# -*- coding: utf-8 -*-
"""FastAPI routes for AI annotation.

Endpoints are designed for portability and for a UI that can edit prompt files.

Compat endpoints are also provided:
- POST /api/episodes/{episode_index}/ai/subtasks
- POST /api/episodes/{episode_index}/ai/fake_vqa
"""

from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException

from .config_store import ConfigStore, get_prompts_dir
from .engine import AIAnnotator
from .prompts_store import get_subtask_demo_store, get_vqa_demo_store
from .schemas import (
    AutoSubtasksRequest,
    AutoVQARequest,
    ConfigPayload,
    PromptPayload,
    StatusResponse,
)


def _get_cfg() -> Dict[str, Any]:
    return ConfigStore.default().load()


def build_ai_router(manager: Any) -> APIRouter:
    root = APIRouter()

    router = APIRouter(prefix="/api/ai", tags=["ai"])
    annotator = AIAnnotator(manager)

    @router.get("/status", response_model=StatusResponse)
    def status() -> StatusResponse:
        cfg = _get_cfg()
        return StatusResponse(
            enabled=bool(cfg.get("enabled", True)),
            base_url=str(cfg.get("openai_base_url", "")),
            model=str(cfg.get("model", "")),
            prompts_dir=str(get_prompts_dir()),
        )

    @router.get("/config", response_model=ConfigPayload)
    def get_config() -> ConfigPayload:
        return ConfigPayload(config=_get_cfg())

    @router.put("/config", response_model=ConfigPayload)
    def put_config(payload: ConfigPayload) -> ConfigPayload:
        store = ConfigStore.default()
        store.save(payload.config)
        return payload

    @router.get("/prompts/subtask", response_model=PromptPayload)
    def get_subtask_prompt_file() -> PromptPayload:
        return PromptPayload(text=get_subtask_demo_store().read_text())

    @router.put("/prompts/subtask", response_model=PromptPayload)
    def put_subtask_prompt_file(payload: PromptPayload) -> PromptPayload:
        get_subtask_demo_store().write_text(payload.text)
        return payload

    @router.get("/prompts/vqa", response_model=PromptPayload)
    def get_vqa_prompt_file() -> PromptPayload:
        return PromptPayload(text=get_vqa_demo_store().read_text())

    @router.put("/prompts/vqa", response_model=PromptPayload)
    def put_vqa_prompt_file(payload: PromptPayload) -> PromptPayload:
        get_vqa_demo_store().write_text(payload.text)
        return payload

    @router.post("/subtasks")
    def ai_subtasks(req: AutoSubtasksRequest) -> Dict[str, Any]:
        try:
            segments = annotator.generate_subtasks(req)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI subtasks failed: {e}")
        return {"episode_index": req.episode_index, "count": len(segments), "subtasks": segments}

    @router.post("/fake_vqa")
    def ai_fake_vqa(req: AutoVQARequest) -> Dict[str, Any]:
        try:
            segments = annotator.generate_fake_vqa(req)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"AI fake VQA failed: {e}")
        return {"episode_index": req.episode_index, "count": len(segments), "high_levels": segments}

    # Compatibility routes under /api/episodes/... (older UI patches)
    compat = APIRouter(prefix="/api/episodes", tags=["ai-compat"])

    @compat.post("/{episode_index}/ai/subtasks")
    def compat_subtasks(episode_index: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        if payload.get("episode_index") is None:
            payload["episode_index"] = episode_index
        req = AutoSubtasksRequest(**payload)
        return ai_subtasks(req)

    @compat.post("/{episode_index}/ai/fake_vqa")
    def compat_fake_vqa(episode_index: int, payload: Dict[str, Any]) -> Dict[str, Any]:
        if payload.get("episode_index") is None:
            payload["episode_index"] = episode_index
        req = AutoVQARequest(**payload)
        return ai_fake_vqa(req)

    root.include_router(router)
    root.include_router(compat)
    return root
