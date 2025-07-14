from peewee import Model, CharField, IntegerField, DateTimeField
from playhouse.pool import PooledMySQLDatabase
from datetime import datetime
import os

DB = PooledMySQLDatabase(
    os.environ.get("MYSQL_DBNAME", "rag_flow"),
    user=os.environ.get("MYSQL_USER", "root"),
    password=os.environ.get("MYSQL_PASSWORD", "infini_rag_flow"),
    host=os.environ.get("MYSQL_HOST", "mysql"),
    port=int(os.environ.get("MYSQL_PORT", 5455)),
    max_connections=8,
    stale_timeout=300
)

class SgaiPlanUser(Model):
    email = CharField(max_length=255, unique=True, index=True, null=False)
    plan = CharField(max_length=32, default='free', null=False)
    used_generations = IntegerField(default=0, null=False)
    last_generation_reset = DateTimeField(null=True)
    stripe_customer_id = CharField(max_length=255, null=True)
    stripe_subscription_id = CharField(max_length=255, null=True)

    class Meta:
        database = DB
        db_table = "sgai_plan_user"