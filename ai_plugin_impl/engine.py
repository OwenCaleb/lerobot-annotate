# -*- coding: utf-8 -*-
"""High-level AI annotation engine.

This class provides a stable interface for routes and for external scripts.
It intentionally reloads config and prompt files on each call so the UI can
edit them without restarting the server.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import math
from typing import Any, Dict, List, Optional

from .config_store import ConfigStore, get_app_root
from .client_openai import build_client_from_config
from .prompts_store import get_subtask_demo_store, get_vqa_demo_store
from .sampler import FrameSampler
from .schemas import AutoSubtasksRequest, AutoVQARequest
from .strategy_subtask import AutoSubtaskGenerator
from .strategy_vqa import AutoVQAGenerator
from .adapter import get_episode_timing


def _cache_dir() -> Path:
    # Keep cache under repo root for portability.
    return get_app_root() / ".cache" / "ai_frames"


def _merge_adjacent_subtasks(segments: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Merge consecutive subtask segments with the same label."""
    if not segments:
        return []
    out: List[Dict[str, Any]] = []
    for s in segments:
        if not out:
            out.append(dict(s))
            continue
        prev = out[-1]
        if str(prev.get("label", "")) == str(s.get("label", "")) and float(prev.get("end", 0.0)) >= float(s.get("start", 0.0)):
            # Extend end.
            prev["end"] = max(float(prev.get("end", 0.0)), float(s.get("end", 0.0)))
        else:
            out.append(dict(s))
    # Keep numeric formatting stable.
    for s in out:
        s["start"] = round(float(s.get("start", 0.0)), 3)
        s["end"] = round(float(s.get("end", 0.0)), 3)
    return out


@dataclass
class AIAnnotator:
    manager: Any

    def _load_cfg(self) -> Dict[str, Any]:
        return ConfigStore.default().load()

    def _frame_sampler(self, cfg: Dict[str, Any]) -> FrameSampler:
        image_max_side = int(cfg.get("image_max_side", 768))
        return FrameSampler(cache_dir=_cache_dir(), image_max_side=image_max_side)

    def generate_subtasks(self, req: AutoSubtasksRequest) -> List[Dict[str, Any]]:
        cfg = self._load_cfg()
        subt_cfg = dict(cfg.get("subtasks", {}) or {})

        # Backward compatibility:
        # - Older UI uses max_frames/max_segments (max_frames means frames-per-segment sampling, NOT summary).
        # - Keep summary_frames independent.
        segment_frames = req.segment_frames if hasattr(req, 'segment_frames') else None
        if segment_frames is None:
            segment_frames = req.max_frames
        max_steps = req.max_steps if req.max_steps is not None else req.max_segments

        # If stride_s is not specified but max_segments exists, approximate a stride
        # that yields roughly that many segments across the episode.
        stride_s = req.stride_s
        if stride_s is None and req.max_segments:
            timing = get_episode_timing(self.manager, req.episode_index)
            duration = max(1e-3, float(timing.duration))
            stride_s = duration / float(max(int(req.max_segments), 1))

        stride_s = float(stride_s if stride_s is not None else subt_cfg.get("stride_s", 2.0))
        summary_frames = int(req.summary_frames if req.summary_frames is not None else subt_cfg.get("summary_frames", 6))
        segment_frames = int(segment_frames if segment_frames is not None else subt_cfg.get("segment_frames", 8))
        max_steps = int(max_steps if max_steps is not None else subt_cfg.get("max_steps", 200))
        language = str(req.language if req.language is not None else subt_cfg.get("language", "auto"))

        start_time_s: Optional[float] = req.start_time_s
        if (start_time_s is None) and bool(req.resume_from_last):
            ann0 = self.manager.get_episode_annotations(req.episode_index)
            if ann0.subtasks:
                try:
                    start_time_s = float(ann0.subtasks[-1]["end"])
                except Exception:
                    start_time_s = None

        client = build_client_from_config(cfg)
        sampler = self._frame_sampler(cfg)

        gen = AutoSubtaskGenerator(
            client=client,
            frame_sampler=sampler,
            system_prompt=str(subt_cfg.get("system_prompt", "")),
            user_prompt_template=str(subt_cfg.get("user_prompt_template", "")),
            demo_text=get_subtask_demo_store().read_text(),
            temperature=float(subt_cfg.get("temperature", 0.2)),
            max_tokens=int(subt_cfg.get("max_tokens", 64)),
        )

        segments = gen.generate(
            manager=self.manager,
            episode_index=req.episode_index,
            stride_s=stride_s,
            summary_frames=summary_frames,
            segment_frames=segment_frames,
            max_steps=max_steps,
            start_time_s=start_time_s,
            language=language,
        )

        if bool(req.merge_adjacent):
            segments = _merge_adjacent_subtasks(segments)

        # Normalize schema for existing lerobot-annotate UI:
        # UI expects 'robot_utterance' (not 'robot_response').


        for s in segments:
            # If some generator uses robot_response, map it to robot_utterance.
            if ("robot_utterance" not in s) and ("robot_response" in s):
                s["robot_utterance"] = s.get("robot_response", "")
                s.pop("robot_response", None)

            # If both exist but robot_response is empty, drop it to avoid confusion.
            if "robot_response" in s and (s.get("robot_response") is None or str(s.get("robot_response")).strip() == ""):
                s.pop("robot_response", None)        
        
        
        # Persist into lerobot_annotations.json
        ann = self.manager.get_episode_annotations(req.episode_index)
        if req.mode == "replace":
            ann.subtasks = segments
        else:
            ann.subtasks = (ann.subtasks or []) + segments
        self.manager._save_annotations()
        return segments

    def generate_fake_vqa(self, req: AutoVQARequest) -> List[Dict[str, Any]]:
        cfg = self._load_cfg()
        vqa_cfg = dict(cfg.get("fake_vqa", {}) or {})

        # Backward compatibility: map older payload fields.
        window_frames = req.window_frames if req.window_frames is not None else req.max_frames

        stride_s = req.stride_s
        if stride_s is None and req.max_segments:
            timing = get_episode_timing(self.manager, req.episode_index)
            duration = max(1e-3, float(timing.duration))
            stride_s = duration / float(max(int(req.max_segments), 1))

        stride_s = float(stride_s if stride_s is not None else vqa_cfg.get("stride_s", 6.0))
        window_s = float(req.window_s if req.window_s is not None else vqa_cfg.get("window_s", 2.0))
        window_frames = int(window_frames if window_frames is not None else vqa_cfg.get("window_frames", 3))
        language = str(req.language if req.language is not None else vqa_cfg.get("language", "en"))
        scenario_type = str(req.scenario_type if req.scenario_type is not None else vqa_cfg.get("scenario_type", "vqa"))
        response_type = str(req.response_type if req.response_type is not None else vqa_cfg.get("response_type", "answer"))
        skill = str(req.skill if req.skill is not None else vqa_cfg.get("skill", "fake_vqa"))

        start_time_s: Optional[float] = req.start_time_s
        if (start_time_s is None) and bool(req.resume_from_last):
            ann0 = self.manager.get_episode_annotations(req.episode_index)
            if ann0.high_levels:
                try:
                    start_time_s = float(ann0.high_levels[-1]["end"])
                except Exception:
                    start_time_s = None

        if window_frames < 1:
            window_frames = 1

        client = build_client_from_config(cfg)
        sampler = self._frame_sampler(cfg)

        gen = AutoVQAGenerator(
            client=client,
            frame_sampler=sampler,
            system_prompt=str(vqa_cfg.get("system_prompt", "")),
            user_prompt_template=str(vqa_cfg.get("user_prompt_template", "")),
            demo_text=get_vqa_demo_store().read_text(),
            temperature=float(vqa_cfg.get("temperature", 0.2)),
            max_tokens=int(vqa_cfg.get("max_tokens", 128)),
            demo_pairs_max=int(vqa_cfg.get("demo_pairs_max", 20)),
        )

        # Densify: generate exactly one VQA pair per stride step by sampling a short clip
        # starting at cursor, and forcing generator to run only one iteration.
        segments: List[Dict[str, Any]] = []
        timing = get_episode_timing(self.manager, req.episode_index)
        duration_s = max(1e-3, float(timing.duration))
        cursor = float(start_time_s if start_time_s is not None else 0.0)
        # Safety: clamp
        if cursor < 0:
            cursor = 0.0
        if cursor > duration_s:
            cursor = duration_s
        steps = int(math.ceil(max(duration_s - cursor, 0.0) / max(stride_s, 1e-6))) if duration_s > cursor else 0
        # Allow user to cap steps (optional field)
        max_steps = getattr(req, "max_steps", None)
        if max_steps is not None:
            try:
                steps = min(steps, int(max_steps))
            except Exception:
                pass
        # Also respect max_segments if provided (legacy UI)
        if req.max_segments:
            try:
                steps = min(steps, int(req.max_segments))
            except Exception:
                pass
        
        for _ in range(max(steps, 0)):
            clip_end = min(cursor + window_s, duration_s)
            try:
                one = gen.generate(
                    manager=self.manager,
                    episode_index=req.episode_index,
                    # make generator run only once by using a huge stride
                    stride_s=1e9,
                    window_s=window_s,
                    window_frames=window_frames,
                    start_time_s=cursor,
                    language=language,
                    scenario_type=scenario_type,
                    response_type=response_type,
                    skill=skill,
                )
                seg = one[0] if one else {}
            except Exception:
                seg = {}
        
            # Ensure required keys and correct time span
            if not isinstance(seg, dict):
                seg = {}
            seg["start"] = float(cursor)
            seg["end"] = float(clip_end)
            seg.setdefault("scenario_type", scenario_type)
            seg.setdefault("response_type", response_type)
            seg.setdefault("skill", skill)
            seg.setdefault("user_prompt", "")
            seg.setdefault("robot_response", "")
            segments.append(seg)
        
            cursor += stride_s
            if cursor >= duration_s - 1e-6:
                break
        
        ann = self.manager.get_episode_annotations(req.episode_index)
        # IMPORTANT: if resuming from last segment, always append, otherwise previous segments get overwritten.
        effective_mode = "append" if bool(req.resume_from_last) else req.mode
        if effective_mode == "replace":
            ann.high_levels = segments
        else:
            ann.high_levels = (ann.high_levels or []) + segments
        self.manager._save_annotations()
        return segments