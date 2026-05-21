def display_from_payload(payload: dict) -> str:
    if isinstance(payload.get("name"), str) and payload["name"].strip():
        return str(payload["name"]).strip()
    given = str(payload.get("given_name") or "").strip()
    family = str(payload.get("family_name") or "").strip()
    combined = f"{given} {family}".strip()
    if combined:
        return combined
    return "Member"


def upsert_profile_from_token(conn, sub: str, payload: dict) -> None:
    email_raw = payload.get("email")
    email = email_raw.strip().lower() if isinstance(email_raw, str) and email_raw.strip() else None
    display = display_from_payload(payload)
    conn.execute(
        """
        INSERT INTO user_profiles (sub, email, display_name)
        VALUES (%s, %s, %s)
        ON CONFLICT (sub) DO UPDATE SET
          email = COALESCE(EXCLUDED.email, user_profiles.email),
          display_name = EXCLUDED.display_name,
          updated_at = now()
        """,
        (sub, email, display),
    )
