#!/bin/bash

# Quick demo of the backend API flows

echo "=== Smart Labs Analyzer Backend Demo ==="
echo ""

BACKEND_URL="http://localhost:9000"

# Demo 1: Health Check
echo "1️⃣ Health Check"
echo "GET $BACKEND_URL/health"
curl -s "$BACKEND_URL/health" | jq .
echo ""
echo ""

# Demo 2: Fetch STS Token
echo "2️⃣ Fetch STS Token (for frontend to upload OSS directly)"
echo "GET $BACKEND_URL/api/sts-token"
STS=$(curl -s "$BACKEND_URL/api/sts-token")
echo "$STS" | jq .
echo ""
echo "✓ Frontend can now use these credentials to upload file to OSS"
echo ""
echo ""

# Demo 3: Sign OSS URL
echo "3️⃣ Sign OSS URL (for accessing private files)"
echo "GET $BACKEND_URL/api/sign-url?object_key=test-lab-results.pdf"
SIGN=$(curl -s "$BACKEND_URL/api/sign-url?object_key=test-lab-results.pdf")
echo "$SIGN" | jq .
echo ""
echo ""

# Demo 4: Analyze (SSE Stream)
echo "4️⃣ Analyze Lab Results (SSE Streaming)"
echo "POST $BACKEND_URL/api/analyze"
echo "Body: {\"file_url\": \"https://example-bucket.oss-cn-hangzhou.aliyuncs.com/sample.pdf\"}"
echo ""
echo "Stream output (first 10 lines):"
curl -s -X POST "$BACKEND_URL/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"file_url": "https://example-bucket.oss-cn-hangzhou.aliyuncs.com/sample.pdf"}' \
  | head -20
echo ""
echo "... (stream continues with Qwen analysis)"
echo ""
echo ""

echo "✅ Demo complete!"
echo ""
echo "Next steps:"
echo "1. Set up Alibaba Cloud credentials in .env"
echo "2. Deploy to Alibaba Function Compute (optional)"
echo "3. Run the Next.js frontend and verify OSS upload"
echo "4. Polish summary/results/chat/history panels"
