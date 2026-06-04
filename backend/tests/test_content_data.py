"""
Platform content reference data tests.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.platforms.content_data import build_content_data_summary, get_platform_content_profile


def test_douyin_content_profiles_are_field_specific():
    interest = get_platform_content_profile("douyin", "interest")
    search = get_platform_content_profile("douyin", "search")

    assert interest["platform"] == "douyin"
    assert interest["category"] == "interest"
    assert search["category"] == "search"
    assert interest["category_label"] != search["category_label"]
    assert interest["sample_titles"] != search["sample_titles"]
    assert interest["reference_count"] >= 35
    assert search["reference_count"] >= 35


def test_wechat_content_profiles_are_category_specific():
    local = get_platform_content_profile("wechat_channels", "hospitality_design")
    knowledge = get_platform_content_profile("wechat_channels", "office_design")

    assert local["platform"] == "wechat_channels"
    assert local["category_label"] == "民宿酒店设计"
    assert knowledge["category_label"] == "办公空间设计"
    assert local["comment_patterns"] != knowledge["comment_patterns"]
    assert local["keyword_packs"]
    assert knowledge["reference_count"] >= 35


def test_content_data_summary_contains_prompt_sections():
    summary = build_content_data_summary("wechat_channels", "office_design", agent_type="judge", max_items=2)

    assert "平台内容数据参考" in summary
    assert "办公空间设计" in summary
    assert "高频标题结构" in summary
    assert "关键词包" in summary
    assert "风险提醒" in summary
