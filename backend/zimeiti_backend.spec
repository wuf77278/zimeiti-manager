# -*- mode: python ; coding: utf-8 -*-
from __future__ import annotations

import os
from pathlib import Path

from PyInstaller.utils.hooks import collect_submodules


backend_root = Path(SPECPATH)
project_root = backend_root.parent

datas = [
    (str(project_root / "frontend" / "dist"), "frontend/dist"),
    (str(project_root / "docs"), "docs"),
    (str(backend_root / "data"), "backend/data"),
]

hiddenimports = []
for package in (
    "uvicorn.lifespan",
    "uvicorn.protocols.http",
    "uvicorn.protocols.websockets",
    "uvicorn.loops",
    "httptools",
    "websockets",
    "jieba",
):
    hiddenimports += collect_submodules(package)

a = Analysis(
    ["desktop_server.py"],
    pathex=[str(backend_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="zimeiti-backend",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="zimeiti-backend",
)
