"""Desktop entrypoint for the bundled FastAPI server."""
from __future__ import annotations

import os

import uvicorn

from app.main import app


def main() -> None:
    host = os.getenv("ZIMEITI_BACKEND_HOST", "127.0.0.1")
    port = int(os.getenv("ZIMEITI_BACKEND_PORT", "8001"))
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level=os.getenv("ZIMEITI_LOG_LEVEL", "info"),
        access_log=False,
    )


if __name__ == "__main__":
    main()
