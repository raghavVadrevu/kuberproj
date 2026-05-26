"""Move app data from a stale Cognito sub to the current one (same email, new account)."""

import logging

logger = logging.getLogger(__name__)


def migrate_user_sub(conn, old_sub: str, new_sub: str) -> None:
    """Reassign rows keyed by old_sub to new_sub, then remove the stale profile."""
    if old_sub == new_sub:
        return

    logger.info("Reclaiming profile data: %s -> %s", old_sub, new_sub)

    conn.execute(
        """
        DELETE FROM group_members gm_old
        USING group_members gm_new
        WHERE gm_old.user_sub = %s AND gm_new.user_sub = %s
          AND gm_old.group_id = gm_new.group_id
        """,
        (old_sub, new_sub),
    )
    conn.execute(
        "UPDATE group_members SET user_sub = %s WHERE user_sub = %s",
        (new_sub, old_sub),
    )

    conn.execute(
        """
        UPDATE friendships SET
          user_low = CASE WHEN user_low = %s THEN %s ELSE user_low END,
          user_high = CASE WHEN user_high = %s THEN %s ELSE user_high END
        WHERE user_low = %s OR user_high = %s
        """,
        (old_sub, new_sub, old_sub, new_sub, old_sub, old_sub),
    )
    conn.execute(
        """
        UPDATE friendships SET user_low = user_high, user_high = user_low
        WHERE user_low > user_high
        """
    )
    conn.execute(
        """
        DELETE FROM friendships f1
        USING friendships f2
        WHERE f1.user_low = f2.user_low
          AND f1.user_high = f2.user_high
          AND f1.ctid < f2.ctid
        """
    )

    conn.execute(
        "UPDATE friend_requests SET from_sub = %s WHERE from_sub = %s",
        (new_sub, old_sub),
    )
    conn.execute(
        "UPDATE friend_requests SET to_sub = %s WHERE to_sub = %s",
        (new_sub, old_sub),
    )

    conn.execute(
        """
        DELETE FROM poll_votes pv_old
        USING poll_votes pv_new
        WHERE pv_old.user_sub = %s AND pv_new.user_sub = %s
          AND pv_old.poll_id = pv_new.poll_id
        """,
        (old_sub, new_sub),
    )
    conn.execute(
        "UPDATE poll_votes SET user_sub = %s WHERE user_sub = %s",
        (new_sub, old_sub),
    )

    conn.execute(
        """
        DELETE FROM availability a_old
        USING availability a_new
        WHERE a_old.user_sub = %s AND a_new.user_sub = %s
          AND a_old.group_id = a_new.group_id
          AND a_old.day = a_new.day
          AND a_old.slot = a_new.slot
        """,
        (old_sub, new_sub),
    )
    conn.execute(
        "UPDATE availability SET user_sub = %s WHERE user_sub = %s",
        (new_sub, old_sub),
    )

    conn.execute(
        "UPDATE groups SET created_by = %s WHERE created_by = %s",
        (new_sub, old_sub),
    )
    conn.execute(
        "UPDATE polls SET created_by = %s WHERE created_by = %s",
        (new_sub, old_sub),
    )
    conn.execute(
        "UPDATE group_expenses SET created_by = %s WHERE created_by = %s",
        (new_sub, old_sub),
    )
    conn.execute(
        "UPDATE group_expenses SET paid_by_sub = %s WHERE paid_by_sub = %s",
        (new_sub, old_sub),
    )
    expense_rows = conn.execute(
        """
        SELECT id, participant_subs FROM group_expenses
        WHERE %s = ANY(participant_subs)
        """,
        (old_sub,),
    ).fetchall()
    for row in expense_rows:
        seen: set[str] = set()
        participants: list[str] = []
        for participant in row["participant_subs"]:
            sub_id = new_sub if participant == old_sub else participant
            if sub_id not in seen:
                seen.add(sub_id)
                participants.append(sub_id)
        conn.execute(
            "UPDATE group_expenses SET participant_subs = %s WHERE id = %s",
            (participants, row["id"]),
        )
    conn.execute(
        "UPDATE group_vault_items SET created_by = %s WHERE created_by = %s",
        (new_sub, old_sub),
    )
    conn.execute(
        "UPDATE group_chat_messages SET sender_sub = %s WHERE sender_sub = %s",
        (new_sub, old_sub),
    )

    conn.execute("DELETE FROM user_profiles WHERE sub = %s", (old_sub,))


def reclaim_stale_profile_by_email(conn, sub: str, email: str) -> None:
    """If another profile owns this email, migrate its data to the current sub."""
    row = conn.execute(
        """
        SELECT sub FROM user_profiles
        WHERE lower(email) = lower(%s) AND sub <> %s
        """,
        (email, sub),
    ).fetchone()
    if row:
        migrate_user_sub(conn, row["sub"], sub)
