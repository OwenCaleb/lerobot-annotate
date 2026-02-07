# -*- coding: utf-8 -*-
"""FastAPI registration glue.

This module isolates any assumptions about the host application's objects
(FastAPI `app` and DataManager-like `manager`).
"""

from __future__ import annotations

from typing import Any

from .routes import build_ai_router


def register_ai_plugin(app: Any, manager: Any) -> None:
    """Attach AI plugin API routes onto the existing FastAPI app."""

    router = build_ai_router(manager)
    app.include_router(router)
