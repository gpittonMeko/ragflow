# sgai_plans.py
from peewee import Model, CharField, IntegerField, DateTimeField, ForeignKeyField
from playhouse.pool import PooledMySQLDatabase
from datetime import datetime, timedelta
import os

# Usa PyMySQL come MySQLdb
import pymysql  # type: ignore
pymysql.install_as_MySQLdb()

DB = PooledMySQLDatabase(
    os.environ.get("MYSQL_DBNAME", "rag_flow"),
    user=os.environ.get("MYSQL_USER", "root"),
    password=os.environ.get("MYSQL_PASSWORD", "infini_rag_flow"),
    host=os.environ.get("MYSQL_HOST", "mysql"),
    port=int(os.environ.get("MYSQL_PORT", 5455)),
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
    id = CharField(primary_key=True, max_length=64)  # uuid hex
    user = ForeignKeyField(SgaiPlanUser, backref='sessions', on_delete='CASCADE')
    expires_at = DateTimeField(null=False)

    class Meta:
        table_name = "sgai_session"

def ensure_tables():
    DB.connect(reuse_if_open=True)
    DB.create_tables([SgaiPlanUser, Session])
    DB.close()
