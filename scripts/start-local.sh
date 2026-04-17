#!/usr/bin/env bash
set -euo pipefail

# Start backend and frontend for local development on Linux.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_PORT="${BACKEND_PORT:-9000}"
VENV_DIR="$BACKEND_DIR/.venv"

info() {
  printf '[INFO] %s\n' "$1"
}

error() {
  printf '[ERROR] %s\n' "$1" >&2
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    error "Required command not found: $1"
    exit 1
  fi
}

is_port_listening() {
  local port="$1"
  ss -ltn "sport = :$port" 2>/dev/null | grep -q LISTEN
}

pick_frontend_port() {
  local p
  for p in 3000 3001 3002 3003 3004; do
    if ! is_port_listening "$p"; then
      echo "$p"
      return 0
    fi
  done
  return 1
}

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" >/dev/null 2>&1; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

info "Root: $ROOT_DIR"

require_cmd node
require_cmd npm
require_cmd python3
require_cmd ss

if [[ ! -f "$BACKEND_DIR/package.json" ]]; then
  error "Backend package.json not found: $BACKEND_DIR"
  exit 1
fi

if [[ ! -f "$FRONTEND_DIR/package.json" ]]; then
  error "Frontend package.json not found: $FRONTEND_DIR"
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/requirements.txt" ]]; then
  error "Python requirements not found: $BACKEND_DIR/requirements.txt"
  exit 1
fi

if [[ ! -d "$VENV_DIR" ]]; then
  info "Creating Python virtual environment at $VENV_DIR..."
  python3 -m venv "$VENV_DIR"
fi

PIP_BIN="$VENV_DIR/bin/pip"
if [[ ! -x "$PIP_BIN" ]]; then
  error "pip not found in virtual environment: $PIP_BIN"
  exit 1
fi

if [[ ! -d "$BACKEND_DIR/node_modules" ]]; then
  info "Installing backend dependencies..."
  (cd "$BACKEND_DIR" && npm install)
fi

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  info "Installing frontend dependencies..."
  (cd "$FRONTEND_DIR" && npm install)
fi

info "Installing backend Python dependencies from requirements.txt..."
"$PIP_BIN" install -r "$BACKEND_DIR/requirements.txt"

FRONTEND_PORT="$(pick_frontend_port || true)"
if [[ -z "$FRONTEND_PORT" ]]; then
  error "Could not find an available frontend port in range 3000-3004"
  exit 1
fi

info "Starting backend on port $BACKEND_PORT..."
(
  cd "$BACKEND_DIR"
  export PATH="$VENV_DIR/bin:$PATH"
  PORT="$BACKEND_PORT" npm start
) &
BACKEND_PID=$!

info "Starting frontend on port $FRONTEND_PORT..."
(
  cd "$FRONTEND_DIR"
  npm run dev -- -p "$FRONTEND_PORT"
) &
FRONTEND_PID=$!

sleep 3

APP_URL="http://localhost:$FRONTEND_PORT"
info "App URL: $APP_URL"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" >/dev/null 2>&1 || true
fi

info "Press Ctrl+C to stop both services."
wait "$BACKEND_PID" "$FRONTEND_PID"
