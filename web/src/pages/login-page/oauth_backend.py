"""
backend.py – Flask server one‑file
• valida l’ID‑Token Google
• mantiene un “DB” in RAM con piano & contatore
• espone /api/generate con limite per piano
• crea la Stripe Checkout Session (email facoltativa)
• riceve il webhook Stripe e aggiorna il piano
"""

import os
import threading
import time
from typing import Dict, Optional

from flask import Flask, request, jsonify
from flask_cors import CORS

import google.auth.transport.requests
import google.oauth2.id_token
import stripe

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
CLIENT_ID = (
    "872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com"
)

PLAN_LIMITS = {
    "free": 5,
    "standard": 50,
    "premium": 1_000_000_000,
}

# Stripe – impostale nel tuo ambiente / docker‑compose
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
APP_URL = os.getenv("APP_URL", "http://localhost:5173")

SUCCESS_URL = f"{APP_URL}/success?session_id={{CHECKOUT_SESSION_ID}}"
CANCEL_URL = f"{APP_URL}/"

# ─────────────────────────────────────────────────────────────
# APP & “DB” in RAM
# ─────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

users_db: Dict[str, Dict] = {}
db_lock = threading.Lock()

# ─────────────────────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────────────────────
def verify_token(token: str) -> Optional[Dict]:
    """Restituisce il payload se il token Google è valido; altrimenti None."""
    try:
        req = google.auth.transport.requests.Request()
        return google.oauth2.id_token.verify_oauth2_token(token, req, CLIENT_ID)
    except Exception as exc:  # noqa: BLE001
        print("Token validation failed:", exc)
        return None


# ─────────────────────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────────────────────
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


# ─────────────────────────────────────────────────────────────
# GENERATE (finto)
# ─────────────────────────────────────────────────────────────
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

    time.sleep(1)  # simuliamo l’attesa AI

    return jsonify(
        message="Fake AI response",
        remainingGenerations=remaining,
        usedGenerations=user["usedGenerations"],
    )


# ─────────────────────────────────────────────────────────────
# STRIPE – Create Checkout Session
# ─────────────────────────────────────────────────────────────
@app.post("/api/stripe/create-checkout-session")
dfrom flask import Flask, request, jsonify
import stripe, os

# … variabili d’ambiente come prima …

@app.post("/api/stripe/create-checkout-session")
def create_checkout_session():
    if not stripe.api_key:
        return jsonify(error="Stripe secret key missing"), 500

    data = request.get_json() or {}
    email = data.get("email")

    price_id = os.getenv("STRIPE_PRICE_PREMIUM")
    if not price_id:
        msg = "Stripe price missing: env STRIPE_PRICE_PREMIUM non impostata"
        print("\033[91m" + msg + "\033[0m")   # rosso
        return jsonify(error=msg, debug={"price_id": None}), 500

    try:
        session = stripe.checkout.Session.create(
            mode="subscription",
            payment_method_types=["card"],
            success_url=SUCCESS_URL,
            cancel_url=CANCEL_URL,
            line_items=[{"price": price_id, "quantity": 1}],
            metadata={"selected_plan": "premium", **({"email": email} if email else {})},
            customer_email=email or None,
        )
        print("\033[92mStripe session OK:\033[0m", session.id)  # verde
        return jsonify(sessionId=session.id)
    except Exception as exc:
        print("\033[91mStripe error:\033[0m", exc)              # rosso
        return jsonify(error="Stripe exception", debug=str(exc)), 500




# ─────────────────────────────────────────────────────────────
# STRIPE – Webhook
# ─────────────────────────────────────────────────────────────
@app.post("/api/stripe/webhook")
def stripe_webhook():
    if not stripe.api_key:
        return jsonify(error="Stripe secret key missing"), 500

    endpoint_secret = os.getenv("STRIPE_WEBHOOK_SECRET")
    if not endpoint_secret:
        return jsonify(error="Webhook secret missing"), 500

    payload = request.get_data(as_text=False)
    sig_header = request.headers.get("Stripe-Signature", "")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
    except Exception as exc:  # noqa: BLE001
        return jsonify(error=str(exc)), 400

    evt_type = event["type"]

    if evt_type == "checkout.session.completed":
        session = event["data"]["object"]
        email = session["metadata"].get("email")      # può essere None
        plan = session["metadata"].get("selected_plan", "premium")

        if email:  # aggiorniamo solo se abbiamo l'e‑mail
            with db_lock:
                user = users_db.setdefault(
                    email, {"plan": "free", "usedGenerations": 0}
                )
                user["plan"] = plan
                user["usedGenerations"] = 0

    elif evt_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        email = sub.get("customer_email")
        if email:
            with db_lock:
                user = users_db.get(email)
                if user:
                    user["plan"] = "free"
                    user["usedGenerations"] = 0

    return jsonify(received=True)


# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # In produzione usa gunicorn/uwsgi. Qui debug=True per test.
    app.run(host="0.0.0.0", port=8000, debug=True)
