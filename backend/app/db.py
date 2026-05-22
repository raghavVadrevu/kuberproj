import json
import os
from contextlib import contextmanager
from typing import Any, Iterator

import boto3
import psycopg
from psycopg.conninfo import make_conninfo
from psycopg.rows import dict_row

_cached_prod_params: dict[str, str] | None = None


def _production_connection_params() -> dict[str, str]:
    global _cached_prod_params
    if _cached_prod_params is not None:
        return _cached_prod_params

    secret_name = os.environ.get("DB_SECRET_NAME", "huddle/prod/db-credentials")
    region = os.environ.get("AWS_REGION") or os.environ.get(
        "AWS_DEFAULT_REGION", "ap-south-1"
    )
    client = boto3.client("secretsmanager", region_name=region)
    response = client.get_secret_value(SecretId=secret_name)
    creds: dict[str, Any] = json.loads(response["SecretString"])

    host = creds.get("host") or os.environ.get("DB_HOST")
    if not host:
        raise RuntimeError(
            "Production DB: add 'host' to the secret JSON or set DB_HOST on the instance."
        )

    _cached_prod_params = {
        "host": host,
        "port": str(creds.get("port") or os.environ.get("DB_PORT", "5432")),
        "user": creds["username"],
        "password": creds["password"],
        "dbname": str(creds.get("dbname") or os.environ.get("DB_NAME", "postgres")),
        "sslmode": str(creds.get("sslmode") or os.environ.get("DB_SSLMODE", "require")),
    }
    return _cached_prod_params


def _local_connection_params() -> dict[str, str]:
    return {
        "host": os.environ.get("DB_HOST", "127.0.0.1"),
        "port": os.environ.get("DB_PORT", "5432"),
        "user": os.environ["DB_USER"],
        "password": os.environ["DB_PASSWORD"],
        "dbname": os.environ["DB_NAME"],
        "sslmode": os.environ.get("DB_SSLMODE", "prefer"),
    }


def connection_params() -> dict[str, str]:
    if os.environ.get("APP_ENV") == "production":
        return _production_connection_params()
    return _local_connection_params()


def conninfo() -> str:
    return make_conninfo(**connection_params())


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    with psycopg.connect(conninfo(), row_factory=dict_row) as conn:
        yield conn


def _migrate(conn: psycopg.Connection) -> None:
    has_col = conn.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'polls' AND column_name = 'group_id'
        """
    ).fetchone()
    if not has_col:
        conn.execute(
            """
            ALTER TABLE polls
            ADD COLUMN group_id UUID REFERENCES groups(id) ON DELETE CASCADE
            """
        )

    av = conn.execute(
        """
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'availability' AND column_name = 'group_id'
        """
    ).fetchone()
    if not av:
        conn.execute("DROP TABLE IF EXISTS availability CASCADE")
        conn.execute(
            """
            CREATE TABLE availability (
              group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
              user_sub TEXT NOT NULL,
              day TEXT NOT NULL CHECK (day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
              slot TEXT NOT NULL CHECK (slot IN ('Morning','Afternoon','Evening','Night')),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              PRIMARY KEY (group_id, user_sub, day, slot)
            )
            """
        )


def init_schema() -> None:
    ddl = """
    CREATE EXTENSION IF NOT EXISTS pgcrypto;

    CREATE TABLE IF NOT EXISTS user_profiles (
      sub TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      display_name TEXT NOT NULL DEFAULT 'Member',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS groups (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS group_members (
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_sub TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('owner','member')),
      joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_sub)
    );

    CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_sub);

    CREATE TABLE IF NOT EXISTS friend_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_sub TEXT NOT NULL,
      to_sub TEXT NOT NULL CHECK (from_sub <> to_sub),
      status TEXT NOT NULL CHECK (status IN ('pending','accepted','declined','cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_one_pending
      ON friend_requests(from_sub, to_sub) WHERE status = 'pending';

    CREATE TABLE IF NOT EXISTS friendships (
      user_low TEXT NOT NULL,
      user_high TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_low, user_high),
      CHECK (user_low < user_high)
    );

    CREATE TABLE IF NOT EXISTS polls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      created_by TEXT NOT NULL,
      group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS poll_options (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      sort_order INT NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id);
    CREATE INDEX IF NOT EXISTS idx_polls_group ON polls(group_id);

    CREATE TABLE IF NOT EXISTS poll_votes (
      poll_id UUID NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
      user_sub TEXT NOT NULL,
      ranking JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (poll_id, user_sub)
    );

    CREATE TABLE IF NOT EXISTS availability (
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      user_sub TEXT NOT NULL,
      day TEXT NOT NULL CHECK (day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')),
      slot TEXT NOT NULL CHECK (slot IN ('Morning','Afternoon','Evening','Night')),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (group_id, user_sub, day, slot)
    );

    CREATE TABLE IF NOT EXISTS group_expenses (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
      category TEXT NOT NULL DEFAULT 'other',
      paid_by_sub TEXT NOT NULL,
      participant_subs TEXT[] NOT NULL,
      settled BOOLEAN NOT NULL DEFAULT false,
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_group_expenses_group ON group_expenses(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_expenses_settled ON group_expenses(group_id, settled);

    CREATE TABLE IF NOT EXISTS group_vault_items (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK (item_type IN ('code','location','link')),
      title TEXT NOT NULL,
      subtitle TEXT,
      value TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('Access Codes', 'Locations', 'Links')),
      created_by TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_group_vault_items_group ON group_vault_items(group_id);

    CREATE TABLE IF NOT EXISTS group_chat_messages (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      sender_sub TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_group_chat_messages_group_created
      ON group_chat_messages(group_id, created_at);
    """
    with get_connection() as conn:
        conn.execute(ddl)
        _migrate(conn)
        conn.commit()
