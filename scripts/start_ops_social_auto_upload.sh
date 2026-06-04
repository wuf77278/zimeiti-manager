#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAU_REPO="${SOCIAL_AUTO_UPLOAD_REPO_PATH:-$ROOT_DIR/integrations/social-auto-upload}"

export BACKEND_PORT="${BACKEND_PORT:-8002}"
export FRONTEND_PORT="${FRONTEND_PORT:-5174}"
export OPS_ENABLED="${OPS_ENABLED:-true}"
export VITE_ENABLE_OPS="${VITE_ENABLE_OPS:-true}"
export PUBLISHER_RUN_MODE="${PUBLISHER_RUN_MODE:-social_auto_upload}"
export PUBLISHER_EXECUTION_ENABLED="${PUBLISHER_EXECUTION_ENABLED:-true}"
export SOCIAL_AUTO_UPLOAD_ENABLED="${SOCIAL_AUTO_UPLOAD_ENABLED:-true}"
export SOCIAL_AUTO_UPLOAD_REPO_PATH="$SAU_REPO"
export SOCIAL_AUTO_UPLOAD_CLI="${SOCIAL_AUTO_UPLOAD_CLI:-$SAU_REPO/.venv/bin/sau}"
export OPS_ADMIN_TOKEN="${OPS_ADMIN_TOKEN:-}"

cat <<EOF
自媒体管家 Ops + Social Auto Upload 模式
  前端: http://localhost:${FRONTEND_PORT}/app/ops
  后端: http://localhost:${BACKEND_PORT}
  OPS_ADMIN_TOKEN: ${OPS_ADMIN_TOKEN:-未启用，本地免令牌}
  SAU CLI: ${SOCIAL_AUTO_UPLOAD_CLI}

真实上传前请确认：
  1. 已完成 sau 登录，例如:
     cd "$SAU_REPO"
     .venv/bin/sau douyin login --account <账号名> --headed
  2. 发布任务已人工审核，且发布包的视频文件来自本地上传。

EOF

exec "$ROOT_DIR/start.sh"
