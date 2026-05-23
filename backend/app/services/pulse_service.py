from datetime import UTC, datetime, timedelta

from app.schemas import PollOut, TabOverviewOut


def _leading_option(poll: PollOut) -> str | None:
    if not poll.options:
        return None
    best = max(poll.options, key=lambda o: o.first_choice_votes)
    if best.first_choice_votes <= 0:
        return None
    return f"{best.label} ({best.first_choice_votes} first-choice)"


def _net_label(net: float) -> str:
    if abs(net) < 0.01:
        return "even on the tab"
    if net > 0:
        return f"owed ${net:.2f} overall"
    return f"owing ${abs(net):.2f} overall"


def format_pulse_context(
    *,
    group_name: str,
    member_count: int,
    polls: list[PollOut],
    tab: TabOverviewOut,
    viewer_name: str | None = None,
) -> str:
    """Structured facts for the Pulse TL;DR LLM call."""
    active_polls = [p for p in polls if p.status == "active"]
    unsettled = [e for e in tab.expenses if not e.settled]
    unsettled_total = sum(e.amount for e in unsettled)

    cutoff = datetime.now(UTC) - timedelta(days=7)
    recent: list = []
    for e in tab.expenses:
        created = datetime.fromisoformat(e.created_at.replace("Z", "+00:00"))
        if created.tzinfo is None:
            created = created.replace(tzinfo=UTC)
        if created >= cutoff:
            recent.append(e)

    lines: list[str] = [
        f"Group: {group_name}",
        f"Members: {member_count}",
        f"Viewer: {viewer_name or 'the current user'} ({_net_label(tab.my_net)})",
        "",
        f"Active polls: {len(active_polls)}",
    ]

    if not active_polls:
        lines.append("- none")
    else:
        pending_vote = 0
        for poll in active_polls[:8]:
            voted = bool(poll.my_ranking)
            if not voted:
                pending_vote += 1
            lead = _leading_option(poll)
            vote_note = "viewer voted" if voted else "viewer has NOT voted"
            lead_note = f"leading: {lead}" if lead else "no votes yet"
            lines.append(
                f'- "{poll.title}" — {poll.vote_count} vote(s), {lead_note}, {vote_note}',
            )
        lines.append(f"Polls awaiting viewer vote: {pending_vote}")

    lines.extend(
        [
            "",
            f"Unsettled expenses: {len(unsettled)} (total ${unsettled_total:.2f})",
        ],
    )
    if unsettled:
        for exp in unsettled[:6]:
            payer = exp.paid_by_display_name or exp.paid_by_sub
            lines.append(f'- "{exp.description}" ${exp.amount:.2f} (paid by {payer})')
    else:
        lines.append("- none")

    lines.extend(
        [
            "",
            f"Expenses in last 7 days: {len(recent)}",
        ],
    )
    if recent:
        for exp in recent[:5]:
            status = "settled" if exp.settled else "pending"
            lines.append(f'- "{exp.description}" ${exp.amount:.2f} ({status})')

    if tab.balances:
        lines.extend(["", "Net balances (unsettled only):"])
        for row in tab.balances[:6]:
            name = row.display_name or row.user_sub
            sign = "+" if row.net >= 0 else ""
            lines.append(f"- {name}: {sign}${row.net:.2f}")

    return "\n".join(lines)


def fallback_pulse_tldr(
    *,
    group_name: str,
    polls: list[PollOut],
    tab: TabOverviewOut,
) -> str:
    """Deterministic copy when the LLM is unavailable."""
    active = [p for p in polls if p.status == "active"]
    pending = sum(1 for p in active if not p.my_ranking)
    unsettled = [e for e in tab.expenses if not e.settled]
    total = sum(e.amount for e in unsettled)

    parts: list[str] = []
    if not active:
        parts.append("no active polls right now.")
    elif pending > 0:
        parts.append(
            f"{len(active)} active poll{'s' if len(active) != 1 else ''} — "
            f"you still have {pending} to vote on.",
        )
    else:
        parts.append(
            f"{len(active)} active poll{'s' if len(active) != 1 else ''} — you're caught up on voting.",
        )

    if not unsettled:
        parts.append("no unsettled expenses in the group.")
    else:
        parts.append(
            f"{len(unsettled)} unsettled expense{'s' if len(unsettled) != 1 else ''} "
            f"totaling about ${total:.2f}.",
        )

    return f"{group_name}: " + " ".join(parts)
