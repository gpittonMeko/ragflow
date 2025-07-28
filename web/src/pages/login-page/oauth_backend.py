"""
backend.py – Flask server che:
• valida l’ID-Token Google
• gestisce utenti/limiti in RAM (simulazione DB)
• crea le Stripe Checkout Session
• riceve il webhook Stripe e aggiorna il piano
"""

import os
import time
import threading

from flask import Flask, request, jsonify
from flask_cors import CORS

import google.auth.transport.requests
import google.oauth2.id_token

import stripe

# ===================== CONFIG ===================== #
CLIENT_ID = "872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com"

PLAN_LIMITS = {
    "free": 5,
    "standard": 50,
    "premium": 1_000_000_000,
}

# Variabili d'ambiente (imposta nel tuo docker/hosting)
# STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_STANDARD, STRIPE_PRICE_PREMIUM, APP_URL
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
APP_URL = os.environ.get("APP_URL", "http://localhost:5173")
SUCCESS_URL = f"{APP_URL}/success?session_id={{CHECKOUT_SESSION_ID}}"
CANCEL_URL = f"{APP_URL}/"

# ===================== APP ===================== #
app = Flask(__name__)
CORS(app)

# DB in RAM
users_db: dict[str, dict] = {}
db_lock = threading.Lock()


# ===================== HELPER ===================== #
def verify_token(token: str) -> dict | None:
    """Ritorna il payload del token Google se valido, altrimenti None."""
    try:
        req = google.auth.transport.requests.Request()
        id_info = google.oauth2.id_token.verify_oauth2_token(token, req, CLIENT_ID)
        return id_info
    except Exception as e:
        print("Token validation failed:", e)
        return None


# ===================== AUTH ===================== #
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
        user = users_db.setdefault(email, {"plan": "free", "usedGenerations": 0})

    return jsonify(
        email=email,
        plan=user["plan"],
        usedGenerations=user["usedGenerations"],
        generationLimit=PLAN_LIMITS[user["plan"]],
    )


# ===================== GENERATE (FAKE AI) ===================== #
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

    # simulazione ritardo risposta
    time.sleep(1)

    return jsonify(
        message="Fake AI response",
        remainingGenerations=remaining,
        usedGenerations=users_db[email]["usedGenerations"],
    )


# ===================== STRIPE: CREATE CHECKOUT SESSION ===================== #
@app.post("/api/stripe/create-checkout-session")
def create_checkout_session():
    data = request.get_json() or {}
    email = data.get("email")
    selected_plan = data.get("selected_plan", "premium")

    if selected_plan not in ("standard", "premium"):
        return jsonify(error="Invalid plan"), 400

    price_env = "STRIPE_PRICE_PREMIUM" if selected_plan == "premium" else "STRIPE_PRICE_STANDARD"
    price_id = os.environ.get(price_env)
    if not price_id:
        return jsonify(error="Stripe price missing"), 500

    session = stripe.checkout.Session.create(
        mode="subscription",
        success_url=SUCCESS_URL,
        cancel_url=CANCEL_URL,
        customer_email=email,
        line_items=[{"price": price_id, "quantity": 1}],
        metadata={"selected_plan": selected_plan, "email": email},
    )

    return jsonify(sessionId=session.id)


# ===================== STRIPE: WEBHOOK ===================== #
@app.post("/api/stripe/webhook")
def stripe_webhook():
    payload = request.get_data(as_text=False)  # raw bytes
    sig_header = request.headers.get("Stripe-Signature", "")
    endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except Exception as e:
        return jsonify(error=str(e)), 400

    # gestisci gli eventi che ti servono
    evt_type = event["type"]

    if evt_type == "checkout.session.completed":
        session = event["data"]["object"]
        email = session["metadata"].get("email")
        plan = session["metadata"].get("selected_plan", "premium")

        with db_lock:
            user = users_db.setdefault(email, {"plan": "free", "usedGenerations": 0})
            user["plan"] = plan
            user["usedGenerations"] = 0

    elif evt_type == "customer.subscription.deleted":
        # downgrade se vuoi gestirlo
        subscription = event["data"]["object"]
        # qui non hai sempre l'email, conviene salvare customer->email nel tuo DB
        # se vuoi ignorare, lascia così
        pass

    return jsonify(received=True)


# ===================== MAIN ===================== #
if __name__ == "__main__":
    # In produzione usa un WSGI server (gunicorn/uwsgi). Porta: 8000 come nel tuo esempio
    app.run(host="0.0.0.0", port=8000, debug=True)
