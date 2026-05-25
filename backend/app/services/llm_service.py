import logging
import os
import re
from collections.abc import AsyncIterator

from litellm import acompletion

from app.chat_queries import AI_SENDER_SUB
from app.schemas import ChatMessageOut

logger = logging.getLogger(__name__)

AI_MENTION_RE = re.compile(r"@huddle\b", re.IGNORECASE)

CHAT_CONTEXT_LIMIT = 15

HUDDLE_CORE_RULES = """
CORE BEHAVIORAL RULES:
1. NO AI DISCLAIMERS: You must NEVER say "As an AI", "As a language model", or mention Docker, AWS, or your infrastructure. You are just Huddle.
2. TEXT LIKE A HUMAN: Speak exactly like a normal person in a group chat. Use lowercase letters casually when it fits the vibe.
3. THE ANTI-THERAPIST RULE: Never act like a mediator, HR rep, or therapist. Do NOT talk about "group harmony." However, do NOT reject casual chat, greetings, or general questions — just answer them with your signature casual, witty vibe.
4. BAN CORPORATE SPEAK: Never say "I hope you're doing well," "How can I assist," or "Here is the summary." Just drop the answer.
5. MATCH THE VIBE: Keep it casual and direct — like a friend who scanned the group chat and tab.
6. BE THE LOGISTICS WIZARD: When money or polls matter, be specific with numbers and names from the data.
7. NO OVER-EXPLAINING: Never explain *why* you are giving an answer. Just give the answer.
"""

CHAT_SYSTEM_PROMPT = f"""
You are Huddle, the witty, highly capable, and slightly sarcastic digital assistant living inside this friend group's chat app. Your job is to help the group coordinate trips, split expenses, run polls, and figure out when everyone is free.

User messages are prefixed with "[Message from Name]:" so you know who is speaking.

{HUDDLE_CORE_RULES}
8. CHAT LENGTH: Keep responses incredibly concise (1-2 sentences max unless summarizing data).
9. BANTER: If friends joke around, ask how you are doing, shoot the breeze, or use slang, play along seamlessly with witty banter. Do not constantly remind them you only do logistics unless they ask you to perform an unsupported app action.
10. SUMMARIES: When asked to summarize plans, debts, or schedules, use clean, punchy bullet points.
11. GROUP SNAPSHOT: A GROUP ACTIVITY block is attached for your situational awareness. Only reference it when explicitly asked about expenses, balances, or polls. If the user is just chatting or asking general questions, ignore the block completely and respond naturally.

Read the room, step in seamlessly, drop your message, and step out.
"""

GROUP_ACTIVITY_PREFIX = (
    "\n\n--- GROUP ACTIVITY (live app data; use when helpful, never invent beyond this) ---\n"
)

PULSE_TLDR_SYSTEM_PROMPT = f"""
You are Huddle, the witty, highly capable, and slightly sarcastic digital assistant for this friend group's app.

You are writing the Pulse TL;DR — a 1-3 sentence snapshot on the home screen about what's happening right now (polls, shared tab, who owes what). The viewer is one group member; speak to them directly when it matters ("you still need to vote on…").

{HUDDLE_CORE_RULES}
8. PULSE FORMAT: Plain prose only. No "TL;DR:" prefix. No markdown. No bullet lists unless 2+ urgent items truly need it.
9. PULSE LENGTH: 1-3 short sentences max. Lead with what needs action, then the rest.
10. USE THE DATA: Only state facts from the context block. Do not invent plans, amounts, or votes.
11. CURRENCY: All money is in Indian rupees. Use ₹ (e.g. ₹1,250.00). Never use $ or USD.

Read the room, drop the snapshot, step out.
"""


def _is_local_env() -> bool:
    env = os.environ.get("APP_ENV") or os.environ.get("ENVIRONMENT", "")
    return env.strip().lower() == "local"


CHAT_FALLBACK_REPLY = (
    "My bad, my circuit breakers tripped out. Try sending that again."
)


def _llm_model() -> str:
    if _is_local_env():
        return os.environ.get("LLM_LOCAL_MODEL", "ollama/llama3.2:1b")
    return os.environ.get(
        "LLM_PROD_MODEL",
        "bedrock/deepseek.v3.2",
    )


def _local_fallback_model() -> str | None:
    if not _is_local_env():
        return None
    return os.environ.get("LLM_LOCAL_FALLBACK_MODEL", "ollama/llama3.2:1b")


def _ollama_api_base() -> str | None:
    if not _is_local_env():
        return None
    return os.environ.get("OLLAMA_API_BASE", "http://ollama:11434")


def message_mentions_ai(content: str) -> bool:
    return bool(AI_MENTION_RE.search(content))


def ai_prompt_from_message(content: str) -> str:
    prompt = AI_MENTION_RE.sub("", content).strip()
    return prompt or content.strip()


def _sender_label(msg: ChatMessageOut) -> str:
    name = (msg.sender_display_name or "").strip()
    return name or "Member"


def format_user_message(sender_name: str, content: str) -> str:
    """Prefix user chat lines so the model knows who is speaking."""
    label = sender_name.strip() or "Member"
    return f"[Message from {label}]: {content}"


def _completion_kwargs(
    messages: list[dict[str, str]],
    *,
    stream: bool,
    model: str | None = None,
) -> dict:
    kwargs: dict = {
        "model": model or _llm_model(),
        "messages": messages,
        "stream": stream,
    }
    api_base = _ollama_api_base()
    if api_base:
        kwargs["api_base"] = api_base
        kwargs["max_tokens"] = int(os.environ.get("LLM_MAX_TOKENS", "384"))
    return kwargs


async def _stream_tokens(messages: list[dict[str, str]], *, model: str) -> AsyncIterator[str]:
    response = await acompletion(**_completion_kwargs(messages, stream=True, model=model))
    async for chunk in response:
        choice = chunk.choices[0] if chunk.choices else None
        if not choice or not choice.delta:
            continue
        content = choice.delta.content
        if content:
            yield content


def build_llm_messages(
    history: list[ChatMessageOut],
    *,
    group_activity: str | None = None,
) -> list[dict[str, str]]:
    """Turn the last N chat messages into LiteLLM message roles."""
    system = CHAT_SYSTEM_PROMPT
    if group_activity and group_activity.strip():
        system = f"{system}{GROUP_ACTIVITY_PREFIX}{group_activity.strip()}"
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]

    for msg in history:
        if msg.is_ai or msg.sender_sub == AI_SENDER_SUB:
            messages.append({"role": "assistant", "content": msg.content})
        else:
            messages.append(
                {
                    "role": "user",
                    "content": format_user_message(_sender_label(msg), msg.content),
                },
            )

    return messages


async def generate_pulse_tldr(context: str) -> str:
    """Non-streaming Pulse TL;DR in Huddle voice."""
    messages: list[dict[str, str]] = [
        {"role": "system", "content": PULSE_TLDR_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                "Using only the facts below, write the Pulse TL;DR for this viewer.\n\n"
                f"{context.strip()}"
            ),
        },
    ]
    model = _llm_model()
    try:
        response = await acompletion(**_completion_kwargs(messages, stream=False))
        choice = response.choices[0] if response.choices else None
        text = (choice.message.content if choice and choice.message else "") or ""
        return text.strip()
    except Exception:
        logger.exception("Pulse TL;DR LLM failed model=%s", model)
        raise


async def stream_chat_response(
    history: list[ChatMessageOut] | None = None,
    *,
    group_activity: str | None = None,
) -> AsyncIterator[str]:
    """
    Stream LLM tokens via LiteLLM.
    Local: Ollama in Docker. Production: AWS Bedrock (same code path).
    """
    context = (history or [])[-CHAT_CONTEXT_LIMIT:]
    messages = build_llm_messages(context, group_activity=group_activity)
    api_base = _ollama_api_base()
    models: list[str] = []
    primary = _llm_model()
    if primary not in models:
        models.append(primary)
    fallback = _local_fallback_model()
    if fallback and fallback not in models:
        models.append(fallback)

    last_error: Exception | None = None
    for model in models:
        try:
            async for token in _stream_tokens(messages, model=model):
                yield token
            return
        except Exception as e:
            last_error = e
            logger.warning(
                "LLM stream failed model=%s api_base=%s; trying next",
                model,
                api_base,
                exc_info=True,
            )

    if last_error:
        logger.error(
            "LLM stream exhausted models=%s api_base=%s",
            models,
            api_base,
            exc_info=last_error,
        )
    yield CHAT_FALLBACK_REPLY