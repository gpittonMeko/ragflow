"""
backend.py – Flask server che:
• valida l’ID-Token Google
• registra/l legge l’utente in RAM (simulazione DB)
• conta le generazioni in base al piano
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import google.auth.transport.requests
import google.oauth2.id_token
import threading
import time

app = Flask(__name__)
CORS(app)

# ATTENZIONE! deve essere identico a quello nel front-end
CLIENT_ID = "872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com"

# simulazione di un DB in RAM
users_db: dict[str, dict] = {}
db_lock = threading.Lock()

PLAN_LIMITS = {
    "free": 5,
    "standard": 50,
    "premium": 1_000_000_000
}


def verify_token(token: str) -> dict | None:
    """Restituisce il payload del token se valido, altrimenti None"""
    try:
        req = google.auth.transport.requests.Request()
        id_info = google.oauth2.id_token.verify_oauth2_token(
            token, req, CLIENT_ID
        )
        return id_info
    except Exception as e:
        print("Token validation failed:", e)
        return None


# ============ AUTH ============ #
@app.post("/api/auth/google")
def google_auth():
    token = (request.json or {}).get("token")
    if not token:
        return jsonify(error="Missing token"), 400

    id_info = verify_token(token)
    if not id_info:
        return jsonify(error="Invalid token"), 401

    email = id_info.get("email")
    if not email:
        return jsonify(error="Email not present in token"), 400

    with db_lock:
        user = users_db.setdefault(
            email, {"plan": "free", "usedGenerations": 0}
        )

    return jsonify(
        email=email,
        plan=user["plan"],
        usedGenerations=user["usedGenerations"],
        generationLimit=PLAN_LIMITS[user["plan"]],
    )


# ============ GENERATE ============ #
@app.post("/api/generate")
def generate():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify(error="Missing Bearer token"), 401
    token = auth_header.split(" ", 1)[1]

    id_info = verify_token(token)
    if not id_info:
        return jsonify(error="Invalid token"), 401
    email = id_info.get("email")

    with db_lock:
        user = users_db.get(email)
        if not user:
            return jsonify(error="User not registered"), 401

        limit = PLAN_LIMITS[user["plan"]]
        if user["plan"] != "premium" and user["usedGenerations"] >= limit:
            return jsonify(error="Generation limit reached"), 403

        user["usedGenerations"] += 1
        remaining = max(limit - user["usedGenerations"], 0)

    # simulazione del tempo di risposta AI
    time.sleep(1)

    return jsonify(
        message="Fake AI response",
        remainingGenerations=remaining,
        usedGenerations=users_db[email]["usedGenerations"],
    )


# ============ UPGRADE PIANO ============ #
@app.post("/api/upgrade")
def upgrade_plan():
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify(error="Missing Bearer token"), 401
    token = auth_header.split(" ", 1)[1]

    id_info = verify_token(token)
    if not id_info:
        return jsonify(error="Invalid token"), 401
    email = id_info.get("email")

    amount = (request.json or {}).get("amount")  # es. 49.99, 69.99
    if amount not in [49.99, 69.99]:
        return jsonify(error="Invalid amount"), 400

    with db_lock:
        user = users_db.get(email)
        if not user:
            return jsonify(error="User not registered"), 401

        user["plan"] = "standard" if amount == 49.99 else "premium"
        user["usedGenerations"] = 0  # reset
        plan = user["plan"]
        limit = PLAN_LIMITS[plan]

    return jsonify(plan=plan, generationLimit=limit)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)