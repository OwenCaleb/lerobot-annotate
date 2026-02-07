# -*- coding: utf-8 -*-
"""Safe string template formatting.

We allow users to edit prompt templates from the UI. Standard `str.format()`
will raise if a placeholder is missing. This helper fills unknown placeholders
with empty strings, so a slightly imperfect template does not break the API.
"""

from __future__ import annotations

import string
from typing import Any, Dict


def safe_format(template: str, mapping: Dict[str, Any]) -> str:
    """Format a `{name}` template with best-effort substitution.

    Unknown placeholders become an empty string.
    """
    template = template or ""
    mapping = dict(mapping or {})

    formatter = string.Formatter()
    needed = {field_name for _, field_name, _, _ in formatter.parse(template) if field_name}
    for k in needed:
        if k not in mapping:
            mapping[k] = ""

    try:
        return template.format_map(mapping)
    except Exception:
        # As a last resort, do not crash.
        return template
