#!/usr/bin/env python3
"""Command-line control surface for the local self-media manager.

This script intentionally uses only the Python standard library so other local
agents can call it without installing another SDK.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_API_BASE = "http://127.0.0.1:8002/api"
PLATFORMS = ("douyin", "xiaohongshu", "wechat_channels")


class CliError(RuntimeError):
    pass


def split_tags(value: str) -> list[str]:
    tags: list[str] = []
    for raw in value.replace("，", ",").replace("、", ",").replace("#", " ").replace(",", " ").split():
        tag = raw.strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def read_text_arg(value: str | None, file_path: str | None) -> str:
    if file_path:
        return Path(file_path).expanduser().read_text(encoding="utf-8").strip()
    return (value or "").strip()


def normalize_media_path(value: str, label: str) -> str:
    cleaned = value.strip()
    if not cleaned:
        raise CliError(f"{label}_missing")
    if cleaned.startswith(("http://", "https://", "/api/")):
        return cleaned
    path = Path(cleaned).expanduser()
    if not path.exists():
        raise CliError(f"{label}_not_found:{path}")
    return str(path.resolve())


def emit(data: Any, *, pretty: bool = True) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=2 if pretty else None))


class OpsClient:
    def __init__(self, api_base: str) -> None:
        self.api_base = api_base.rstrip("/")

    def request(self, method: str, path: str, payload: Any | None = None) -> Any:
        body = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(f"{self.api_base}{path}", data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                raw = response.read().decode("utf-8")
                return json.loads(raw) if raw else None
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise CliError(f"http_{exc.code}:{detail}") from exc
        except urllib.error.URLError as exc:
            raise CliError(f"api_unreachable:{exc.reason}") from exc

    def get(self, path: str) -> Any:
        return self.request("GET", path)

    def post(self, path: str, payload: Any | None = None) -> Any:
        return self.request("POST", path, payload or {})


def connected_accounts(client: OpsClient, platforms: list[str] | None = None) -> list[dict[str, Any]]:
    state = client.get("/ops/state")
    accounts = [account for account in state.get("accounts", []) if account.get("status") == "connected"]
    if platforms:
        accounts = [account for account in accounts if account.get("platform") in platforms]
    return accounts


def resolve_account_ids(client: OpsClient, args: argparse.Namespace) -> list[str]:
    explicit = list(args.account_id or [])
    if explicit:
        return explicit
    platforms = list(args.platform or [])
    if args.all_connected or platforms:
        return [account["id"] for account in connected_accounts(client, platforms or None)]
    raise CliError("target_accounts_missing: use --account-id, --platform, or --all-connected")


def cmd_state(client: OpsClient, args: argparse.Namespace) -> None:
    state = client.get("/ops/state")
    if args.accounts:
        state = {
            "accounts": [
                {
                    "id": item["id"],
                    "platform": item["platform"],
                    "displayName": item["displayName"],
                    "handle": item["handle"],
                    "status": item["status"],
                    "sessionHealth": item["sessionHealth"],
                }
                for item in state.get("accounts", [])
            ]
        }
    emit(state, pretty=not args.compact)


def cmd_runtime(client: OpsClient, args: argparse.Namespace) -> None:
    emit(client.get("/ops/runtime"), pretty=not args.compact)


def cmd_accounts_list(client: OpsClient, args: argparse.Namespace) -> None:
    state = client.get("/ops/state")
    accounts = state.get("accounts", [])
    if args.platform:
        accounts = [item for item in accounts if item.get("platform") == args.platform]
    emit({"accounts": accounts}, pretty=not args.compact)


def cmd_accounts_create(client: OpsClient, args: argparse.Namespace) -> None:
    payload = {
        "platform": args.platform,
        "displayName": args.display_name or "",
        "handle": args.handle or "",
        "profile": args.profile or "",
        "sauAccountName": args.sau_account_name or "",
    }
    emit(client.post("/ops/accounts", payload), pretty=not args.compact)


def cmd_accounts_sync(client: OpsClient, args: argparse.Namespace) -> None:
    payload = {
        "displayName": args.display_name or "",
        "handle": args.handle or "",
        "profile": args.profile or "",
        "workspaceUrl": args.workspace_url or "",
        "pageTitle": args.page_title or "",
        "source": "manual",
        "raw": {"source": "ops_cli"},
    }
    emit(client.post(f"/ops/accounts/{args.account_id}/sync-profile", payload), pretty=not args.compact)


def cmd_task_execute(client: OpsClient, args: argparse.Namespace) -> None:
    results = [client.post(f"/ops/tasks/{task_id}/execute") for task_id in args.task_id]
    emit({"tasks": results}, pretty=not args.compact)


def cmd_task_list(client: OpsClient, args: argparse.Namespace) -> None:
    state = client.get("/ops/state")
    tasks = state.get("tasks", [])
    if args.status:
        tasks = [task for task in tasks if task.get("status") == args.status]
    emit({"tasks": tasks[: args.limit]}, pretty=not args.compact)


def cmd_publish_video(client: OpsClient, args: argparse.Namespace) -> None:
    account_ids = resolve_account_ids(client, args)
    copy = read_text_arg(args.copy, args.copy_file)
    if not copy:
        raise CliError("copy_missing")
    video_path = normalize_media_path(args.video, "video")
    cover_path = normalize_media_path(args.cover, "cover")
    payload = {
        "contentType": "video",
        "titleBase": args.title.strip(),
        "descriptionBase": copy,
        "videoUrl": video_path,
        "videoLocalPath": video_path if not video_path.startswith(("http://", "https://", "/api/")) else "",
        "coverUrl": cover_path,
        "coverLocalPath": cover_path if not cover_path.startswith(("http://", "https://", "/api/")) else "",
        "tags": split_tags(args.topics or ""),
        "durationSeconds": args.duration,
        "owner": args.owner,
        "copyrightStatus": "owned",
    }
    asset = client.post("/ops/assets", payload)
    drafts = client.post("/ops/drafts/generate", {"assetId": asset["id"], "accountIds": account_ids})
    tasks = []
    executed = []
    for draft in drafts:
        task = client.post("/ops/tasks", {"draftId": draft["id"], "scheduledAt": args.scheduled_at})
        tasks.append(task)
        if args.execute:
            executed.append(client.post(f"/ops/tasks/{task['id']}/execute"))
    emit(
        {
            "asset": asset,
            "drafts": drafts,
            "tasks": tasks,
            "executedTasks": executed,
            "targetAccountIds": account_ids,
        },
        pretty=not args.compact,
    )


def cmd_agent_manifest(client: OpsClient, args: argparse.Namespace) -> None:
    emit(client.get("/ops/agent/manifest"), pretty=not args.compact)


def cmd_agent_tools(client: OpsClient, args: argparse.Namespace) -> None:
    emit(client.get("/ops/agent/tools"), pretty=not args.compact)


def add_common_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--api-base", default=DEFAULT_API_BASE, help="API base URL, default: %(default)s")
    parser.add_argument("--compact", action="store_true", help="Print compact JSON")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="自媒体管家 CLI control surface")
    add_common_flags(parser)
    sub = parser.add_subparsers(dest="command", required=True)

    state = sub.add_parser("state", help="Show operations state")
    state.add_argument("--accounts", action="store_true", help="Only print account summary")
    state.set_defaults(func=cmd_state)

    runtime = sub.add_parser("runtime", help="Show publishing runtime")
    runtime.set_defaults(func=cmd_runtime)

    accounts = sub.add_parser("accounts", help="Manage accounts")
    accounts_sub = accounts.add_subparsers(dest="accounts_command", required=True)
    accounts_list = accounts_sub.add_parser("list", help="List accounts")
    accounts_list.add_argument("--platform", choices=PLATFORMS)
    accounts_list.set_defaults(func=cmd_accounts_list)
    accounts_create = accounts_sub.add_parser("create", help="Create a pending browser-session account")
    accounts_create.add_argument("--platform", choices=PLATFORMS, required=True)
    accounts_create.add_argument("--display-name")
    accounts_create.add_argument("--handle")
    accounts_create.add_argument("--profile")
    accounts_create.add_argument("--sau-account-name")
    accounts_create.set_defaults(func=cmd_accounts_create)
    accounts_sync = accounts_sub.add_parser("sync", help="Sync detected account identity")
    accounts_sync.add_argument("--account-id", required=True)
    accounts_sync.add_argument("--display-name")
    accounts_sync.add_argument("--handle")
    accounts_sync.add_argument("--profile")
    accounts_sync.add_argument("--workspace-url")
    accounts_sync.add_argument("--page-title")
    accounts_sync.set_defaults(func=cmd_accounts_sync)

    publish = sub.add_parser("publish", help="Create and run publish jobs")
    publish_sub = publish.add_subparsers(dest="publish_command", required=True)
    video = publish_sub.add_parser("video", help="One-shot video publish package")
    video.add_argument("--account-id", action="append", help="Target account id. Repeatable.")
    video.add_argument("--platform", action="append", choices=PLATFORMS, help="All connected accounts on platform. Repeatable.")
    video.add_argument("--all-connected", action="store_true", help="Use all connected accounts")
    video.add_argument("--title", required=True)
    video.add_argument("--copy")
    video.add_argument("--copy-file")
    video.add_argument("--topics", default="")
    video.add_argument("--video", required=True, help="Local video path or URL")
    video.add_argument("--cover", required=True, help="Local cover path or URL")
    video.add_argument("--duration", type=int, default=60)
    video.add_argument("--owner", default="CLI Agent")
    video.add_argument("--scheduled-at", help="ISO datetime; omitted means now")
    video.add_argument("--no-execute", action="store_false", dest="execute", help="Only create tasks")
    video.set_defaults(func=cmd_publish_video, execute=True)

    tasks = sub.add_parser("tasks", help="List or execute tasks")
    tasks_sub = tasks.add_subparsers(dest="tasks_command", required=True)
    tasks_list = tasks_sub.add_parser("list", help="List tasks")
    tasks_list.add_argument("--status")
    tasks_list.add_argument("--limit", type=int, default=20)
    tasks_list.set_defaults(func=cmd_task_list)
    tasks_execute = tasks_sub.add_parser("execute", help="Execute tasks")
    tasks_execute.add_argument("task_id", nargs="+")
    tasks_execute.set_defaults(func=cmd_task_execute)

    agent = sub.add_parser("agent", help="Machine-readable agent metadata")
    agent_sub = agent.add_subparsers(dest="agent_command", required=True)
    manifest = agent_sub.add_parser("manifest", help="Show agent manifest")
    manifest.set_defaults(func=cmd_agent_manifest)
    tools = agent_sub.add_parser("tools", help="Show agent tools")
    tools.set_defaults(func=cmd_agent_tools)
    return parser


def normalize_global_args(argv: list[str]) -> list[str]:
    """Allow global flags before or after subcommands.

    Argparse normally requires global options to appear before the subcommand.
    External agents often append flags at the end, so we lift the known global
    flags to the front before parsing.
    """

    lifted: list[str] = []
    rest: list[str] = []
    index = 0
    while index < len(argv):
        item = argv[index]
        if item == "--compact":
            lifted.append(item)
            index += 1
        elif item == "--api-base":
            if index + 1 >= len(argv):
                rest.append(item)
                index += 1
            else:
                lifted.extend([item, argv[index + 1]])
                index += 2
        elif item.startswith("--api-base="):
            lifted.append(item)
            index += 1
        else:
            rest.append(item)
            index += 1
    return [*lifted, *rest]


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    normalized_argv = normalize_global_args(list(sys.argv[1:] if argv is None else argv))
    args = parser.parse_args(normalized_argv)
    client = OpsClient(args.api_base)
    try:
        args.func(client, args)
        return 0
    except CliError as exc:
        emit({"ok": False, "error": str(exc)}, pretty=not args.compact)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
