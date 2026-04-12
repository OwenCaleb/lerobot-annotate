#!/usr/bin/env bash
set -euo pipefail

WORKSPACE_ROOT="/mnt/nas_ssd/workspace/wenboli"
VSCODE_DIR="$WORKSPACE_ROOT/.vscode-server"
THRESHOLD="${THRESHOLD:-180}"

echo "[recover] step1: clean high-fd sshd-session(notty), threshold=$THRESHOLD"
for p in /proc/[0-9]*; do
  pid="${p#/proc/}"
  [[ -r "$p/comm" ]] || continue
  [[ -r "$p/cmdline" ]] || continue
  comm="$(cat "$p/comm" 2>/dev/null || true)"
  [[ "$comm" == "sshd-session" ]] || continue

  cmdline="$(cat "$p/cmdline" 2>/dev/null | tr '\0' ' ' || true)"
  [[ "$cmdline" == *"@notty"* ]] || continue

  fds=$(ls "$p/fd" 2>/dev/null | wc -l)
  [[ "$fds" =~ ^[0-9]+$ ]] || continue

  if (( fds > THRESHOLD )); then
    echo "[recover] kill sshd-session pid=$pid fds=$fds"
    kill "$pid" 2>/dev/null || true
  fi
done

echo "[recover] step2: restart vscode server process (remote side)"
if [[ -d "$VSCODE_DIR" ]]; then
  mapfile -t pid_files < <(find "$VSCODE_DIR" -maxdepth 1 -type f -name ".*.pid" 2>/dev/null)
  for pf in "${pid_files[@]}"; do
    spid="$(cat "$pf" 2>/dev/null || true)"
    if [[ -n "${spid:-}" ]] && kill -0 "$spid" 2>/dev/null; then
      cmd="$(tr '\0' ' ' < "/proc/$spid/cmdline" 2>/dev/null || true)"
      if [[ "$cmd" == *"server-main.js"* || "$cmd" == *"code-server"* ]]; then
        echo "[recover] kill vscode server pid=$spid from $(basename "$pf")"
        kill "$spid" 2>/dev/null || true
      fi
    fi
  done
fi

sleep 1

echo "[recover] step3: current listener check"
ss -lntp | grep -E '127.0.0.1:34791|34791' || true

echo "[recover] done. Please reconnect VS Code Remote-SSH."
