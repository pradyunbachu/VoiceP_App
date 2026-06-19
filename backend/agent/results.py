"""Structured outputs of the Voxy agent."""
from pydantic import BaseModel, Field
from typing import Optional


class Action(BaseModel):
    """An action the agent actually performed (drives client cards/refresh)."""
    type: str
    summary: str
    data: dict = Field(default_factory=dict)


class PendingAction(BaseModel):
    """A confirm-required action proposed but NOT yet executed."""
    id: str
    tool: str
    args: dict = Field(default_factory=dict)
    summary: str


class AgentResult(BaseModel):
    """Final result of one agent turn."""
    reply: str
    actions: list[Action] = Field(default_factory=list)
    pending: list[PendingAction] = Field(default_factory=list)
    intent: str = "agent"
    sub_intent: Optional[str] = None
