#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-7860}"
STOP_GUARD="${STOP_GUARD:-1}"
GUARD_PID_FILE="/tmp/lerobot_annotate_ssh_fd_guard.pid"

find_uvicorn_pids() {
  for p in /proc/[0-9]*; do
    pid="${p#/proc/}"
    [[ -r "$p/cmdline" ]] || continue
    cmd="$(cat "$p/cmdline" 2>/dev/null | tr '\0' ' ' || true)"
    if [[ "$cmd" == *"uvicorn app_ai:app"* ]]; then
      echo "$pid"
    fi
  done
}

find_listen_pid_by_port() {
  ss -lntp 2>/dev/null | awk -v p=":${PORT}" '$4 ~ p {print}' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1
}

stop_pid() {
  local pid="$1"
  [[ -n "$pid" ]] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

echo "Stopping app_ai on port ${PORT} ..."

# 1) stop listeners on target port first
port_pid="$(find_listen_pid_by_port)"
if [[ -n "${port_pid:-}" ]]; then
  echo "- stop port owner pid=${port_pid}"
  stop_pid "$port_pid"
fi

# 2) stop any remaining app_ai uvicorn process
mapfile -t pids < <(find_uvicorn_pids || true)
for pid in "${pids[@]}"; do
  echo "- stop uvicorn pid=${pid}"
  stop_pid "$pid"
done

if [[ "$STOP_GUARD" == "1" ]]; then
  if [[ -f "$GUARD_PID_FILE" ]]; then
    gpid="$(cat "$GUARD_PID_FILE" 2>/dev/null || true)"
    if [[ -n "${gpid:-}" ]] && kill -0 "$gpid" 2>/dev/null; then
      echo "- stop guard pid=${gpid}"
      kill "$gpid" 2>/dev/null || true
      sleep 1
      if kill -0 "$gpid" 2>/dev/null; then
        kill -9 "$gpid" 2>/dev/null || true
      fi
    fi
    rm -f "$GUARD_PID_FILE"
  fi
fi

echo "Done."
