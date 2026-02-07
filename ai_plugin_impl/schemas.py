# -*- coding: utf-8 -*-
"""Pydantic schemas for AI plugin API.

Design goals:
- Backward compatible with earlier UI payloads (max_frames/max_segments).
- Forward compatible with a configurable AI mode UI (prompts + config editable).
"""

from __future__ import annotations

from typing import Any, Dict, Literal, Optional

from pydantic import BaseModel, Field


class StatusResponse(BaseModel):
    enabled: bool
    base_url: str
    model: str
    prompts_dir: str


class ConfigPayload(BaseModel):
    config: Dict[str, Any]


class PromptPayload(BaseModel):
    text: str


class AutoSubtasksRequest(BaseModel):
    episode_index: int
    stride_s: Optional[float] = None
    summary_frames: Optional[int] = None
    segment_frames: Optional[int] = Field(default=None, description="frames to sample per stride segment when building clip")
    max_steps: Optional[int] = None
    # Backward-compat fields from older UI patches.
    max_frames: Optional[int] = None
    max_segments: Optional[int] = None
    # Behavior
    mode: Literal["replace", "append"] = "replace"
    start_time_s: Optional[float] = Field(default=None, description="override start time within episode")
    resume_from_last: Optional[bool] = Field(default=False, description="if true and start_time_s is None, continue from last segment end")
    language: Optional[str] = Field(default=None, description="override label language; default from config")
    merge_adjacent: Optional[bool] = Field(default=True, description="merge adjacent segments with identical labels")


class AutoVQARequest(BaseModel):
    episode_index: int
    stride_s: Optional[float] = None
    window_s: Optional[float] = None
    window_frames: Optional[int] = None
    # Backward-compat fields from older UI patches.
    max_frames: Optional[int] = None
    max_segments: Optional[int] = None
    max_steps: Optional[int] = None  # cap steps; None means full episode
    mode: Literal["replace", "append"] = "replace"
    start_time_s: Optional[float] = None
    resume_from_last: Optional[bool] = False
    language: Optional[str] = Field(default=None, description="override; default from config")
    scenario_type: Optional[str] = None
    response_type: Optional[str] = None
    skill: Optional[str] = None
