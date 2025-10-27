"""
oauth_backend.py – Flask server one-file
• valida l’ID-Token Google
• persiste utente su MySQL (Peewee) + sessione server-side (cookie HttpOnly)
• espone /api/me, /api/quota e /api/generate
• crea la Stripe Checkout Session (solo se utente loggato da cookie)
• riceve il webhook Stripe e aggiorna il piano nel DB
"""

import os
import threading
import time
from typing import Dict, Optional
from datetime import datetime, timedelta
import uuid
from urllib.parse import urlparse

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS

import google.auth.transport.requests
import google.oauth2.id_token
import stripe

# ─────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────
CLIENT_ID = "872236618020-3len9toeu389v3hkn4nbo198h7d5jk1c.apps.googleusercontent.com"

ANON_TOTAL_LIMIT   = 5           # ← Anonimo: limite TOTALE
FREE_DAILY_LIMIT   = 5           # ← User free: limite GIORNALIERO
PREMIUM_LIMIT      = 1_000_000_000  # ← illimitato di fatto (simbolico)

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
APP_URL = os.getenv("APP_URL", "https://sgailegal.com")  # dominio pubblico (no IP)

# Cookie valido su dominio e sottodomini (www / senza www)
_COOKIE_HOST = urlparse(APP_URL).hostname or "sgailegal.com"
COOKIE_DOMAIN = "." + _COOKIE_HOST  # => ".sgailegal.com"

# SameSite=None richiede Secure=True in HTTPS.
# Se sviluppi in locale HTTP, puoi forzare a False con ENV COOKIE_SECURE=0
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "1") != "0"

# Pagine frontend stanno sotto /oauth
SUCCESS_URL = f"{APP_URL}/oauth/success.html?session_id={{CHECKOUT_SESSION_ID}}"
CANCEL_URL  = f"{APP_URL}/oauth"

SESSION_COOKIE = "sgaai_session"

def today_key() -> str:
    return time.strftime("%Y-%m-%d", time.localtime())

# ─────────────────────────────────────────────────────────────
# APP & CORS
# ─────────────────────────────────────────────────────────────
app = Flask(__name__)
FRONT_ORIGIN = "{uri.scheme}://{uri.netloc}".format(uri=urlparse(APP_URL))
CORS(app, supports_credentials=True, origins=[FRONT_ORIGIN])

# ─────────────────────────────────────────────────────────────
# DB Peewee (utenti + sessioni)
# ─────────────────────────────────────────────────────────────
# Richiede sgai_plans.py con i modelli Peewee e ensure_tables()
# DB Peewee (utenti + sessioni)
# Richiede sgai_plans.py con i modelli Peewee e ensure_tables()
import socket

def wait_for_mysql(host: str, port: int | str, timeout: int = 60):
    """Attende che MySQL sia raggiungibile (rete Docker: porta 3306)."""
    start = time.time()
    port = int(port)
    delay = 0.5
    while True:
        try:
            with socket.create_connection((host, port), timeout=2):
                print(f"✅ MySQL raggiungibile su {host}:{port}")
                return
        except OSError:
            if time.time() - start > timeout:
                raise RuntimeError(f"MySQL non raggiungibile su {host}:{port} entro {timeout}s")
            time.sleep(delay)
            delay = min(delay * 1.5, 5)

from sgai_plans import SgaiPlanUser, Session, ensure_tables, DB

# Host/porta letti dalle ENV (docker-compose deve passare MYSQL_HOST=mysql e MYSQL_PORT=3306)
MYSQL_HOST = os.getenv("MYSQL_HOST", "mysql")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", "3306"))

# Attendi MySQL prima di toccare le tabelle
wait_for_mysql(MYSQL_HOST, MYSQL_PORT)

# Crea/assicurati le tabelle dopo che MySQL è up
ensure_tables()


# ─────────────────────────────────────────────────────────────
# “DB” in RAM SOLO per anonimi (facoltativo, manteniamo compatibilità)
# ─────────────────────────────────────────────────────────────
# users_db struttura per anonimi:
# - anonimi (chiave = "anon:<client_id>"): {"plan":"anon","usedTotal":int}
users_db: Dict[str, Dict] = {}
db_lock = threading.Lock()

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
# Google ID Token verification (usato come fallback Bearer, non per cookie)
# ─────────────────────────────────────────────────────────────
def verify_token(token: str) -> Optional[Dict]:
    try:
        req = google.auth.transport.requests.Request()
        # Convalida aud == CLIENT_ID se vuoi essere pignolo:
        idinfo = google.oauth2.id_token.verify_oauth2_token(token, req)
        # if idinfo.get("aud") != CLIENT_ID: raise ValueError("Invalid audience")
        return idinfo
    except Exception as exc:  # noqa: BLE001
        print("Token validation failed:", exc)
        return None

# ─────────────────────────────────────────────────────────────
# Sessione server-side (cookie HttpOnly)
# ─────────────────────────────────────────────────────────────
def set_session_cookie(resp, sid: str):
    resp.set_cookie(
        SESSION_COOKIE,
        sid,
        max_age=60*60*24*30,
        secure=COOKIE_SECURE,   # True in produzione (HTTPS)
        httponly=True,
        samesite="None",
        path="/",
        # 👇 RIMOSSO on purpose:
        # domain=COOKIE_DOMAIN,
    )


def create_session_for_user(user: SgaiPlanUser, days=30) -> str:
    sid = uuid.uuid4().hex
    with DB.atomic():
        Session.create(id=sid, user=user, expires_at=datetime.utcnow() + timedelta(days=days))
    return sid

def get_current_user_from_cookie() -> Optional[SgaiPlanUser]:
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        return None
    with DB.atomic():
        sess = Session.get_or_none(Session.id == sid)
    if not sess or sess.expires_at < datetime.utcnow():
        return None
    return sess.user


# ─────────────────────────────────────────────────────────────
# LOGOUT – invalida la sessione e cancella il cookie
# ─────────────────────────────────────────────────────────────
@app.post("/api/logout")
def logout():
    sid = request.cookies.get(SESSION_COOKIE)
    if sid:
        with DB.atomic():
            Session.delete().where(Session.id == sid).execute()

    resp = jsonify({"ok": True})

    # 1) Variante con domain=.sgailegal.com + path=/
    resp.set_cookie(
        SESSION_COOKIE, "", expires=0, max_age=0,
        path="/", httponly=True, samesite="None",
        secure=COOKIE_SECURE, domain=COOKIE_DOMAIN
    )
    # 2) Variante con domain=.sgailegal.com + path=/oauth
    resp.set_cookie(
        SESSION_COOKIE, "", expires=0, max_age=0,
        path="/oauth", httponly=True, samesite="None",
        secure=COOKIE_SECURE, domain=COOKIE_DOMAIN
    )
    # 3) Variante host-only (senza domain) + path=/
    resp.set_cookie(
        SESSION_COOKIE, "", expires=0, max_age=0,
        path="/", httponly=True, samesite="None",
        secure=COOKIE_SECURE
    )
    # 4) Variante host-only (senza domain) + path=/oauth
    resp.set_cookie(
        SESSION_COOKIE, "", expires=0, max_age=0,
        path="/oauth", httponly=True, samesite="None",
        secure=COOKIE_SECURE
    )

    return resp




# ─────────────────────────────────────────────────────────────
# AUTH
# ─────────────────────────────────────────────────────────────
@app.post("/api/auth/google")
def google_auth():
    # Accetta sia "token" sia "credential" dal client
    payload = request.get_json(silent=True) or {}
    id_token_str = payload.get("token") or payload.get("credential")
    if not id_token_str:
        return jsonify(error="Missing token/credential"), 400

    id_info = verify_token(id_token_str)
    if not id_info:
        return jsonify(error="Invalid token"), 401

    email = id_info.get("email")
    if not email:
        return jsonify(error="Email not present in token"), 400

    # Upsert utente su MySQL
    user = SgaiPlanUser.get_or_none(SgaiPlanUser.email == email)
    if not user:
        user = SgaiPlanUser.create(
            email=email,
            plan="free",
            used_generations=0,
            last_generation_reset=datetime.utcnow()
        )

    # Crea sessione + cookie
    sid = create_session_for_user(user)
    resp = make_response(jsonify(
        email=user.email,
        plan=user.plan,
    ))
    set_session_cookie(resp, sid)
    return resp

@app.get("/api/me")
def me():
    u = get_current_user_from_cookie()
    if not u:
        return jsonify(ok=False), 401
    return jsonify(ok=True, user={"email": u.email, "plan": u.plan})

# --- DEBUG COOKIE (UNICA DEFINIZIONE, NIENTE DUPLICATI) ---
@app.get("/debug-cookie")
@app.get("/api/debug-cookie")
def debug_cookie_probe():
    cookies_dict = dict(request.cookies)
    raw = request.headers.get("Cookie", "")
    return jsonify({
        "raw_cookie_header": raw,
        "all_cookies": cookies_dict,
        "sgaai_session": cookies_dict.get("sgaai_session"),
        "sgai_session_legacy": cookies_dict.get("sgai_session"),
    })

# ─────────────────────────────────────────────────────────────
# AUTO-SYNC STRIPE (controlla subscription attive)
# ─────────────────────────────────────────────────────────────
import threading

def sync_user_with_stripe(user: SgaiPlanUser) -> bool:
    """Sincronizza un singolo utente con Stripe. Ritorna True se cambiato."""
    if not user.stripe_customer_id or not stripe.api_key:
        return False
    
    try:
        subs = stripe.Subscription.list(
            customer=user.stripe_customer_id,
            status='active',
            limit=1
        )
        
        should_be_premium = len(subs.data) > 0
        
        if should_be_premium and user.plan != "premium":
            user.plan = "premium"
            if subs.data:
                user.stripe_subscription_id = subs.data[0].id
            user.save()
            print(f"✅ Sync: {user.email} → premium")
            return True
            
        elif not should_be_premium and user.plan == "premium":
            user.plan = "free"
            user.save()
            print(f"⬇️  Sync: {user.email} → free")
            return True
            
    except Exception as exc:
        print(f"❌ Sync error per {user.email}: {exc}")
    
    return False


def auto_sync_all_users():
    """Thread in background che sincronizza tutti gli utenti ogni 5 minuti"""
    import time
    
    while True:
        try:
            time.sleep(5 * 60)  # 5 minuti
            
            if not stripe.api_key:
                continue
            
            print(f"\n{'='*60}")
            print(f"🔄 AUTO-SYNC STRIPE - {datetime.utcnow().strftime('%H:%M:%S')}")
            print(f"{'='*60}")
            
            users = SgaiPlanUser.select().where(
                SgaiPlanUser.stripe_customer_id.is_null(False)
            )
            
            synced = 0
            for user in users:
                if sync_user_with_stripe(user):
                    synced += 1
            
            print(f"✅ Sync completato: {synced} utenti aggiornati su {users.count()}")
            
        except Exception as exc:
            print(f"❌ Auto-sync error: {exc}")


# Avvia thread in background
sync_thread = threading.Thread(target=auto_sync_all_users, daemon=True)
sync_thread.start()
print("✅ Auto-sync Stripe avviato (ogni 5 minuti)")

@app.post("/api/stripe/sync")
def sync_current_user():
    """
    Sincronizza l'utente corrente con Stripe cercando SEMPRE la migliore condizione:
    - Cerca customer per email (non si fida del customer_id salvato)
    - Trova la subscription attiva più recente
    - Aggiorna il DB con i dati corretti
    """
    u = get_current_user_from_cookie()
    if not u:
        return jsonify(error="Not logged in"), 401
    
    if not stripe.api_key:
        return jsonify(error="Stripe not configured"), 500
    
    print(f"\n{'='*60}")
    print(f"🔄 SYNC STRIPE per {u.email}")
    print(f"   Piano attuale DB: {u.plan}")
    print(f"   Customer ID DB: {u.stripe_customer_id or 'N/A'}")
    print(f"{'='*60}")
    
    try:
        # 1. Cerca TUTTI i customer con questa email
        customers = stripe.Customer.list(email=u.email, limit=100)
        
        if not customers.data:
            print(f"❌ Nessun customer trovato per {u.email}")
            # Se aveva dati Stripe, li rimuoviamo
            if u.plan == "premium":
                u.plan = "free"
                u.stripe_customer_id = None
                u.stripe_subscription_id = None
                u.save()
                return jsonify(
                    synced=True,
                    changed=True,
                    old_plan="premium",
                    new_plan="free",
                    message="Nessun customer Stripe trovato, downgrade a free"
                )
            return jsonify(
                synced=False,
                message="Nessun customer Stripe trovato per questa email"
            )
        
        print(f"✅ Trovati {len(customers.data)} customer per {u.email}")
        
        # 2. Cerca la MIGLIORE subscription attiva tra tutti i customer
        best_subscription = None
        best_customer = None
        
        for customer in customers.data:
            print(f"   Controllo customer {customer.id}...")
            
            # Cerca subscription attive per questo customer
            subs = stripe.Subscription.list(
                customer=customer.id,
                status='active',
                limit=10
            )
            
            if subs.data:
                # Ordina per data creazione (più recente prima)
                subs_sorted = sorted(
                    subs.data, 
                    key=lambda s: s.created, 
                    reverse=True
                )
                
                for sub in subs_sorted:
                    print(f"      → Subscription {sub.id} (status: {sub.status})")
                    
                    # Prendi la prima subscription attiva trovata
                    if not best_subscription:
                        best_subscription = sub
                        best_customer = customer
                        print(f"      ✅ MIGLIORE TROVATA!")
        
        # 3. Aggiorna il DB con i dati corretti
        old_plan = u.plan
        old_customer_id = u.stripe_customer_id
        old_subscription_id = u.stripe_subscription_id
        
        if best_subscription and best_customer:
            # Ha subscription attiva → premium
            u.plan = "premium"
            u.stripe_customer_id = best_customer.id
            u.stripe_subscription_id = best_subscription.id
            u.save()
            
            print(f"\n✅ AGGIORNATO A PREMIUM")
            print(f"   Customer: {best_customer.id}")
            print(f"   Subscription: {best_subscription.id}")
            print(f"   Status: {best_subscription.status}")
            print(f"{'='*60}\n")
            
            return jsonify(
                synced=True,
                changed=(old_plan != "premium" or old_customer_id != best_customer.id),
                old_plan=old_plan,
                new_plan="premium",
                customer_id=best_customer.id,
                subscription_id=best_subscription.id,
                subscription_status=best_subscription.status,
                message="Subscription attiva trovata"
            )
        else:
            # Nessuna subscription attiva → free
            if u.plan != "free":
                u.plan = "free"
                u.stripe_subscription_id = None
                # Manteniamo il customer_id per riferimento
                u.save()
                
                print(f"\n⬇️  DOWNGRADE A FREE")
                print(f"   Nessuna subscription attiva trovata")
                print(f"{'='*60}\n")
                
                return jsonify(
                    synced=True,
                    changed=True,
                    old_plan=old_plan,
                    new_plan="free",
                    customer_id=u.stripe_customer_id,
                    message="Nessuna subscription attiva, downgrade a free"
                )
            else:
                print(f"\n✅ GIÀ FREE (corretto)")
                print(f"{'='*60}\n")
                
                return jsonify(
                    synced=True,
                    changed=False,
                    old_plan="free",
                    new_plan="free",
                    message="Nessuna subscription attiva"
                )
    
    except stripe.error.StripeError as se:
        print(f"❌ Stripe API Error: {se}")
        return jsonify(error=f"Stripe error: {str(se)}"), 500
    
    except Exception as exc:
        print(f"❌ Errore generico: {exc}")
        return jsonify(error=str(exc)), 500
# ─────────────────────────────────────────────────────────────
# QUOTA
# ─────────────────────────────────────────────────────────────
@app.get("/api/quota")
def quota():
    # 1) cookie session → utente DB
    u = get_current_user_from_cookie()
    if u:
        today = today_key()
        # reset giornaliero semplice
        if not u.last_generation_reset or u.last_generation_reset.strftime("%Y-%m-%d") != today:
            u.used_generations = 0
            u.last_generation_reset = datetime.utcnow()
            u.save()
        limit = PREMIUM_LIMIT if u.plan == "premium" else FREE_DAILY_LIMIT
        return jsonify(
            scope="user",
            id=u.email,
            plan=u.plan,
            usedToday=u.used_generations,
            dailyLimit=limit,
            remainingToday=max(limit - u.used_generations, 0),
            day=today,
        )

    # 2) fallback Bearer (se lo vuoi ancora supportare)
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        id_info = verify_token(token)
        if not id_info:
            return jsonify(error="Invalid token"), 401
        email = id_info.get("email")
        user = SgaiPlanUser.get_or_none(SgaiPlanUser.email == email) or SgaiPlanUser.create(email=email)
        today = today_key()
        if not user.last_generation_reset or user.last_generation_reset.strftime("%Y-%m-%d") != today:
            user.used_generations = 0
            user.last_generation_reset = datetime.utcnow()
            user.save()
        limit = PREMIUM_LIMIT if user.plan == "premium" else FREE_DAILY_LIMIT
        return jsonify(
            scope="user",
            id=user.email,
            plan=user.plan,
            usedToday=user.used_generations,
            dailyLimit=limit,
            remainingToday=max(limit - user.used_generations, 0),
            day=today,
        )

    # 3) anonimo via X-Client-Id → resta in RAM
    client_id = (request.headers.get("X-Client-Id") or "").strip()
    if client_id:
        uanon = _get_user_anon(client_id)
        return jsonify(
            scope="anon",
            id=client_id,
            plan="anon",
            usedTotal=uanon["usedTotal"],
            totalLimit=ANON_TOTAL_LIMIT,
            remainingTotal=max(ANON_TOTAL_LIMIT - uanon["usedTotal"], 0),
        )

    return jsonify(error="Missing session, token or X-Client-Id"), 401

# ─────────────────────────────────────────────────────────────
# GENERATE (finto) – enforcement lato server
# ─────────────────────────────────────────────────────────────
@app.post("/api/generate")
def generate():
    # 1) cookie session → DB
    u = get_current_user_from_cookie()
    if u:
        today = today_key()
        if not u.last_generation_reset or u.last_generation_reset.strftime("%Y-%m-%d") != today:
            u.used_generations = 0
            u.last_generation_reset = datetime.utcnow()
        if u.plan != "premium":
            limit = FREE_DAILY_LIMIT
            if u.used_generations >= limit:
                return jsonify(
                    error="Daily limit reached",
                    plan=u.plan,
                    usedToday=u.used_generations,
                    dailyLimit=limit,
                    remainingToday=0,
                    day=today,
                ), 403
        u.used_generations += 1
        u.save()
        remaining = (PREMIUM_LIMIT if u.plan == "premium" else max(FREE_DAILY_LIMIT - u.used_generations, 0))
        time.sleep(1)
        return jsonify(
            message="Fake AI response",
            scope="user",
            plan=u.plan,
            usedToday=u.used_generations,
            dailyLimit=(PREMIUM_LIMIT if u.plan == "premium" else FREE_DAILY_LIMIT),
            remainingToday=remaining,
            day=today,
        )

    # 2) fallback Bearer
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        id_info = verify_token(token)
        if not id_info:
            return jsonify(error="Invalid token"), 401
        email = id_info.get("email")
        user = SgaiPlanUser.get_or_none(SgaiPlanUser.email == email) or SgaiPlanUser.create(email=email)
        today = today_key()
        if not user.last_generation_reset or user.last_generation_reset.strftime("%Y-%m-%d") != today:
            user.used_generations = 0
            user.last_generation_reset = datetime.utcnow()
        if user.plan != "premium":
            limit = FREE_DAILY_LIMIT
            if user.used_generations >= limit:
                return jsonify(
                    error="Daily limit reached",
                    plan=user.plan,
                    usedToday=user.used_generations,
                    dailyLimit=limit,
                    remainingToday=0,
                    day=today,
                ), 403
        user.used_generations += 1
        user.save()
        remaining = (PREMIUM_LIMIT if user.plan == "premium" else max(FREE_DAILY_LIMIT - user.used_generations, 0))
        time.sleep(1)
        return jsonify(
            message="Fake AI response",
            scope="user",
            plan=user.plan,
            usedToday=user.used_generations,
            dailyLimit=(PREMIUM_LIMIT if user.plan == "premium" else FREE_DAILY_LIMIT),
            remainingToday=remaining,
            day=today,
        )

    # 3) anonimo
    client_id = (request.headers.get("X-Client-Id") or "").strip()
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

    return jsonify(error="Missing session, Bearer token or X-Client-Id"), 401

# ─────────────────────────────────────────────────────────────
# STRIPE – Create Checkout Session (solo se loggato via cookie)
# ─────────────────────────────────────────────────────────────
@app.post("/api/stripe/create-checkout-session")
def create_checkout_session():
    if not stripe.api_key:
        return jsonify(error="Stripe secret key missing"), 500

    u = get_current_user_from_cookie()
    if not u:
        return jsonify(error="UNAUTHORIZED"), 401

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
            metadata={"selected_plan": "premium", "email": u.email},
            customer_email=u.email,
            allow_promotion_codes=True,
        )
        print("\033[92mStripe session OK:\033[0m", session.id)
        return jsonify(sessionId=session.id)
    except Exception as exc:
        print("\033[91mStripe error:\033[0m", exc)
        return jsonify(error="Stripe exception", debug=str(exc)), 500

# ─────────────────────────────────────────────────────────────
# STRIPE – Verify Session (chiamata dalla pagina /oauth/success)
# ─────────────────────────────────────────────────────────────
@app.get("/api/stripe/verify-session")
def stripe_verify_session():
    if not stripe.api_key:
        return jsonify(error="Stripe secret key missing"), 500

    sid = request.args.get("session_id")
    if not sid:
        return jsonify(error="Missing session_id"), 400

    try:
        s = stripe.checkout.Session.retrieve(sid, expand=["customer_details"])
        if s.get("payment_status") != "paid":
            return jsonify(ok=False, status=s.get("payment_status", "")), 200

        email = (
            s.get("customer_email")
            or (s.get("customer_details") or {}).get("email")
            or (s.get("metadata") or {}).get("email")
        )

        if email:
            user = SgaiPlanUser.get_or_none(SgaiPlanUser.email == email) or SgaiPlanUser.create(email=email)
            user.plan = "premium"
            user.used_generations = 0
            user.last_generation_reset = datetime.utcnow()
            if s.get("customer"):
                user.stripe_customer_id = s.get("customer")
            if s.get("subscription"):
                user.stripe_subscription_id = s.get("subscription")
            user.save()

            # 👇 AGGIUNGI QUESTO BLOCCO
            sid_cookie = create_session_for_user(user)
            resp = make_response(jsonify(ok=True, email=email, plan="premium"))
            set_session_cookie(resp, sid_cookie)
            return resp

        return jsonify(ok=False, error="email non trovata"), 500

    except Exception as exc:
        return jsonify(error=str(exc)), 500


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
        s = event["data"]["object"]
        # (facoltativo ma consigliato)
        if s.get("payment_status") != "paid":
            return jsonify(received=True)

        email = (
            s.get("customer_email")
            or (s.get("customer_details") or {}).get("email")
            or (s.get("metadata") or {}).get("email")
        )
        plan = (s.get("metadata") or {}).get("selected_plan", "premium")

        if email:
            user = SgaiPlanUser.get_or_none(SgaiPlanUser.email == email) or SgaiPlanUser.create(email=email)
            user.plan = plan
            user.used_generations = 0
            user.last_generation_reset = datetime.utcnow()
            if s.get("customer"):
                user.stripe_customer_id = s.get("customer")
            if s.get("subscription"):
                user.stripe_subscription_id = s.get("subscription")
            user.save()

    elif evt_type == "customer.subscription.deleted":
        sub = event["data"]["object"]
        email = (
            sub.get("customer_email")
            or (sub.get("customer_details") or {}).get("email")
            or (sub.get("metadata") or {}).get("email")
        )
        if email:
            user = SgaiPlanUser.get_or_none(SgaiPlanUser.email == email)
            if user:
                user.plan = "free"
                user.used_generations = 0
                user.last_generation_reset = datetime.utcnow()
                user.save()

    return jsonify(received=True)


# ─────────────────────────────────────────────────────────────
# STRIPE – Get Subscription Info
# ─────────────────────────────────────────────────────────────
@app.get("/api/subscription/info")
def get_subscription_info():
    """Recupera info abbonamento Stripe dell'utente loggato"""
    print("🔍 [subscription/info] START")
    
    if not stripe.api_key:
        print("❌ Stripe API key non configurata")
        return jsonify(error="Stripe not configured"), 500
    
    u = get_current_user_from_cookie()
    print(f"🔍 User from cookie: {u}")
    
    if not u:
        print("❌ Utente non loggato")
        return jsonify(error="UNAUTHORIZED"), 401
    
    try:
        print(f"🔍 User email: {u.email}, plan: {u.plan}")
        
        # Dati base utente
        info = {
            "email": u.email,
            "plan": u.plan,
            "stripe_customer_id": getattr(u, "stripe_customer_id", None),
            "subscription_id": getattr(u, "stripe_subscription_id", None),
        }
        
        print(f"🔍 Info base: {info}")
        
        # Se ha un subscription_id, recupera i dettagli da Stripe
        if u.stripe_subscription_id:
            try:
                sub = stripe.Subscription.retrieve(u.stripe_subscription_id)
                info["current_period_end"] = sub.current_period_end * 1000  # timestamp in ms
                info["cancel_at_period_end"] = sub.cancel_at_period_end
                info["status"] = sub.status
            except Exception as e:
                print(f"⚠️  Errore recupero subscription da Stripe: {e}")
        
        return jsonify(info)
    except Exception as exc:
        print(f"❌ Errore subscription/info: {exc}")
        return jsonify(error=str(exc)), 500


# ─────────────────────────────────────────────────────────────
# STRIPE – Create Customer Portal Session
# ─────────────────────────────────────────────────────────────
@app.post("/api/subscription/portal")
def create_portal_session():
    """Crea sessione Stripe Customer Portal per gestire abbonamento"""
    if not stripe.api_key:
        return jsonify(error="Stripe not configured"), 500
    
    u = get_current_user_from_cookie()
    if not u:
        return jsonify(error="UNAUTHORIZED"), 401
    
    if not u.stripe_customer_id:
        return jsonify(error="No Stripe customer found"), 400
    
    try:
        portal_session = stripe.billing_portal.Session.create(
            customer=u.stripe_customer_id,
            return_url=f"{os.getenv('FRONTEND_URL', 'http://localhost')}/subscription",
            configuration="bpc_1SMthDBo6bKd1aEWfVbZeRA9",
        )
        return jsonify(url=portal_session.url)
    except Exception as exc:
        print(f"❌ Errore portal session: {exc}")
        return jsonify(error=str(exc)), 500


# ─────────────────────────────────────────────────────────────
# STRIPE – Cancel Subscription
# ─────────────────────────────────────────────────────────────
@app.post("/api/subscription/cancel")
def cancel_subscription():
    """Cancella abbonamento Stripe (resta attivo fino a fine periodo)"""
    if not stripe.api_key:
        return jsonify(error="Stripe not configured"), 500
    
    u = get_current_user_from_cookie()
    if not u:
        return jsonify(error="UNAUTHORIZED"), 401
    
    if not u.stripe_subscription_id:
        return jsonify(error="No active subscription"), 400
    
    try:
        # Cancella alla fine del periodo corrente (non immediatamente)
        sub = stripe.Subscription.modify(
            u.stripe_subscription_id,
            cancel_at_period_end=True
        )
        return jsonify(
            ok=True,
            cancel_at_period_end=sub.cancel_at_period_end,
            current_period_end=sub.current_period_end * 1000
        )
    except Exception as exc:
        print(f"❌ Errore cancellazione subscription: {exc}")
        return jsonify(error=str(exc)), 500


@app.teardown_appcontext
def close_db_connection(exc):
    if not DB.is_closed():
        try:
            DB.close()
        except Exception as e:
            print(f"Errore in chiusura DB: {e}")



# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # FLASK_RUN_PORT=8000
    app.run(host="0.0.0.0", port=8000, debug=True)
