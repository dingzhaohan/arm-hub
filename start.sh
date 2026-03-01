#!/bin/bash
# ARM Hub — start script
# Builds frontend, then starts backend at http://0.0.0.0:50005
#
# Usage:
#   ./start.sh              # build frontend + start backend
#   ./start.sh --skip-build # skip frontend build, start backend only
#   ./start.sh --daemon     # build + start in background
#   ./start.sh --stop       # stop running daemon
#   ./start.sh --status     # check if running

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_DIR="$PROJECT_DIR/backend"
PID_FILE="/tmp/arm-hub.pid"
LOG_FILE="/tmp/arm-hub.log"
PORT=50005

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[arm-hub]${NC} $*"; }
warn() { echo -e "${YELLOW}[arm-hub]${NC} $*"; }
err()  { echo -e "${RED}[arm-hub]${NC} $*" >&2; }

stop_existing() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "Stopping existing process (PID $pid)..."
            kill "$pid" 2>/dev/null
            for i in $(seq 1 10); do
                kill -0 "$pid" 2>/dev/null || break
                sleep 0.5
            done
            if kill -0 "$pid" 2>/dev/null; then
                warn "Force killing PID $pid"
                kill -9 "$pid" 2>/dev/null
            fi
        fi
        rm -f "$PID_FILE"
    fi

    local pids
    pids=$(lsof -ti tcp:$PORT 2>/dev/null || true)
    if [ -n "$pids" ]; then
        warn "Killing processes on port $PORT: $pids"
        echo "$pids" | xargs kill 2>/dev/null || true
        sleep 1
    fi
}

build_frontend() {
    log "Building frontend..."
    cd "$FRONTEND_DIR"
    if [ ! -d "node_modules" ]; then
        log "Installing npm dependencies..."
        npm install --silent
    fi
    npx vite build
    log "Frontend build complete -> $FRONTEND_DIR/dist/"
}

start_backend() {
    cd "$BACKEND_DIR"
    log "Starting backend on port $PORT..."
    exec python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT" --workers 2
}

start_daemon() {
    cd "$BACKEND_DIR"
    log "Starting backend in daemon mode (log: $LOG_FILE)..."
    nohup python3 -m uvicorn main:app --host 0.0.0.0 --port "$PORT" --workers 2 \
        > "$LOG_FILE" 2>&1 &
    local pid=$!
    echo "$pid" > "$PID_FILE"
    sleep 1
    if kill -0 "$pid" 2>/dev/null; then
        log "Backend started (PID $pid)"
        log "URL: http://0.0.0.0:$PORT"
        log "Log: $LOG_FILE"
    else
        err "Backend failed to start. Check $LOG_FILE"
        exit 1
    fi
}

show_status() {
    if [ -f "$PID_FILE" ]; then
        local pid
        pid=$(cat "$PID_FILE" 2>/dev/null)
        if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
            log "Running (PID $pid, port $PORT)"
            return 0
        fi
    fi
    local pids
    pids=$(lsof -ti tcp:$PORT 2>/dev/null || true)
    if [ -n "$pids" ]; then
        warn "Process on port $PORT (PID: $pids) but no PID file"
        return 0
    fi
    err "Not running"
    return 1
}

SKIP_BUILD=false
DAEMON=false

for arg in "$@"; do
    case "$arg" in
        --skip-build) SKIP_BUILD=true ;;
        --daemon)     DAEMON=true ;;
        --stop)       stop_existing; log "Stopped."; exit 0 ;;
        --status)     show_status; exit $? ;;
        -h|--help)    head -8 "$0" | tail -7; exit 0 ;;
        *)            err "Unknown option: $arg"; exit 1 ;;
    esac
done

stop_existing

if [ "$SKIP_BUILD" = false ]; then
    build_frontend
fi

if [ "$DAEMON" = true ]; then
    start_daemon
else
    start_backend
fi
