# -*- coding: utf-8 -*-
"""AI plugin configuration.

Portable by construction: all AI behavior is governed by files under ai_prompts/.
The UI can edit these files via API endpoints.

Files:
- ai_prompts/ai_config.json
- ai_prompts/subtask_prompt.txt
- ai_prompts/vqa_prompt.txt
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict


def get_app_root() -> Path:
    """Resolve application root.

    Default: repo root (parent of this ai_plugin_impl directory).
    Override: set LEROBOT_ANNOTATE_APP_ROOT.
    """
    env = os.environ.get("LEROBOT_ANNOTATE_APP_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return Path(__file__).resolve().parents[1]


def get_prompts_dir() -> Path:
    env = os.environ.get("LEROBOT_ANNOTATE_AI_PROMPTS_DIR")
    if env:
        return Path(env).expanduser().resolve()
    return get_app_root() / "ai_prompts"


@dataclass
class ConfigStore:
    """JSON config store."""

    path: Path

    @classmethod
    def default(cls) -> "ConfigStore":
        return cls(get_prompts_dir() / "ai_config.json")

    def ensure_exists(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            raise FileNotFoundError(f"Missing config file: {self.path}")

    def load(self) -> Dict[str, Any]:
        self.ensure_exists()
        with self.path.open("r", encoding="utf-8") as f:
            return json.load(f)

    def save(self, data: Dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        with tmp.open("w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        tmp.replace(self.path)
