#!/bin/bash

set -e

echo "🚀 Starting Smart Labs Analyzer Backend + Mobile Demo"
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
cd backend
PORT=9000 npm start &
BACKEND_PID=$!
cd ..
sleep 2

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

# Step 5: Flutter
echo -e "${YELLOW}Step 5: Flutter project setup...${NC}"
if command -v flutter &> /dev/null; then
  echo -e "${GREEN}✓ Flutter SDK found${NC}"
  echo ""
  echo -e "${YELLOW}Step 6: Running Flutter app...${NC}"
  cd mobile
  flutter pub get
  flutter run
  cd ..
else
  echo -e "${YELLOW}⚠ Flutter SDK not found locally${NC}"
  echo "To run the Flutter app, please:"
  echo "  1. Install Flutter from https://flutter.dev"
  echo "  2. Run: cd mobile && flutter pub get && flutter run"
  echo ""
  echo "Backend is still running at http://localhost:9000"
  echo "Press Ctrl+C to stop the backend server"
  wait $BACKEND_PID
fi
