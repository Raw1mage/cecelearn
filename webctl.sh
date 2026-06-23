#!/usr/bin/env bash
#
# webctl.sh — cecelearn web runtime controller
#
# 單一管理來源：委派 systemd user services（cecelearn-backend / cecelearn-frontend）。
# 不再用 nohup 自起子進程——nohup 進程會隨終端 / WSL session 收掉，且與 systemd unit
# 搶同一個 port，造成「服務死了不復活 / 雙重管理打架」。改由 systemd 托管（Restart=always
# + loginctl linger）後，服務跨 session 常駐、被 kill 自動復活。
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="$HOME/.local/state/cecelearn"
LOG_DIR="$STATE_DIR/logs"
BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
ACCESS_LOG="$LOG_DIR/access.log"
mkdir -p "$LOG_DIR"

BACKEND_UNIT="cecelearn-backend.service"
FRONTEND_UNIT="cecelearn-frontend.service"

# --- helpers ---

# 把 component（all|backend|frontend）映射成要操作的 unit 清單。
units_for() {
  case "${1:-all}" in
    all)      echo "$BACKEND_UNIT $FRONTEND_UNIT" ;;
    backend)  echo "$BACKEND_UNIT" ;;
    frontend) echo "$FRONTEND_UNIT" ;;
    *)        echo "" ;;
  esac
}

uc() { systemctl --user "$@"; }

# --- commands ---

do_start() {
  local units; units=$(units_for "${1:-all}")
  [[ -z "$units" ]] && { echo "unknown component: $1"; exit 1; }
  # shellcheck disable=SC2086
  uc start $units
  echo "[start] $units"
  do_status
}

do_stop() {
  local units; units=$(units_for "${1:-all}")
  [[ -z "$units" ]] && { echo "unknown component: $1"; exit 1; }
  # shellcheck disable=SC2086
  uc stop $units
  echo "[stop] $units"
}

do_restart() {
  local units; units=$(units_for "${1:-all}")
  [[ -z "$units" ]] && { echo "unknown component: $1"; exit 1; }
  # shellcheck disable=SC2086
  uc restart $units
  echo "[restart] $units"
  do_status
}

# 改動 code 後讓 systemd 服務重讀（前端 Vite 有 HMR 通常不需；後端 bun 需 restart）。
do_reload() {
  uc daemon-reload
  echo "[daemon-reload] unit definitions reloaded"
}

# 開機自起（已 enable 則 idempotent）。linger 確保沒登入也常駐。
do_enable() {
  uc enable "$BACKEND_UNIT" "$FRONTEND_UNIT"
  loginctl enable-linger "$USER" 2>/dev/null || true
  echo "[enable] services enabled + linger on (跨 session 常駐)"
}

do_disable() {
  uc disable "$BACKEND_UNIT" "$FRONTEND_UNIT"
  echo "[disable] services disabled (不再開機自起)"
}

status_line() {
  local label="$1" unit="$2" port="$3"
  local active main
  active=$(uc is-active "$unit" 2>/dev/null || true)
  main=$(uc show "$unit" -p MainPID --value 2>/dev/null || echo "")
  if [[ "$active" == "active" ]]; then
    printf '[%-8s] RUNNING  PID=%-7s port=%s\n' "$label" "$main" "$port"
  else
    printf '[%-8s] %s\n' "$label" "${active:-unknown}"
  fi
}

do_status() {
  echo "=== cecelearn web status (systemd user) ==="
  status_line backend  "$BACKEND_UNIT"  3014
  status_line frontend "$FRONTEND_UNIT" 5173
  local acount
  acount=$(wc -l < "$ACCESS_LOG" 2>/dev/null || echo "0")
  echo "[access]   $acount lines  → $ACCESS_LOG"
}

# logs：優先看 journald（systemd 收的 stdout/stderr），access 仍是 app 自寫的檔。
do_logs() {
  local component="${1:-all}"
  case "$component" in
    all)
      echo "=== backend log (journal, last 20) ==="
      uc -n 20 --no-pager status "$BACKEND_UNIT" 2>/dev/null | tail -20 || true
      tail -20 "$BACKEND_LOG" 2>/dev/null || true
      echo ""
      echo "=== frontend log (last 20) ==="
      tail -20 "$FRONTEND_LOG" 2>/dev/null || echo "(no log)"
      echo ""
      echo "=== access log (last 10) ==="
      tail -10 "$ACCESS_LOG" 2>/dev/null || echo "(no log)"
      ;;
    backend)  journalctl --user -u "$BACKEND_UNIT" -n 50 --no-pager 2>/dev/null || tail -50 "$BACKEND_LOG" 2>/dev/null || echo "(no log)" ;;
    frontend) journalctl --user -u "$FRONTEND_UNIT" -n 50 --no-pager 2>/dev/null || tail -50 "$FRONTEND_LOG" 2>/dev/null || echo "(no log)" ;;
    access)   tail -f "$ACCESS_LOG" 2>/dev/null || echo "(no log)" ;;
    *)        echo "Usage: webctl.sh logs [all|backend|frontend|access]"; exit 1 ;;
  esac
}

# --- main ---

usage() {
  cat <<EOF
Usage: webctl.sh <command> [component]

委派 systemd user services（單一管理來源；不再用 nohup）。

Commands:
  start   [all|frontend|backend]   Start services (default: all)
  stop    [all|frontend|backend]   Stop services (default: all)
  restart [all|frontend|backend]   Restart services (default: all)
  status                           Show running status
  logs    [all|frontend|backend|access]  Show logs (access = tail -f)
  reload                           systemctl daemon-reload (改 unit 後用)
  enable                           開機自起 + linger（跨 session 常駐）
  disable                          取消開機自起

Notes:
  改後端 code → webctl.sh restart backend
  改前端 code → Vite HMR 自動套用（必要時 restart frontend）
  改 *.service unit → webctl.sh reload && webctl.sh restart
EOF
}

case "${1:-}" in
  start)   do_start "${2:-all}" ;;
  stop)    do_stop "${2:-all}" ;;
  restart) do_restart "${2:-all}" ;;
  status)  do_status ;;
  logs)    do_logs "${2:-all}" ;;
  reload)  do_reload ;;
  enable)  do_enable ;;
  disable) do_disable ;;
  *)       usage; exit 1 ;;
esac
