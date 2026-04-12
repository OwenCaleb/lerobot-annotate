#!/usr/bin/env bash
set -u

INTERVAL="${INTERVAL:-10}"
THRESHOLD="${THRESHOLD:-180}"
LOG_FILE="${LOG_FILE:-/tmp/lerobot_annotate_ssh_fd_guard.log}"
ONCE="${1:-}"

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"
}

fd_count() {
  local pid="$1"
  ls "/proc/$pid/fd" 2>/dev/null | wc -l
}

scan_and_heal() {
  local cleaned=0
  for p in /proc/[0-9]*; do
    local pid="${p#/proc/}"
    local comm cmdline fds

    [[ -r "$p/comm" ]] || continue
    [[ -r "$p/cmdline" ]] || continue

    comm="$(cat "$p/comm" 2>/dev/null || true)"
    [[ "$comm" == "sshd-session" ]] || continue

    cmdline="$(cat "$p/cmdline" 2>/dev/null | tr '\0' ' ' || true)"
    [[ "$cmdline" == *"@notty"* ]] || continue

    fds="$(fd_count "$pid")"
    [[ "$fds" =~ ^[0-9]+$ ]] || continue

    if (( fds > THRESHOLD )); then
      log "kill pid=$pid fds=$fds cmd='$cmdline'"
      kill "$pid" 2>/dev/null || true
      cleaned=$((cleaned + 1))
    fi
  done

  if (( cleaned > 0 )); then
    log "cleaned=$cleaned threshold=$THRESHOLD"
  fi
}

log "guard start interval=${INTERVAL}s threshold=${THRESHOLD}"

if [[ "$ONCE" == "--once" ]]; then
  scan_and_heal
  log "guard once done"
  exit 0
fi

while true; do
  scan_and_heal
  sleep "$INTERVAL"
done
