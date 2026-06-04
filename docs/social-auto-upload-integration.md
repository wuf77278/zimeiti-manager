# social-auto-upload 集成说明

本项目已接入 `dreammis/social-auto-upload` 作为可选发布引擎。原有运营台继续负责账号、素材、草稿、排期和任务日志；真实上传动作由本机的 `sau` CLI 执行。

## 安装上游发布引擎

```bash
./scripts/setup_social_auto_upload.sh
```

脚本会把上游仓库安装到 `integrations/social-auto-upload`，创建独立 Python 3.12 虚拟环境，并安装 `sau` CLI 和 Patchright Chromium。该目录属于本机外部依赖，已从主项目交付范围中排除。

## 启用发布模式

推荐直接使用 Ops + SAU 启动脚本：

```bash
./scripts/start_ops_social_auto_upload.sh
```

脚本默认使用：

- 前端：`http://localhost:5174/app/ops`
- 后端：`http://localhost:8002`
- 本地令牌：`OPS_ADMIN_TOKEN=local-ops-token`
- 发布模式：`PUBLISHER_RUN_MODE=social_auto_upload`

如需覆盖端口或令牌，可以在启动前设置环境变量。手动方式如下：

```bash
export PUBLISHER_RUN_MODE=social_auto_upload
export PUBLISHER_EXECUTION_ENABLED=true
export SOCIAL_AUTO_UPLOAD_ENABLED=true
export OPS_ENABLED=true
export OPS_ADMIN_TOKEN="replace-with-local-token"
export VITE_ENABLE_OPS=true
export SOCIAL_AUTO_UPLOAD_REPO_PATH="/Users/Apple_501/Desktop/自媒体管家/integrations/social-auto-upload"
export SOCIAL_AUTO_UPLOAD_CLI="/Users/Apple_501/Desktop/自媒体管家/integrations/social-auto-upload/.venv/bin/sau"
```

然后照常启动：

```bash
./start.sh
```

## 账号登录约定

自媒体管家会把账号 `handle` 作为 `sau --account` 名称。比如账号 handle 是 `dy_design_01`，先在上游目录登录：

```bash
cd "/Users/Apple_501/Desktop/自媒体管家/integrations/social-auto-upload"
.venv/bin/sau douyin login --account dy_design_01 --headed
.venv/bin/sau xiaohongshu login --account xhs_design_01 --headed
.venv/bin/sau tencent login --account shipinhao_design_01 --headed
```

如果 handle 是中文或特殊字符，系统会自动转成安全的账号名；任务日志里会显示实际使用的 `account`。

## 当前支持边界

- 默认已接入：抖音、小红书视频上传。
- 实验接入：视频号。上游 `sau tencent` 已提供 CLI 入口，但视频号页面变化和原创声明流程更容易波动，因此本项目默认仍回退人工接管。确认要试用时设置 `SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT=true`；系统会先探测本机 `sau --help` 是否包含 `tencent`，不支持时不会显示为可自动上传平台。
- 视频号实验上传默认追加 `--draft`，也就是保存草稿而不是直接发布；确认稳定后可设置 `SOCIAL_AUTO_UPLOAD_TENCENT_DRAFT=false` 改为按上游流程发布。
- 快手和 B 站已从当前平台体系移除；如后续恢复平台模型，可复用 `sau kuaishou` / `sau bilibili`。

如果需要打开每个账号自己的平台后台并保持登录态隔离，使用桌面版账号浏览器和本地扩展桥。完整路线见 [自动发布路线](自动发布路线.md)。

## 常用环境变量

- `SOCIAL_AUTO_UPLOAD_HEADLESS=0`：让 `sau` 上传时打开可见浏览器；默认无头执行，登录仍建议手动 `--headed`。
- `PUBLISHER_EXECUTION_ENABLED=true`：允许发布流程进入浏览器准备、上传准备或 SAU 执行模式。
- `SOCIAL_AUTO_UPLOAD_ENABLED=true`：允许后端实际调用本机 `sau` CLI。
- `SOCIAL_AUTO_UPLOAD_DEBUG=1`：把 `--debug` 传给 `sau`。
- `SOCIAL_AUTO_UPLOAD_ENABLE_TENCENT=true`：实验开启视频号 `sau tencent` 登录态检查和视频上传。
- `SOCIAL_AUTO_UPLOAD_TENCENT_DRAFT=false`：关闭视频号实验链路的默认草稿保护。
- `SOCIAL_AUTO_UPLOAD_ENABLE_SCHEDULE=0`：不把未来排期时间传给平台定时发布。
- `SOCIAL_AUTO_UPLOAD_TIMEOUT_SECONDS=2700`：上传子进程超时时间。
- `SOCIAL_AUTO_UPLOAD_ACCOUNT_PREFIX=teamA_`：给所有 `sau --account` 加统一前缀。
