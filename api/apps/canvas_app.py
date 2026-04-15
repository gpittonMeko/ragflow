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
import os
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


def _enrich_canvas_user_message(raw_message: str, req: dict) -> str:
    """
    Opzioni da client: doc_ids (CSV), deep_search (bool), retrieval_kb_ids (CSV, vedi
    _apply_retrieval_kb_filter — non modifica questo testo), retrieval_top_n (int, vedi
    _apply_retrieval_top_n).
    - deep_search: arricchimento con fonti web. Ordine: (1) Tavily se TAVILY_API_KEY è
      impostata; (2) altrimenti DuckDuckGo via duckduckgo_search (nessuna API key, come
      agent/component/duckduckgo.py). Le chiavi OpenAI non servono per cercare sul web.
    - doc_ids: antepone riferimento agli ID documento caricati in chat.
    """
    doc_ids_str = (req.get("doc_ids") or "").strip()
    if doc_ids_str:
        n = len([x for x in doc_ids_str.split(",") if x.strip()])
        logging.debug("[CANVAS] completion doc_ids count=%s", n)
    deep_search = bool(req.get("deep_search"))
    text = raw_message

    if deep_search:
        web_enriched = False
        tav_key = os.environ.get("TAVILY_API_KEY", "").strip()
        if tav_key:
            try:
                from rag.utils.tavily_conn import Tavily

                tav = Tavily(tav_key)
                tav_res = tav.retrieve_chunks(raw_message)
                chunks = tav_res.get("chunks") or []
                if chunks:
                    parts = []
                    for c in chunks[:8]:
                        title = c.get("docnm_kwd") or "fonte"
                        body = (c.get("content_with_weight") or "")[:1000]
                        url = c.get("url") or ""
                        line = f"- **{title}**"
                        if url:
                            line += f" ({url})"
                        line += f"\n  {body}"
                        parts.append(line)
                    text = (
                        "## Fonti web (Deep search, Tavily)\n\n"
                        + "\n\n".join(parts)
                        + "\n\n---\n\n## Domanda utente\n\n"
                        + raw_message
                    )
                    web_enriched = True
            except Exception as e:
                logging.warning("[CANVAS] deep_search Tavily: %s", e)

        if not web_enriched:
            try:
                from duckduckgo_search import DDGS

                parts = []
                with DDGS() as ddgs:
                    for r in ddgs.text(raw_message, max_results=6):
                        title = (r.get("title") or "")[:220]
                        href = r.get("href") or ""
                        body = (r.get("body") or "")[:900]
                        line = f"- **{title}**"
                        if href:
                            line += f" ({href})"
                        line += f"\n  {body}"
                        parts.append(line)
                if parts:
                    text = (
                        "## Fonti web (Deep search, DuckDuckGo)\n\n"
                        + "\n\n".join(parts)
                        + "\n\n---\n\n## Domanda utente\n\n"
                        + raw_message
                    )
                else:
                    logging.info("[CANVAS] deep_search DuckDuckGo: nessun risultato")
            except Exception as e:
                logging.warning("[CANVAS] deep_search DuckDuckGo: %s", e)

    if doc_ids_str:
        text = f"[Documenti allegati: {doc_ids_str}]\n\n" + text

    return text


def _apply_retrieval_kb_filter(canvas, kb_csv):
    """
    Limita i nodi Retrieval ai kb_id richiesti dal client (sottoinsieme di quelli già
    configurati nell'agent). Chiave request: retrieval_kb_ids (CSV). Non espande mai
    oltre i kb già presenti nel canvas.
    """
    if not kb_csv or not str(kb_csv).strip():
        return
    allow = {x.strip() for x in str(kb_csv).split(",") if x.strip()}
    if not allow:
        return
    try:
        for _cid, cpn in canvas.components.items():
            obj = cpn.get("obj")
            if not obj or getattr(obj, "component_name", "") != "Retrieval":
                continue
            param = getattr(obj, "_param", None)
            if param is None or not getattr(param, "kb_ids", None):
                continue
            orig = list(param.kb_ids)
            if not orig:
                continue
            filt = [x for x in orig if x in allow]
            param.kb_ids = filt if filt else orig
            logging.info(
                "[CANVAS] retrieval_kb_ids filter: %s -> %s", orig, param.kb_ids
            )
    except Exception as e:
        logging.warning("[CANVAS] retrieval_kb_ids filter skipped: %s", e)


def _apply_retrieval_top_n(canvas, top_n):
    """Override top_n su tutti i nodi Retrieval (richiesta client, cap sicuro)."""
    if top_n is None:
        return
    try:
        n = int(top_n)
        if n < 1:
            return
        n = min(n, 32)
        applied = 0
        for _cid, cpn in canvas.components.items():
            obj = cpn.get("obj")
            if not obj or getattr(obj, "component_name", "") != "Retrieval":
                continue
            param = getattr(obj, "_param", None)
            if param is None:
                continue
            param.top_n = n
            applied += 1
        if applied:
            logging.info("[CANVAS] retrieval_top_n=%s on %s Retrieval node(s)", n, applied)
    except Exception as e:
        logging.warning("[CANVAS] retrieval_top_n skipped: %s", e)


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


@manager.route('/session/<canvas_id>/<session_id>', methods=['GET'])
def get_session_messages(canvas_id, session_id):
    """Load messages for a specific session"""
    from api.db.services.api_service import API4ConversationService
    
    # Verify canvas exists
    e, c = UserCanvasService.get_by_id(canvas_id)
    if not e:
        return get_data_error_result(message="canvas not found.")
    
    # Load conversation by session_id
    e, conv = API4ConversationService.get_by_id(session_id)
    if not e:
        logging.info(f"[SESSION API] Session {session_id} not found, returning empty")
        return get_json_result(data={"messages": []})
    
    # Return messages from DSL
    messages = conv.dsl.get("messages", []) if conv.dsl else []
    logging.info(f"[SESSION API] Loaded {len(messages)} messages for session {session_id}")
    return get_json_result(data={"messages": messages})



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
    logging.info(f"[DEBUG-REQ] Full request: id={req.get('id')}, message={req.get('message', '')[:100] if req.get('message') else 'NONE'}, session_id={req.get('session_id')}, message_id={message_id}")
    
    try:
        if "message" in req:
            user_message = _enrich_canvas_user_message(req["message"], req)
            logging.info(f"[CANVAS] ✅ Messaggio ricevuto: {user_message[:100]}...")
            logging.info(f"[CANVAS] Canvas state prima: messages={len(canvas.messages)}, history={len(canvas.history)}, path={len(canvas.path) if canvas.path else 0}")
            
            canvas.messages.append({"role": "user", "content": user_message, "id": message_id})
            logging.info(f"[CANVAS] ✅ Messaggio aggiunto a canvas.messages")
            
            canvas.add_user_input(user_message)
            logging.info(f"[CANVAS] ✅ add_user_input chiamato, canvas.path dopo: {canvas.path}")
            logging.info(f"[CANVAS] Canvas state dopo add_user_input: messages={len(canvas.messages)}, history={len(canvas.history)}, path={len(canvas.path) if canvas.path else 0}")
            
            # Salva anche in conv.message
            if not conv.message:
                conv.message = []
            conv.message.append({"role": "user", "content": user_message, "id": message_id, "created_at": time.time()})
            logging.info(f"[HISTORY] ✅ Nuovo messaggio salvato, totale history: {len(canvas.history)}, totale messages: {len(canvas.messages)}")
        else:
            logging.warning(f"[CANVAS] ⚠️ ATTENZIONE: 'message' NON presente nella request! Keys disponibili: {list(req.keys())}")
    except Exception as e:
        logging.error(f"[CANVAS] ❌ ERRORE nell'aggiunta del messaggio: {str(e)}", exc_info=True)
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
                _apply_retrieval_kb_filter(canvas, req.get("retrieval_kb_ids"))
                _apply_retrieval_top_n(canvas, req.get("retrieval_top_n"))
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
    _apply_retrieval_kb_filter(canvas, req.get("retrieval_kb_ids"))
    _apply_retrieval_top_n(canvas, req.get("retrieval_top_n"))
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

