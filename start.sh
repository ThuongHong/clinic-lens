#!/bin/bash

set -euo pipefail

echo "🚀 Starting Smart Labs Analyzer Backend + Web Demo"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_LOG="/tmp/smart-labs-backend.log"
FRONTEND_LOG="/tmp/smart-labs-frontend.log"
BACKEND_PID_FILE="/tmp/smart-labs-backend.pid"
FRONTEND_PID_FILE="/tmp/smart-labs-frontend.pid"

wait_for_url() {
  local url="$1"
  local retries="${2:-30}"
  local delay_seconds="${3:-1}"

  for ((i = 1; i <= retries; i++)); do
    if curl -fsS "$url" > /dev/null 2>&1; then
      return 0
    fi
    sleep "$delay_seconds"
  done

  return 1
}

# Step 1: Backend setup
echo -e "${YELLOW}Step 1: Installing backend dependencies...${NC}"
cd "$ROOT_DIR/backend"
if [ ! -d "node_modules" ] || [ ! -d "node_modules/express" ]; then
  npm install
else
  echo "✓ Node modules already installed"
fi
cd "$ROOT_DIR"
echo -e "${GREEN}✓ Backend ready${NC}"
echo ""

# Step 2: Check .env
echo -e "${YELLOW}Step 2: Checking environment configuration...${NC}"
if [ ! -f ".env" ]; then
  echo -e "${RED}⚠ .env file not found!${NC}"
  echo "Please create .env from .env.example:"
  echo "  cp .env.example .env"
  echo "  # Edit .env with your Alibaba Cloud credentials"
  exit 1
else
  echo -e "${GREEN}✓ .env file found${NC}"
fi
echo ""

# Step 3: Restart backend + frontend processes
echo -e "${YELLOW}Step 3: Restarting backend and frontend processes...${NC}"
if [ -f "$BACKEND_PID_FILE" ]; then
  kill "$(cat "$BACKEND_PID_FILE")" 2>/dev/null || true
fi
if [ -f "$FRONTEND_PID_FILE" ]; then
  kill "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null || true
fi

pkill -f "node server.js" 2>/dev/null || true
pkill -f "next dev|next/dist/bin/next" 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓ Old processes stopped${NC}"
echo ""

# Step 4: Start backend and wait for health
echo -e "${YELLOW}Step 4: Starting backend server...${NC}"
cd "$ROOT_DIR/backend"
PORT=9000 npm start > "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$BACKEND_PID_FILE"
cd "$ROOT_DIR"

if wait_for_url "http://127.0.0.1:9000/health" 30 1; then
  echo -e "${GREEN}✓ Backend is running on http://127.0.0.1:9000 (pid: $BACKEND_PID)${NC}"
else
  echo -e "${RED}❌ Backend health check failed${NC}"
  echo "Last backend log lines:"
  tail -n 40 "$BACKEND_LOG" || true
  exit 1
fi
echo ""

# Step 5: Frontend
echo -e "${YELLOW}Step 5: Frontend project setup...${NC}"
if [ ! -d "frontend" ]; then
  echo -e "${RED}❌ Frontend directory not found${NC}"
  exit 1
fi

if ! command -v node &> /dev/null; then
  echo -e "${RED}❌ Node.js is required to run the frontend${NC}"
  exit 1
fi

cd "$ROOT_DIR/frontend"
if [ ! -d "node_modules" ] || [ ! -d "node_modules/next" ]; then
  npm install
else
  echo "✓ Frontend dependencies already installed"
fi

if [ ! -f ".env.local" ]; then
  if [ -f ".env.example" ]; then
    cp .env.example .env.local
    echo "✓ Created frontend/.env.local from .env.example"
  else
    echo -e "${YELLOW}⚠ frontend/.env.example not found; continuing without .env.local${NC}"
  fi
fi

echo ""
echo -e "${YELLOW}Step 6: Starting Next.js frontend...${NC}"
NEXT_PUBLIC_BACKEND_BASE_URL=http://127.0.0.1:9000 PORT=3000 npm run dev > "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"
cd "$ROOT_DIR"

if wait_for_url "http://127.0.0.1:3000" 60 1; then
  echo -e "${GREEN}✓ Frontend is running on http://127.0.0.1:3000 (pid: $FRONTEND_PID)${NC}"
else
  echo -e "${RED}❌ Frontend startup check failed${NC}"
  echo "Last frontend log lines:"
  tail -n 60 "$FRONTEND_LOG" || true
  exit 1
fi

echo ""
echo -e "${GREEN}✅ All services are up${NC}"
echo "Backend health: http://127.0.0.1:9000/health"
echo "Frontend: http://127.0.0.1:3000"
echo ""
echo "Logs:"
echo "  backend:  $BACKEND_LOG"
echo "  frontend: $FRONTEND_LOG"
echo ""
echo "PIDs:"
echo "  backend:  $BACKEND_PID_FILE"
echo "  frontend: $FRONTEND_PID_FILE"

