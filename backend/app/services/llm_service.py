import logging
import os
import re
from collections.abc import AsyncIterator

from litellm import acompletion

from app.chat_queries import AI_SENDER_SUB
from app.schemas import ChatMessageOut

logger = logging.getLogger(__name__)

AI_MENTION_RE = re.compile(r"@huddle\b", re.IGNORECASE)

CHAT_CONTEXT_LIMIT = 100

SYSTEM_PROMPT = """
You are Huddle, the witty, highly capable, and slightly sarcastic digital assistant living inside this friend group's chat app. Your job is to help the group coordinate trips, split expenses, run polls, and figure out when everyone is free. 

User messages are prefixed with "[Message from Name]:" so you know who is speaking.

CORE BEHAVIORAL RULES:
1. NO AI DISCLAIMERS: You must NEVER say "As an AI", "As a language model", or mention Docker, AWS, or your infrastructure. You are just Huddle.
2. TEXT LIKE A HUMAN: Speak exactly like a normal person in a group chat. Keep responses incredibly concise (1-2 sentences max unless summarizing data). Use lowercase letters casually. 
3. THE ANTI-THERAPIST RULE: Never act like a mediator, HR rep, or therapist. If friends joke around, insult each other, or say "STFU," play along with witty banter. Do NOT invent backstories, apologize, or talk about "group harmony."
4. BAN CORPORATE SPEAK: Never say "I hope you're doing well," "How can I assist," or "Here is the summary." Just drop the answer.
5. MATCH THE VIBE: If a user says "Wahstup" or "yo", do not overthink it. Respond casually (e.g., "nm, just waiting for y'all to make a plan. what's good?").
6. BE THE LOGISTICS WIZARD: When asked to summarize plans, debts, or schedules, use clean, punchy bullet points.
7. NO OVER-EXPLAINING: Never explain *why* you are giving an answer. Just give the answer.

Read the room, step in seamlessly, drop your message, and step out.
"""


def _is_local_env() -> bool:
    env = os.environ.get("APP_ENV") or os.environ.get("ENVIRONMENT", "")
    return env.strip().lower() == "local"


def _llm_model() -> str:
    if _is_local_env():
        return os.environ.get("LLM_LOCAL_MODEL", "ollama/phi3")
    return os.environ.get(
        "LLM_PROD_MODEL",
        "bedrock/anthropic.claude-3-haiku-20240307-v1:0",
    )


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


def build_llm_messages(history: list[ChatMessageOut]) -> list[dict[str, str]]:
    """Turn the last N chat messages into LiteLLM message roles."""
    messages: list[dict[str, str]] = [{"role": "system", "content": SYSTEM_PROMPT}]

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


async def stream_chat_response(
    history: list[ChatMessageOut] | None = None,
) -> AsyncIterator[str]:
    """
    Stream LLM tokens via LiteLLM.
    Local: Ollama in Docker. Production: AWS Bedrock (same code path).
    """
    context = (history or [])[-CHAT_CONTEXT_LIMIT:]
    messages = build_llm_messages(context)
    model = _llm_model()
    api_base = _ollama_api_base()

    kwargs: dict = {
        "model": model,
        "messages": messages,
        "stream": True,
    }
    if api_base:
        kwargs["api_base"] = api_base

    try:
        response = await acompletion(**kwargs)
        async for chunk in response:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice or not choice.delta:
                continue
            content = choice.delta.content
            if content:
                yield content
    except Exception:
        logger.exception("LLM stream failed model=%s api_base=%s", model, api_base)
        yield (
            "Sorry, I could not reach the AI service right now. "
            "If you are running locally, ensure the Ollama container is up and "
            "the phi3 model has been pulled."
        )
