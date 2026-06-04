"""
Platform-specific diagnosis interfaces and push-chain model tests.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from fastapi.testclient import TestClient

from app.agents.orchestrator import Orchestrator
from app.main import app
from app.platforms.wechat_channels import (
    build_wechat_algorithm_chain,
    build_wechat_fallback_report,
    enrich_wechat_report,
)


client = TestClient(app)


def _base_form(platform: str = "douyin") -> dict[str, str]:
    return {
        "platform": platform,
        "title": "别再乱花钱，3 步做出民宿改造清单",
        "content": "收藏这条，按步骤做预算、灯光和软装。",
        "category": "interest" if platform == "douyin" else "local",
        "tags": "民宿,改造,预算",
        "script": "先给结论，第一步改灯光，第二步换软装，第三步补收纳，评论领取清单。",
        "opening_hook": "先看这 3 个位置",
        "trafficField": "interest",
        "goal": "save",
        "duration": "35",
    }


def _fake_wechat_report() -> dict:
    return {
        "platform": "wechat_channels",
        "overall_score": 72,
        "grade": "B",
        "radar_data": {
            "title_hook": 70,
            "cover_click": 68,
            "script_retention": 74,
            "interaction_share": 66,
            "positioning_fit": 76,
            "overall": 72,
        },
        "agent_opinions": [
            {
                "agent_name": "标题脚本专家",
                "dimension": "标题钩子",
                "score": 70,
                "issues": [],
                "suggestions": [],
                "reasoning": "测试桩",
                "debate_comments": [],
            }
        ],
        "issues": [],
        "suggestions": [],
        "debate_summary": "测试报告",
        "debate_timeline": [],
        "simulated_comments": [
            {
                "username": "测试用户",
                "avatar_emoji": "",
                "comment": "这个信息很实用",
                "sentiment": "positive",
            }
        ],
    }


def _fake_wechat_error_report() -> dict:
    return {
        "platform": "wechat_channels",
        "diagnosis_method": "noterx_multi_agent",
        "overall_score": 50,
        "grade": "D",
        "radar_data": {
            "title_hook": 0,
            "cover_click": 0,
            "script_retention": 0,
            "interaction_share": 0,
            "positioning_fit": 0,
            "overall": 0,
        },
        "agent_opinions": [
            {
                "agent_name": "标题脚本专家",
                "dimension": "error",
                "score": 0,
                "issues": ["诊断出错: Error code: 401 - API key missing"],
                "suggestions": ["检查 OPENAI_API_KEY"],
                "reasoning": "API key missing",
                "debate_comments": [],
            }
        ],
        "issues": [{"severity": "high", "description": "Error code: 401 - API key missing", "from_agent": "系统"}],
        "suggestions": [{"priority": 1, "description": "检查 OPENAI_API_KEY", "expected_impact": "恢复 LLM"}],
        "debate_summary": "裁判失败",
        "debate_timeline": [],
        "simulated_comments": [],
    }


def test_douyin_diagnose_alias_returns_push_chain():
    response = client.post("/api/douyin/diagnose", data=_base_form("douyin"))

    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "douyin"
    assert data["diagnosis_method"] == "noterx_multi_agent"
    assert data["algorithm_chain"]
    assert data["workflow_trace"]
    assert data["content_profile"]["platform"] == "douyin"
    assert any(item["stage"] == "cold_start" for item in data["algorithm_chain"])


def test_douyin_stream_alias_returns_push_chain():
    response = client.post("/api/douyin/diagnose/stream", data=_base_form("douyin"))

    assert response.status_code == 200
    body = response.text
    assert "event: result" in body
    assert '"platform": "douyin"' in body
    assert '"algorithm_chain"' in body
    assert '"workflow_trace"' in body
    assert '"content_profile"' in body
    assert "秒停留 Agent 完成独立诊断" in body


def test_wechat_algorithm_chain_and_enrichment():
    chain = build_wechat_algorithm_chain(
        title="武汉周末遛娃别再只去商场了",
        content="人均 39，适合下雨天，评论区领取地址清单。",
        category="local",
        tags=["遛娃", "本地生活"],
        opening_hook="先看价格和停车",
        metrics={"plays": 5000, "likes": 260, "comments": 30, "shares": 48, "favorites": 80, "completion_rate": 42},
        image_count=2,
    )

    assert len(chain) >= 6
    assert {item["stage"] for item in chain} >= {
        "title_hook",
        "cover_card",
        "watch_retention",
        "social_spread",
        "private_handoff",
        "positioning_fit",
    }
    assert all(0 <= item["score"] <= 100 for item in chain)

    enriched = enrich_wechat_report(
        _fake_wechat_report(),
        title="武汉周末遛娃别再只去商场了",
        content="人均 39，适合下雨天，评论区领取地址清单。",
        category="local",
        tags=["遛娃", "本地生活"],
        image_count=2,
    )
    assert enriched["platform"] == "wechat_channels"
    assert enriched["diagnosis_method"] == "noterx_multi_agent"
    assert enriched["algorithm_chain"]
    assert enriched["workflow_trace"]
    assert enriched["content_profile"]["platform"] == "wechat_channels"
    assert enriched["suggestions"][0]["description"].startswith("先修视频号推送链路")


def test_wechat_fallback_report_has_full_report_shape():
    report = build_wechat_fallback_report(
        title="武汉周末遛娃别再只去商场了",
        content="人均 39，适合下雨天，评论区领取地址清单。",
        category="local",
        tags=["遛娃", "本地生活"],
        script="先给结论，再讲价格、停车、适合年龄，最后评论领取地址。",
        opening_hook="先看价格和停车",
        metrics={"plays": 5000, "likes": 260, "comments": 30, "shares": 48, "favorites": 80, "completion_rate": 42},
        image_count=2,
        fallback_reason="unit test",
    )

    assert report["platform"] == "wechat_channels"
    assert report["diagnosis_method"] == "noterx_rule_fallback"
    assert 0 <= report["overall_score"] <= 100
    assert report["grade"] in {"S", "A", "B", "C", "D"}
    assert {key for key in report["radar_data"]} >= {
        "title_hook",
        "cover_click",
        "script_retention",
        "interaction_share",
        "positioning_fit",
        "overall",
    }
    assert report["agent_opinions"]
    assert report["issues"]
    assert report["suggestions"]
    assert report["algorithm_chain"]
    assert report["workflow_trace"]
    assert report["content_profile"]["platform"] == "wechat_channels"
    assert report["optimized_title"]
    assert report["optimized_content"]
    assert "。。" not in report["debate_summary"]
    assert len({item["description"] for item in report["suggestions"]}) == len(report["suggestions"])


def test_wechat_diagnose_alias_enriches_report(monkeypatch):
    async def fake_run(self, **kwargs):  # noqa: ARG001
        return _fake_wechat_report()

    monkeypatch.setattr(Orchestrator, "run", fake_run)
    response = client.post("/api/wechat-channels/diagnose", data=_base_form("wechat_channels"))

    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "wechat_channels"
    assert data["diagnosis_method"] == "noterx_multi_agent"
    assert data["algorithm_chain"]
    assert data["workflow_trace"]
    assert data["content_profile"]["category_label"]
    assert data["suggestions"][0]["description"].startswith("先修视频号推送链路")


def test_wechat_diagnose_alias_falls_back_when_agents_fail(monkeypatch):
    async def fake_run(self, **kwargs):  # noqa: ARG001
        raise RuntimeError("LLM unavailable")

    monkeypatch.setattr(Orchestrator, "run", fake_run)
    response = client.post("/api/wechat-channels/diagnose", data=_base_form("wechat_channels"))

    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "wechat_channels"
    assert data["diagnosis_method"] == "noterx_rule_fallback"
    assert data["algorithm_chain"]
    assert data["workflow_trace"]
    assert data["suggestions"]


def test_wechat_diagnose_alias_falls_back_on_error_shell_report(monkeypatch):
    async def fake_run(self, **kwargs):  # noqa: ARG001
        return _fake_wechat_error_report()

    monkeypatch.setattr(Orchestrator, "run", fake_run)
    response = client.post("/api/wechat-channels/diagnose", data=_base_form("wechat_channels"))

    assert response.status_code == 200
    data = response.json()
    assert data["platform"] == "wechat_channels"
    assert data["diagnosis_method"] == "noterx_rule_fallback"
    assert data["agent_opinions"][0]["dimension"] != "error"
    assert data["optimized_title"]


def test_wechat_stream_alias_enriches_report(monkeypatch):
    async def fake_run(self, **kwargs):
        progress_cb = kwargs.get("progress_cb")
        if progress_cb:
            await progress_cb("round1_start", "测试专家诊断")
        return _fake_wechat_report()

    monkeypatch.setattr(Orchestrator, "run", fake_run)
    response = client.post("/api/wechat-channels/diagnose/stream", data=_base_form("wechat_channels"))

    assert response.status_code == 200
    body = response.text
    assert "event: result" in body
    assert '"platform": "wechat_channels"' in body
    assert '"algorithm_chain"' in body
    assert '"workflow_trace"' in body
    assert '"content_profile"' in body


def test_wechat_stream_alias_falls_back_when_agents_fail(monkeypatch):
    async def fake_run(self, **kwargs):  # noqa: ARG001
        raise RuntimeError("LLM unavailable")

    monkeypatch.setattr(Orchestrator, "run", fake_run)
    response = client.post("/api/wechat-channels/diagnose/stream", data=_base_form("wechat_channels"))

    assert response.status_code == 200
    body = response.text
    assert "event: result" in body
    assert '"diagnosis_method": "noterx_rule_fallback"' in body
    assert "LLM 会诊暂不可用" in body
    assert '"algorithm_chain"' in body


def test_wechat_stream_alias_falls_back_on_error_shell_report(monkeypatch):
    async def fake_run(self, **kwargs):  # noqa: ARG001
        return _fake_wechat_error_report()

    monkeypatch.setattr(Orchestrator, "run", fake_run)
    response = client.post("/api/wechat-channels/diagnose/stream", data=_base_form("wechat_channels"))

    assert response.status_code == 200
    body = response.text
    assert "event: result" in body
    assert '"diagnosis_method": "noterx_rule_fallback"' in body
    assert '"dimension": "error"' not in body
