# -*- coding: utf-8 -*-
"""Thin wrapper to enable AI plugin without editing app.py.

Run:
  uvicorn app_ai:app --reload

It imports the base app + manager from app.py and registers ai_plugin routes.
"""

from app import app, manager  # type: ignore

from ai_plugin import register_ai_plugin

register_ai_plugin(app, manager)
