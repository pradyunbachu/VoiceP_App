"""The Voxy agent loop: call Groq, run tool calls, chain, reply."""
import asyncio
import json
import logging

from config import groq_client
from agent.tools import TOOL_REGISTRY, TOOL_SPECS, requires_confirmation
from agent.results import Action, PendingAction, AgentResult
from agent.prompt import build_messages

logger = logging.getLogger(__name__)

# gpt-oss-120b reliably formats tool calls on Groq; llama-3.3-70b-versatile
# frequently fails with 400 tool_use_failed (malformed <function=...> syntax),
# which would crash the agent down to the classifier fallback. (The retry below
# is kept as a safety net for transient hiccups.)
MODEL = "openai/gpt-oss-120b"

# Llama-on-Groq intermittently emits a malformed tool call, and Groq rejects it
# with a 400 "tool_use_failed" instead of recovering. Generation is
# nondeterministic, so retrying (with a little extra temperature for variety)
# usually succeeds. Without this, one bad generation would crash the whole turn
# down to the dumb classifier fallback.
_TOOL_RETRY_TEMPS = [0.2, 0.5, 0.7, 0.9]


def _is_tool_use_failed(err) -> bool:
    s = str(err).lower()
    return "tool_use_failed" in s or "failed to call a function" in s


def _create_completion(client, messages, specs):
    last_err = None
    for i, temp in enumerate(_TOOL_RETRY_TEMPS):
        try:
            return client.chat.completions.create(
                model=MODEL, messages=messages, tools=specs,
                tool_choice="auto", temperature=temp,
            )
        except Exception as err:
            if _is_tool_use_failed(err):
                last_err = err
                logger.warning("Groq tool_use_failed (attempt %d/%d); retrying",
                               i + 1, len(_TOOL_RETRY_TEMPS))
                continue
            raise
    raise last_err


async def run_agent(user_id, message, history=None, *, client=None,
                    tool_registry=None, tool_specs=None, max_iters=5):
    client = client or groq_client
    registry = tool_registry if tool_registry is not None else TOOL_REGISTRY
    specs = tool_specs if tool_specs is not None else TOOL_SPECS

    messages = build_messages(message, history)
    actions: list[Action] = []
    pending: list[PendingAction] = []

    for _ in range(max_iters):
        resp = await asyncio.get_running_loop().run_in_executor(
            None, _create_completion, client, messages, specs
        )
        msg = resp.choices[0].message
        tool_calls = getattr(msg, "tool_calls", None)

        if not tool_calls:
            return AgentResult(reply=(msg.content or "").strip() or "Done.",
                               actions=actions, pending=pending)

        # Record the assistant's tool-call turn.
        messages.append({
            "role": "assistant", "content": msg.content or "",
            "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in tool_calls
            ],
        })

        for tc in tool_calls:
            name = tc.function.name
            try:
                args = json.loads(tc.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}
            # The model sometimes sends the JSON literal `null` (or a non-object)
            # for no-arg tools; coerce so tools can safely do args.get(...).
            if not isinstance(args, dict):
                args = {}
            tool_def = registry.get(name)

            if tool_def is None:
                tool_content = json.dumps({"error": f"unknown tool {name}"})
            elif requires_confirmation(tool_def, args):
                pid = f"p{len(pending) + 1}"
                summary = _confirm_summary(name, args)
                pending.append(PendingAction(id=pid, tool=name, args=args, summary=summary))
                tool_content = json.dumps({"status": "needs_confirmation", "summary": summary})
            else:
                try:
                    res = await tool_def.fn(user_id, args, message)
                    if res.action_type:
                        actions.append(Action(type=res.action_type, summary=res.summary, data=res.data))
                    tool_content = json.dumps({"status": "ok", "summary": res.summary, "data": res.data})
                except Exception as e:  # surface to model, never crash the turn
                    logger.exception("Tool %s failed", name)
                    tool_content = json.dumps({"error": str(e)})

            messages.append({"role": "tool", "tool_call_id": tc.id,
                             "name": name, "content": tool_content})

    # Hit the iteration cap.
    reply = ("I did some of that. " if actions else "")
    reply += "Could you simplify the request a bit?" if not pending else "Confirm the pending action and I'll finish."
    return AgentResult(reply=reply.strip(), actions=actions, pending=pending)


def _confirm_summary(name, args):
    if name == "delete_expense":
        return f"Delete expense ({args.get('ref') or args.get('delete_item_name') or 'the one you mentioned'})?"
    if name == "clear_shopping_list":
        return "Clear your entire shopping list?"
    if name == "share_list":
        return f"Share your shopping list with {args.get('target', 'them')}?"
    if name == "log_expense":
        return f"Log a ${args.get('amount')} expense at {args.get('store', 'that store')}?"
    return f"Confirm {name}?"


async def execute_pending(user_id, pending, ids, *, tool_registry=None):
    registry = tool_registry if tool_registry is not None else TOOL_REGISTRY
    by_id = {p["id"]: p for p in pending if p.get("id")}
    actions: list[Action] = []
    done = []
    for pid in ids:
        p = by_id.get(pid)
        if not p:
            continue
        if not p.get("tool"):
            continue
        tool_def = registry.get(p.get("tool"))
        if not tool_def:
            continue
        # Only execute tools that actually require confirmation; skip "none"-policy
        # tools so the /confirm endpoint can't be abused to run safe tools.
        if tool_def.policy == "none":
            continue
        try:
            res = await tool_def.fn(user_id, p.get("args", {}), "")
            actions.append(Action(type=res.action_type or p.get("tool"), summary=res.summary, data=res.data))
            done.append(res.summary)
        except Exception as e:  # never crash the turn — mirror run_agent's per-tool guard
            logger.exception("execute_pending: tool %s failed", p.get("tool"))
            done.append(f"Couldn't complete '{p.get('summary', p.get('tool', ''))}': {e}")
    reply = " ".join(done) if done else "Nothing to confirm."
    return AgentResult(reply=reply, actions=actions, pending=[])
