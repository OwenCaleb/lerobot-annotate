# -*- coding: utf-8 -*-
"""Minimal OpenAI-compatible chat client.

Works with vLLM OpenAI server and similar /v1/chat/completions endpoints.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests


@dataclass
class OpenAIChatClient:
    base_url: str
    api_key: str
    model: str
    timeout_s: int = 120

    def chat(self, messages: List[Dict[str, Any]], *, temperature: float = 0.2, max_tokens: int = 256,
             response_format: Optional[Dict[str, Any]] = None,
             extra_body: Optional[Dict[str, Any]] = None) -> str:
        url = self.base_url.rstrip("/") + "/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key or 'EMPTY'}",
        }
        payload: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format is not None:
            payload["response_format"] = response_format
        if extra_body:
            payload.update(extra_body)

        r = requests.post(url, headers=headers, json=payload, timeout=self.timeout_s)
        r.raise_for_status()
        data = r.json()
        # OpenAI compatible
        return (data.get("choices") or [{}])[0].get("message", {}).get("content", "")


def build_client_from_config(cfg: Dict[str, Any]) -> OpenAIChatClient:
    return OpenAIChatClient(
        base_url=cfg.get("openai_base_url", "http://127.0.0.1:8000/v1"),
        api_key=cfg.get("openai_api_key", "EMPTY"),
        model=cfg.get("model", ""),
        timeout_s=int(cfg.get("request_timeout_s", 120)),
    )
