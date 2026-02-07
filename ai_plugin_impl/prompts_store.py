# -*- coding: utf-8 -*-
"""Prompt demo text files for AI plugin.

These are intended to be edited by the user from UI.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .config_store import get_prompts_dir


@dataclass
class TextFileStore:
    path: Path

    def read_text(self) -> str:
        if not self.path.exists():
            return ""
        return self.path.read_text(encoding="utf-8")

    def write_text(self, text: str) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(text, encoding="utf-8")
        tmp.replace(self.path)


def get_subtask_demo_store() -> TextFileStore:
    return TextFileStore(get_prompts_dir() / "subtask_prompt.txt")


def get_vqa_demo_store() -> TextFileStore:
    return TextFileStore(get_prompts_dir() / "vqa_prompt.txt")
