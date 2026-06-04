#!/bin/bash
# 自媒体管家 一键启动脚本
# Usage: ./start.sh

set -e

PROJECT_NAME="自媒体管家"
BACKEND_PORT=${BACKEND_PORT:-8001}
FRONTEND_PORT=${FRONTEND_PORT:-5173}

echo "🚀 ${PROJECT_NAME} 启动中..."

# Check .env
if [ ! -f backend/.env ] && [ ! -f .env ]; then
  echo "⚠️  未找到 backend/.env 文件。如需启用 LLM 能力，请先复制并填写 API Key："
  echo "   cp .env.example backend/.env"
fi

# Start backend
echo "🔧 启动后端服务..."
cd backend
if [ ! -x venv/bin/python ]; then
  echo "   创建 Python 虚拟环境..."
  python3 -m venv venv
fi
./venv/bin/python -m pip install -r requirements.txt -q
./venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT} --reload &
BACKEND_PID=$!
cd ..

# Start frontend
echo "🎨 启动前端服务..."
cd frontend
npm install -q 2>/dev/null
VITE_API_PROXY_TARGET="http://localhost:${BACKEND_PORT}" npm run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} &
FRONTEND_PID=$!
cd ..

echo ""
echo "✅ ${PROJECT_NAME} 已启动！"
echo "   前端: http://localhost:${FRONTEND_PORT}/app"
echo "   后端: http://localhost:${BACKEND_PORT}"
echo "   API文档: http://localhost:${BACKEND_PORT}/docs"
echo "   默认仅启用内容诊断；Ops/Admin/真实发布需显式配置环境变量。"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
