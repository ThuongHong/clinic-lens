# Smart Labs Frontend

Next.js web frontend for Smart Labs Analyzer.

## Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Set `NEXT_PUBLIC_BACKEND_BASE_URL` to your backend URL.

## Behavior

- Uploads lab PDFs/images directly to Alibaba OSS with STS credentials.
- Streams analysis results and chat replies from the Node backend via SSE.
- Uses a dedicated Chat tab and keeps raw stream fragments out of the UI.
