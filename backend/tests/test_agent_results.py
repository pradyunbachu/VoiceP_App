from agent.results import Action, PendingAction, AgentResult


def test_agent_result_defaults_and_dump():
    r = AgentResult(reply="hi")
    assert r.reply == "hi"
    assert r.actions == []
    assert r.pending == []
    assert r.intent == "agent"
    assert r.model_dump()["reply"] == "hi"


def test_action_and_pending_roundtrip():
    a = Action(type="shopping_add", summary="Added milk", data={"items": ["milk"]})
    p = PendingAction(id="p1", tool="delete_expense", args={"ref": "last"}, summary="Delete last expense?")
    r = AgentResult(reply="done", actions=[a], pending=[p])
    dumped = r.model_dump()
    assert dumped["actions"][0]["type"] == "shopping_add"
    assert dumped["pending"][0]["id"] == "p1"
