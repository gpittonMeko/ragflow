from flask import Flask, request, jsonify
from flask_cors import CORS
import google.auth.transport.requests
import google.oauth2.id_token
import threading

app = Flask(__name__)
CORS(app)

CLIENT_ID = "872236618020-3len9toeui389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com"

users_db = {}
db_lock = threading.Lock()

PLAN_LIMITS = {
    "free": 5,
    "standard": 50,
    "premium": 1_000_000_000,  # quasi infinito
}

def verify_token(token):
    try:
        request_adapter = google.auth.transport.requests.Request()
        id_info = google.oauth2.id_token.verify_oauth2_token(token, request_adapter, CLIENT_ID)
        print("ID token info:", id_info)
        return id_info
    except Exception as e:
        print(f"Token validation failed: {e}")
        return None


@app.route('/api/auth/google', methods=['POST'])
def google_auth():
    data = request.json or {}
    token = data.get('token')
    if not token:
        return jsonify({"error": "Missing token"}), 400

    id_info = verify_token(token)
    if not id_info:
        return jsonify({"error": "Invalid token"}), 401

    email = id_info.get('email')
    if not email:
        return jsonify({"error": "No email in token"}), 400

    with db_lock:
        user = users_db.setdefault(email, {"plan": "free", "usedGenerations": 0})

    return jsonify({
        'email': email,
        'plan': user['plan'],
        'usedGenerations': user['usedGenerations'],
        'generationLimit': PLAN_LIMITS.get(user['plan'], 5)
    })


@app.route('/api/generate', methods=['POST'])
def generate():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"error": "Missing Bearer token"}), 401
    token = auth_header.split(' ')[1]

    id_info = verify_token(token)
    if not id_info:
        return jsonify({"error": "Invalid token"}), 401

    email = id_info.get('email')
    if not email:
        return jsonify({"error": "Invalid user email"}), 401

    with db_lock:
        if email not in users_db:
            return jsonify({"error": "User not registered"}), 401
        user = users_db[email]
        limit = PLAN_LIMITS.get(user['plan'], 5)
        if user['plan'] != 'premium' and user['usedGenerations'] >= limit:
            return jsonify({"error": "Generation limit reached"}), 403
        user['usedGenerations'] += 1
        remaining = max(limit - user['usedGenerations'], 0)

    # Qui puoi mettere la logica effettiva di generazione AI

    return jsonify({"remainingGenerations": remaining})


@app.route('/api/upgrade', methods=['POST'])
def upgrade_plan():
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        return jsonify({"error": "Missing Bearer token"}), 401
    token = auth_header.split(' ')[1]

    id_info = verify_token(token)
    if not id_info:
        return jsonify({"error": "Invalid token"}), 401

    email = id_info.get('email')
    if not email:
        return jsonify({"error": "Invalid user email"}), 401

    data = request.json or {}
    amount = data.get('amount')
    if amount not in [49.99, 69.99]:
        return jsonify({"error": "Invalid amount"}), 400

    with db_lock:
        if email not in users_db:
            return jsonify({"error": "User not registered"}), 401

        if amount == 49.99:
            users_db[email]['plan'] = 'standard'
        else:
            users_db[email]['plan'] = 'premium'

        # Reset contatore generazioni all'upgrade
        users_db[email]['usedGenerations'] = 0
        plan = users_db[email]['plan']
        limit = PLAN_LIMITS.get(plan, 5)

    return jsonify({"plan": plan, "generationLimit": limit})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)