"""Sun–Sat availability week; resets when Sunday 00:00 begins in the given timezone."""

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

SLOTS = ("Morning", "Afternoon", "Evening", "Night")

DEFAULT_TZ = "Asia/Kolkata"


def resolve_tz(tz_name: str | None) -> ZoneInfo:
    try:
        return ZoneInfo((tz_name or DEFAULT_TZ).strip() or DEFAULT_TZ)
    except Exception:
        return ZoneInfo("UTC")


def week_start_sunday(d: date) -> date:
    """Sunday on or before ``d`` (week runs Sun → Sat)."""
    days_since_sunday = (d.weekday() + 1) % 7
    return d - timedelta(days=days_since_sunday)


def day_label(d: date) -> str:
    return f"{d.strftime('%a')}/{d.strftime('%b')} {d.day}"


def current_availability_week(
    tz_name: str | None,
) -> tuple[date, list[tuple[str, str]]]:
    """
    Returns (week_start Sunday, [(iso_date, label), ...]).
    Purge runs at Sunday 00:00 in ``tz_name``: rows outside this Sun–Sat range are stale.
    """
    tz = resolve_tz(tz_name)
    today = datetime.now(tz).date()
    start = week_start_sunday(today)
    days: list[tuple[str, str]] = []
    for i in range(7):
        d = start + timedelta(days=i)
        days.append((d.isoformat(), day_label(d)))
    return start, days


def is_date_in_week(day_iso: str, week_start: date) -> bool:
    try:
        d = date.fromisoformat(day_iso)
    except ValueError:
        return False
    week_end = week_start + timedelta(days=6)
    return week_start <= d <= week_end


def purge_stale_availability(conn, group_id: str, week_start: date) -> None:
    """Drop legacy Mon–Sun rows and anything outside the current Sun–Sat week."""
    week_end = week_start + timedelta(days=6)
    conn.execute(
        """
        DELETE FROM availability
        WHERE group_id = %s::uuid
        AND (
          day IN ('Mon','Tue','Wed','Thu','Fri','Sat','Sun')
          OR day !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          OR day::date < %s::date
          OR day::date > %s::date
        )
        """,
        (group_id, week_start.isoformat(), week_end.isoformat()),
    )


def slot_key(day_iso: str, slot: str) -> str:
    return f"{day_iso}|{slot}"
