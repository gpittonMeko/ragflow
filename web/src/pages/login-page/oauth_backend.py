"""
oauth_backend.py – Flask server one-file
• valida l’ID-Token Google
• mantiene un “DB” in RAM con limiti: anon (totale), user free (giornaliero), premium (illimitato)
• espone /api/quota e /api/generate
• crea la Stripe Checkout Session (email facoltativa)
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

ANON_TOTAL_LIMIT = 5          # ← Anonimo: limite TOTALE
FREE_DAILY_LIMIT = 5          # ← User free: limite GIORNALIERO
PREMIUM_LIMIT = 1_000_000_000 # ← illimitato di fatto

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
APP_URL = os.getenv("APP_URL", "http://localhost:5173")
SUCCESS_URL = f"{APP_URL}/success?session_id={{CHECKOUT_SESSION_ID}}"
CANCEL_URL = f"{APP_URL}/"

def today_key() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())

# ─────────────────────────────────────────────────────────────
# APP & “DB” in RAM
# ─────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

# users_db struttura:
# - utenti loggati (chiave = email):
#     {"plan": "free"/"premium", "usedToday": int, "day": "YYYY-MM-DD", "email": email}
# - anonimi (chiave = "anon:<client_id>"):
#     {"plan": "anon", "usedTotal": int, "email": None}
users_db: Dict[str, Dict] = {}
db_lock = threading.Lock()

def verify_token(token: str) -> Optional[Dict]:
    try:
        req = google.auth.transport.requests.Request()
        return google.oauth2.id_token.verify_oauth2_token(token, req, CLIENT_ID)
    except Exception as exc:  # noqa: BLE001
        print("Token validation failed:", exc)
        return None

def _get_user_logged(email: str) -> Dict:
    with db_lock:
        u = users_db.setdefault(email, {
            "plan": "free",
            "usedToday": 0,
            "day": today_key(),
            "email": email,
        })
        # reset giornaliero
        if u.get("day") != today_key():
            u["day"] = today_key()
            u["usedToday"] = 0
        return u

def _get_user_anon(client_id: str) -> Dict:
    key = f"anon:{client_id}"
    with db_lock:
        u = users_db.setdefault(key, {
            "plan": "anon",
            "usedTotal": 0,
            "email": None,
        })
        return u

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

    user = _get_user_logged(email)
    limit = PREMIUM_LIMIT if user["plan"] == "premium" else FREE_DAILY_LIMIT
    remaining = max(limit - user["usedToday"], 0)

    return jsonify(
        email=email,
        plan=user["plan"],
        usedToday=user["usedToday"],
        dailyLimit=limit,
        remainingToday=remaining,
        day=user["day"],
    )

# ─────────────────────────────────────────────────────────────
# QUOTA
# ─────────────────────────────────────────────────────────────
@app.get("/api/quota")
def quota():
    auth_header = request.headers.get("Authorization", "")
    client_id = (request.headers.get("X-Client-Id") or "").strip()

    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        id_info = verify_token(token)
        if not id_info:
            return jsonify(error="Invalid token"), 401
        email = id_info.get("email")
        user = _get_user_logged(email)
        limit = PREMIUM_LIMIT if user["plan"] == "premium" else FREE_DAILY_LIMIT
        return jsonify(
            scope="user",
            id=email,
            plan=user["plan"],
            usedToday=user["usedToday"],
            dailyLimit=limit,
            remainingToday=max(limit - user["usedToday"], 0),
            day=user["day"],
        )

    if client_id:
        u = _get_user_anon(client_id)
        return jsonify(
            scope="anon",
            id=client_id,
            plan="anon",
            usedTotal=u["usedTotal"],
            totalLimit=ANON_TOTAL_LIMIT,
            remainingTotal=max(ANON_TOTAL_LIMIT - u["usedTotal"], 0),
        )

    return jsonify(error="Missing token or X-Client-Id"), 401

# ─────────────────────────────────────────────────────────────
# GENERATE (finto) – enforcement lato server
# ─────────────────────────────────────────────────────────────
@app.post("/api/generate")
def generate():
    auth_header = request.headers.get("Authorization", "")
    client_id = (request.headers.get("X-Client-Id") or "").strip()

    # Utente loggato
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        id_info = verify_token(token)
        if not id_info:
            return jsonify(error="Invalid token"), 401
        email = id_info.get("email")
        user = _get_user_logged(email)

        with db_lock:
            # premium = illimitato (non blocco, ma tengo traccia incrementando)
            if user["plan"] != "premium":
                limit = FREE_DAILY_LIMIT
                if user["usedToday"] >= limit:
                    return jsonify(
                        error="Daily limit reached",
                        plan=user["plan"],
                        usedToday=user["usedToday"],
                        dailyLimit=limit,
                        remainingToday=0,
                        day=user["day"],
                    ), 403
                user["usedToday"] += 1
                remaining = max(limit - user["usedToday"], 0)
            else:
                # premium: nessun limite; contiamo comunque se vuoi
                user["usedToday"] = user.get("usedToday", 0) + 1
                remaining = PREMIUM_LIMIT  # simbolico

        time.sleep(1)
        return jsonify(
            message="Fake AI response",
            scope="user",
            plan=user["plan"],
            usedToday=user["usedToday"],
            dailyLimit=(PREMIUM_LIMIT if user["plan"] == "premium" else FREE_DAILY_LIMIT),
            remainingToday=remaining,
            day=user["day"],
        )

    # Anonimo
    if client_id:
        user = _get_user_anon(client_id)
        with db_lock:
            if user["usedTotal"] >= ANON_TOTAL_LIMIT:
                return jsonify(
                    error="Total limit reached",
                    scope="anon",
                    usedTotal=user["usedTotal"],
                    totalLimit=ANON_TOTAL_LIMIT,
                    remainingTotal=0,
                ), 403
            user["usedTotal"] += 1
            remaining = max(ANON_TOTAL_LIMIT - user["usedTotal"], 0)

        time.sleep(1)
        return jsonify(
            message="Fake AI response",
            scope="anon",
            usedTotal=user["usedTotal"],
            totalLimit=ANON_TOTAL_LIMIT,
            remainingTotal=remaining,
        )

    return jsonify(error="Missing Bearer token or X-Client-Id"), 401

# ─────────────────────────────────────────────────────────────
# STRIPE – Create Checkout Session
# ─────────────────────────────────────────────────────────────
@app.post("/api/stripe/create-checkout-session")
def create_checkout_session():
    if not stripe.api_key:
        return jsonify(error="Stripe secret key missing"), 500

    data = request.get_json() or {}
    email = data.get("email")

    price_id = os.getenv("STRIPE_PRICE_PREMIUM")
    if not price_id:
        msg = "Stripe price missing: env STRIPE_PRICE_PREMIUM non impostata"
        print("\033[91m" + msg + "\033[0m")
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
        print("\033[92mStripe session OK:\033[0m", session.id)
        return jsonify(sessionId=session.id)
    except Exception as exc:
        print("\033[91mStripe error:\033[0m", exc)
        return jsonify(error="Stripe exception", debug=str(exc)), 500

# ─────────────────────────────────────────────────────────────
# STRIPE – Webhook
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
    except Exception as exc:  # noqa: BLE001
        return jsonify(error=str(exc)), 400

    evt_type = event["type"]

    if evt_type == "checkout.session.completed":
        session_obj = event["data"]["object"]
        email = (session_obj.get("metadata") or {}).get("email")
        plan = (session_obj.get("metadata") or {}).get("selected_plan", "premium")
        if email:
            with db_lock:
                u = users_db.setdefault(email, {"plan": "free", "usedToday": 0, "day": today_key(), "email": email})
                u["plan"] = plan
                u["usedToday"] = 0
                u["day"] = today_key()

    elif evt_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        email = sub.get("customer_email")
        if email:
            with db_lock:
                u = users_db.get(email)
                if u:
                    u["plan"] = "free"
                    u["usedToday"] = 0
                    u["day"] = today_key()

    return jsonify(received=True)

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
