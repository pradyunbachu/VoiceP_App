# backend/tests/test_agent_prompt.py
from agent.prompt import build_messages, SYSTEM_PROMPT


def test_build_messages_caps_history_and_appends_user():
    history = [{"role": "user", "content": f"m{i}"} for i in range(20)]
    msgs = build_messages("now", history)
    assert msgs[0]["role"] == "system"
    assert msgs[0]["content"] == SYSTEM_PROMPT
    # last 10 history turns + system + new user
    assert len(msgs) == 1 + 10 + 1
    assert msgs[-1] == {"role": "user", "content": "now"}


def test_build_messages_ignores_malformed_turns():
    history = [{"role": "system", "content": "x"}, {"role": "user"}, {"content": "y"}]
    msgs = build_messages("hi", history)
    # only system + new user (all history turns filtered out)
    assert [m["role"] for m in msgs] == ["system", "user"]
    assert msgs[-1]["content"] == "hi"


def test_system_prompt_mentions_confirmation_rule():
    assert "confirm" in SYSTEM_PROMPT.lower()
