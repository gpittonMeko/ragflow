# common.py
import threading

PLAN_LIMITS = {
    "free": 5,
    "standard": 50,
    "premium": 1_000_000_000,
}

users_db: dict[str, dict] = {}   # e‑mail → {plan, usedGenerations}
db_lock = threading.Lock()
