# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install all dependencies (backend venv + frontend npm)
make install

# Initialize SQLite database + seed baseline data
make data

# Start both services (backend + frontend)
./start.sh

# Manual start
cd backend && source venv/bin/activate && uvicorn app.main:app --port 8001 --reload
cd frontend && npm run dev

# Production: build frontend then serve everything from backend on one port
cd frontend && npm run build
cd backend && source venv/bin/activate && uvicorn app.main:app --port 8001

# Run backend tests
make test
# or: cd backend && source venv/bin/activate && python -m pytest tests/ -v

# Frontend type check + build
cd frontend && npx tsc --noEmit && npx vite build

# Full CI
make ci
```

## Architecture

自媒体管家 is a dual-platform content diagnosis workspace for **微信视频号** and **抖音号**. Users submit their own titles, scripts, screenshots/videos, and optional first-party metrics; the backend runs platform-aware scoring, baseline comparison, multi-agent diagnosis, debate, and report assembly.

The main application skeleton is the VideoRx React/FastAPI architecture, with the standalone local Douyin analysis prototype migrated into a deterministic `douyin` platform strategy for the MVP.

### Product boundaries

This is a defensive/assistive content analysis tool. Do not implement platform scraping, simulated clients, login bypass, unauthorized batch collection, fake engagement, auto-comments, bulk private messages, or platform-rule evasion.

MVP analysis must stay limited to user-entered, user-uploaded, self-owned, or manually imported material/data.

Ops, Admin, social-auto-upload, private-message monitoring, and Agent publishing controls are optional local/internal modules. They stay disabled unless `OPS_ENABLED=true`, `ADMIN_ENABLED=true`, and the relevant bearer tokens/execution switches are explicitly configured.

### Platform key

Both frontend and backend use a shared platform field:

```text
platform = "wechat_channels" | "douyin"
```

- `wechat_channels`: 微信视频号 diagnosis flow.
- `douyin`: 抖音素材/账号 diagnosis flow.

Frontend platform labels, dimensions, category options, examples, tips, and progress steps are centralized in `frontend/src/config/platforms.ts`.

### Multi-Agent Flow (`backend/app/agents/orchestrator.py`)

微信视频号 still uses the full LLM/orchestrator path:

```text
Input → TextAnalyzer + Image/OCR/Video analysis
     → BaselineComparator (SQLite)
     → Round 1: 4 agents diagnose in parallel (asyncio.gather)
        ContentAgent | VisualAgent | GrowthAgent | UserSimAgent
     → Round 2: Each agent debates others' opinions
     → Round 3: JudgeAgent synthesizes final report
     → Response assembly
```

Agent roles for Video Channels:
- `ContentAgent`: title hook, publish copy, opening 3 seconds, script rhythm.
- `VisualAgent`: cover/first-frame clickability and WeChat preview readability.
- `GrowthAgent`: interaction, forwarding motivation, publishing time, private-domain handoff.
- `UserSimAgent`: information-feed, Moments, group-chat, local/private-domain audience reactions.
- `JudgeAgent`: final scoring and optimization prescription.

### Douyin strategy (`backend/app/platforms/douyin.py`)

抖音 MVP uses deterministic platform scoring migrated from the local 自媒体管家 prototype. It does not scrape Douyin or require external platform access.

Core concepts:
- traffic fields: `interest`, `search`, `local`, `commerce`, `private`
- goals: `follow`, `comment`, `save`, `lead`, `deal`
- optional first-party baseline rows via `baselineRows`
- media counts from user-uploaded images/videos

The strategy returns the same report shape as the Video Channels flow: `platform`, `overall_score`, `grade`, `radar_data`, `agent_opinions`, `debate_timeline`, `simulated_comments`, optimization suggestions, and cover direction.

### Report dimensions

微信视频号 reports use these radar/scoring keys:

- `title_hook` — 标题钩子
- `cover_click` — 封面点击力
- `script_retention` — 脚本留存力
- `interaction_share` — 互动转发力
- `positioning_fit` — 账号定位匹配
- `overall` — 综合评分

抖音 reports use these radar/scoring keys:

- `hook` — 前3秒/秒停留
- `completion` — 完播结构
- `recognition` — 内容识别/分发
- `conversion` — 转化承接
- `baseline_fit` — 账号/爆款基线
- `overall` — 综合评分

### Model Tiers (configured in `backend/.env`)

Three models via Xiaomi MiMo API or another OpenAI-compatible gateway:
- `MODEL_PRO` / `LLM_MODEL_PRO` — used for agent diagnosis, debate, and judging.
- `MODEL_OMNI` / `LLM_MODEL_OMNI` — multimodal, used for OCR/image/video analysis.
- `MODEL_FAST` / `LLM_MODEL_FAST` — used for quick tasks like simulated comments.

`base_agent.py` handles MiMo gateway quirks: `max_completion_tokens` instead of `max_tokens`, fallback when `response_format=json_object` is unsupported, proxy bypass via `trust_env=False`.

### Frontend-Backend Connection

- **Dev mode**: Vite proxy forwards `/api/*` to backend (configured in `frontend/vite.config.ts`; override with `frontend/.env.development`).
- **Production**: FastAPI serves the built SPA via `SPAMiddleware`; non-`/api` routes fall through to `index.html`.
- React Router uses `BrowserRouter basename="/app"`; internal navigation to home should use `navigate("/")`, not `navigate("/app")`.

### Database

SQLite is stored at `backend/data/baseline.db`.

- **Baseline data**: seeded Video Channels scenario data across categories such as local, knowledge, emotion, enterprise, shop, and ip. Used by `BaselineComparator`.
- **Diagnosis history**: `diagnosis_history` table, auto-created/migrated on startup via the `lifespan` hook in `main.py`; includes a `platform` column.
- **Local memory**: `backend/data/noterx_workspace` is intentionally retained as the storage path for compatibility with upstream/local data.

### Key API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/diagnose` | Main diagnosis (multipart form; platform-aware) |
| POST | `/api/diagnose-stream` | Streaming diagnosis progress via SSE |
| POST | `/api/diagnose/stream` | Compatibility alias for streaming diagnosis |
| POST | `/api/screenshot/quick` | Quick screenshot/video recognition |
| POST | `/api/generate-comments` | Generate more simulated comments |
| POST | `/api/optimize` | Generate optimization variants |
| GET | `/api/baseline/{category}` | Category baseline stats |
| CRUD | `/api/history` | Diagnosis history, including platform |

### Frontend Stack

React 19 + TypeScript + MUI + Vite. Framer Motion for page transitions and tab animations. ECharts for radar chart. html2canvas for export.

Pages: Home (platform selector + input) → Diagnosing (platform-aware progress) → Report (score, platform dimensions, radar, agent debate, simulated comments, export card). History is stored locally in the browser and preserves platform metadata.

## Configuration

Copy `.env.example` to `backend/.env`. Key vars:
- `OPENAI_API_KEY` / `OPENAI_BASE_URL` — API credentials.
- `LLM_MODEL_FAST` / `LLM_MODEL_PRO` / `LLM_MODEL_OMNI` — model names per tier.
- `LLM_PROVIDER` — `openai` (default) or `anthropic`.

The `_is_mimo_openai_compat()` function in `base_agent.py` auto-detects MiMo gateway from URL or model name.
