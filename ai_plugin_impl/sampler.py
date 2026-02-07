# -*- coding: utf-8 -*-
"""Media sampling utilities.

We use ffmpeg to extract frames and short mp4 clips for portability.
- Frames are cached as JPEGs.
- Clips are cached as MP4 and sent to multimodal models via OpenAI-compatible
  `video_url` with a data:video/mp4;base64,... URL.

Note: Many multimodal servers (e.g., vLLM OpenAI server) accept `video_url`.
"""

from __future__ import annotations

import base64
import hashlib
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List


def _sha1(s: str) -> str:
    return hashlib.sha1(s.encode("utf-8")).hexdigest()


@dataclass
class FrameSampler:
    cache_dir: Path
    image_max_side: int = 768

    def __post_init__(self) -> None:
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    # -------------------------
    # Image frames
    # -------------------------
    def _frame_path(self, video_path: Path, ts_sec: float) -> Path:
        key = _sha1(f"{video_path}|{ts_sec:.6f}|{self.image_max_side}")
        return self.cache_dir / f"frame_{key}.jpg"

    def extract_frame(self, video_path: Path, ts_sec: float) -> Path:
        out_path = self._frame_path(video_path, ts_sec)
        if out_path.exists() and out_path.stat().st_size > 0:
            return out_path

        # scale so that max(w,h) == image_max_side (or keep if smaller)
        s = self.image_max_side
        vf = f"scale=if(gt(iw\\,ih)\\,{s}\\,-2):if(gt(iw\\,ih)\\,-2\\,{s}):flags=bicubic"
        
        
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{ts_sec}",
            "-i",
            str(video_path),
            "-frames:v",
            "1",
            "-q:v",
            "2",
            "-vf",
            vf,
            "-y",
            str(out_path),
        ]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"ffmpeg failed: {e.stderr.decode('utf-8', errors='ignore')}")

        if not out_path.exists() or out_path.stat().st_size == 0:
            raise RuntimeError("ffmpeg produced empty frame")
        return out_path

    def frame_to_data_url(self, frame_path: Path) -> str:
        data = frame_path.read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:image/jpeg;base64,{b64}"

    def sample_frames(self, video_path: Path, ts_list: List[float]) -> List[str]:
        """Return list of data URLs for requested timestamps."""
        urls: List[str] = []
        for ts in ts_list:
            p = self.extract_frame(video_path, ts)
            urls.append(self.frame_to_data_url(p))
        return urls

    # -------------------------
    # Video clips
    # -------------------------
    def _clip_path(self, video_path: Path, start_sec: float, end_sec: float, fps: float) -> Path:
        key = _sha1(f"{video_path}|{start_sec:.3f}|{end_sec:.3f}|{fps:.3f}|{self.image_max_side}")
        return self.cache_dir / f"clip_{key}.mp4"

    def extract_clip(self, video_path: Path, start_sec: float, end_sec: float, fps: float) -> Path:
        """Extract a short mp4 clip [start_sec, end_sec] with fps sampling."""
        start_sec = float(start_sec)
        end_sec = float(end_sec)
        if end_sec <= start_sec:
            end_sec = start_sec + 0.05
        fps = float(fps)
        if fps <= 1e-6:
            fps = 1.0

        out_path = self._clip_path(video_path, start_sec, end_sec, fps)
        if out_path.exists() and out_path.stat().st_size > 0:
            return out_path

        # scale so that max(w,h) == image_max_side
        s = self.image_max_side
        scale = f"scale={s}:{s}:force_original_aspect_ratio=decrease:flags=bicubic"
        make_even = "pad=ceil(iw/2)*2:ceil(ih/2)*2"
        vf = f"fps={fps},{scale},{make_even}"

        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-ss",
            f"{start_sec}",
            "-to",
            f"{end_sec}",
            "-i",
            str(video_path),
            "-an",
            "-vf",
            vf,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-y",
            str(out_path),
        ]
        out_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"ffmpeg clip failed: {e.stderr.decode('utf-8', errors='ignore')}")

        if not out_path.exists() or out_path.stat().st_size == 0:
            raise RuntimeError("ffmpeg produced empty clip")
        return out_path

    def clip_to_data_url(self, clip_path: Path) -> str:
        data = clip_path.read_bytes()
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:video/mp4;base64,{b64}"

    def sample_video(self, video_path: Path, start_sec: float, end_sec: float, *, fps: float) -> str:
        """Return data URL for a short mp4 clip."""
        p = self.extract_clip(video_path, start_sec, end_sec, fps=float(fps))
        return self.clip_to_data_url(p)
