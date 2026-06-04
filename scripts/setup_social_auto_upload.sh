#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${SOCIAL_AUTO_UPLOAD_REPO_PATH:-$ROOT_DIR/integrations/social-auto-upload}"
REPO_URL="${SOCIAL_AUTO_UPLOAD_REPO_URL:-https://github.com/dreammis/social-auto-upload.git}"

mkdir -p "$(dirname "$TARGET_DIR")"

if [ ! -d "$TARGET_DIR/.git" ]; then
  git clone --depth 1 "$REPO_URL" "$TARGET_DIR"
else
  git -C "$TARGET_DIR" pull --ff-only
fi

cd "$TARGET_DIR"

if [ ! -f conf.py ] && [ -f conf.example.py ]; then
  cp conf.example.py conf.py
fi

if command -v uv >/dev/null 2>&1; then
  if ! uv python find 3.12 >/dev/null 2>&1; then
    uv python install 3.12
  fi
  uv venv --python 3.12 --allow-existing .venv
  . .venv/bin/activate
  uv pip install -e .
else
  PYTHON_BIN="${PYTHON_BIN:-python3.12}"
  "$PYTHON_BIN" -m venv .venv
  . .venv/bin/activate
  python -m pip install --upgrade pip
  python -m pip install -e .
fi

patchright install chromium

cat <<EOF

social-auto-upload 已安装到:
  $TARGET_DIR

后端启用方式:
  export PUBLISHER_RUN_MODE=social_auto_upload
  export SOCIAL_AUTO_UPLOAD_REPO_PATH="$TARGET_DIR"
  export SOCIAL_AUTO_UPLOAD_CLI="$TARGET_DIR/.venv/bin/sau"

账号登录示例:
  cd "$TARGET_DIR"
  .venv/bin/sau douyin login --account <自媒体管家账号 handle> --headed
  .venv/bin/sau xiaohongshu login --account <自媒体管家账号 handle> --headed

EOF
