# stripe_routes.py
import os
from flask import Blueprint, request, jsonify
import stripe

from backend import users_db, db_lock, PLAN_LIMITS   # importa il "DB" in RAM

stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")

stripe_bp = Blueprint("stripe_bp", __name__)

SUCCESS_URL = os.environ.get("APP_URL", "http://localhost:5173") + "/success?session_id={CHECKOUT_SESSION_ID}"
CANCEL_URL  = os.environ.get("APP_URL", "http://localhost:5173") + "/"

@stripe_bp.post("/create-checkout-session")
def create_checkout_session():
    """
    Crea una Checkout Session di Stripe per passare al piano selected_plan.
    Body JSON atteso: { "email": "...", "selected_plan": "standard" | "premium" }
    """
    data = request.get_json() or {}
    email = data.get("email")
    selected_plan = data.get("selected_plan", "premium")

    if selected_plan not in ("standard", "premium"):
        return jsonify(error="Invalid plan"), 400

    price_id = os.environ.get(
        "STRIPE_PRICE_PREMIUM" if selected_plan == "premium" else "STRIPE_PRICE_STANDARD"
    )

    if not price_id:
        return jsonify(error="Stripe price missing"), 500

    # Crea la sessione
    session = stripe.checkout.Session.create(
        mode="subscription",
        success_url=SUCCESS_URL,
        cancel_url=CANCEL_URL,
        customer_email=email,   # usa email se non hai customer id
        line_items=[{"price": price_id, "quantity": 1}],
        metadata={"selected_plan": selected_plan, "email": email},
    )

    return jsonify(sessionId=session.id)


@stripe_bp.post("/webhook")
def stripe_webhook():
    """
    Riceve gli eventi Stripe.
    Deve usare il raw body per verificare la firma.
    """
    payload = request.get_data(as_text=False)  # bytes
    sig_header = request.headers.get("Stripe-Signature", "")
    endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET")

    try:
        event = stripe.Webhook.construct_event(
            payload=payload,
            sig_header=sig_header,
            secret=endpoint_secret
        )
    except Exception as e:
        return jsonify(error=str(e)), 400

    # Gestisci solo quello che ti serve
    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        email = session["metadata"].get("email")
        plan = session["metadata"].get("selected_plan", "premium")

        with db_lock:
            user = users_db.setdefault(email, {"plan": "free", "usedGenerations": 0})
            user["plan"] = plan
            user["usedGenerations"] = 0

    elif event["type"] == "customer.subscription.deleted":
        sub = event["data"]["object"]
        email = sub.get("customer_email")  # solo se presente, altrimenti tieni customer->email nel DB
        if email:
            with db_lock:
                user = users_db.get(email)
                if user:
                    user["plan"] = "free"
                    user["usedGenerations"] = 0

    return jsonify(received=True)
