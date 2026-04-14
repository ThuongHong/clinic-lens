#!/bin/bash

set -e

echo "🚀 Starting Smart Labs Analyzer Backend + Web Demo"
echo ""

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Backend setup
echo -e "${YELLOW}Step 1: Installing backend dependencies...${NC}"
cd backend
if [ ! -d "node_modules" ] || [ ! -d "node_modules/express" ]; then
  npm install
else
  echo "✓ Node modules already installed"
fi
cd ..
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

# Step 3: Start backend
echo -e "${YELLOW}Step 3: Starting backend server...${NC}"
BACKEND_STARTED_BY_SCRIPT=0
BACKEND_PID=""

if curl -s http://localhost:9000/health | jq . > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Backend already running on http://localhost:9000${NC}"

  CHAT_ROUTE_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    http://localhost:9000/api/chat \
    -H "Content-Type: application/json" \
    -d '{}')

  if [ "$CHAT_ROUTE_CODE" = "404" ]; then
    echo -e "${YELLOW}⚠ Running backend is missing /api/chat. Restarting backend...${NC}"

    OLD_BACKEND_PID=$(lsof -ti tcp:9000 | head -n 1)
    if [ -n "$OLD_BACKEND_PID" ]; then
      kill "$OLD_BACKEND_PID" 2>/dev/null || true
      sleep 1
    fi

    cd backend
    PORT=9000 npm start &
    BACKEND_PID=$!
    BACKEND_STARTED_BY_SCRIPT=1
    cd ..
    sleep 2
  fi
else
  cd backend
  PORT=9000 npm start &
  BACKEND_PID=$!
  BACKEND_STARTED_BY_SCRIPT=1
  cd ..
  sleep 2
fi

# Test backend health
echo -e "${YELLOW}Step 4: Testing backend health...${NC}"
if curl -s http://localhost:9000/health | jq . > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Backend is running on http://localhost:9000${NC}"
else
  echo -e "${RED}❌ Backend health check failed${NC}"
  kill $BACKEND_PID 2>/dev/null || true
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

cd frontend
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
echo -e "${YELLOW}Step 6: Running Next.js frontend...${NC}"
NEXT_PUBLIC_BACKEND_BASE_URL=http://localhost:9000 PORT=3000 npm run dev

