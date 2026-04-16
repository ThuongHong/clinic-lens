# Deploy to Alibaba Cloud ECS with One Command

## 1. Prerequisites on ECS

- Ubuntu 22.04 LTS (recommended)
- Docker Engine + Docker Compose plugin
- Open security group ports:
  - 80 (website)

Install Docker on ECS:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Reconnect SSH after adding user to docker group.

## 2. Prepare environment file

From repository root:

```bash
cp .env.alibabacloud.example .env
```

Edit .env with real Alibaba values:

- ALI_ACCESS_KEY
- ALI_SECRET_KEY
- ALI_ROLE_ARN
- OSS_REGION
- OSS_BUCKET_NAME
- DASHSCOPE_API_KEY
- NEXT_PUBLIC_BACKEND_BASE_URL

For ECS without domain, set NEXT_PUBLIC_BACKEND_BASE_URL to:

```text
http://<ECS_PUBLIC_IP>
```

## 3. Deploy with one command

Run from repository root:

```bash
docker compose --profile proxy up -d --build
```

This command will:

- Build backend and frontend images
- Start backend and frontend containers on private network
- Start reverse proxy as the public entrypoint
- Persist backend data with named volume backend_data
- Wait for backend health before frontend startup

## 4. Verify deployment

```bash
docker compose ps
curl -f http://127.0.0.1:${PUBLIC_HTTP_PORT:-80}/healthz
docker compose exec backend node -e "require('http').get('http://127.0.0.1:9000/health', (res) => { console.log('backend status', res.statusCode); process.exit(res.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"
```

Open in browser:

- Frontend: http://<ECS_PUBLIC_IP>:<FRONTEND_PORT>
- Website (frontend + /api): http://<ECS_PUBLIC_IP>:<PUBLIC_HTTP_PORT>
- Backend is private and only reachable from Docker internal network

## 5. Operations

View logs:

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

Restart services:

```bash
docker compose restart
```

Stop services:

```bash
docker compose down
```

Stop and remove volume (destructive):

```bash
docker compose down -v
```

## 6. Rollback

If new build is unhealthy, return to previous git tag/commit and redeploy:

```bash
git checkout <previous-tag-or-commit>
docker compose up -d --build
```
