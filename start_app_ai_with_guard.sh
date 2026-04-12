#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")" && pwd)"
GUARD_SCRIPT="$APP_DIR/auto_heal_ssh_tunnel.sh"
PID_FILE="/tmp/lerobot_annotate_ssh_fd_guard.pid"
OUT_FILE="/tmp/lerobot_annotate_ssh_fd_guard.out"

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-7860}"
INTERVAL="${INTERVAL:-10}"
THRESHOLD="${THRESHOLD:-180}"
PYTHON_BIN="${PYTHON_BIN:-python}"

find_listen_pid_by_port() {
  local port="$1"
  ss -lntp 2>/dev/null | awk -v p=":${port}" '$4 ~ p {print}' | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p' | head -n1
}

ensure_port_available() {
  local owner_pid
  owner_pid="$(find_listen_pid_by_port "$PORT")"
  [[ -n "${owner_pid:-}" ]] || return 0

  local owner_cmd
  owner_cmd="$(tr '\0' ' ' < "/proc/$owner_pid/cmdline" 2>/dev/null || true)"

  if [[ "$owner_cmd" == *"uvicorn app_ai:app"* ]]; then
    echo "Port ${PORT} is occupied by old app_ai process pid=${owner_pid}, restarting it..."
    kill "$owner_pid" 2>/dev/null || true
    sleep 1

    if kill -0 "$owner_pid" 2>/dev/null; then
      kill -9 "$owner_pid" 2>/dev/null || true
      sleep 1
    fi

    owner_pid="$(find_listen_pid_by_port "$PORT")"
    if [[ -n "${owner_pid:-}" ]]; then
      echo "Failed to free port ${PORT}. Current owner pid=${owner_pid}."
      exit 1
    fi
    return 0
  fi

  echo "Port ${PORT} is already in use by another process (pid=${owner_pid})."
  echo "Please change port: PORT=7890 ./start_app_ai_with_guard.sh"
  exit 1
}

ensure_python_env() {
  if "$PYTHON_BIN" -c "import pandas" >/dev/null 2>&1; then
    return 0
  fi

  if [[ -x "/opt/conda/envs/wallx/bin/python" ]]; then
    PYTHON_BIN="/opt/conda/envs/wallx/bin/python"
  fi

  if ! "$PYTHON_BIN" -c "import pandas" >/dev/null 2>&1; then
    echo "Cannot find a Python environment with pandas."
    echo "Use: PYTHON_BIN=/opt/conda/envs/wallx/bin/python ./start_app_ai_with_guard.sh"
    exit 1
  fi
}

start_guard() {
  if [[ -f "$PID_FILE" ]]; then
    old_pid="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "${old_pid:-}" ]] && kill -0 "$old_pid" 2>/dev/null; then
      echo "Guard already running: pid=$old_pid"
      return
    fi
  fi

  echo "Starting guard (interval=${INTERVAL}s, threshold=${THRESHOLD})..."
  nohup env INTERVAL="$INTERVAL" THRESHOLD="$THRESHOLD" "$GUARD_SCRIPT" >"$OUT_FILE" 2>&1 &
  echo $! >"$PID_FILE"
  echo "Guard started: pid=$(cat "$PID_FILE")"
}

cd "$APP_DIR"
chmod +x "$GUARD_SCRIPT"
start_guard
ensure_port_available
ensure_python_env

echo "Starting uvicorn on ${HOST}:${PORT} with ${PYTHON_BIN} ..."
exec "$PYTHON_BIN" -m uvicorn app_ai:app --host "$HOST" --port "$PORT"
