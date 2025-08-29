# sgai_plans.py
from peewee import Model, CharField, IntegerField, DateTimeField, ForeignKeyField
from playhouse.pool import PooledMySQLDatabase
from datetime import datetime
import os
import pymysql  # type: ignore

pymysql.install_as_MySQLdb()

MYSQL_DBNAME = os.environ.get("MYSQL_DBNAME", "rag_flow")
MYSQL_USER   = os.environ.get("MYSQL_USER",   "root")
MYSQL_PASS   = os.environ.get("MYSQL_PASSWORD", "infini_rag_flow")
MYSQL_HOST   = os.environ.get("MYSQL_HOST",   "mysql")
# ⚠️ In rete Docker la porta corretta è 3306 (NON la porta host mappata tipo 5455)
MYSQL_PORT   = int(os.environ.get("MYSQL_PORT", 3306))

DB = PooledMySQLDatabase(famm
    MYSQL_DBNAME,
    user=MYSQL_USER,
    password=MYSQL_PASS,
    host=MYSQL_HOST,
    port=MYSQL_PORT,
    max_connections=8,
    stale_timeout=300,
)

class BaseModel(Model):
    class Meta:
        database = DB

class SgaiPlanUser(BaseModel):
    email = CharField(max_length=255, unique=True, index=True, null=False)
    plan = CharField(max_length=32, default='free', null=False)
    used_generations = IntegerField(default=0, null=False)
    last_generation_reset = DateTimeField(null=True)
    stripe_customer_id = CharField(max_length=255, null=True)
    stripe_subscription_id = CharField(max_length=255, null=True)

    class Meta:
        table_name = "sgai_plan_user"

class Session(BaseModel):
    id = CharField(primary_key=True, max_length=64)
    user = ForeignKeyField(SgaiPlanUser, backref='sessions', on_delete='CASCADE')
    expires_at = DateTimeField(null=False)

    class Meta:
        table_name = "sgai_session"

def ensure_tables():
    DB.connect(reuse_if_open=True)
    DB.create_tables([SgaiPlanUser, Session])
    DB.close()
