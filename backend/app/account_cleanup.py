"""Remove a user's rows from the app database (not Cognito)."""


def delete_user_data(conn, user_sub: str) -> None:
    conn.execute(
        "DELETE FROM friend_requests WHERE from_sub = %s OR to_sub = %s",
        (user_sub, user_sub),
    )
    conn.execute(
        "DELETE FROM friendships WHERE user_low = %s OR user_high = %s",
        (user_sub, user_sub),
    )
    conn.execute("DELETE FROM group_members WHERE user_sub = %s", (user_sub,))
    conn.execute("DELETE FROM poll_votes WHERE user_sub = %s", (user_sub,))
    conn.execute("DELETE FROM availability WHERE user_sub = %s", (user_sub,))
    conn.execute("DELETE FROM user_profiles WHERE sub = %s", (user_sub,))
