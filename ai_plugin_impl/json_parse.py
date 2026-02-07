# -*- coding: utf-8 -*-
"""Robust JSON extraction from model output."""

from __future__ import annotations

import json
import re
from typing import Any, Dict


_JSON_BLOCK_RE = re.compile(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", re.IGNORECASE)


def extract_json_object(text: str) -> Dict[str, Any]:
    """Extract and parse first JSON object from a string.

    Strategy:
    1) direct json.loads
    2) fenced code block ```json
    3) substring from first { to last }
    """
    text = (text or "").strip()
    if not text:
        raise ValueError("empty model output")

    # 1) direct
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except Exception:
        pass

    # 2) fenced
    m = _JSON_BLOCK_RE.search(text)
    if m:
        candidate = m.group(1)
        obj = json.loads(candidate)
        if isinstance(obj, dict):
            return obj

    # 3) braces substring
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        obj = json.loads(candidate)
        if isinstance(obj, dict):
            return obj

    raise ValueError("could not parse JSON object from model output")
