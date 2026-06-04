# 自媒体管家 CLI

本项目提供 `scripts/ops_cli.py` 作为本地命令行控制入口，供其他智能体或自动化脚本直接操控运营台。

默认连接：

```bash
python3 scripts/ops_cli.py --api-base http://127.0.0.1:8002/api state --accounts
```

常用命令：

```bash
# 查看账号
python3 scripts/ops_cli.py state --accounts

# 查看发布运行模式
python3 scripts/ops_cli.py runtime

# 新增一个待扫码账号
python3 scripts/ops_cli.py accounts create --platform douyin

# 手动同步账号身份
python3 scripts/ops_cli.py accounts sync \
  --account-id <account_id> \
  --display-name "账号昵称" \
  --handle "平台账号ID"

# 一键发布视频到所有已连接账号
python3 scripts/ops_cli.py publish video \
  --all-connected \
  --title "视频标题" \
  --copy "发布文案" \
  --topics "#创业日记 #观点" \
  --video /path/to/video.mp4 \
  --cover /path/to/cover.png

# 只创建任务，不立即执行
python3 scripts/ops_cli.py publish video \
  --platform douyin \
  --title "视频标题" \
  --copy-file /path/to/copy.txt \
  --topics "#案例 #干货" \
  --video /path/to/video.mp4 \
  --cover /path/to/cover.png \
  --no-execute

# 查看任务
python3 scripts/ops_cli.py tasks list --limit 10

# 执行指定任务
python3 scripts/ops_cli.py tasks execute <task_id>

# 给外部智能体读取可用工具定义
python3 scripts/ops_cli.py agent tools
python3 scripts/ops_cli.py agent manifest
```

输出均为 JSON，便于其他智能体解析后继续调用。
