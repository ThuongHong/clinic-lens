FROM node:20-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache dumb-init \
    && addgroup -S nodejs \
    && adduser -S appuser -G nodejs

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package*.json ./
COPY . .

RUN mkdir -p /app/data \
    && chown -R appuser:nodejs /app

ENV NODE_ENV=production
ENV PORT=9000

EXPOSE 9000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:' + (process.env.PORT || 9000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1));"

USER appuser

ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "server.js"]
