.PHONY: data install setup-social-auto-upload test ci desktop-backend desktop-mac desktop-win

# 一键初始化数据库并生成 baseline
data:
	python3 scripts/init_db.py
	python3 scripts/seed_data.py
	python3 scripts/compute_baseline.py

# 安装所有依赖
install:
	cd backend && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt
	cd frontend && npm install

setup-social-auto-upload:
	./scripts/setup_social_auto_upload.sh

# 后端测试
test:
	cd backend && . venv/bin/activate && python -m pytest tests/ -v

# CI 检查（构建+测试）
ci: test
	cd frontend && npx tsc --noEmit && npx vite build

desktop-backend:
	cd backend && . venv/bin/activate && pip install -r requirements-desktop.txt && python -m PyInstaller --noconfirm zimeiti_backend.spec

desktop-mac: data desktop-backend
	cd frontend && npm install && npm run desktop:dist:mac

desktop-win: data desktop-backend
	cd frontend && npm install && npm run desktop:dist:win
