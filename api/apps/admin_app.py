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
from datetime import datetime, timedelta
from flask import request
from api.db import TaskStatus, StatusEnum
from api.db.db_models import API4Conversation, DB, Document, Knowledgebase, Task
from api.utils.api_utils import server_error_response, get_json_result
from collections import defaultdict
from peewee import fn
import re
import logging

# Blueprint per le API admin
# NOTA: url_prefix viene impostato automaticamente dal sistema di auto-registrazione
# Il path finale sarà /v1/admin/...
from flask import Blueprint
manager = Blueprint('admin', __name__)


@manager.route('/user-sessions', methods=['POST'])
def get_user_sessions():
    """
    Endpoint per ottenere tutte le sessioni utente con conversazioni complete
    
    Request body:
    {
        "startDate": "2025-11-01",  # opzionale
        "endDate": "2025-11-04"      # opzionale
    }
    
    Returns:
    {
        "sessions": [...],
        "stats": {...}
    }
    """
    try:
        req = request.json or {}
        start_date = req.get('startDate')
        end_date = req.get('endDate')
        
        # Query base
        query = API4Conversation.select()
        
        # Filtro date se specificato (usa update_time in millisecondi)
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            start_ts = int(start_dt.timestamp() * 1000)
            query = query.where(API4Conversation.update_time >= start_ts)
        
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
            end_ts = int(end_dt.timestamp() * 1000)
            query = query.where(API4Conversation.update_time < end_ts)
        
        # Ordina per data (più recenti prima)
        query = query.order_by(API4Conversation.update_time.desc())
        
        # Esegui query
        with DB.connection_context():
            conversations = list(query.dicts())
        
        # Processa i dati
        sessions = []
        stats = {
            'totalUsers': 0,
            'freeUsers': 0,
            'premiumUsers': 0,
            'betaTesters': 0,
            'todayLogins': 0,
            'uniqueCountries': 0
        }
        
        user_ids_set = set()
        today = datetime.now().date()
        
        for conv in conversations:
            user_id = conv.get('user_id', 'anonymous')
            user_ids_set.add(user_id)
            
            # Determina il piano (da implementare con logica reale)
            plan = 'free'  # default
            if 'beta' in user_id.lower():
                plan = 'beta'
                stats['betaTesters'] += 1
            elif 'premium' in user_id.lower() or '@' in user_id:
                plan = 'premium'
                stats['premiumUsers'] += 1
            else:
                stats['freeUsers'] += 1
            
            # Estrai messaggi (può essere JSON string o già parsed)
            messages_raw = conv.get('message', [])
            if isinstance(messages_raw, str):
                try:
                    import json
                    messages = json.loads(messages_raw)
                except:
                    messages = []
            else:
                messages = messages_raw if messages_raw else []
            
            # Costruisci conversazione formattata - MIGLIORE PARSING
            conversation_text = []
            for idx, msg in enumerate(messages):
                if not isinstance(msg, dict):
                    continue
                    
                role = msg.get('role', 'unknown')
                content = msg.get('content', '')
                timestamp = msg.get('created_at', 0)
                
                # Salta messaggi di sistema, vuoti o di benvenuto
                if role == 'system':
                    continue
                if not content or content.strip() == '':
                    continue
                # Salta messaggi di benvenuto standard
                if 'Benvenuto! Sono SGAI' in content:
                    continue
                
                if role == 'user':
                    conversation_text.append({
                        'type': 'question',
                        'text': content,
                        'timestamp': timestamp,
                        'index': idx
                    })
                elif role == 'assistant':
                    conversation_text.append({
                        'type': 'answer',
                        'text': content,
                        'timestamp': timestamp,
                        'index': idx
                    })
            
            # Converti timestamp da millisecondi a datetime
            update_ts = conv.get('update_time')
            login_time_str = ''
            if update_ts:
                try:
                    login_dt = datetime.fromtimestamp(update_ts / 1000)
                    login_time_str = login_dt.strftime('%Y-%m-%d %H:%M:%S')
                    
                    # Count today logins
                    if login_dt.date() == today:
                        stats['todayLogins'] += 1
                except:
                    login_time_str = 'N/A'
            
            # Get tracking data from database (new columns)
            ip_address = conv.get('ip_address', 'N/A')
            user_agent = conv.get('user_agent', 'N/A')
            browser = conv.get('browser', 'Unknown')
            os_name = conv.get('os', 'Unknown')
            device_type = conv.get('device_type', 'desktop')
            
            # Crea sessione
            session = {
                'id': conv.get('id', '')[:8],
                'sessionId': conv.get('id', ''),
                'userId': user_id if user_id else 'anonymous',
                'email': user_id if user_id and '@' in user_id else None,
                'plan': plan,
                'loginTime': login_time_str,
                'ipAddress': ip_address,
                'userAgent': user_agent,
                'country': 'Italy',  # da implementare con GeoIP
                'city': 'Unknown',  # da implementare con GeoIP
                'browser': browser,
                'os': os_name,
                'deviceType': device_type,
                'referrer': conv.get('referrer'),
                'language': conv.get('language'),
                'messagesCount': len(messages),
                'conversation': conversation_text,
                'duration': round(conv.get('duration', 0), 1),
                'tokens': conv.get('tokens', 0)
            }
            
            sessions.append(session)
        
        stats['totalUsers'] = len(user_ids_set)
        stats['uniqueCountries'] = 1  # placeholder
        
        return get_json_result(data={
            'sessions': sessions,
            'stats': stats
        })
        
    except Exception as e:
        return server_error_response(e)


@manager.route('/knowledge-status', methods=['GET'])
def get_knowledge_status():
    """
    Ritorna lo stato di avanzamento del parsing documenti per un dataset.
    Risponde con totale documenti, chunk estratti, distribuzione per stato e progresso.
    """
    dataset_name = request.args.get('dataset', 'SENTENZE BANCA DATI MEF')
    try:
        status_map = {
            TaskStatus.UNSTART.value: 'unstart',
            TaskStatus.RUNNING.value: 'running',
            TaskStatus.CANCEL.value: 'cancel',
            TaskStatus.DONE.value: 'done',
            TaskStatus.FAIL.value: 'fail',
        }

        with DB.connection_context():
            dataset_ids = list(
                Knowledgebase
                .select(Knowledgebase.id)
                .where(Knowledgebase.name == dataset_name)
                .dicts()
            )

            if not dataset_ids:
                return get_json_result(data={
                    'dataset': dataset_name,
                    'found': False,
                    'total': 0,
                    'chunkSum': 0,
                    'statusCounts': {label: 0 for label in status_map.values()},
                    'progress': 0.0,
                    'remaining': 0
                })

            kb_ids = [row['id'] for row in dataset_ids]

            query = (
                Document
                .select(
                    Document.run.alias('run_status'),
                    fn.COUNT(Document.id).alias('doc_count'),
                    fn.SUM(Document.chunk_num).alias('chunk_sum'),
                    fn.MAX(Document.process_begin_at).alias('last_started_at'),
                )
                .where(Document.kb_id.in_(kb_ids))
                .group_by(Document.run)
            )

            status_counts = {label: 0 for label in status_map.values()}
            total_docs = 0
            total_chunks = 0
            last_started_at = None

            for row in query.dicts():
                status_key = status_map.get(row['run_status'] or TaskStatus.UNSTART.value, 'unknown')
                count = row.get('doc_count', 0) or 0
                chunks = row.get('chunk_sum', 0) or 0
                status_counts[status_key] = status_counts.get(status_key, 0) + count
                total_docs += count
                total_chunks += chunks

                started_at = row.get('last_started_at')
                if started_at and (last_started_at is None or started_at > last_started_at):
                    last_started_at = started_at

            done_docs = status_counts.get('done', 0)
            parsed_progress = (done_docs / total_docs) if total_docs else 0.0
            remaining_docs = total_docs - done_docs if total_docs else 0

            return get_json_result(data={
                'dataset': dataset_name,
                'found': True,
                'total': total_docs,
                'chunkSum': total_chunks,
                'statusCounts': status_counts,
                'progress': parsed_progress,
                'remaining': remaining_docs,
                'lastStartedAt': last_started_at.isoformat() if last_started_at else None,
            })
    except Exception as e:
        return server_error_response(e)


def extract_browser_os(user_agent: str):
    """Estrae browser e OS da user agent string"""
    browser = 'Unknown'
    os = 'Unknown'
    
    # Semplice parser (da migliorare)
    if 'Chrome' in user_agent:
        browser = 'Chrome'
    elif 'Firefox' in user_agent:
        browser = 'Firefox'
    elif 'Safari' in user_agent:
        browser = 'Safari'
    elif 'Edge' in user_agent:
        browser = 'Edge'
    
    if 'Windows' in user_agent:
        os = 'Windows'
    elif 'Mac' in user_agent or 'macOS' in user_agent:
        os = 'macOS'
    elif 'Linux' in user_agent:
        os = 'Linux'
    elif 'Android' in user_agent:
        os = 'Android'
    elif 'iOS' in user_agent or 'iPhone' in user_agent:
        os = 'iOS'
    
    return browser, os


def extract_ip(user_id: str):
    """Estrae IP da user_id se presente (formato: ip_xxx.xxx.xxx.xxx)"""
    # Pattern per IP: xxx.xxx.xxx.xxx
    ip_pattern = r'\b(?:\d{1,3}\.){3}\d{1,3}\b'
    match = re.search(ip_pattern, user_id)
    if match:
        return match.group(0)
    return 'N/A'


@manager.route('/requeue-unstart-documents', methods=['POST'])
def requeue_unstart_documents():
    """
    Rimette in coda tutti i documenti con stato 'unstart' per un dataset specifico.
    
    Request body:
    {
        "dataset": "SENTENZE BANCA DATI MEF",  # opzionale, default
        "limit": 1000,  # opzionale, numero massimo di documenti da processare
        "dry_run": false  # opzionale, se true solo conta senza processare
    }
    
    Returns:
    {
        "total_found": 1234,
        "queued": 1000,
        "errors": []
    }
    """
    try:
        from api.db.services.document_service import DocumentService
        from api.db.services.file2document_service import File2DocumentService
        from api.db.services.task_service import queue_tasks, TaskService
        from api.db.services.knowledgebase_service import KnowledgebaseService
        from api import settings
        from rag.utils import search
        
        req = request.json or {}
        dataset_name = req.get('dataset', 'SENTENZE BANCA DATI MEF')
        limit = req.get('limit', 1000)  # Limite per evitare sovraccarico
        dry_run = req.get('dry_run', False)
        
        with DB.connection_context():
            # Trova il dataset
            dataset_ids = list(
                Knowledgebase
                .select(Knowledgebase.id, Knowledgebase.tenant_id)
                .where(Knowledgebase.name == dataset_name)
                .dicts()
            )
            
            if not dataset_ids:
                return get_json_result(
                    data={
                        'error': f'Dataset "{dataset_name}" non trovato',
                        'total_found': 0,
                        'queued': 0
                    },
                    code=settings.RetCode.DATA_ERROR
                )
            
            kb_ids = [row['id'] for row in dataset_ids]
            tenant_id = dataset_ids[0]['tenant_id']
            
            # Trova documenti con stato unstart (0) - NON tocca DONE, RUNNING, CANCEL
            # Esclude anche documenti VIRTUAL che non devono essere processati
            unstart_docs = list(
                Document
                .select(
                    Document.id, 
                    Document.name, 
                    Document.kb_id, 
                    Document.type, 
                    Document.parser_id, 
                    Document.parser_config,
                    Document.status
                )
                .where(
                    Document.kb_id.in_(kb_ids),
                    Document.run == TaskStatus.UNSTART.value,
                    Document.status == StatusEnum.VALID.value  # Solo documenti validi
                )
                .limit(limit)
                .dicts()
            )
            
            logging.info(f"[REQUEUE] Trovati {len(unstart_docs)} documenti UNSTART per dataset '{dataset_name}'")
            
            total_found = len(unstart_docs)
            queued = 0
            errors = []
            
            if dry_run:
                return get_json_result(data={
                    'dataset': dataset_name,
                    'total_found': total_found,
                    'queued': 0,
                    'dry_run': True,
                    'message': f'Trovati {total_found} documenti da processare (dry run)'
                })
            
            # Processa ogni documento
            for doc_dict in unstart_docs:
                try:
                    doc_id = doc_dict['id']
                    doc_name = doc_dict.get('name', 'unknown')
                    
                    # ✅ VERIFICA: Non processare documenti già DONE o RUNNING (doppio controllo)
                    e, doc_check = DocumentService.get_by_id(doc_id)
                    if not e:
                        errors.append(f"Documento {doc_id}: non trovato nel DB")
                        continue
                    
                    if doc_check.run == TaskStatus.DONE.value:
                        logging.warning(f"[REQUEUE] ⚠️ Salto documento {doc_id} ({doc_name}): già DONE")
                        continue
                    
                    if doc_check.run == TaskStatus.RUNNING.value:
                        logging.warning(f"[REQUEUE] ⚠️ Salto documento {doc_id} ({doc_name}): già RUNNING")
                        continue
                    
                    # Ottieni bucket e nome file
                    bucket, name = File2DocumentService.get_storage_address(doc_id=doc_id)
                    if not bucket or not name:
                        errors.append(f"Documento {doc_id} ({doc_name}): file non trovato nello storage")
                        logging.warning(f"[REQUEUE] ⚠️ File non trovato per {doc_id}: bucket={bucket}, name={name}")
                        continue
                    
                    # Prepara documento per queue_tasks
                    doc = doc_dict.copy()
                    doc['tenant_id'] = tenant_id
                    
                    # ✅ Aggiorna stato a RUNNING PRIMA di mettere in coda
                    DocumentService.update_by_id(doc_id, {
                        'run': TaskStatus.RUNNING.value,
                        'progress': 0,
                        'progress_msg': f'Rimesso in coda il {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}'
                    })
                    
                    # ✅ Rimuovi task vecchi se esistono (per evitare duplicati)
                    deleted_tasks = TaskService.filter_delete([Task.doc_id == doc_id])
                    if deleted_tasks:
                        logging.info(f"[REQUEUE] Rimossi {deleted_tasks} task vecchi per documento {doc_id}")
                    
                    # ✅ Metti in coda Redis
                    queue_tasks(doc, bucket, name, priority=0)
                    queued += 1
                    
                    logging.info(f"[REQUEUE] ✅ Documento {doc_id} ({doc_name}) rimesso in coda")
                    
                    if queued % 100 == 0:
                        logging.info(f"[REQUEUE] 📊 Progresso: {queued}/{total_found} documenti rimessi in coda")
                        
                except Exception as e:
                    error_msg = f"Documento {doc_dict.get('id', 'unknown')} ({doc_dict.get('name', 'unknown')}): {str(e)}"
                    errors.append(error_msg)
                    logging.error(f"[REQUEUE] ❌ Errore: {error_msg}", exc_info=True)
            
            return get_json_result(data={
                'dataset': dataset_name,
                'total_found': total_found,
                'queued': queued,
                'errors': errors[:10],  # Limita errori mostrati
                'errors_count': len(errors)
            })
            
    except Exception as e:
        logging.error(f"[REQUEUE] Errore generale: {e}", exc_info=True)
        return server_error_response(e)

