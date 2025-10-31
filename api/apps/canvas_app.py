#
#  Copyright 2024 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#
import json
import traceback
from flask import request, Response
from flask_login import login_required, current_user
from api.db.services.canvas_service import CanvasTemplateService, UserCanvasService
from api.db.services.user_service import TenantService
from api.db.services.user_canvas_version import UserCanvasVersionService
from api.settings import RetCode
from api.utils import get_uuid
from api.utils.api_utils import get_json_result, server_error_response, validate_request, get_data_error_result
from agent.canvas import Canvas
from peewee import MySQLDatabase, PostgresqlDatabase
from api.db.db_models import APIToken
import logging
import time

@manager.route('/templates', methods=['GET'])  # noqa: F821
@login_required
def templates():
    return get_json_result(data=[c.to_dict() for c in CanvasTemplateService.get_all()])


@manager.route('/list', methods=['GET'])  # noqa: F821
@login_required
def canvas_list():
    return get_json_result(data=sorted([c.to_dict() for c in \
                                 UserCanvasService.query(user_id=current_user.id)], key=lambda x: x["update_time"]*-1)
                           )


@manager.route('/rm', methods=['POST'])  # noqa: F821
@validate_request("canvas_ids")
@login_required
def rm():
    for i in request.json["canvas_ids"]:
        if not UserCanvasService.query(user_id=current_user.id,id=i):
            return get_json_result(
                data=False, message='Only owner of canvas authorized for this operation.',
                code=RetCode.OPERATING_ERROR)
        UserCanvasService.delete_by_id(i)
    return get_json_result(data=True)


@manager.route('/set', methods=['POST'])  # noqa: F821
@validate_request("dsl", "title")
@login_required
def save():
    req = request.json
    req["user_id"] = current_user.id
    if not isinstance(req["dsl"], str):
        req["dsl"] = json.dumps(req["dsl"], ensure_ascii=False)
    req["dsl"] = json.loads(req["dsl"])
    if "id" not in req:
        if UserCanvasService.query(user_id=current_user.id, title=req["title"].strip()):
            return get_data_error_result(message=f"{req['title'].strip()} already exists.")
        req["id"] = get_uuid()
        if not UserCanvasService.save(**req):
            return get_data_error_result(message="Fail to save canvas.")
    else:
        if not UserCanvasService.query(user_id=current_user.id, id=req["id"]):
            return get_json_result(
                data=False, message='Only owner of canvas authorized for this operation.',
                code=RetCode.OPERATING_ERROR)
        UserCanvasService.update_by_id(req["id"], req)
    # save version    
    UserCanvasVersionService.insert( user_canvas_id=req["id"], dsl=req["dsl"], title="{0}_{1}".format(req["title"], time.strftime("%Y_%m_%d_%H_%M_%S")))
    UserCanvasVersionService.delete_all_versions(req["id"])
    return get_json_result(data=req)

 


@manager.route('/get/<canvas_id>', methods=['GET'])  # noqa: F821
def get(canvas_id):
    # Allow public access - try by ID first, then by tenant_id if authenticated
    from flask_login import current_user as flask_current_user
    is_authenticated = flask_current_user.is_authenticated if hasattr(flask_current_user, 'is_authenticated') else False
    
    if is_authenticated:
        e, c = UserCanvasService.get_by_tenant_id(canvas_id)
    else:
        # For public access, get by ID directly
        e, c = UserCanvasService.get_by_id(canvas_id)
    
    logging.info(f"get canvas_id: {canvas_id} c: {c}")
    if not e:
        return get_data_error_result(message="canvas not found.")
    return get_json_result(data=c if isinstance(c, dict) else c.to_dict())

@manager.route('/getsse/<canvas_id>', methods=['GET'])
def getsse(canvas_id):
    # Allow public access without authentication
    e, c = UserCanvasService.get_by_id(canvas_id)
    if not e:
        return get_data_error_result(message="canvas not found.")

    return get_json_result(data=c if isinstance(c, dict) else c.to_dict())





@manager.route('/completion', methods=['POST'])  # noqa: F821
@validate_request("id")
def run():
    from api.db.services.api_service import API4ConversationService
    from api.db.db_models import API4Conversation
    
    req = request.json
    logging.info(f"[COMPLETION] Request JSON: {req}")
    stream = req.get("stream", True)
    session_id = req.get("session_id")  # ✅ Leggi session_id dal frontend
    # Tronca session_id a 32 caratteri per compatibilità con DB
    if session_id and len(session_id) > 32:
        session_id = session_id[:32]
        logging.info(f"[SESSION] Troncato session_id a 32 char: {session_id}")
    
    e, cvs = UserCanvasService.get_by_id(req["id"])
    if not e:
        return get_data_error_result(message="canvas not found.")
    
    # Allow public access
    from flask_login import current_user as flask_current_user
    is_authenticated = flask_current_user.is_authenticated if hasattr(flask_current_user, 'is_authenticated') else False
    
    if is_authenticated:
        if not UserCanvasService.query(user_id=flask_current_user.id, id=req["id"]):
            return get_json_result(
                data=False, message='Only owner of canvas authorized for this operation.',
                code=RetCode.OPERATING_ERROR)
        user_id = flask_current_user.id
    else:
        user_id = cvs.user_id

    if not isinstance(cvs.dsl, str):
        cvs.dsl = json.dumps(cvs.dsl, ensure_ascii=False)

    final_ans = {"reference": [], "content": ""}
    message_id = req.get("message_id", get_uuid())
    
    # ✅ FIX COMPLETO: Gestisci conversazioni separate con session_id
    if not session_id:
        # Nuova sessione: usa DSL originale del canvas
        session_id = get_uuid()
        canvas = Canvas(cvs.dsl, user_id)
        logging.info(f"[SESSION] Creata nuova sessione: {session_id}")
        
        # Salva conversazione vuota nel DB
        conv_data = {
            "id": session_id,
            "dialog_id": cvs.id,
            "user_id": "",
            "message": [],
            "source": "agent",
            "dsl": json.loads(str(canvas))
        }
        API4ConversationService.save(**conv_data)
        conv = API4Conversation(**conv_data)
    else:
        # Sessione esistente: recupera dal DB
        e, conv = API4ConversationService.get_by_id(session_id)
        if not e:
            # Session non trovata, creala (con gestione duplicate)
            logging.warning(f"[SESSION] {session_id} non trovata, creo nuova")
            canvas = Canvas(cvs.dsl, user_id)
            conv_data = {
                "id": session_id,
                "dialog_id": cvs.id,
                "user_id": "",
                "message": [],
                "source": "agent",
                "dsl": json.loads(str(canvas))
            }
            try:
                API4ConversationService.save(**conv_data)
                conv = API4Conversation(**conv_data)
                logging.info(f"[SESSION] Nuova sessione creata: {session_id}")
                
                # ✅ ESEGUI canvas.run() UNA VOLTA per inizializzare il path e il begin
                logging.info(f"[SESSION] Inizializzo canvas per nuova sessione...")
                for ans in canvas.run(stream=False):
                    pass  # Ignora l'output, ci serve solo per popolare canvas.path
                logging.info(f"[SESSION] Canvas inizializzato, path: {canvas.path}")
                
                # Salva il prologue come primo messaggio se esiste
                prologue = canvas.get_prologue()
                if prologue:
                    conv.message = [{"role": "assistant", "content": prologue, "id": "begin-welcome"}]
                    canvas.messages = [{"role": "assistant", "content": prologue, "id": "begin-welcome"}]
                    canvas.history = [("assistant", prologue)]
                    logging.info(f"[SESSION] Aggiunto messaggio di benvenuto dal prologue")
                
            except Exception as ex:
                # Gestisci duplicate key: riprova a caricare
                logging.warning(f"[SESSION] Errore creazione (duplicate?): {ex}, riprovo a caricare")
                e, conv = API4ConversationService.get_by_id(session_id)
                if e:
                    canvas = Canvas(json.dumps(conv.dsl), user_id)
                    logging.info(f"[SESSION] Caricata dopo errore: {session_id}")
                else:
                    # Fallback: usa canvas vuoto
                    logging.error(f"[SESSION] FALLBACK: uso canvas vuoto per {session_id}")
                    canvas = Canvas(cvs.dsl, user_id)
                    conv = API4Conversation(**conv_data)
        else:
            logging.info(f"[SESSION] Caricata sessione esistente: {session_id}")
            # ✅ USA IL DSL DELLA CONVERSAZIONE, non del canvas globale!
            canvas = Canvas(json.dumps(conv.dsl), user_id)
    
    # ✅ RICOSTRUISCI SEMPRE la history dai messages salvati
    if canvas.messages:
        canvas.history = []
        for msg in canvas.messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role and content:
                canvas.history.append((role, content))
        logging.info(f"[HISTORY] Ricostruita history: {len(canvas.history)} messaggi")
    else:
        logging.info(f"[HISTORY] Nessun messaggio precedente")
    
    # ❌ INJECTION DISABILITATA - causava problemi al Generate
    # Il canvas usa già il DSL corretto dalla conversazione
    logging.info(f"[SESSION] Canvas caricato, messages: {len(canvas.messages)}, history: {len(canvas.history)}")
    
    logging.info(f"[DEBUG-REQ] req keys: {list(req.keys())}, 'message' in req: {'message' in req}")
    
    try:
        if "message" in req:
            logging.info(f"[CANVAS] Aggiunto messaggio utente: {req['message'][:100]}...")
            canvas.messages.append({"role": "user", "content": req["message"], "id": message_id})
            canvas.add_user_input(req["message"])
            logging.info(f"[CANVAS] add_user_input chiamato, canvas.path: {canvas.path}")
            # Salva anche in conv.message
            if not conv.message:
                conv.message = []
            conv.message.append({"role": "user", "content": req["message"], "id": message_id, "created_at": time.time()})
            logging.info(f"[HISTORY] Nuovo messaggio, totale history: {len(canvas.history)}")
    except Exception as e:
        return server_error_response(e)

    # ✅ FUNZIONE DI SERIALIZZAZIONE (usata sia stream che non-stream)
    def safe_serialize_canvas(canvas_obj):
        """Serializza il canvas evitando AttributeError su componenti malformati"""
        try:
            dsl = json.loads(str(canvas_obj))
            # ✅ FORZA il salvataggio della history/messages/reference modificati!
            dsl['history'] = getattr(canvas_obj, 'history', [])
            dsl['messages'] = getattr(canvas_obj, 'messages', [])
            dsl['reference'] = getattr(canvas_obj, 'reference', [])
            dsl['path'] = getattr(canvas_obj, 'path', [])
            logging.info(f"[SERIALIZE] Salvato DSL con {len(dsl.get('history', []))} msgs in history, {len(dsl.get('messages', []))} in messages")
            return dsl
        except AttributeError as e:
            logging.warning(f"Canvas serialization error (ignored): {e}")
            return {
                "components": {},
                "history": getattr(canvas_obj, 'history', []),
                "messages": getattr(canvas_obj, 'messages', []),
                "reference": getattr(canvas_obj, 'reference', []),
                "path": getattr(canvas_obj, 'path', [])
            }

    if stream:
        def sse():
            nonlocal final_ans, cvs
            
            try:
                logging.info("[SSE] Starting stream...")
                answer_count = 0
                for ans in canvas.run(stream=True):
                    answer_count += 1
                    logging.info(f"[SSE] Received answer #{answer_count}: {list(ans.keys())}")
                    if ans.get("running_status"):
                        yield "data:" + json.dumps({
                            "code": 0,
                            "message": "",
                            "data": {
                                "answer": ans["content"],
                                "running_status": True
                            }
                        }, ensure_ascii=False) + "\n\n"
                        continue
                    
                    for k in ans.keys():
                        final_ans[k] = ans[k]
                    
                    ans_data = {"answer": ans["content"], "reference": ans.get("reference", [])}
                    yield "data:" + json.dumps({"code": 0, "message": "", "data": ans_data}, ensure_ascii=False) + "\n\n"

                # Salva stato
                canvas.messages.append({"role": "assistant", "content": final_ans.get("content", ""), "id": message_id})
                canvas.history.append(("assistant", final_ans.get("content", "")))
                if canvas.path and not canvas.path[-1]:
                    canvas.path.pop(-1)
                if final_ans.get("reference"):
                    canvas.reference.append(final_ans["reference"])
                
                # ✅ SALVA NELLA CONVERSAZIONE (session-based), non nel canvas globale!
                conv.message.append({"role": "assistant", "content": final_ans.get("content", ""), "id": message_id, "created_at": time.time()})
                conv.dsl = safe_serialize_canvas(canvas)
                if final_ans.get("reference"):
                    if not conv.reference:
                        conv.reference = []
                    conv.reference.extend(final_ans["reference"] if isinstance(final_ans["reference"], list) else [final_ans["reference"]])
                API4ConversationService.update_by_id(session_id, conv.to_dict())
                
                logging.info(f"[SSE] Stream completed, session: {session_id}, history: {len(canvas.history)} msgs")
                yield "data:" + json.dumps({"code": 0, "message": "", "data": True}, ensure_ascii=False) + "\n\n"
                
            except GeneratorExit:
                logging.warning("[SSE] Client disconnected (GeneratorExit)")
                try:
                    conv.dsl = safe_serialize_canvas(canvas)
                    if canvas.path and not canvas.path[-1]:
                        canvas.path.pop(-1)
                    API4ConversationService.update_by_id(session_id, conv.to_dict())
                except Exception as save_err:
                    logging.error(f"Save error on GeneratorExit: {save_err}")
                
            except Exception as e:
                logging.error(f"[SSE] Error: {str(e)}", exc_info=True)
                
                try:
                    conv.dsl = safe_serialize_canvas(canvas)
                    if canvas.path and not canvas.path[-1]:
                        canvas.path.pop(-1)
                    API4ConversationService.update_by_id(session_id, conv.to_dict())
                except Exception as save_err:
                    logging.error(f"Save error on exception: {save_err}")
                
                traceback.print_exc()
                
                yield "data:" + json.dumps({
                    "code": 500,
                    "message": str(e),
                    "data": {"answer": f"**ERROR**: {str(e)}", "reference": []}
                }, ensure_ascii=False) + "\n\n"
                
                yield "data:" + json.dumps({"code": 0, "message": "", "data": True}, ensure_ascii=False) + "\n\n"

        resp = Response(sse(), mimetype="text/event-stream")
        resp.headers.add_header("Cache-Control", "no-cache, no-store, must-revalidate")
        resp.headers.add_header("Connection", "keep-alive")
        resp.headers.add_header("X-Accel-Buffering", "no")
        resp.headers.add_header("Content-Type", "text/event-stream; charset=utf-8")
        return resp

    # Non-streaming
    for answer in canvas.run(stream=False):
        if answer.get("running_status"):
            continue
        final_ans["content"] = "\n".join(answer["content"]) if "content" in answer else ""
        canvas.messages.append({"role": "assistant", "content": final_ans["content"], "id": message_id})
        conv.message.append({"role": "assistant", "content": final_ans["content"], "id": message_id, "created_at": time.time()})
        if final_ans.get("reference"):
            canvas.reference.append(final_ans["reference"])
            if not conv.reference:
                conv.reference = []
            conv.reference.extend(final_ans["reference"] if isinstance(final_ans["reference"], list) else [final_ans["reference"]])
        conv.dsl = safe_serialize_canvas(canvas)
        API4ConversationService.update_by_id(session_id, conv.to_dict())
        return get_json_result(data={"answer": final_ans["content"], "reference": final_ans.get("reference", [])})

@manager.route('/reset', methods=['POST'])  # noqa: F821
@validate_request("id")
@login_required
def reset():
    req = request.json
    try:
        e, user_canvas = UserCanvasService.get_by_id(req["id"])
        if not e:
            return get_data_error_result(message="canvas not found.")
        if not UserCanvasService.query(user_id=current_user.id, id=req["id"]):
            return get_json_result(
                data=False, message='Only owner of canvas authorized for this operation.',
                code=RetCode.OPERATING_ERROR)

        canvas = Canvas(json.dumps(user_canvas.dsl), current_user.id)
        canvas.reset()
        req["dsl"] = json.loads(str(canvas))
        UserCanvasService.update_by_id(req["id"], {"dsl": req["dsl"]})
        return get_json_result(data=req["dsl"])
    except Exception as e:
        return server_error_response(e)


@manager.route('/input_elements', methods=['GET'])  # noqa: F821
@login_required
def input_elements():
    cvs_id = request.args.get("id")
    cpn_id = request.args.get("component_id")
    try:
        e, user_canvas = UserCanvasService.get_by_id(cvs_id)
        if not e:
            return get_data_error_result(message="canvas not found.")
        if not UserCanvasService.query(user_id=current_user.id, id=cvs_id):
            return get_json_result(
                data=False, message='Only owner of canvas authorized for this operation.',
                code=RetCode.OPERATING_ERROR)

        canvas = Canvas(json.dumps(user_canvas.dsl), current_user.id)
        return get_json_result(data=canvas.get_component_input_elements(cpn_id))
    except Exception as e:
        return server_error_response(e)


@manager.route('/debug', methods=['POST'])  # noqa: F821
@validate_request("id", "component_id", "params")
@login_required
def debug():
    req = request.json
    for p in req["params"]:
        assert p.get("key")
    try:
        e, user_canvas = UserCanvasService.get_by_id(req["id"])
        if not e:
            return get_data_error_result(message="canvas not found.")
        if not UserCanvasService.query(user_id=current_user.id, id=req["id"]):
            return get_json_result(
                data=False, message='Only owner of canvas authorized for this operation.',
                code=RetCode.OPERATING_ERROR)

        canvas = Canvas(json.dumps(user_canvas.dsl), current_user.id)
        canvas.get_component(req["component_id"])["obj"]._param.debug_inputs = req["params"]
        df = canvas.get_component(req["component_id"])["obj"].debug()
        return get_json_result(data=df.to_dict(orient="records"))
    except Exception as e:
        return server_error_response(e)


@manager.route('/test_db_connect', methods=['POST'])  # noqa: F821
@validate_request("db_type", "database", "username", "host", "port", "password")
@login_required
def test_db_connect():
    req = request.json
    try:
        if req["db_type"] in ["mysql", "mariadb"]:
            db = MySQLDatabase(req["database"], user=req["username"], host=req["host"], port=req["port"],
                               password=req["password"])
        elif req["db_type"] == 'postgresql':
            db = PostgresqlDatabase(req["database"], user=req["username"], host=req["host"], port=req["port"],
                                    password=req["password"])
        elif req["db_type"] == 'mssql':
            import pyodbc
            connection_string = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={req['host']},{req['port']};"
                f"DATABASE={req['database']};"
                f"UID={req['username']};"
                f"PWD={req['password']};"
            )
            db = pyodbc.connect(connection_string)
            cursor = db.cursor()
            cursor.execute("SELECT 1")
            cursor.close()
        else:
            return server_error_response("Unsupported database type.")
        if req["db_type"] != 'mssql':
            db.connect()
        db.close()
        
        return get_json_result(data="Database Connection Successful!")
    except Exception as e:
        return server_error_response(e)

@manager.route('/getlistversion/<canvas_id>', methods=['GET'])  # noqa: F821
@login_required
def getlistversion(canvas_id):
    try:
        list =sorted([c.to_dict() for c in UserCanvasVersionService.list_by_canvas_id(canvas_id)], key=lambda x: x["update_time"]*-1)
        return get_json_result(data=list)
    except Exception as e:
        return get_data_error_result(message=f"Error getting history files: {e}")

@manager.route('/getversion/<version_id>', methods=['GET'])  # noqa: F821
@login_required
def getversion(version_id):
    try:
        e, version = UserCanvasVersionService.get_by_id(version_id)
        if version:
            return get_json_result(data=version.to_dict())
    except Exception as e:
        return get_json_result(data=f"Error getting history file: {e}")

@manager.route('/listteam', methods=['GET'])  # noqa: F821
@login_required
def list_kbs():
    keywords = request.args.get("keywords", "")
    page_number = int(request.args.get("page", 1))
    items_per_page = int(request.args.get("page_size", 150))
    orderby = request.args.get("orderby", "create_time")
    desc = request.args.get("desc", True)
    try:
        tenants = TenantService.get_joined_tenants_by_user_id(current_user.id)
        kbs, total = UserCanvasService.get_by_tenant_ids(
            [m["tenant_id"] for m in tenants], current_user.id, page_number,
            items_per_page, orderby, desc, keywords)
        return get_json_result(data={"kbs": kbs, "total": total})
    except Exception as e:
        return server_error_response(e)

@manager.route('/setting', methods=['POST'])  # noqa: F821
@validate_request("id", "title", "permission")
@login_required
def setting():
    req = request.json
    req["user_id"] = current_user.id
    e,flow = UserCanvasService.get_by_id(req["id"])
    if not e:
        return get_data_error_result(message="canvas not found.")
    flow = flow.to_dict()
    flow["title"] = req["title"]
    if req["description"]:
        flow["description"] = req["description"]
    if req["permission"]:
        flow["permission"] = req["permission"]
    if req["avatar"]:
        flow["avatar"] = req["avatar"]
    if not UserCanvasService.query(user_id=current_user.id, id=req["id"]):
        return get_json_result(
            data=False, message='Only owner of canvas authorized for this operation.',
            code=RetCode.OPERATING_ERROR)
    num= UserCanvasService.update_by_id(req["id"], flow)
    return get_json_result(data=num)

