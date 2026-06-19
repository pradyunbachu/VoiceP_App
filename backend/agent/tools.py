"""Tool registry, policies, and dispatch for the Voxy agent.

Each tool wraps an existing handler. user_id is always passed by the runner
(server-side), never by the model.
"""
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional


@dataclass
class ToolResult:
    data: dict
    summary: str
    action_type: Optional[str] = None


@dataclass
class ToolDef:
    name: str
    spec: dict                      # Groq tool JSON schema
    fn: Callable[[str, dict, str], Awaitable[ToolResult]]
    policy: str = "none"            # "none" | "always" | "threshold"
    threshold_field: Optional[str] = None
    threshold: float = 0.0


TOOL_REGISTRY: dict[str, ToolDef] = {}
TOOL_SPECS: list[dict] = []


def register(tool_def: ToolDef) -> None:
    TOOL_REGISTRY[tool_def.name] = tool_def
    # Keep specs aligned with registry order, de-duped by name.
    TOOL_SPECS[:] = [t.spec for t in TOOL_REGISTRY.values()]


def requires_confirmation(tool_def: ToolDef, args: dict) -> bool:
    if tool_def.policy == "always":
        return True
    if tool_def.policy == "threshold":
        raw = args.get(tool_def.threshold_field) if tool_def.threshold_field else None
        try:
            return raw is not None and float(raw) >= tool_def.threshold
        except (TypeError, ValueError):
            return False
    return False
