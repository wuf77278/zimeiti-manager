# 自媒体管家

双平台内容会诊工作台：支持 **微信视频号** 与 **抖音号** 的素材诊断、基线对比、多 Agent 会诊、SSE 进度流和报告卡片。项目以原 VideoRx/FastAPI + React 架构为主骨架，并融合本地抖音账号分析台的素材会诊逻辑。

> MVP 只分析用户手动填写的数据、上传的截图/视频或自有导入素材；不做平台爬取、模拟客户端、绕过登录、批量采集、刷量、自动评论或自动私信。

## 核心能力

- **双平台入口**：首页可选择微信视频号或抖音号，表单字段、诊断步骤、维度标签随平台切换。
- **多模态输入**：支持封面/截图/视频上传，也可手动填写标题、正文、脚本、前 3 秒钩子、发布时间和运营数据。
- **视频号五维评分**：标题钩子、封面点击力、脚本留存力、互动转发力、账号定位匹配。
- **抖音五维评分**：前 3 秒/秒停留、完播结构、内容识别/分发、转化承接、账号/爆款基线。
- **平台推送链路代理模型**：抖音按准入、内容识别、冷启动、完播放大、互动、转化、搜索长尾和负反馈诊断；视频号按标题开头、封面卡片、有效观看、熟人转发、私域承接和账号定位诊断。该模型基于公开可观察信号与用户自有数据，不代表平台内部权重。
- **NoteRx 会诊主干**：复用 NoteRx 的“Model A 预评分 / baseline 对比 / 4 Agent 并行诊断 / Agent 辩论 / JudgeAgent 汇总 / 优化闭环”诊断思路，平台差异只体现在 Agent 判断框架和推送链路权重代理上。
- **多 Agent 会诊**：平台化专家先独立诊断，再辩论补充，由 JudgeAgent 汇总最终报告。
- **报告与历史**：输出雷达图、维度条、核心问题、优化处方、模拟评论、分享卡片和本地浏览器历史记录。

## 产品模块

### 1. 内容诊断工作台，默认启用

- 微信视频号诊断
- 抖音诊断
- 截图/视频快识别
- 报告与本地历史

### 2. Ops 运营台，默认关闭

- 账号管理
- 素材管理
- 草稿生成
- 发布任务
- Agent 发布计划

启用时需要同时配置 `OPS_ENABLED=true`、`OPS_ADMIN_TOKEN` 和前端 `VITE_ENABLE_OPS=true`。

### 3. social-auto-upload，可选外部引擎

- 仅本地显式启用
- 默认不真实上传
- 视频号自动上传暂不作为稳定能力

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 · TypeScript · MUI · Framer Motion · ECharts · Vite |
| 后端 | FastAPI · asyncio · SSE · SQLite |
| AI | OpenAI-compatible MiMo 模型网关：Pro / Omni / Flash |
| 分析 | jieba 文本分析 · OCR/视觉识别 · 视频首帧/听写 · 基线/启发式评分 |

## 快速开始

```bash
# 安装后端 venv 和前端依赖
make install

# 初始化 SQLite baseline 数据
make data

# 启动前后端
./start.sh
```

访问 `http://localhost:5173/app`。

也可以手动启动：

```bash
cd backend && source venv/bin/activate && uvicorn app.main:app --port 8001 --reload
cd frontend && npm run dev
```

如后端不在默认端口，可在 `frontend/.env.development` 配置：

```env
VITE_API_PROXY_TARGET=http://localhost:8001
```

默认后端端口使用 `8001`，避免和本机 OpenAI-compatible 模型网关常用的 `8000` 冲突。需要换端口时可运行 `BACKEND_PORT=8002 FRONTEND_PORT=5174 ./start.sh`。

## 诊断接口

前端会按平台调用独立诊断接口，也保留兼容入口：

- 抖音号：`POST /api/douyin/diagnose`、`POST /api/douyin/diagnose/stream`
- 微信视频号：`POST /api/wechat-channels/diagnose`、`POST /api/wechat-channels/diagnose/stream`
- 兼容入口：`POST /api/diagnose`、`POST /api/diagnose-stream`、`POST /api/diagnose/stream`

标准工作链路复用 NoteRx：素材填写/上传 -> 前端打包 FormData -> 平台诊断接口流式提交 -> 后端解析文本、图片、视频和运营数据 -> Model A 预评分 -> 本地 baseline 对比 -> 4 个平台专家 Agent 独立诊断 -> Agent 互相辩论补充 -> JudgeAgent 汇总 -> 前端展示评分、雷达图、建议、评论模拟、平台推送链路、NoteRx 会诊链路和分享卡片 -> 保存到本地历史。

## 配置

复制环境变量示例并填入模型网关配置：

```bash
cp .env.example backend/.env
```

常用变量：

- `OPENAI_API_KEY` / `OPENAI_BASE_URL`：OpenAI-compatible API 凭证与地址。
- `LLM_MODEL_PRO`：Agent 诊断、辩论、裁判模型。
- `LLM_MODEL_OMNI`：截图、封面、视频理解模型。
- `LLM_MODEL_FAST`：模拟评论等快速任务模型。
- `OPS_ENABLED=false` / `ADMIN_ENABLED=false`：默认不注册运营台和 Admin 接口。
- `PUBLISHER_RUN_MODE=dry_run`：默认只模拟发布，不触达真实平台。
- `PUBLISHER_EXECUTION_ENABLED=false` / `SOCIAL_AUTO_UPLOAD_ENABLED=false`：真实或半自动发布的二次保护开关。

没有可用 API key 时，抖音 MVP 会走确定性本地策略；视频号的部分 AI 识别或完整诊断可能失败，但前端仍可验证表单、路由、错误提示和本地报告展示流程。

## 常用命令

```bash
make test
cd frontend && npx tsc --noEmit && npx vite build
make ci
```

## 本地桌面 App

桌面版使用 Electron 承载前端，并在启动时自动拉起本机 FastAPI 后端。首次启动会把内置 `baseline.db` 复制到系统用户数据目录，后续诊断历史和运营台数据都写入用户目录，不写回安装包。

```bash
# macOS 本机构建 .app zip
make install
make desktop-mac

# Windows 安装包需在 Windows 环境构建
make install
make desktop-win
```

产物输出到 `release/desktop/`。也可以在 GitHub Actions 里手动运行 `Desktop Release`，macOS runner 会生成 `.app` zip，Windows runner 会生成 NSIS `.exe` 安装包；推送 `v*` 标签时会自动发布到 GitHub Release。若需要 DMG，可在 macOS 上运行 `cd frontend && npm run desktop:dist:mac:dmg`。

## 可选：接入 social-auto-upload 发布引擎

运营台可调用 [dreammis/social-auto-upload](https://github.com/dreammis/social-auto-upload) 的 `sau` CLI 执行抖音/小红书视频上传。该引擎作为本机外部依赖，不要求主项目携带第三方仓库源码：

```bash
./scripts/setup_social_auto_upload.sh
export OPS_ENABLED=true
export OPS_ADMIN_TOKEN="replace-with-local-token"
export VITE_ENABLE_OPS=true
export PUBLISHER_EXECUTION_ENABLED=true
export SOCIAL_AUTO_UPLOAD_ENABLED=true
export PUBLISHER_RUN_MODE=social_auto_upload
./start.sh
```

详细账号登录、环境变量和视频号边界见 [docs/social-auto-upload-integration.md](docs/social-auto-upload-integration.md)。
自动发布的两条执行路线、独立账号浏览器和扩展桥边界见 [docs/自动发布路线.md](docs/自动发布路线.md)。

## 合规边界

自媒体管家的定位是内容诊断和优化建议工具，不实现或鼓励：

- 自动爬取微信视频号、抖音或其他平台内容；
- 模拟客户端、绕过登录或访问控制；
- 非授权批量采集账号数据；
- 刷量、诱导违规分享、自动评论、批量私信；
- 任何破坏平台规则或用户隐私的功能。

## 上游与许可证

本项目基于开源项目 [jiangmuran/noterx](https://github.com/jiangmuran/noterx) 的多 Agent 会诊框架改造，并融合本地抖音素材会诊原型的产品逻辑。保留原 Apache License 2.0 授权与上游归属信息。
