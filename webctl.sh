#!/usr/bin/env bash
#
# webctl.sh — cecelearn web runtime controller (localhost direct)
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FRONTEND_DIR="$SCRIPT_DIR/webapp/frontend"
BACKEND_DIR="$SCRIPT_DIR/webapp/backend"
STATE_DIR="$HOME/.local/state/cecelearn"
LOG_DIR="$STATE_DIR/logs"
PID_DIR="$STATE_DIR"
mkdir -p "$LOG_DIR" "$PID_DIR"
FRONTEND_LOG="$LOG_DIR/frontend.log"
BACKEND_LOG="$LOG_DIR/backend.log"
ACCESS_LOG="$LOG_DIR/access.log"
FRONTEND_PID_FILE="$PID_DIR/frontend.pid"
BACKEND_PID_FILE="$PID_DIR/backend.pid"

# Load env from BUILD/env if present
load_env() {
  local envfile="$SCRIPT_DIR/BUILD/env/$1.env"
  if [[ -f "$envfile" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$envfile"
    set +a
  fi
}

# --- helpers ---

pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

read_pid() {
  local pidfile="$1"
  [[ -f "$pidfile" ]] && cat "$pidfile" || echo ""
}

find_port_pid() {
  lsof -i :"$1" -t 2>/dev/null | head -1 || true
}

# --- commands ---

do_start() {
  local component="${1:-all}"

  if [[ "$component" == "all" || "$component" == "backend" ]]; then
    local existing
    existing=$(read_pid "$BACKEND_PID_FILE")
    if pid_alive "$existing"; then
      echo "[backend] already running (PID $existing)"
    else
      load_env backend
      cd "$BACKEND_DIR"
      nohup bun run src/server.ts > "$BACKEND_LOG" 2>&1 &
      local pid=$!
      echo "$pid" > "$BACKEND_PID_FILE"
      echo "[backend] started (PID $pid) on port ${PORT:-3014}"
    fi
  fi

  if [[ "$component" == "all" || "$component" == "frontend" ]]; then
    local existing
    existing=$(read_pid "$FRONTEND_PID_FILE")
    if pid_alive "$existing"; then
      echo "[frontend] already running (PID $existing)"
    else
      load_env frontend
      export PUBLIC_BASE_PATH="${PUBLIC_BASE_PATH:-/}"
      cd "$FRONTEND_DIR"
      nohup bun run dev > "$FRONTEND_LOG" 2>&1 &
      local pid=$!
      echo "$pid" > "$FRONTEND_PID_FILE"
      echo "[frontend] started (PID $pid) — base: ${PUBLIC_BASE_PATH}"
    fi
  fi
}

do_stop() {
  local component="${1:-all}"

  if [[ "$component" == "all" || "$component" == "backend" ]]; then
    local pid
    pid=$(read_pid "$BACKEND_PID_FILE")
    if pid_alive "$pid"; then
      kill "$pid" 2>/dev/null
      echo "[backend] stopped (PID $pid)"
    else
      # fallback: find by port
      pid=$(find_port_pid 3014)
      if [[ -n "$pid" ]]; then
        kill "$pid" 2>/dev/null
        echo "[backend] stopped (PID $pid, found by port)"
      else
        echo "[backend] not running"
      fi
    fi
    rm -f "$BACKEND_PID_FILE"
  fi

  if [[ "$component" == "all" || "$component" == "frontend" ]]; then
    local pid
    pid=$(read_pid "$FRONTEND_PID_FILE")
    if pid_alive "$pid"; then
      # kill process tree (vite spawns child processes)
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null
      echo "[frontend] stopped (PID $pid)"
    else
      pid=$(find_port_pid 5173)
      if [[ -n "$pid" ]]; then
        kill "$pid" 2>/dev/null
        echo "[frontend] stopped (PID $pid, found by port)"
      else
        echo "[frontend] not running"
      fi
    fi
    rm -f "$FRONTEND_PID_FILE"
  fi
}

do_restart() {
  do_stop "${1:-all}"
  sleep 1
  do_start "${1:-all}"
}

do_status() {
  echo "=== cecelearn web status ==="

  local bpid
  bpid=$(read_pid "$BACKEND_PID_FILE")
  if pid_alive "$bpid"; then
    echo "[backend]  RUNNING  PID=$bpid  port=3014"
  else
    local fallback
    fallback=$(find_port_pid 3014)
    if [[ -n "$fallback" ]]; then
      echo "[backend]  RUNNING  PID=$fallback  port=3014 (no pidfile)"
    else
      echo "[backend]  STOPPED"
    fi
  fi

  local fpid
  fpid=$(read_pid "$FRONTEND_PID_FILE")
  if pid_alive "$fpid"; then
    echo "[frontend] RUNNING  PID=$fpid  port=5173"
  else
    local fallback
    fallback=$(find_port_pid 5173)
    if [[ -n "$fallback" ]]; then
      echo "[frontend] RUNNING  PID=$fallback  port=5173 (no pidfile)"
    else
      echo "[frontend] STOPPED"
    fi
  fi

  local acount
  acount=$(wc -l < "$ACCESS_LOG" 2>/dev/null || echo "0")
  echo "[access]   $acount lines  → $ACCESS_LOG"
}

do_logs() {
  local component="${1:-all}"
  case "$component" in
    all)
      echo "=== backend log ==="
      tail -20 "$BACKEND_LOG" 2>/dev/null || echo "(no log)"
      echo ""
      echo "=== frontend log ==="
      tail -20 "$FRONTEND_LOG" 2>/dev/null || echo "(no log)"
      echo ""
      echo "=== access log (last 10) ==="
      tail -10 "$ACCESS_LOG" 2>/dev/null || echo "(no log)"
      ;;
    backend)  tail -50 "$BACKEND_LOG" 2>/dev/null || echo "(no log)" ;;
    frontend) tail -50 "$FRONTEND_LOG" 2>/dev/null || echo "(no log)" ;;
    access)   tail -f "$ACCESS_LOG" 2>/dev/null || echo "(no log)" ;;
    *)        echo "Usage: webctl.sh logs [all|backend|frontend|access]"; exit 1 ;;
  esac
}

# --- main ---

usage() {
  cat <<EOF
Usage: webctl.sh <command> [component]

Commands:
  start   [all|frontend|backend]   Start services (default: all)
  stop    [all|frontend|backend]   Stop services (default: all)
  restart [all|frontend|backend]   Restart services (default: all)
  status                           Show running status
  logs    [all|frontend|backend|access]  Show logs (access = tail -f)

Environment:
  PUBLIC_BASE_PATH   Base path prefix (default from BUILD/env/*.env)
  PORT               Backend port (default: 3014)
EOF
}

case "${1:-}" in
  start)   do_start "${2:-all}" ;;
  stop)    do_stop "${2:-all}" ;;
  restart) do_restart "${2:-all}" ;;
  status)  do_status ;;
  logs)    do_logs "${2:-all}" ;;
  *)       usage; exit 1 ;;
esac
