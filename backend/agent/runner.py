"""The Voxy agent loop: call Groq, run tool calls, chain, reply."""
import json
import logging

from config import groq_client
from agent.tools import TOOL_REGISTRY, TOOL_SPECS, requires_confirmation
from agent.results import Action, PendingAction, AgentResult
from agent.prompt import build_messages

logger = logging.getLogger(__name__)

MODEL = "llama-3.3-70b-versatile"


async def run_agent(user_id, message, history=None, *, client=None,
                    tool_registry=None, tool_specs=None, max_iters=5):
    client = client or groq_client
    registry = tool_registry if tool_registry is not None else TOOL_REGISTRY
    specs = tool_specs if tool_specs is not None else TOOL_SPECS

    messages = build_messages(message, history)
    actions: list[Action] = []
    pending: list[PendingAction] = []

    for _ in range(max_iters):
        resp = client.chat.completions.create(
            model=MODEL, messages=messages, tools=specs,
            tool_choice="auto", temperature=0.2,
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
    by_id = {p["id"]: p for p in pending}
    actions: list[Action] = []
    done = []
    for pid in ids:
        p = by_id.get(pid)
        if not p:
            continue
        tool_def = registry.get(p["tool"])
        if not tool_def:
            continue
        try:
            res = await tool_def.fn(user_id, p.get("args", {}), "")
            actions.append(Action(type=res.action_type or p["tool"], summary=res.summary, data=res.data))
            done.append(res.summary)
        except Exception as e:  # never crash the turn — mirror run_agent's per-tool guard
            logger.exception("execute_pending: tool %s failed", p["tool"])
            done.append(f"Couldn't complete '{p.get('summary', p['tool'])}': {e}")
    reply = " ".join(done) if done else "Nothing to confirm."
    return AgentResult(reply=reply, actions=actions, pending=[])
