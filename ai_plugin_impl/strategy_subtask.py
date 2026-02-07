# -*- coding: utf-8 -*-
"""Subtask auto-labeling strategy (video-segment based).

Updated behavior (your latest requirement):
- Episode summary:
  - If summary_frames > 16, build a low-fps MP4 clip spanning the whole episode
    and send it as `video_url` so the model gets global context.
  - Otherwise, fall back to a few sparse frames across the episode.
- Main labeling loop:
  - Stride (s)=t means: for each segment [a, a+t], we build an MP4 clip of that
    time range and ask the model to label the *active subtask for this segment*.
  - The label applies to the whole segment. Repeat until the end.

The label style is controlled by one-per-line examples in subtask_prompt.txt.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .adapter import get_episode_timing, get_episode_video_path
from .client_openai import OpenAIChatClient
from .json_parse import extract_json_object
from .sampler import FrameSampler
from .templating import safe_format


def _parse_label_examples(text: str, max_lines: int = 60) -> str:
    lines: List[str] = []
    for raw in (text or "").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        lines.append(s)
        if len(lines) >= max_lines:
            break
    return "\n".join(lines)


def _linspace_times(start: float, end: float, n: int) -> List[float]:
    if n <= 1:
        return [start]
    if end <= start:
        return [start]
    step = (end - start) / (n - 1)
    return [start + i * step for i in range(n)]


def _clip_fps(num_frames: int, duration_s: float, *, min_fps: float = 0.2, max_fps: float = 6.0) -> float:
    duration_s = max(float(duration_s), 1e-3)
    num_frames = max(int(num_frames), 1)
    fps = float(num_frames) / duration_s
    if fps < min_fps:
        fps = min_fps
    if fps > max_fps:
        fps = max_fps
    return fps


@dataclass
class AutoSubtaskGenerator:
    client: OpenAIChatClient
    frame_sampler: FrameSampler
    system_prompt: str
    user_prompt_template: str
    demo_text: str
    temperature: float = 0.2
    max_tokens: int = 64

    def _make_episode_summary(self, *, manager: Any, episode_index: int, summary_frames: int) -> str:
        if summary_frames <= 0:
            return ""
        timing = get_episode_timing(manager, episode_index)
        video_path = get_episode_video_path(manager, episode_index)

        duration = max(1e-3, float(timing.duration))
        abs_start = float(timing.video_start_time)
        abs_end = float(timing.video_end_time)

        # If enough frames requested, send a low-fps video clip for global context.
        if int(summary_frames) > 16:
            fps = _clip_fps(int(summary_frames), duration, min_fps=0.05, max_fps=2.0)
            video_url = self.frame_sampler.sample_video(video_path, abs_start, abs_end, fps=fps)
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You summarize a robotic manipulation episode. "
                        "Given a short video clip sampled at low FPS, describe the overall goal and "
                        "the rough phases in 2-4 sentences. Output ONLY JSON: {\"summary\": \"...\"}."
                    ),
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "Summarize this episode."},
                        {"type": "video_url", "video_url": {"url": video_url}},
                    ],
                },
            ]
            text = self.client.chat(messages, temperature=0.0, max_tokens=256, response_format={"type": "json_object"})
            obj = extract_json_object(text)
            return str(obj.get("summary", "")).strip()

        # Fallback: sparse frames.
        n = max(1, int(summary_frames))
        local_ts = _linspace_times(0.0, max(0.0, duration - 1e-3), n)
        abs_ts = [min(max(timing.video_start_time + t, timing.video_start_time), timing.video_end_time - 1e-3) for t in local_ts]
        data_urls = self.frame_sampler.sample_frames(video_path, abs_ts)

        messages = [
            {
                "role": "system",
                "content": (
                    "You summarize a robotic manipulation episode. "
                    "Given a few frames sampled across the episode, describe the overall task goal and "
                    "the rough phases in 2-4 sentences. Output ONLY JSON: {\"summary\": \"...\"}."
                ),
            },
            {
                "role": "user",
                "content": [{"type": "text", "text": "Summarize this episode."}]
                + [{"type": "image_url", "image_url": {"url": u}} for u in data_urls],
            },
        ]
        text = self.client.chat(messages, temperature=0.0, max_tokens=256, response_format={"type": "json_object"})
        obj = extract_json_object(text)
        return str(obj.get("summary", "")).strip()

    def _predict_label_over_segment(
        self,
        *,
        episode_summary: str,
        examples: str,
        seg_start_s: float,
        seg_end_s: float,
        video_url: str,
        language: str,
    ) -> str:
        sys_prompt = (self.system_prompt or "").strip()
        user_tmpl = (self.user_prompt_template or "").strip()

        user_text = safe_format(
            user_tmpl,
            {
                "episode_summary": episode_summary or "",
                "examples": examples or "",
                "time_s": f"{seg_start_s:.3f}",
                "seg_start_s": f"{seg_start_s:.3f}",
                "seg_end_s": f"{seg_end_s:.3f}",
                "duration_s": f"{max(0.0, seg_end_s - seg_start_s):.3f}",
                "language": language,
            },
        )

        # Always attach as video_url (segment clip).
        messages = [
            {"role": "system", "content": sys_prompt},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    {"type": "video_url", "video_url": {"url": video_url}},
                ],
            },
        ]

        text = self.client.chat(
            messages,
            temperature=float(self.temperature),
            max_tokens=int(self.max_tokens),
            response_format={"type": "json_object"},
        )
        obj = extract_json_object(text)
        label = str(obj.get("label", "")).strip()
        if not label:
            raise ValueError("model returned empty label")
        return label

    def generate(
        self,
        *,
        manager: Any,
        episode_index: int,
        stride_s: float,
        summary_frames: int,
        segment_frames: int,
        max_steps: int,
        start_time_s: Optional[float] = None,
        language: str = "auto",
    ) -> List[Dict[str, Any]]:
        timing = get_episode_timing(manager, episode_index)
        duration = float(timing.duration)
        if duration <= 0:
            return []

        stride_s = max(1e-6, float(stride_s))
        max_steps = max(1, int(max_steps))
        segment_frames = max(1, int(segment_frames))

        examples = _parse_label_examples(self.demo_text)
        episode_summary = self._make_episode_summary(manager=manager, episode_index=episode_index, summary_frames=int(summary_frames))
        video_path = get_episode_video_path(manager, episode_index)

        t0 = float(start_time_s) if start_time_s is not None else 0.0
        t0 = max(0.0, min(t0, max(0.0, duration - 1e-3)))

        segments: List[Dict[str, Any]] = []
        t = t0
        steps = 0

        while t < duration and steps < max_steps:
            seg_start = float(t)
            seg_end = min(duration, seg_start + stride_s)

            abs_start = min(max(timing.video_start_time + seg_start, timing.video_start_time), timing.video_end_time - 1e-3)
            abs_end = min(max(timing.video_start_time + seg_end, timing.video_start_time + seg_start + 1e-3), timing.video_end_time)

            fps = _clip_fps(segment_frames, max(1e-3, seg_end - seg_start), min_fps=0.5, max_fps=6.0)
            video_url = self.frame_sampler.sample_video(video_path, abs_start, abs_end, fps=fps)

            label = self._predict_label_over_segment(
                episode_summary=episode_summary,
                examples=examples,
                seg_start_s=seg_start,
                seg_end_s=seg_end,
                video_url=video_url,
                language=language,
            )

            segments.append({"start": round(seg_start, 3), "end": round(seg_end, 3), "label": label})

            t += stride_s
            steps += 1

        return segments
