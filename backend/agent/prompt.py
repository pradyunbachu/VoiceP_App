"""System prompt + message assembly for the Voxy agent."""

SYSTEM_PROMPT = "You are Voxy, a concise voice assistant for expenses and pantry. Use tools to act."


def build_messages(message, history=None):
    msgs = [{"role": "system", "content": SYSTEM_PROMPT}]
    for turn in (history or [])[-10:]:
        role = turn.get("role")
        content = turn.get("content")
        if role in ("user", "assistant") and content:
            msgs.append({"role": role, "content": content})
    msgs.append({"role": "user", "content": message})
    return msgs
