# -*- coding: utf-8 -*-
"""Adapter between LeRobot Annotate DataManager and AI plugin."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional


@dataclass
class EpisodeTiming:
    fps: float
    length: int
    duration: float
    video_start_time: float
    video_end_time: float


def get_episode_timing(manager: Any, episode_index: int, video_key: Optional[str] = None) -> EpisodeTiming:
    if manager.episodes_df is None or manager.info is None:
        raise ValueError("dataset not loaded")

    video_key = video_key or getattr(manager, "video_key", None)
    fps = float(manager.info.get("fps", 30))

    row = manager.episodes_df[manager.episodes_df["episode_index"] == episode_index]
    if row.empty:
        raise ValueError(f"Episode {episode_index} not found")
    row = row.iloc[0]

    length = int(row.get("length", row.get("dataset_to_index", 0) - row.get("dataset_from_index", 0)))
    duration = length / fps if fps else 0.0

    video_start_time = 0.0
    video_end_time = duration

    # Use manager's internal offset calculator if available.
    if video_key:
        try:
            offsets = manager._calculate_video_offsets(video_key, fps)  # type: ignore
            info = offsets.get(episode_index)
            if info:
                video_start_time = float(info.get("video_start_time", 0.0))
                video_end_time = float(info.get("video_end_time", duration))
        except Exception:
            pass

    return EpisodeTiming(
        fps=fps,
        length=length,
        duration=duration,
        video_start_time=video_start_time,
        video_end_time=video_end_time,
    )


def get_episode_video_path(manager: Any, episode_index: int, video_key: Optional[str] = None) -> Path:
    video_key = video_key or getattr(manager, "video_key", None)
    p = manager.get_episode_video_path(episode_index, video_key=video_key)  # type: ignore
    return Path(p)
