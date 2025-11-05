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
from flask_login import login_required
from api.db.db_models import API4Conversation, DB
from api.utils.api_utils import server_error_response, get_json_result
from collections import defaultdict
import re

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

