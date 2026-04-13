#!/bin/bash

set -e

echo "🚀 Testing Smart Labs Analyzer Backend..."
echo ""

BACKEND_URL="${1:-http://localhost:9000}"
echo "Backend URL: $BACKEND_URL"
echo ""

# Test 1: Health check
echo "📋 Test 1: Health Check"
curl -s "$BACKEND_URL/health" | jq . || echo "❌ Health check failed"
echo ""

# Test 2: STS Token
echo "📋 Test 2: Fetch STS Token"
STS_RESPONSE=$(curl -s "$BACKEND_URL/api/sts-token")
echo "Response: $STS_RESPONSE" | jq . || echo "❌ STS token fetch failed"
echo ""

# Test 3: Sign URL
echo "📋 Test 3: Sign OSS URL"
curl -s "$BACKEND_URL/api/sign-url?object_key=test-file.pdf&expires_in=600" | jq . || echo "❌ Sign URL failed"
echo ""

echo "✅ Backend tests complete!"
