#!/bin/sh
set -eu

cd "$(dirname "$0")"

# Flip this to 1 to enable request/response logs by default.
DEFAULT_VERBOSE=0
E2E_VERBOSE="${E2E_VERBOSE:-$DEFAULT_VERBOSE}"
TTY_STATE=""

usage() {
  cat <<'EOF'
Usage: sh e2e/run.sh [--verbose|-v] [--quiet|--no-verbose]

Options:
  --verbose, -v       Print e2e request/response details even when tests pass.
  --quiet, --no-verbose
                      Disable verbose e2e request/response logs.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --verbose|-v)
      E2E_VERBOSE=1
      ;;
    --quiet|--no-verbose)
      E2E_VERBOSE=0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

export E2E_VERBOSE
export COMPOSE_MENU=false

if [ -t 0 ]; then
  TTY_STATE="$(stty -g 2>/dev/null || true)"
fi

restore_tty() {
  if [ -n "$TTY_STATE" ]; then
    stty "$TTY_STATE" 2>/dev/null || stty sane 2>/dev/null || true
  fi
}

cleanup() {
  status=$?
  trap - EXIT INT TERM
  restore_tty
  docker compose down -v --remove-orphans || true
  restore_tty
  exit "$status"
}

trap cleanup EXIT INT TERM

docker compose down -v --remove-orphans
docker compose up --build --abort-on-container-exit --exit-code-from e2e-tests e2e-tests
