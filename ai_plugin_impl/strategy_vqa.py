# -*- coding: utf-8 -*-
"""Windowed Fake-VQA generation (Mode 2) with video clips.

Updated behavior:
- For each anchor time t (step = stride_s), we build a short MP4 clip covering
  [t, t + window_s] and send it as `video_url` for temporal context.
- We still require the produced VQA Q/A to be answerable from the FIRST frame
  alone and consistent throughout the window.
- We write the result as a high-level prompt segment using the schema expected
  by lerobot-annotate UI: {start, end, user_prompt, robot_utterance, ...}.

Tip: If Q/A repeats, we keep a small "recent questions" set and skip duplicates.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import re

from .adapter import get_episode_timing, get_episode_video_path
from .client_openai import OpenAIChatClient
from .json_parse import extract_json_object
from .sampler import FrameSampler
from .templating import safe_format


def _parse_vqa_demos(text: str) -> List[Tuple[str, str]]:
    """Parse vqa_prompt.txt into (question, answer) pairs.

    Format: two non-empty lines per pair, comments allowed with leading '#'.
    """
    lines: List[str] = []
    for raw in (text or "").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        lines.append(s)
    pairs: List[Tuple[str, str]] = []
    i = 0
    while i + 1 < len(lines):
        pairs.append((lines[i], lines[i + 1]))
        i += 2
    return pairs


def _norm_q(s: str) -> str:
    s = (s or "").lower()
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[^a-z0-9 ]+", "", s)
    return s


def _clip_fps(num_frames: int, duration_s: float, *, min_fps: float = 0.5, max_fps: float = 6.0) -> float:
    duration_s = max(float(duration_s), 1e-3)
    num_frames = max(int(num_frames), 1)
    fps = float(num_frames) / duration_s
    if fps < min_fps:
        fps = min_fps
    if fps > max_fps:
        fps = max_fps
    return fps


@dataclass
class AutoVQAGenerator:
    client: OpenAIChatClient
    frame_sampler: FrameSampler
    system_prompt: str
    user_prompt_template: str
    demo_text: str
    temperature: float = 0.2
    max_tokens: int = 256
    demo_pairs_max: int = 20

    def generate(
        self,
        *,
        manager: Any,
        episode_index: int,
        stride_s: float,
        window_s: float,
        window_frames: int,
        start_time_s: Optional[float] = None,
        language: str = "en",
        scenario_type: str = "vqa",
        response_type: str = "answer",
        skill: str = "fake_vqa",
    ) -> List[Dict[str, Any]]:
        timing = get_episode_timing(manager, episode_index)
        video_path = get_episode_video_path(manager, episode_index)

        stride_s = max(float(stride_s), 1e-3)
        window_s = max(float(window_s), 1e-3)
        if window_s > stride_s:
            window_s = stride_s
        window_frames = max(int(window_frames), 1)

        start = float(start_time_s) if start_time_s is not None else 0.0
        start = max(0.0, min(start, max(0.0, timing.duration - 1e-3)))

        demos = _parse_vqa_demos(self.demo_text)
        demo_block = "\n".join([f"Q: {q}\nA: {a}" for (q, a) in demos[: max(1, int(self.demo_pairs_max))]])

        template = (self.user_prompt_template or "").strip()
        sys_prompt = (self.system_prompt or "").strip()

        segments: List[Dict[str, Any]] = []
        used_q: set[str] = set()
        t = start

        while t < timing.duration - 1e-6:
            seg_start = t
            seg_end = min(timing.duration, t + stride_s)
            check_end = min(timing.duration, t + window_s)

            abs_start = min(max(timing.video_start_time + seg_start, timing.video_start_time), timing.video_end_time - 1e-3)
            abs_end = min(max(timing.video_start_time + check_end, timing.video_start_time + seg_start + 1e-3), timing.video_end_time)

            fps = _clip_fps(window_frames, max(1e-3, check_end - seg_start), min_fps=0.5, max_fps=6.0)
            clip_url = self.frame_sampler.sample_video(video_path, abs_start, abs_end, fps=fps)

            # Also attach the first frame for "answerable from first frame" constraint.
            first_frame_url = self.frame_sampler.sample_frames(video_path, [abs_start])[0]

            recent = "\n".join([q for q in list(used_q)[-8:]]) if used_q else ""

            user_text = safe_format(
                template,
                {
                    "qa_demos": demo_block,
                    "time_s": f"{seg_start:.3f}",
                    "window_s": f"{window_s:.3f}",
                    "stride_s": f"{stride_s:.3f}",
                    "language": language,
                    "recent_questions": recent,
                },
            )

            messages = [
                {"role": "system", "content": sys_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {"type": "image_url", "image_url": {"url": first_frame_url}},
                        {"type": "video_url", "video_url": {"url": clip_url}},
                    ],
                },
            ]

            raw = self.client.chat(
                messages,
                temperature=float(self.temperature),
                max_tokens=int(self.max_tokens),
                response_format={"type": "json_object"},
            )
            obj = extract_json_object(raw)

            if bool(obj.get("skip", False)):
                t += stride_s
                continue

            q = str(obj.get("question", "")).strip()
            a = str(obj.get("answer", "")).strip()
            if not q or not a:
                t += stride_s
                continue

            # Force English if desired.
            if language.lower().startswith("en") and re.search(r"[\u4e00-\u9fff]", q + a):
                t += stride_s
                continue

            nq = _norm_q(q)
            if nq in used_q:
                t += stride_s
                continue
            used_q.add(nq)

            segments.append(
                {
                    "start": round(seg_start, 3),
                    "end": round(seg_end, 3),
                    "user_prompt": q,
                    "robot_utterance": a,
                    "scenario_type": scenario_type,
                    "response_type": response_type,
                    "skill": skill,
                }
            )

            t += stride_s

        return segments
