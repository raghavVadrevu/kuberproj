def names_from_payload(payload: dict) -> tuple[str, str]:
    given = str(payload.get("given_name") or "").strip()
    family = str(payload.get("family_name") or "").strip()
    return given, family


def display_from_names(given_name: str, family_name: str) -> str:
    combined = f"{given_name.strip()} {family_name.strip()}".strip()
    return combined or "Member"


def display_from_payload(payload: dict) -> str:
    if isinstance(payload.get("name"), str) and payload["name"].strip():
        return str(payload["name"]).strip()
    given = str(payload.get("given_name") or "").strip()
    family = str(payload.get("family_name") or "").strip()
    combined = f"{given} {family}".strip()
    if combined:
        return combined
    return "Member"


def picture_from_payload(payload: dict) -> str | None:
    raw = payload.get("picture")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def upsert_profile_from_token(conn, sub: str, payload: dict) -> None:
    email_raw = payload.get("email")
    email = email_raw.strip().lower() if isinstance(email_raw, str) and email_raw.strip() else None
    display = display_from_payload(payload)
    picture = picture_from_payload(payload)
    conn.execute(
        """
        INSERT INTO user_profiles (sub, email, display_name, picture_url)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (sub) DO UPDATE SET
          email = COALESCE(EXCLUDED.email, user_profiles.email),
          display_name = EXCLUDED.display_name,
          picture_url = COALESCE(EXCLUDED.picture_url, user_profiles.picture_url),
          updated_at = now()
        """,
        (sub, email, display, picture),
    )
