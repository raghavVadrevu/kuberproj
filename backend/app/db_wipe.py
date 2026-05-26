"""Delete all application rows from Postgres (schema/tables remain)."""

from psycopg import Connection

# Child tables first; CASCADE on truncate handles FK order when grouped.
_APP_TABLES = (
    "group_chat_messages",
    "group_vault_items",
    "group_expenses",
    "poll_votes",
    "poll_options",
    "polls",
    "availability",
    "group_members",
    "groups",
    "friend_requests",
    "friendships",
    "user_profiles",
)


def wipe_all_app_data(conn: Connection) -> None:
    tables = ", ".join(_APP_TABLES)
    conn.execute(f"TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE")
