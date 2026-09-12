# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS builder
COPY tsconfig*.json ./
COPY config ./config
COPY public ./public
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
ARG APP_VERSION=0.0.0
ENV NODE_ENV=production
WORKDIR /app

LABEL org.opencontainers.image.title="genericFoalTS"
LABEL org.opencontainers.image.version=$APP_VERSION

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build
COPY --from=builder /app/config ./config
COPY --from=builder /app/public ./public
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN chmod +x /app/docker-entrypoint.sh && mkdir -p /app/storage/uploads && chown -R node:node /app

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3001) + '/health/ready', { redirect: 'manual' }).then(response => process.exit(response.status === 200 ? 0 : 1)).catch(() => process.exit(1))"

CMD ["./docker-entrypoint.sh"]
