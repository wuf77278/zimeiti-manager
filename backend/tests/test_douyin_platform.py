"""
Douyin platform strategy tests.
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.platforms.douyin import build_douyin_report, compute_baseline, score_dimensions, _parse_baseline_rows


DOUYIN_DIMENSIONS = {"hook", "completion", "recognition", "conversion", "baseline_fit", "overall"}


def test_douyin_report_shape():
    """Douyin report should match the shared DiagnoseResponse shape."""
    report = build_douyin_report(
        title="小预算房间改造完整流程",
        content="适合新手房东收藏的民宿改造避坑清单。",
        category="interest",
        tags="民宿,改造,预算,装修避坑",
        script="痛点：预算少。误区：先买大件。第一步改灯光，第二步换软装，第三步补收纳。评论领取清单。",
        audience="想做民宿但预算有限的新手房东",
        trafficField="interest",
        goal="save",
        duration=35,
        hook="别再花大钱改房间，先把这 3 个位置做对",
        opsData="近 7 天同类内容收藏率高，评论常问预算清单。",
        baselineRows=json.dumps([
            {"plays": 12000, "completion": 42, "likes": 800, "comments": 65, "shares": 40},
            {"plays": 18000, "completion": 48, "likes": 1200, "comments": 92, "shares": 58},
        ], ensure_ascii=False),
        image_count=2,
        video_count=1,
    )

    assert report["platform"] == "douyin"
    assert report["diagnosis_method"] == "noterx_multi_agent"
    assert DOUYIN_DIMENSIONS.issubset(report["radar_data"].keys())
    assert 0 <= report["overall_score"] <= 100
    assert report["grade"] in {"S", "A", "B", "C", "D"}
    assert len(report["agent_opinions"]) == 4
    assert report["debate_timeline"]
    assert report["simulated_comments"]
    assert report["cover_direction"]["tips"]
    assert report["algorithm_chain"]
    assert report["content_profile"]["platform"] == "douyin"
    assert report["content_profile"]["category"] == "interest"
    assert report["content_profile"]["sample_titles"]
    assert report["content_profile"]["comment_patterns"]
    assert {item["stage"] for item in report["algorithm_chain"]} >= {
        "admission_safety",
        "content_recognition",
        "cold_start",
        "completion_amplification",
        "interaction_trigger",
        "conversion_handoff",
        "search_longtail",
        "negative_feedback",
    }
    assert all(0 <= item["score"] <= 100 for item in report["algorithm_chain"])
    assert [item["stage"] for item in report["workflow_trace"]] == [
        "formdata_submit",
        "stream_api",
        "parse_material",
        "baseline_compare",
        "agent_round",
        "agent_debate",
        "judge_summary",
    ]


def test_douyin_baseline_metrics():
    """First-party Douyin rows should produce baseline metrics."""
    baseline = compute_baseline([
        {"plays": "10,000", "completionRate": "45", "likes": 600, "comments": 50, "shares": 20},
        {"播放": 20000, "完播": 55, "点赞": 1500, "评论": 120, "分享": 80},
    ])

    assert baseline["count"] == 2
    assert baseline["avg_plays"] == 15000
    assert baseline["completion_rate"] == 50
    assert baseline["engagement_rate"] > 0


def _assert_expected_csv_baseline(csv_text: str):
    baseline = compute_baseline(_parse_baseline_rows(csv_text))

    assert baseline["count"] == 2
    assert baseline["avg_plays"] == 15000
    assert baseline["completion_rate"] == 50
    assert baseline["engagement_rate"] > 0


def test_douyin_baseline_parses_english_csv():
    """English CSV headers should map to first-party baseline metrics."""
    _assert_expected_csv_baseline(
        """plays,completion,likes,comments,shares
10000,45,600,50,20
20000,55,1500,120,80
"""
    )


def test_douyin_baseline_parses_chinese_csv():
    """Chinese CSV headers should map to first-party baseline metrics."""
    _assert_expected_csv_baseline(
        """播放,完播,点赞,评论,分享
10000,45,600,50,20
20000,55,1500,120,80
"""
    )


def test_douyin_score_rewards_strong_hook_and_conversion():
    """Strong hook/conversion signals should score better than sparse input."""
    weak = score_dimensions(
        {
            "title": "房间改造",
            "content": "简单记录一下。",
            "script": "",
            "hook": "",
            "tags": "",
            "trafficField": "interest",
            "goal": "follow",
            "duration": 180,
            "opsData": "",
        },
        {"images": 0, "videos": 0},
        compute_baseline([]),
    )
    strong = score_dimensions(
        {
            "title": "别再乱花钱，3 步做出民宿改造清单！",
            "content": "评论领取预算模板，收藏后按步骤复盘。",
            "script": "第一步改灯光，第二步换软装，第三步补收纳，最后私信领取清单。",
            "hook": "先把这 3 个位置做对，预算少也能出效果",
            "tags": "民宿,改造,预算,避坑",
            "audience": "新手房东",
            "trafficField": "commerce",
            "goal": "lead",
            "duration": 35,
            "opsData": "评论和私信咨询较多",
        },
        {"images": 2, "videos": 1},
        compute_baseline([{"plays": 15000, "completion": 45, "likes": 900, "comments": 80, "shares": 50}]),
    )

    assert strong["overall"] > weak["overall"]
    assert strong["hook"] > weak["hook"]
    assert strong["conversion"] > weak["conversion"]
