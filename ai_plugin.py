# -*- coding: utf-8 -*-
"""AI plugin entry.

Keep this file tiny for portability. The implementation lives under
`ai_plugin_impl/`.

Recommended usage (no edits to app.py):

  uvicorn app_ai:app --host 0.0.0.0 --port 7860
"""

from __future__ import annotations

from typing import Any


def register_ai_plugin(app: Any, manager: Any) -> None:
    """Register AI plugin routes onto an existing FastAPI app."""

    from ai_plugin_impl.register import register_ai_plugin as _register

    _register(app, manager)
