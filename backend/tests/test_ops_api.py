"""
Matrix operation API tests.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["OPS_ENABLED"] = "true"
os.environ["OPS_ADMIN_TOKEN"] = "test-ops-token"
os.environ["OPS_SEED_DEMO_DATA"] = "true"

from fastapi.testclient import TestClient

from app.ops.models import Account, Asset
from app.main import app
from app.ops.social_auto_upload import get_social_auto_upload_state
from app.ops.service import _parse_scutil_proxy, create_platform_draft, create_task_for_draft, execute_publish_task


client = TestClient(app)
client.headers.update({"Authorization": "Bearer test-ops-token"})


def test_ops_parse_macos_system_proxy():
    parsed = _parse_scutil_proxy(
        """
<dictionary> {
  HTTPEnable : 1
  HTTPPort : 7890
  HTTPProxy : 127.0.0.1
  ExceptionsList : <array> {
    0 : localhost
    1 : 127.0.0.1
  }
}
"""
    )

    assert parsed.detected is True
    assert parsed.source == "macOS HTTP 系统代理"
    assert parsed.proxyServer == "http://127.0.0.1:7890"
    assert parsed.bypassList == "localhost,127.0.0.1"


def test_ops_state_seed_shape(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))

    response = client.get("/api/ops/state")

    assert response.status_code == 200
    data = response.json()
    assert len(data["accounts"]) >= 3
    assert {item["platform"] for item in data["accounts"]} >= {"douyin", "xiaohongshu", "wechat_channels"}
    assert data["accounts"][0]["memory"]
    profile_dirs = [item["browserProfileDir"] for item in data["accounts"]]
    assert all(profile_dirs)
    assert len(profile_dirs) == len(set(profile_dirs))
    assert len(data["assets"]) >= 2
    assert "metricCollectionJobs" in data
    assert "creatorCoachReports" in data
    dm_monitor_platforms = {item["platform"] for item in data["directMessageMonitors"]}
    assert dm_monitor_platforms >= {"douyin", "wechat_channels"}
    assert "xiaohongshu" not in dm_monitor_platforms


def test_ops_generate_drafts_and_agent_plan(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    asset_id = state["assets"][0]["id"]

    draft_response = client.post("/api/ops/drafts/generate", json={"assetId": asset_id})
    assert draft_response.status_code == 201
    drafts = draft_response.json()
    assert drafts
    assert {draft["platform"] for draft in drafts} >= {"douyin", "xiaohongshu", "wechat_channels"}
    douyin_draft = next(draft for draft in drafts if draft["platform"] == "douyin")
    assert douyin_draft["publishOptions"]["diagnoseEndpoint"] == "/api/douyin/diagnose/stream"

    plan_response = client.post("/api/ops/agent/plans", json={"objective": "测试三平台计划"})
    assert plan_response.status_code == 201
    plan = plan_response.json()
    assert plan["draftIds"]
    assert plan["summary"].startswith("已为")


def test_ops_task_execute_dry_run(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    asset_id = state["assets"][0]["id"]
    drafts = client.post("/api/ops/drafts/generate", json={"assetId": asset_id}).json()
    douyin_draft = next(draft for draft in drafts if draft["platform"] == "douyin")

    task = client.post("/api/ops/tasks", json={"draftId": douyin_draft["id"]}).json()
    response = client.post(f"/api/ops/tasks/{task['id']}/execute")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "published"
    assert data["platformItemId"].startswith("dryrun-douyin")
    assert any("未向真实平台提交" in row["message"] for row in data["logs"])
    assert any("流程 01/10" in row["message"] for row in data["logs"])
    assert any("模拟上传视频" in row["message"] for row in data["logs"])
    assert any("到达发布按钮" in row["message"] for row in data["logs"])


def test_ops_create_task_rejects_duplicate_active_task(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    asset_id = state["assets"][0]["id"]
    drafts = client.post("/api/ops/drafts/generate", json={"assetId": asset_id}).json()
    draft = next(item for item in drafts if item["platform"] == "douyin")

    first = client.post("/api/ops/tasks", json={"draftId": draft["id"]})
    second = client.post("/api/ops/tasks", json={"draftId": draft["id"]})

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"] == "task_already_exists"


def test_ops_publishing_agent_execute_ready_respects_schedule(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    account_id = next(item["id"] for item in state["accounts"] if item["platform"] == "douyin")
    asset_id = state["assets"][0]["id"]

    response = client.post(
        "/api/ops/agent/publishing-runs",
        json={
            "objective": "测试执行排期",
            "accountIds": [account_id],
            "assetIds": [asset_id],
            "mode": "execute_ready",
            "confirmed": True,
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["executedTaskIds"] == []
    assert payload["blockedTaskIds"]

    next_state = client.get("/api/ops/state").json()
    blocked_task = next(item for item in next_state["tasks"] if item["id"] == payload["blockedTaskIds"][0])
    assert blocked_task["status"] == "scheduled"
    assert any("未到排期时间" in row["message"] for row in blocked_task["logs"])


def test_ops_create_account_from_platform_only(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))

    response = client.post("/api/ops/accounts", json={"platform": "wechat_channels"})

    assert response.status_code == 201
    account = response.json()
    assert account["platform"] == "wechat_channels"
    assert account["displayName"] == "视频号账号（待扫码）"
    assert account["handle"].startswith("wechat_channels-")
    assert account["authType"] == "browser_session"
    assert account["status"] == "needs_login"
    assert account["sessionHealth"] == "unknown"
    assert account["profile"] == "视频号创作者中心扫码接入"
    assert account["browserProfileDir"]


def test_ops_sync_account_profile_from_browser_bridge(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))

    created = client.post("/api/ops/accounts", json={"platform": "douyin"}).json()
    response = client.post(
        f"/api/ops/accounts/{created['id']}/sync-profile",
        json={
            "displayName": "真实抖音号",
            "handle": "douyin-real-001",
            "profile": "扫码后从创作者中心同步",
            "workspaceUrl": "https://creator.douyin.com/creator-micro/home",
            "pageTitle": "抖音创作者中心",
            "source": "browser_bridge",
            "raw": {"platform": "douyin"},
        },
    )

    assert response.status_code == 200
    account = response.json()
    assert account["displayName"] == "真实抖音号"
    assert account["handle"] == "douyin-real-001"
    assert account["profile"] == "扫码后从创作者中心同步"
    assert account["workspaceUrl"].startswith("https://creator.douyin.com")
    assert account["status"] == "connected"
    assert account["sessionHealth"] == "healthy"


def test_ops_sync_creator_data_from_browser_bridge(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    created = client.post("/api/ops/accounts", json={"platform": "douyin"}).json()

    payload = {
        "accountId": created["id"],
        "source": "browser_bridge",
        "posts": [
            {
                "platformPostId": "aweme-001",
                "title": "民宿改造前先看这 3 个预算坑",
                "postUrl": "https://creator.douyin.com/creator-micro/content/manage/aweme-001",
                "metrics": {"plays": 12000, "likes": 800, "comments": 34, "shares": 12, "saves": 90},
                "raw": {"text": "可见作品卡片"},
            }
        ],
        "comments": [
            {
                "platformPostId": "aweme-001",
                "platformCommentId": "comment-001",
                "authorName": "潜在客户",
                "content": "这个民宿设计预算大概要多少钱？",
                "likeCount": 3,
                "replyStatus": "unreplied",
            }
        ],
    }

    first = client.post("/api/ops/creator-data/sync", json=payload)
    second = client.post("/api/ops/creator-data/sync", json=payload)

    assert first.status_code == 201
    assert second.status_code == 201
    data = first.json()
    assert data["posts"][0]["metrics"]["plays"] == 12000
    assert data["comments"][0]["sentiment"] == "lead"
    assert "price_intent" in data["comments"][0]["intentTags"]
    assert data["comments"][0]["replyStatus"] == "drafted"
    assert "预算" in data["comments"][0]["suggestedReply"]

    draft_response = client.post(
        "/api/ops/creator-comments/draft-replies",
        json={"accountId": created["id"], "force": True},
    )
    assert draft_response.status_code == 200
    assert draft_response.json()["comments"][0]["suggestedReply"]
    comment_id = draft_response.json()["comments"][0]["id"]

    approve_response = client.post(
        f"/api/ops/creator-comments/{comment_id}/reply-action",
        json={"action": "approve"},
    )
    assert approve_response.status_code == 200
    assert approve_response.json()["comment"]["replyStatus"] == "approved"

    replied_response = client.post(
        f"/api/ops/creator-comments/{comment_id}/reply-action",
        json={"action": "mark_replied"},
    )
    assert replied_response.status_code == 200
    assert replied_response.json()["comment"]["replyStatus"] == "replied"

    state = client.get("/api/ops/state").json()
    posts = [item for item in state["creatorPosts"] if item["accountId"] == created["id"]]
    comments = [item for item in state["creatorComments"] if item["accountId"] == created["id"]]
    assert len(posts) == 1
    assert len(comments) == 1
    assert comments[0]["postId"] == posts[0]["id"]


def test_ops_account_isolated_workspace_and_memory(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))
    monkeypatch.setenv("PUBLISHER_BROWSER_AUTO_OPEN", "0")

    first = client.post(
        "/api/ops/accounts",
        json={
            "platform": "douyin",
            "displayName": "抖音矩阵 A",
            "handle": "@matrix-a",
            "authType": "browser_session",
            "profile": "民宿酒店设计 A",
            "dailyPublishLimit": 3,
        },
    ).json()
    second = client.post(
        "/api/ops/accounts",
        json={
            "platform": "douyin",
            "displayName": "抖音矩阵 B",
            "handle": "@matrix-b",
            "authType": "browser_session",
            "profile": "办公空间设计 B",
            "dailyPublishLimit": 3,
        },
    ).json()

    assert first["browserProfileDir"] != second["browserProfileDir"]

    workspace = client.post(f"/api/ops/accounts/{first['id']}/open-workspace")
    assert workspace.status_code == 200
    workspace_data = workspace.json()
    assert workspace_data["opened"] is False
    assert workspace_data["launchMode"] == "skipped"
    assert workspace_data["browserProfileDir"] == first["browserProfileDir"]
    assert workspace_data["workspaceUrl"].startswith("https://creator.douyin.com")

    remembered = client.post(f"/api/ops/accounts/{first['id']}/remember-session")
    assert remembered.status_code == 200
    remembered_data = remembered.json()
    assert remembered_data["status"] == "connected"
    assert remembered_data["sessionHealth"] == "healthy"


def test_ops_account_browser_proxy_settings(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))
    monkeypatch.setenv("PUBLISHER_BROWSER_AUTO_OPEN", "0")

    account = client.post(
        "/api/ops/accounts",
        json={
            "platform": "wechat_channels",
            "displayName": "视频号代理账号",
            "handle": "@proxy-a",
            "authType": "browser_session",
            "profile": "办公空间设计",
            "dailyPublishLimit": 3,
            "browserProxyEnabled": True,
            "browserProxyServer": "127.0.0.1:7890",
            "browserProxyBypassList": "localhost;127.0.0.1",
        },
    )
    assert account.status_code == 201
    account_data = account.json()
    assert account_data["browserProxyEnabled"] is True
    assert account_data["browserProxyServer"] == "http://127.0.0.1:7890"
    assert account_data["browserProxyBypassList"] == "localhost,127.0.0.1"

    workspace = client.post(f"/api/ops/accounts/{account_data['id']}/open-workspace")
    assert workspace.status_code == 200
    workspace_data = workspace.json()
    assert workspace_data["proxyEnabled"] is True
    assert workspace_data["proxyServer"] == "http://127.0.0.1:7890"
    assert any("浏览器代理" in row["message"] for row in workspace_data["logs"])

    prepared = client.post(f"/api/ops/accounts/{account_data['id']}/prepare-workspace")
    assert prepared.status_code == 200
    prepared_data = prepared.json()
    assert prepared_data["opened"] is False
    assert prepared_data["launchMode"] == "skipped"
    assert prepared_data["browserExecutable"] == "electron"
    assert prepared_data["account"]["browserProxyServer"] == "http://127.0.0.1:7890"

    updated = client.patch(
        f"/api/ops/accounts/{account_data['id']}/browser",
        json={
            "browserProxyEnabled": False,
            "browserProxyServer": "",
            "browserProxyBypassList": "",
        },
    )
    assert updated.status_code == 200
    updated_data = updated.json()
    assert updated_data["browserProxyEnabled"] is False
    assert updated_data["browserProxyServer"] == ""

    sau_updated = client.patch(
        f"/api/ops/accounts/{account_data['id']}/browser",
        json={"sauAccountName": "shipinhao-office-main"},
    )
    assert sau_updated.status_code == 200
    assert sau_updated.json()["sauAccountName"] == "shipinhao-office-main"


def test_social_auto_upload_mode_does_not_invalidate_unsupported_browser_account(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_RUN_MODE", "social_auto_upload")
    monkeypatch.setenv("PUBLISHER_EXECUTION_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLED", "true")
    monkeypatch.delenv("SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT", raising=False)

    account = client.post(
        "/api/ops/accounts",
        json={
            "platform": "wechat_channels",
            "displayName": "视频号浏览器账号",
            "handle": "wechat-main",
            "authType": "browser_session",
            "profile": "办公空间设计",
            "dailyPublishLimit": 3,
        },
    ).json()
    client.post(f"/api/ops/accounts/{account['id']}/remember-session")

    checked = client.post(f"/api/ops/accounts/{account['id']}/session-check")

    assert checked.status_code == 200
    checked_data = checked.json()
    assert checked_data["platform"] == "wechat_channels"
    assert checked_data["status"] == "connected"
    assert checked_data["sessionHealth"] == "healthy"


def test_social_auto_upload_can_enable_wechat_channels_experiment(tmp_path, monkeypatch):
    fake_sau = tmp_path / "sau"
    fake_log = tmp_path / "sau.log"
    fake_sau.write_text(
        "#!/usr/bin/env bash\n"
        "if [ \"$1\" = \"--help\" ]; then echo 'usage: sau [-h] {douyin,xiaohongshu,tencent} ...'; exit 0; fi\n"
        "printf '%s\\n' \"$*\" >> \"$SAU_FAKE_LOG\"\n"
        "echo valid\n"
        "exit 0\n",
        "utf-8",
    )
    fake_sau.chmod(0o755)
    video_file = tmp_path / "clip.mp4"
    video_file.write_bytes(b"fake-video")

    monkeypatch.setenv("PUBLISHER_RUN_MODE", "social_auto_upload")
    monkeypatch.setenv("PUBLISHER_EXECUTION_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_CLI", str(fake_sau))
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_REPO_PATH", str(tmp_path))
    monkeypatch.setenv("SAU_FAKE_LOG", str(fake_log))

    account = Account(
        id="acct-sau-wechat",
        platform="wechat_channels",
        displayName="视频号 SAU 测试号",
        handle="@wechat-sau",
        status="needs_login",
        authType="browser_session",
        profile="测试",
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    asset = Asset(
        id="asset-sau-wechat",
        titleBase="视频号 SAU 发布测试",
        descriptionBase="视频号正文",
        videoUrl=str(video_file),
        videoLocalPath=str(video_file),
        coverUrl="",
        durationSeconds=15,
        tags=["测试"],
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    draft = create_platform_draft(asset, account)
    task = create_task_for_draft(draft, account)
    task.status = "scheduled"

    result = execute_publish_task(task, account, asset, draft)

    assert result.status == "published"
    assert result.platformItemId and result.platformItemId.startswith("sau-wechat_channels")
    command_output = fake_log.read_text("utf-8")
    assert "tencent check --account wechat-sau" in command_output
    assert "tencent upload-video --account wechat-sau" in command_output
    assert "--draft --headless" in command_output


def test_social_auto_upload_hides_wechat_experiment_when_cli_lacks_tencent(tmp_path, monkeypatch):
    fake_sau = tmp_path / "sau"
    fake_sau.write_text(
        "#!/usr/bin/env bash\n"
        "if [ \"$1\" = \"--help\" ]; then echo 'usage: sau [-h] {douyin,xiaohongshu} ...'; exit 0; fi\n"
        "exit 0\n",
        "utf-8",
    )
    fake_sau.chmod(0o755)

    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_CLI", str(fake_sau))
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_REPO_PATH", str(tmp_path))

    state = get_social_auto_upload_state()

    assert state.executionReady is True
    assert state.supportedPlatforms == ["douyin", "xiaohongshu"]


def test_social_auto_upload_session_check_uses_sau_for_supported_oauth_account(tmp_path, monkeypatch):
    fake_sau = tmp_path / "sau"
    fake_log = tmp_path / "sau.log"
    fake_sau.write_text(
        "#!/usr/bin/env bash\n"
        "printf '%s\\n' \"$*\" >> \"$SAU_FAKE_LOG\"\n"
        "echo invalid-cookie\n"
        "exit 1\n",
        "utf-8",
    )
    fake_sau.chmod(0o755)
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_RUN_MODE", "social_auto_upload")
    monkeypatch.setenv("PUBLISHER_EXECUTION_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_CLI", str(fake_sau))
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_REPO_PATH", str(tmp_path))
    monkeypatch.setenv("SAU_FAKE_LOG", str(fake_log))

    account = client.post(
        "/api/ops/accounts",
        json={
            "platform": "douyin",
            "displayName": "OAuth 但走 SAU 的账号",
            "handle": "@oauth-sau",
            "authType": "oauth",
            "profile": "测试",
            "dailyPublishLimit": 3,
        },
    ).json()

    checked = client.post(f"/api/ops/accounts/{account['id']}/session-check")

    assert checked.status_code == 200
    checked_data = checked.json()
    assert checked_data["status"] == "needs_login"
    assert checked_data["sessionHealth"] == "expired"
    assert "douyin check --account oauth-sau" in fake_log.read_text("utf-8")


def test_social_auto_upload_execute_uses_sau_cli_and_masks_desc(tmp_path, monkeypatch):
    fake_sau = tmp_path / "sau"
    fake_log = tmp_path / "sau.log"
    fake_sau.write_text(
        "#!/usr/bin/env bash\n"
        "if [ \"$1\" = \"--help\" ]; then echo 'douyin xiaohongshu tencent'; exit 0; fi\n"
        "printf '%s\\n' \"$*\" >> \"$SAU_FAKE_LOG\"\n"
        "echo valid\n"
        "exit 0\n",
        "utf-8",
    )
    fake_sau.chmod(0o755)
    video_file = tmp_path / "clip.mp4"
    video_file.write_bytes(b"fake-video")

    monkeypatch.setenv("PUBLISHER_RUN_MODE", "social_auto_upload")
    monkeypatch.setenv("PUBLISHER_EXECUTION_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_CLI", str(fake_sau))
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_REPO_PATH", str(tmp_path))
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ACCOUNT_PREFIX", "teamA_")
    monkeypatch.setenv("SAU_FAKE_LOG", str(fake_log))

    account = Account(
        id="acct-sau",
        platform="douyin",
        displayName="SAU 测试号",
        handle="@sau-main",
        status="needs_login",
        authType="browser_session",
        profile="测试",
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    asset = Asset(
        id="asset-sau",
        titleBase="SAU 发布测试",
        descriptionBase="这段正文不应该原样出现在命令日志里",
        videoUrl=str(video_file),
        videoLocalPath=str(video_file),
        coverUrl="",
        durationSeconds=15,
        tags=["测试"],
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    draft = create_platform_draft(asset, account)
    task = create_task_for_draft(draft, account)
    task.status = "scheduled"

    result = execute_publish_task(task, account, asset, draft)

    assert result.status == "published"
    assert result.platformItemId and result.platformItemId.startswith("sau-douyin")
    messages = [row.message for row in result.logs]
    command_log = next(message for message in messages if message.startswith("sau command"))
    assert "--headless" in command_log
    assert "--desc '<正文内容>'" in command_log or "--desc <正文内容>" in command_log
    assert "这段正文不应该原样" not in command_log
    assert "douyin check --account teamA_sau-main" in fake_log.read_text("utf-8")
    assert "douyin upload-video --account teamA_sau-main" in fake_log.read_text("utf-8")


def test_social_auto_upload_mode_without_second_switch_falls_back_to_dry_run(tmp_path, monkeypatch):
    fake_sau = tmp_path / "sau"
    fake_log = tmp_path / "sau.log"
    fake_sau.write_text(
        "#!/usr/bin/env bash\n"
        "printf '%s\\n' \"$*\" >> \"$SAU_FAKE_LOG\"\n"
        "exit 0\n",
        "utf-8",
    )
    fake_sau.chmod(0o755)
    video_file = tmp_path / "clip.mp4"
    video_file.write_bytes(b"fake-video")

    monkeypatch.setenv("PUBLISHER_RUN_MODE", "social_auto_upload")
    monkeypatch.setenv("PUBLISHER_EXECUTION_ENABLED", "true")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_ENABLED", "false")
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_CLI", str(fake_sau))
    monkeypatch.setenv("SOCIAL_AUTO_UPLOAD_REPO_PATH", str(tmp_path))
    monkeypatch.setenv("SAU_FAKE_LOG", str(fake_log))

    account = Account(
        id="acct-sau-disabled",
        platform="douyin",
        displayName="SAU 禁用测试号",
        handle="@sau-disabled",
        status="connected",
        sessionHealth="healthy",
        authType="browser_session",
        profile="测试",
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    asset = Asset(
        id="asset-sau-disabled",
        titleBase="SAU 禁用测试",
        descriptionBase="不应调用 sau",
        videoUrl=str(video_file),
        videoLocalPath=str(video_file),
        coverUrl="",
        durationSeconds=15,
        tags=["测试"],
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    draft = create_platform_draft(asset, account)
    task = create_task_for_draft(draft, account)

    result = execute_publish_task(task, account, asset, draft)

    assert result.status == "published"
    assert result.platformItemId and result.platformItemId.startswith("dryrun-douyin")
    assert not fake_log.exists()
    assert any("SOCIAL_AUTO_UPLOAD_ENABLED=false" in row.message for row in result.logs)


def test_execute_publish_task_blocks_account_daily_limit():
    account = Account(
        id="acct-limit",
        platform="douyin",
        displayName="额度测试号",
        handle="@limit",
        status="connected",
        sessionHealth="healthy",
        authType="browser_session",
        profile="测试",
        dailyPublishLimit=1,
        publishedToday=1,
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    asset = Asset(
        id="asset-limit",
        titleBase="额度测试",
        descriptionBase="额度测试正文",
        videoUrl="https://example.com/clip.mp4",
        coverUrl="https://example.com/cover.jpg",
        durationSeconds=20,
        tags=["测试"],
        createdAt="2026-05-07T00:00:00+00:00",
        updatedAt="2026-05-07T00:00:00+00:00",
    )
    draft = create_platform_draft(asset, account)
    task = create_task_for_draft(draft, account)

    result = execute_publish_task(task, account, asset, draft)

    assert result.status == "failed"
    assert "今日发布上限" in (result.errorMessage or "")


def test_ops_upload_prepare_requires_local_video_and_stops_before_submit(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))
    monkeypatch.setenv("PUBLISHER_RUN_MODE", "upload_prepare")
    monkeypatch.setenv("PUBLISHER_EXECUTION_ENABLED", "true")

    upload = client.post(
        "/api/ops/assets/upload-file?kind=video",
        files={"file": ("clip.mp4", b"fake-video", "video/mp4")},
    )
    assert upload.status_code == 201
    upload_data = upload.json()
    assert Path(upload_data["filePath"]).exists()

    asset = client.post(
        "/api/ops/assets",
        json={
            "titleBase": "本地上传测试",
            "descriptionBase": "自动发布准备测试",
            "videoUrl": upload_data["fileUrl"],
            "videoLocalPath": upload_data["filePath"],
            "coverUrl": "https://example.com/cover.jpg",
            "durationSeconds": 30,
            "tags": ["测试"],
            "owner": "测试",
            "copyrightStatus": "owned",
        },
    )
    assert asset.status_code == 201

    account = client.post(
        "/api/ops/accounts",
        json={
            "platform": "douyin",
            "displayName": "自动发布测试号",
            "handle": "@auto-publish",
            "authType": "browser_session",
            "profile": "测试",
            "dailyPublishLimit": 3,
        },
    ).json()
    client.post(f"/api/ops/accounts/{account['id']}/remember-session")

    drafts = client.post(
        "/api/ops/drafts/generate",
        json={"assetId": asset.json()["id"], "accountIds": [account["id"]]},
    ).json()
    task = client.post("/api/ops/tasks", json={"draftId": drafts[0]["id"]}).json()
    approved = client.post(f"/api/ops/tasks/{task['id']}/approve")
    assert approved.status_code == 200
    executed = client.post(f"/api/ops/tasks/{task['id']}/execute")

    assert executed.status_code == 200
    executed_data = executed.json()
    assert executed_data["status"] == "manual_takeover"
    assert "已准备自动上传" in executed_data["errorMessage"]
    assert any("待上传视频" in row["message"] for row in executed_data["logs"])
    assert any("不静默点击最终发布" in row["message"] for row in executed_data["logs"])
    assert any("已停在最终发布确认前" in row["message"] for row in executed_data["logs"])


def test_ops_agent_tools_and_invoke_control(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))
    monkeypatch.setenv("PUBLISHER_BROWSER_AUTO_OPEN", "0")

    tools_response = client.get("/api/ops/agent/tools")
    assert tools_response.status_code == 200
    tools = tools_response.json()
    tool_names = {item["name"] for item in tools}
    assert {
        "ops.get_state",
        "ops.create_asset",
        "ops.open_workspace",
        "ops.execute_task",
        "ops.import_diagnosis",
        "ops.check_direct_messages",
        "ops.record_direct_message_event",
        "ops.diagnose_account",
        "ops.record_account_metrics",
        "ops.update_account_memory",
        "ops.collect_account_metrics",
    } <= tool_names
    open_workspace = next(item for item in tools if item["name"] == "ops.open_workspace")
    assert open_workspace["requiresConfirmation"] is True
    diagnose_account = next(item for item in tools if item["name"] == "ops.diagnose_account")
    assert diagnose_account["requiresConfirmation"] is True

    state_response = client.post("/api/ops/agent/invoke", json={"tool": "ops.get_state"})
    assert state_response.status_code == 200
    state_payload = state_response.json()
    assert state_payload["ok"] is True
    account_id = state_payload["result"]["accounts"][0]["id"]

    anonymous_mutation = client.post(
        "/api/ops/agent/invoke",
        json={"tool": "ops.create_asset", "arguments": {"titleBase": "匿名写入"}},
    )
    assert anonymous_mutation.status_code == 200
    assert anonymous_mutation.json()["message"] == "agent_client_required"

    agent_client = client.post("/api/ops/agent/clients", json={"name": "测试控制 Agent"}).json()
    client_id = agent_client["id"]

    gated_response = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": client_id, "tool": "ops.open_workspace", "arguments": {"accountId": account_id}},
    )
    assert gated_response.status_code == 200
    assert gated_response.json()["requiresConfirmation"] is True

    workspace_response = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": client_id, "tool": "ops.open_workspace", "arguments": {"accountId": account_id}, "confirmed": True},
    )
    assert workspace_response.status_code == 200
    workspace_payload = workspace_response.json()
    assert workspace_payload["ok"] is True
    assert workspace_payload["result"]["launchMode"] == "skipped"

    asset_response = client.post(
        "/api/ops/agent/invoke",
        json={
            "clientId": client_id,
            "tool": "ops.create_asset",
            "arguments": {
                "titleBase": "Agent 创建素材",
                "descriptionBase": "用于验证 Agent 控制接口的测试素材。",
                "videoUrl": "https://example.com/agent.mp4",
                "coverUrl": "https://example.com/agent.jpg",
                "tags": ["Agent", "矩阵运营"],
                "durationSeconds": 45,
            },
        },
    )
    assert asset_response.status_code == 200
    asset_payload = asset_response.json()
    assert asset_payload["ok"] is True
    assert asset_payload["result"]["titleBase"] == "Agent 创建素材"

    diagnose_gated_response = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": client_id, "tool": "ops.diagnose_account", "arguments": {"accountId": account_id}},
    )
    assert diagnose_gated_response.status_code == 200
    assert diagnose_gated_response.json()["requiresConfirmation"] is True

    diagnose_response = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": client_id, "tool": "ops.diagnose_account", "arguments": {"accountId": account_id}, "confirmed": True},
    )
    assert diagnose_response.status_code == 200
    diagnose_payload = diagnose_response.json()
    assert diagnose_payload["ok"] is True
    assert diagnose_payload["result"]["accountId"] == account_id
    assert diagnose_payload["result"]["dimensions"]

    metric_response = client.post(
        "/api/ops/agent/invoke",
        json={
            "clientId": client_id,
            "tool": "ops.record_account_metrics",
            "arguments": {
                "accountId": account_id,
                "followers": 1000,
                "plays": 12000,
                "likes": 900,
                "comments": 80,
                "shares": 60,
                "threeSecondRetentionRate": 68,
                "completionRate": 42,
                "followConversionRate": 2.1,
            },
        },
    )
    assert metric_response.status_code == 200
    metric_payload = metric_response.json()
    assert metric_payload["ok"] is True
    assert metric_payload["result"]["threeSecondRetentionRate"] == 68

    collect_gated_response = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": client_id, "tool": "ops.collect_account_metrics", "arguments": {"accountId": account_id}},
    )
    assert collect_gated_response.status_code == 200
    assert collect_gated_response.json()["requiresConfirmation"] is True

    collect_response = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": client_id, "tool": "ops.collect_account_metrics", "arguments": {"accountId": account_id, "source": "simulated"}, "confirmed": True},
    )
    assert collect_response.status_code == 200
    collect_payload = collect_response.json()
    assert collect_payload["ok"] is True
    assert collect_payload["result"]["status"] == "succeeded"
    assert collect_payload["result"]["resultMetricId"]

    memory_response = client.post(
        "/api/ops/agent/invoke",
        json={
            "clientId": client_id,
            "tool": "ops.update_account_memory",
            "arguments": {
                "accountId": account_id,
                "targetAudience": ["民宿业主", "企业行政负责人"],
                "contentPillars": ["案例拆解", "设计咨询"],
                "conversionGoal": "评论关键词进入项目初诊",
                "personaTone": "真实、直接、证据充分",
                "highPerformingPatterns": ["前三秒给结果"],
                "lowPerformingPatterns": ["铺垫过长"],
                "avoidTopics": ["夸大承诺"],
                "commentStrategy": "评论区关键词承接",
            },
        },
    )
    assert memory_response.status_code == 200
    memory_payload = memory_response.json()
    assert memory_payload["ok"] is True
    assert memory_payload["result"]["memory"]["conversionGoal"] == "评论关键词进入项目初诊"


def test_ops_agent_manifest_clients_and_publishing_run(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))
    monkeypatch.setenv("PUBLISHER_BROWSER_AUTO_OPEN", "0")

    manifest_response = client.get("/api/ops/agent/manifest")
    assert manifest_response.status_code == 200
    manifest = manifest_response.json()
    assert manifest["endpoints"]["invoke"] == "POST /api/ops/agent/invoke"
    assert any(rule.startswith("匿名 Agent 只能读取") for rule in manifest["safetyRules"])
    assert any(rule.startswith("外部 Agent 默认不能执行发布任务") for rule in manifest["safetyRules"])
    assert "ops.run_publishing_agent" in {tool["name"] for tool in manifest["tools"]}

    state = client.get("/api/ops/state").json()
    account = next(item for item in state["accounts"] if item["platform"] == "douyin")
    asset = state["assets"][0]
    assert any(item["kind"] == "internal" for item in state["agentClients"])

    external_response = client.post("/api/ops/agent/clients", json={"name": "测试外部 Agent"})
    assert external_response.status_code == 201
    external = external_response.json()
    assert external["kind"] == "external"
    assert external["canExecutePublish"] is False
    assert "ops.execute_task" not in external["allowedTools"]

    state_call = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": external["id"], "tool": "ops.get_state", "purpose": "pytest"},
    )
    assert state_call.status_code == 200
    assert state_call.json()["ok"] is True
    assert state_call.json()["callLogId"]

    blocked_call = client.post(
        "/api/ops/agent/invoke",
        json={"clientId": external["id"], "tool": "ops.run_publishing_agent", "confirmed": True},
    )
    assert blocked_call.status_code == 200
    assert blocked_call.json()["message"] == "tool_not_allowed"

    run_response = client.post(
        "/api/ops/agent/publishing-runs",
        json={
            "objective": "测试内置发布 Agent dry-run",
            "accountIds": [account["id"]],
            "assetIds": [asset["id"]],
            "mode": "execute_ready",
            "confirmed": True,
        },
    )
    assert run_response.status_code == 201
    run = run_response.json()
    assert run["status"] == "completed"
    assert run["planId"]
    assert run["draftIds"]
    assert run["taskIds"]
    assert run["executedTaskIds"] == []
    assert run["blockedTaskIds"]

    refreshed = client.get("/api/ops/state").json()
    assert refreshed["publishingAgentRuns"][0]["id"] == run["id"]
    assert refreshed["agentToolCallLogs"][0]["clientName"] == external["name"]


def test_ops_import_diagnosis_to_connected_account(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    account = next(item for item in state["accounts"] if item["platform"] == "douyin" and item["status"] == "connected")

    response = client.post(
        "/api/ops/diagnosis/import",
        json={
            "accountId": account["id"],
            "title": "诊断优化标题",
            "content": "诊断后得到的发布文案",
            "tags": ["民宿设计", "设计案例"],
            "category": "hospitality_design",
            "score": 86,
            "durationSeconds": 45,
            "createTask": True,
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data["account"]["id"] == account["id"]
    assert data["asset"]["titleBase"] == "诊断优化标题"
    assert data["draft"]["accountId"] == account["id"]
    assert data["draft"]["readiness"] == "needs_review"
    assert data["draft"]["publishOptions"]["source"] == "diagnosis_import"
    assert data["task"]["draftId"] == data["draft"]["id"]
    assert data["task"]["status"] == "pending_review"


def test_ops_account_diagnosis_report(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    monkeypatch.setenv("PUBLISHER_BROWSER_PROFILES_DIR", str(tmp_path / "profiles"))

    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")

    response = client.post(
        f"/api/ops/accounts/{douyin_account['id']}/diagnose",
        json={"readLoggedInWorkspace": True},
    )

    assert response.status_code == 201
    report = response.json()
    assert report["accountId"] == douyin_account["id"]
    assert report["platform"] == "douyin"
    assert report["source"] == "official_api"
    assert report["readLoggedInWorkspace"] is True
    assert 0 <= report["overallScore"] <= 100
    assert report["grade"] in {"S", "A", "B", "C", "D"}
    assert {item["key"] for item in report["dimensions"]} >= {"health", "profile", "engagement", "algorithm", "operation", "response"}
    assert report["findings"]
    assert report["suggestions"]
    assert report["dataPoints"]["latestMetric"]["accountId"] == douyin_account["id"]
    assert [stage["key"] for stage in report["workflowStages"]] == ["snapshot", "baseline", "agents", "debate", "judge"]
    assert len(report["agentOpinions"]) >= 5
    assert {item["agentName"] for item in report["agentOpinions"]} >= {"账号定位 Agent", "内容管线 Agent", "互动转化 Agent", "风险控制 Agent"}
    assert any(item["agentName"] == "JudgeAgent" and item["kind"] == "judge" for item in report["debateTimeline"])
    assert report["judgeSummary"].startswith("JudgeAgent 汇总")
    assert {item["key"] for item in report["actions"]} >= {"title_hook", "script_revision", "comment_reply", "publish_task"}
    assert report["actions"][0]["suggestedTitle"]

    action_response = client.post(
        f"/api/ops/account-diagnoses/{report['id']}/actions/apply",
        json={"actionKey": "title_hook", "createTask": False},
    )
    assert action_response.status_code == 201
    action_payload = action_response.json()
    assert action_payload["account"]["id"] == douyin_account["id"]
    assert action_payload["draft"]["publishOptions"]["source"] == "diagnosis_import"
    assert action_payload["draft"]["publishOptions"]["sourceDiagnosisId"] == f"{report['id']}:title_hook"
    assert action_payload["task"] is None

    task_action_response = client.post(
        f"/api/ops/account-diagnoses/{report['id']}/actions/apply",
        json={"actionKey": "publish_task", "createTask": True},
    )
    assert task_action_response.status_code == 201
    assert task_action_response.json()["task"]["status"] == "pending_review"

    channels_account = next(item for item in state["accounts"] if item["platform"] == "wechat_channels")
    channels_response = client.post(
        f"/api/ops/accounts/{channels_account['id']}/diagnose",
        json={"readLoggedInWorkspace": True},
    )
    assert channels_response.status_code == 201
    channels_report = channels_response.json()
    assert channels_report["accountId"] == channels_account["id"]
    assert channels_report["platform"] == "wechat_channels"
    assert channels_report["source"] == "browser_session"
    assert channels_report["risks"]

    refreshed = client.get("/api/ops/state").json()
    assert {item["id"] for item in refreshed["accountDiagnoses"][:2]} == {report["id"], channels_report["id"]}


def test_ops_record_account_metric_snapshot_feeds_diagnosis(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")

    metric_response = client.post(
        f"/api/ops/accounts/{douyin_account['id']}/metrics",
        json={
            "source": "manual",
            "periodDays": 7,
            "followers": 18000,
            "plays": 260000,
            "likes": 15000,
            "comments": 920,
            "shares": 1300,
            "avgViewDurationSeconds": 21.5,
            "threeSecondRetentionRate": 72,
            "completionRate": 46,
            "replayRate": 13,
            "followConversionRate": 2.4,
            "searchImpressionRate": 22,
            "localTrafficRate": 29,
        },
    )
    assert metric_response.status_code == 201
    metric = metric_response.json()
    assert metric["accountId"] == douyin_account["id"]
    assert metric["threeSecondRetentionRate"] == 72

    diagnosis_response = client.post(f"/api/ops/accounts/{douyin_account['id']}/diagnose")
    assert diagnosis_response.status_code == 201
    diagnosis = diagnosis_response.json()
    assert diagnosis["dataPoints"]["latestMetric"]["id"] == metric["id"]
    assert "3秒留存72%" in diagnosis["dataPoints"]["algorithmSignals"]
    assert any("平台算法信号" in item for item in diagnosis["findings"])
    algorithm_opinion = next(item for item in diagnosis["agentOpinions"] if item["agentName"] == "抖音算法 Agent")
    assert algorithm_opinion["score"] >= 60
    assert any("3秒留存72%" in item for item in algorithm_opinion["evidence"])


def test_ops_collect_account_metrics_simulated_job(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")

    response = client.post(
        f"/api/ops/accounts/{douyin_account['id']}/metrics/collect",
        json={"source": "simulated", "periodDays": 7},
    )

    assert response.status_code == 201
    job = response.json()
    assert job["accountId"] == douyin_account["id"]
    assert job["source"] == "simulated"
    assert job["status"] == "succeeded"
    assert job["resultMetricId"]
    assert job["logs"]

    refreshed = client.get("/api/ops/state").json()
    assert refreshed["metricCollectionJobs"][0]["id"] == job["id"]
    latest_metric = refreshed["metrics"][0]
    assert latest_metric["id"] == job["resultMetricId"]
    assert latest_metric["source"] == "simulated"


def test_ops_collect_account_metrics_real_adapter_pending(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")

    response = client.post(
        f"/api/ops/accounts/{douyin_account['id']}/metrics/collect",
        json={"source": "official_api", "periodDays": 7},
    )

    assert response.status_code == 201
    job = response.json()
    assert job["status"] == "failed"
    assert job["errorMessage"] == "collector_adapter_not_implemented"


def test_ops_creator_coach_generates_profile_patterns_and_ideas(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")

    patterns_response = client.get("/api/ops/content-patterns")
    assert patterns_response.status_code == 200
    patterns = patterns_response.json()
    assert {item["key"] for item in patterns} >= {"result_first", "avoid_pitfall", "question_answer"}

    memory_response = client.patch(
        f"/api/ops/accounts/{douyin_account['id']}/memory",
        json={
            "targetAudience": ["民宿业主", "酒店投资人"],
            "contentPillars": ["民宿改造", "预算清单", "真实避坑"],
            "conversionGoal": "评论关键词领取设计方案清单",
            "personaTone": "真实、克制、结果前置",
            "highPerformingPatterns": ["首屏给改造结果和预算"],
            "lowPerformingPatterns": ["只拍风景不讲适合谁"],
            "avoidTopics": ["夸大低价"],
            "commentStrategy": "评论关键词承接方案咨询",
            "privateDomainStrategy": "私信继续确认项目阶段和预算",
        },
    )
    assert memory_response.status_code == 200

    response = client.post(
        f"/api/ops/accounts/{douyin_account['id']}/coach",
        json={"focusGoal": "线索", "ideaCount": 4},
    )
    assert response.status_code == 201
    report = response.json()
    assert report["accountId"] == douyin_account["id"]
    assert report["profile"]["readinessScore"] >= 70
    assert "账号" in report["profile"]["role"]
    assert report["recommendedPatterns"]
    assert len(report["ideas"]) == 4
    assert any("民宿改造" in idea["title"] or "民宿改造" in idea["hook"] for idea in report["ideas"])
    assert report["nextActions"]

    refreshed = client.get("/api/ops/state").json()
    assert refreshed["creatorCoachReports"][0]["id"] == report["id"]

    agent_client = client.post("/api/ops/agent/clients", json={"name": "创作教练 Agent"}).json()
    agent_response = client.post(
        "/api/ops/agent/invoke",
        json={
            "clientId": agent_client["id"],
            "tool": "ops.generate_creator_coach",
            "arguments": {"accountId": douyin_account["id"], "focusGoal": "互动", "ideaCount": 2},
        },
    )
    assert agent_response.status_code == 200
    agent_payload = agent_response.json()
    assert agent_payload["ok"] is True
    assert len(agent_payload["result"]["ideas"]) == 2


def test_ops_account_memory_feeds_diagnosis_and_drafts(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")

    memory_response = client.patch(
        f"/api/ops/accounts/{douyin_account['id']}/memory",
        json={
            "targetAudience": ["民宿业主", "酒店投资人"],
            "contentPillars": ["民宿改造", "预算清单", "真实避坑"],
            "conversionGoal": "评论关键词领取设计方案清单",
            "personaTone": "真实、克制、结果前置",
            "highPerformingPatterns": ["首屏给改造结果和预算"],
            "lowPerformingPatterns": ["只拍风景不讲适合谁"],
            "avoidTopics": ["夸大低价", "无授权素材"],
            "commentStrategy": "评论关键词承接方案咨询",
            "privateDomainStrategy": "私信继续确认项目阶段和预算",
        },
    )
    assert memory_response.status_code == 200
    memory = memory_response.json()["memory"]
    assert memory["targetAudience"] == ["民宿业主", "酒店投资人"]

    diagnosis_response = client.post(f"/api/ops/accounts/{douyin_account['id']}/diagnose")
    assert diagnosis_response.status_code == 201
    diagnosis = diagnosis_response.json()
    assert diagnosis["dataPoints"]["memoryScore"] >= 90
    assert any(item["key"] == "memory" for item in diagnosis["dimensions"])
    assert any("民宿业主" in item for item in diagnosis["findings"])

    asset_id = state["assets"][0]["id"]
    drafts = client.post("/api/ops/drafts/generate", json={"assetId": asset_id, "accountIds": [douyin_account["id"]]}).json()
    assert "民宿业主" in drafts[0]["description"]
    assert "评论关键词领取设计方案清单" in drafts[0]["description"]


def test_ops_account_diagnosis_supports_xiaohongshu(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    xhs_account = next(item for item in state["accounts"] if item["platform"] == "xiaohongshu")

    response = client.post(f"/api/ops/accounts/{xhs_account['id']}/diagnose")

    assert response.status_code == 201
    report = response.json()
    assert report["accountId"] == xhs_account["id"]
    assert report["platform"] == "xiaohongshu"
    assert report["dimensions"]
    assert report["suggestions"]


def test_ops_import_diagnosis_requires_connected_account(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    account = next(item for item in state["accounts"] if item["platform"] == "wechat_channels")

    response = client.post(
        "/api/ops/diagnosis/import",
        json={"accountId": account["id"], "title": "未登录账号导入"},
    )

    assert response.status_code == 409


def test_ops_direct_message_monitor_event_and_acknowledge(tmp_path, monkeypatch):
    monkeypatch.setenv("OPS_DATA_PATH", str(tmp_path / "ops_db.json"))
    state = client.get("/api/ops/state").json()
    douyin_account = next(item for item in state["accounts"] if item["platform"] == "douyin")
    xhs_account = next(item for item in state["accounts"] if item["platform"] == "xiaohongshu")

    check_response = client.post("/api/ops/direct-messages/check", json={"accountIds": [douyin_account["id"]]})
    assert check_response.status_code == 200
    check_data = check_response.json()
    assert check_data["monitors"][0]["accountId"] == douyin_account["id"]

    event_response = client.post(
        "/api/ops/direct-messages/events",
        json={"accountId": douyin_account["id"], "unreadCount": 3, "source": "manual"},
    )
    assert event_response.status_code == 201
    event_data = event_response.json()
    assert event_data["monitors"][0]["unreadCount"] == 3
    assert event_data["alerts"][0]["status"] == "unread"
    assert event_data["alerts"][0]["unreadCount"] == 3

    ack_response = client.post(f"/api/ops/direct-messages/alerts/{event_data['alerts'][0]['id']}/acknowledge")
    assert ack_response.status_code == 200
    assert ack_response.json()["status"] == "acknowledged"

    unsupported_response = client.post(
        "/api/ops/direct-messages/events",
        json={"accountId": xhs_account["id"], "unreadCount": 1, "source": "manual"},
    )
    assert unsupported_response.status_code == 409
