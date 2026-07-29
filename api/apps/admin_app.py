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
from functools import wraps
import hmac
import os
import time
from flask import jsonify, request, session, Response
from api.db import TaskStatus, StatusEnum
from api.db.db_models import API4Conversation, DB, Document, Knowledgebase, Task
from api.utils.api_utils import server_error_response, get_json_result
from api.utils import timestamp_to_date
from api import settings
from api.utils.sentenze_utils import (
    CODICE_TO_CORTE,
    CODICI_CORTE,
    build_manifest_index,
    lookup_in_manifest,
    resolve_lookup_key,
)
from peewee import fn, Case
import re
import logging
import csv
import io
import json

STATUS_LABELS = {
    TaskStatus.UNSTART.value: 'unstart',
    TaskStatus.RUNNING.value: 'running',
    TaskStatus.CANCEL.value: 'cancel',
    TaskStatus.DONE.value: 'done',
    TaskStatus.FAIL.value: 'fail',
}

MAX_SENTENZE_PAGE_SIZE = 500
DEFAULT_SENTENZE_PAGE_SIZE = 50
SENTENZE_MANIFEST_TTL_SEC = 3600

_SENTENZE_MANIFEST_CACHE: dict[str, object] = {
    "dataset": None,
    "generatedAt": None,
    "manifest": None,
}


def _resolve_dataset_kb_ids(dataset_name):
    with DB.connection_context():
        rows = list(
            Knowledgebase
            .select(Knowledgebase.id, Knowledgebase.embd_id)
            .where(Knowledgebase.name == dataset_name)
            .dicts()
        )
    if not rows:
        return None, None
    return [row['id'] for row in rows], rows[0].get('embd_id')


def _build_sentenze_summary(kb_ids):
    status_counts = {label: 0 for label in STATUS_LABELS.values()}
    total_docs = 0
    total_chunks = 0
    last_started_at = None

    with DB.connection_context():
        status_rows = list(
            Document
            .select(
                Document.run.alias('run_status'),
                fn.COUNT(Document.id).alias('doc_count'),
                fn.SUM(Document.chunk_num).alias('chunk_sum'),
                fn.MAX(Document.process_begin_at).alias('last_started_at'),
            )
            .where(Document.kb_id.in_(kb_ids), Document.status == StatusEnum.VALID.value)
            .group_by(Document.run)
            .dicts()
        )
        embedding_row = (
            Document
            .select(
                fn.SUM(Case(None, [(Document.chunk_num > 0, 1)], 0)).alias('with_embeddings'),
                fn.SUM(Case(None, [(Document.chunk_num == 0, 1)], 0)).alias('without_embeddings'),
                fn.SUM(Document.chunk_num).alias('total_chunks'),
            )
            .where(Document.kb_id.in_(kb_ids), Document.status == StatusEnum.VALID.value)
            .dicts()
            .get()
        )

    for row in status_rows:
        status_key = STATUS_LABELS.get(row['run_status'] or TaskStatus.UNSTART.value, 'unknown')
        count = row.get('doc_count', 0) or 0
        chunks = row.get('chunk_sum', 0) or 0
        status_counts[status_key] = status_counts.get(status_key, 0) + count
        total_docs += count
        total_chunks += chunks
        started_at = row.get('last_started_at')
        if started_at and (last_started_at is None or started_at > last_started_at):
            last_started_at = started_at

    with_embeddings = int(embedding_row.get('with_embeddings') or 0)
    without_embeddings = int(embedding_row.get('without_embeddings') or 0)
    done_docs = status_counts.get('done', 0)
    return {
        'total': total_docs,
        'chunkSum': total_chunks,
        'statusCounts': status_counts,
        'parsed': {
            'done': done_docs,
            'running': status_counts.get('running', 0),
            'unstart': status_counts.get('unstart', 0),
            'cancel': status_counts.get('cancel', 0),
            'fail': status_counts.get('fail', 0),
            'progress': (done_docs / total_docs) if total_docs else 0.0,
            'remaining': total_docs - done_docs if total_docs else 0,
        },
        'embeddings': {
            'withEmbeddings': with_embeddings,
            'withoutEmbeddings': without_embeddings,
            'totalChunks': int(embedding_row.get('total_chunks') or 0),
            'progress': (with_embeddings / total_docs) if total_docs else 0.0,
        },
        'lastStartedAt': last_started_at.isoformat() if last_started_at else None,
    }


def _document_inventory_row(row):
    run_value = row.get('run') or TaskStatus.UNSTART.value
    chunk_num = row.get('chunk_num') or 0
    return {
        'id': row.get('id'),
        'name': row.get('name'),
        'status': STATUS_LABELS.get(run_value, 'unknown'),
        'processed': run_value == TaskStatus.DONE.value,
        'hasEmbedding': chunk_num > 0,
        'chunkNum': chunk_num,
        'tokenNum': row.get('token_num') or 0,
        'size': row.get('size') or 0,
        'progress': row.get('progress') or 0,
        'progressMsg': row.get('progress_msg') or '',
        'processBeginAt': row['process_begin_at'].isoformat() if row.get('process_begin_at') else '',
        'updatedAt': timestamp_to_date(row['update_time']) if row.get('update_time') else '',
    }


def _iter_sentenze_db_rows(kb_ids):
    batch_size = 2000
    offset = 0
    with DB.connection_context():
        while True:
            rows = list(
                Document
                .select(Document.id, Document.name, Document.run, Document.chunk_num)
                .where(
                    Document.kb_id.in_(kb_ids),
                    Document.status == StatusEnum.VALID.value,
                )
                .order_by(Document.name.asc())
                .offset(offset)
                .limit(batch_size)
                .dicts()
            )
            if not rows:
                break
            for row in rows:
                run_value = row.get('run') or TaskStatus.UNSTART.value
                chunk_num = row.get('chunk_num') or 0
                yield {
                    'id': row.get('id'),
                    'name': row.get('name'),
                    'run': run_value,
                    'status': STATUS_LABELS.get(run_value, 'unknown'),
                    'hasEmbedding': chunk_num > 0,
                    'chunk_num': chunk_num,
                }
            offset += batch_size


def _get_sentenze_manifest(dataset_name: str, force_refresh: bool = False) -> dict:
    now = datetime.utcnow()
    cached = _SENTENZE_MANIFEST_CACHE
    if (
        not force_refresh
        and cached.get('manifest')
        and cached.get('dataset') == dataset_name
        and cached.get('generatedAt')
        and (now - cached['generatedAt']).total_seconds() < SENTENZE_MANIFEST_TTL_SEC
    ):
        return cached['manifest']

    kb_ids, _ = _resolve_dataset_kb_ids(dataset_name)
    if not kb_ids:
        return {
            'dataset': dataset_name, 'found': False,
            'generatedAt': now.isoformat() + 'Z',
            'totalFiles': 0, 'uniqueBase': 0, 'duplicateGroups': 0, 'index': {},
        }

    manifest = build_manifest_index(list(_iter_sentenze_db_rows(kb_ids)))
    manifest.update({
        'dataset': dataset_name,
        'found': True,
        'generatedAt': now.isoformat() + 'Z',
    })
    cached.update(dataset=dataset_name, generatedAt=now, manifest=manifest)
    return manifest


def _manifest_jsonl_stream(manifest: dict):
    for key in sorted(manifest.get('index', {}).keys()):
        entry = manifest['index'][key]
        best = entry.get('bestFile') or {}
        yield json.dumps({
            'b': entry['nomeBase'], 'n': entry['copies'],
            'd': entry['hasDone'], 'e': entry['hasEmbedding'],
            'dup': entry['isDuplicate'], 'bf': best.get('name'),
            'bs': best.get('status'), 'be': best.get('hasEmbedding'),
        }, ensure_ascii=False) + '\n'


def _manifest_keys_stream(manifest: dict):
    for key in sorted(manifest.get('index', {}).keys()):
        yield manifest['index'][key]['nomeBase'] + '\n'


def _iter_sentenze_csv_rows(kb_ids, status_filter='all', embedding_filter='all', search=''):
    status_to_run = {label: run for run, label in STATUS_LABELS.items()}
    header = [
        'id', 'name', 'status', 'processed', 'hasEmbedding',
        'chunkNum', 'tokenNum', 'size', 'progress', 'progressMsg',
        'processBeginAt', 'updatedAt',
    ]
    yield header
    with DB.connection_context():
        query = Document.select().where(
            Document.kb_id.in_(kb_ids),
            Document.status == StatusEnum.VALID.value,
        )
        if status_filter != 'all':
            query = query.where(Document.run == status_to_run[status_filter])
        if embedding_filter == 'with':
            query = query.where(Document.chunk_num > 0)
        elif embedding_filter == 'without':
            query = query.where(Document.chunk_num == 0)
        if search:
            query = query.where(Document.name.contains(search))
        batch_size = 2000
        offset = 0
        while True:
            rows = list(query.order_by(Document.name.asc()).offset(offset).limit(batch_size).dicts())
            if not rows:
                break
            for row in rows:
                doc = _document_inventory_row(row)
                yield [doc[col] for col in header]
            offset += batch_size


def _csv_stream(rows_iter):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    for row in rows_iter:
        writer.writerow(row)
        buffer.seek(0)
        data = buffer.read()
        buffer.seek(0)
        buffer.truncate(0)
        yield data

# Blueprint per le API admin
# NOTA: url_prefix viene impostato automaticamente dal sistema di auto-registrazione
# Il path finale sarà /v1/admin/...
from flask import Blueprint
manager = Blueprint('admin', __name__)

ADMIN_SESSION_KEY = "sgai_admin_authenticated"
ADMIN_LOGIN_AT_KEY = "sgai_admin_login_at"
ADMIN_SESSION_LIFETIME = timedelta(hours=8)


@manager.record_once
def _configure_admin_session(state):
    """Mantiene il cookie server-side compatibile con la configurazione Flask-Session."""
    state.app.config.setdefault("SESSION_COOKIE_HTTPONLY", True)
    if not state.app.config.get("SESSION_COOKIE_SAMESITE"):
        state.app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
    state.app.config["PERMANENT_SESSION_LIFETIME"] = ADMIN_SESSION_LIFETIME


def _bearer_token():
    value = request.headers.get("Authorization", "")
    if not value.lower().startswith("bearer "):
        return ""
    return value[7:].strip()


def _constant_time_match(supplied, expected):
    candidate = str(supplied or "").encode()
    configured = str(expected or "").encode()
    return bool(candidate) and bool(configured) and hmac.compare_digest(candidate, configured)


def admin_authenticated():
    if _constant_time_match(_bearer_token(), os.getenv("SGAI_ADMIN_API_TOKEN")):
        return True
    if not session.get(ADMIN_SESSION_KEY):
        return False
    try:
        login_at = float(session.get(ADMIN_LOGIN_AT_KEY, 0))
    except (TypeError, ValueError):
        login_at = 0
    if login_at <= 0 or time.time() - login_at > ADMIN_SESSION_LIFETIME.total_seconds():
        session.clear()
        return False
    return True


def require_admin_session(func):
    @wraps(func)
    def wrapped(*args, **kwargs):
        if not admin_authenticated():
            return jsonify({"data": None, "error": "unauthorized"}), 401
        return func(*args, **kwargs)
    return wrapped


@manager.route('/auth/login', methods=['POST'])
def admin_login():
    body = request.get_json(silent=True) or {}
    if not _constant_time_match(body.get("password"), os.getenv("SGAI_ADMIN_PASSWORD")):
        session.clear()
        return jsonify({"data": {"authenticated": False}, "error": "invalid credentials"}), 401
    session.clear()
    session.permanent = True
    session[ADMIN_SESSION_KEY] = True
    session[ADMIN_LOGIN_AT_KEY] = time.time()
    return jsonify({"data": {"authenticated": True, "expiresIn": 8 * 60 * 60}})


@manager.route('/auth/status', methods=['GET'])
def admin_auth_status():
    return jsonify({"data": {"authenticated": admin_authenticated()}})


@manager.route('/auth/logout', methods=['POST'])
@require_admin_session
def admin_logout():
    session.clear()
    return jsonify({"data": {"authenticated": False}})


@manager.route('/user-sessions', methods=['POST'])
@require_admin_session
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
@require_admin_session
def get_knowledge_status():
    dataset_name = request.args.get('dataset', 'SENTENZE BANCA DATI MEF')
    try:
        kb_ids, _ = _resolve_dataset_kb_ids(dataset_name)
        if not kb_ids:
            return get_json_result(data={
                'dataset': dataset_name, 'found': False, 'total': 0, 'chunkSum': 0,
                'statusCounts': {label: 0 for label in STATUS_LABELS.values()},
                'progress': 0.0, 'remaining': 0,
            })
        summary = _build_sentenze_summary(kb_ids)
        return get_json_result(data={
            'dataset': dataset_name, 'found': True,
            'total': summary['total'], 'chunkSum': summary['chunkSum'],
            'statusCounts': summary['statusCounts'],
            'progress': summary['parsed']['progress'],
            'remaining': summary['parsed']['remaining'],
            'lastStartedAt': summary['lastStartedAt'],
            'embeddings': summary['embeddings'],
        })
    except Exception as e:
        return server_error_response(e)


@manager.route('/sentenze-inventory', methods=['GET'])
@require_admin_session
def get_sentenze_inventory():
    dataset_name = request.args.get('dataset', 'SENTENZE BANCA DATI MEF')
    try:
        page = max(1, int(request.args.get('page', 1)))
        page_size = min(
            MAX_SENTENZE_PAGE_SIZE,
            max(1, int(request.args.get('page_size', DEFAULT_SENTENZE_PAGE_SIZE))),
        )
    except (TypeError, ValueError):
        return get_json_result(
            data={'error': 'page e page_size devono essere interi'},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    status_filter = (request.args.get('status', 'all') or 'all').lower()
    embedding_filter = (request.args.get('embedding', 'all') or 'all').lower()
    search = (request.args.get('search', '') or '').strip()
    summary_only = (request.args.get('summary_only', 'false') or 'false').lower() in ('1', 'true', 'yes')
    status_to_run = {label: run for run, label in STATUS_LABELS.items()}
    if status_filter != 'all' and status_filter not in status_to_run:
        return get_json_result(
            data={'error': f"status non valido: {status_filter}"},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    if embedding_filter not in ('with', 'without', 'all'):
        return get_json_result(
            data={'error': f"embedding non valido: {embedding_filter}"},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    try:
        kb_ids, embd_id = _resolve_dataset_kb_ids(dataset_name)
        if not kb_ids:
            empty_status = {label: 0 for label in STATUS_LABELS.values()}
            return get_json_result(data={
                'dataset': dataset_name, 'found': False, 'embeddingModel': None,
                'summary': {
                    'total': 0, 'statusCounts': empty_status,
                    'parsed': {
                        'done': 0, 'running': 0, 'unstart': 0, 'cancel': 0,
                        'fail': 0, 'progress': 0.0, 'remaining': 0,
                    },
                    'embeddings': {
                        'withEmbeddings': 0, 'withoutEmbeddings': 0,
                        'totalChunks': 0, 'progress': 0.0,
                    },
                },
                'documents': [],
                'pagination': {'page': page, 'pageSize': page_size, 'total': 0, 'totalPages': 0},
            })
        summary = _build_sentenze_summary(kb_ids)
        response = {
            'dataset': dataset_name, 'found': True, 'embeddingModel': embd_id,
            'summary': summary, 'documents': [],
            'pagination': {'page': page, 'pageSize': page_size, 'total': 0, 'totalPages': 0},
        }
        if summary_only:
            return get_json_result(data=response)
        with DB.connection_context():
            query = Document.select().where(
                Document.kb_id.in_(kb_ids),
                Document.status == StatusEnum.VALID.value,
            )
            if status_filter != 'all':
                query = query.where(Document.run == status_to_run[status_filter])
            if embedding_filter == 'with':
                query = query.where(Document.chunk_num > 0)
            elif embedding_filter == 'without':
                query = query.where(Document.chunk_num == 0)
            if search:
                query = query.where(Document.name.contains(search))
            total_filtered = query.count()
            rows = list(
                query.order_by(Document.update_time.desc())
                .offset((page - 1) * page_size).limit(page_size).dicts()
            )
        response['documents'] = [_document_inventory_row(row) for row in rows]
        response['pagination'] = {
            'page': page, 'pageSize': page_size, 'total': total_filtered,
            'totalPages': (total_filtered + page_size - 1) // page_size if total_filtered else 0,
        }
        return get_json_result(data=response)
    except Exception as e:
        return server_error_response(e)


@manager.route('/sentenze-export', methods=['GET'])
@require_admin_session
def export_sentenze_csv():
    dataset_name = request.args.get('dataset', 'SENTENZE BANCA DATI MEF')
    status_filter = (request.args.get('status', 'all') or 'all').lower()
    embedding_filter = (request.args.get('embedding', 'all') or 'all').lower()
    search = (request.args.get('search', '') or '').strip()
    status_to_run = {label: run for run, label in STATUS_LABELS.items()}
    if status_filter != 'all' and status_filter not in status_to_run:
        return get_json_result(
            data={'error': f"status non valido: {status_filter}"},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    if embedding_filter not in ('with', 'without', 'all'):
        return get_json_result(
            data={'error': f"embedding non valido: {embedding_filter}"},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    try:
        kb_ids, _ = _resolve_dataset_kb_ids(dataset_name)
        if not kb_ids:
            return get_json_result(
                data={'error': f'Dataset "{dataset_name}" non trovato'},
                code=settings.RetCode.DATA_ERROR,
            )
        filename = f"sentenze_inventory_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"
        return Response(
            _csv_stream(_iter_sentenze_csv_rows(
                kb_ids, status_filter=status_filter,
                embedding_filter=embedding_filter, search=search,
            )),
            mimetype='text/csv; charset=utf-8',
            headers={
                'Content-Disposition': f'attachment; filename="{filename}"',
                'Cache-Control': 'no-store',
                'X-SGAI-Generated-At': datetime.utcnow().isoformat() + 'Z',
            },
        )
    except Exception as e:
        return server_error_response(e)


@manager.route('/sentenze-manifest', methods=['GET'])
@require_admin_session
def get_sentenze_manifest():
    dataset_name = request.args.get('dataset', 'SENTENZE BANCA DATI MEF')
    fmt = (request.args.get('format', 'summary') or 'summary').lower()
    force_refresh = (request.args.get('refresh', 'false') or 'false').lower() in ('1', 'true', 'yes')
    if fmt not in ('summary', 'keys', 'jsonl'):
        return get_json_result(
            data={'error': f'format non valido: {fmt}'},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    try:
        manifest = _get_sentenze_manifest(dataset_name, force_refresh=force_refresh)
        if fmt == 'summary':
            return get_json_result(data={
                'dataset': manifest.get('dataset', dataset_name),
                'found': manifest.get('found', False),
                'generatedAt': manifest.get('generatedAt'),
                'cacheTtlSec': SENTENZE_MANIFEST_TTL_SEC,
                'totalFiles': manifest.get('totalFiles', 0),
                'uniqueBase': manifest.get('uniqueBase', 0),
                'duplicateGroups': manifest.get('duplicateGroups', 0),
                'formats': {
                    'keys': '/v1/admin/sentenze-manifest?format=keys',
                    'jsonl': '/v1/admin/sentenze-manifest?format=jsonl',
                    'check': '/v1/admin/sentenze-check?codice=V10&numero=13747&anno=2021',
                },
            })
        stream = _manifest_keys_stream(manifest) if fmt == 'keys' else _manifest_jsonl_stream(manifest)
        mimetype = 'text/plain; charset=utf-8' if fmt == 'keys' else 'application/x-ndjson; charset=utf-8'
        return Response(
            stream, mimetype=mimetype,
            headers={
                'Cache-Control': f'private, max-age={SENTENZE_MANIFEST_TTL_SEC}',
                'X-SGAI-Generated-At': manifest.get('generatedAt', ''),
                'X-SGAI-Unique-Base': str(manifest.get('uniqueBase', 0)),
            },
        )
    except Exception as e:
        return server_error_response(e)


@manager.route('/sentenze-check', methods=['GET'])
@require_admin_session
def check_sentenza():
    dataset_name = request.args.get('dataset', 'SENTENZE BANCA DATI MEF')
    force_refresh = (request.args.get('refresh', 'false') or 'false').lower() in ('1', 'true', 'yes')
    lookup_key = resolve_lookup_key(
        nome_file=(request.args.get('name', '') or '').strip(),
        nome_base_param=(request.args.get('nome_base', '') or '').strip(),
        codice=(request.args.get('codice', '') or '').strip(),
        numero=(request.args.get('numero', '') or '').strip(),
        anno=(request.args.get('anno', '') or '').strip(),
        tipo=(request.args.get('tipo', 'Sentenza') or 'Sentenza').strip(),
    )
    if not lookup_key:
        return get_json_result(
            data={'error': 'Specificare name, nome_base oppure codice+numero+anno'},
            code=settings.RetCode.ARGUMENT_ERROR,
        )
    try:
        manifest = _get_sentenze_manifest(dataset_name, force_refresh=force_refresh)
        result = lookup_in_manifest(manifest, lookup_key)
        result['dataset'] = dataset_name
        result['generatedAt'] = manifest.get('generatedAt')
        return get_json_result(data=result)
    except Exception as e:
        return server_error_response(e)


@manager.route('/sentenze-codici', methods=['GET'])
@require_admin_session
def get_sentenze_codici():
    codice = (request.args.get('codice', '') or '').strip().upper()
    if codice:
        info = CODICE_TO_CORTE.get(codice)
        if not info:
            return get_json_result(
                data={'error': f'Codice non trovato: {codice}'},
                code=settings.RetCode.DATA_ERROR,
            )
        return get_json_result(data=info)
    return get_json_result(data={
        'total': len(CODICI_CORTE),
        'note': 'V/U = 1 grado provinciale, Z/V2 = 2 grado regionale.',
        'codici': CODICE_TO_CORTE,
        'mapping': CODICI_CORTE,
    })


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
@require_admin_session
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
        
        # Trova il dataset - usa connection context solo per la query iniziale
        with DB.connection_context():
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
        
        # Chiudi il connection context prima di processare i documenti
        # Ogni metodo chiamato gestirà la propria connessione tramite decoratori
        
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
        
        # Processa ogni documento - ogni metodo gestisce la propria connessione
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

