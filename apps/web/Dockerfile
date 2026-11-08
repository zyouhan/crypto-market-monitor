
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# better-sqlite3 原生模块编译依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

COPY apps/web ./apps/web

ENV NEXT_TELEMETRY_DISABLED=1

# rewrites 在 next build 时固化，compose 里通过 build.args 传入容器内地址
ARG API_INTERNAL_URL=http://localhost:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL

RUN npm run build --workspace=crypto-market-monitor-web

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/package.json ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /app/apps/web/next-env.d.ts ./apps/web/next-env.d.ts
COPY --from=builder /app/apps/web/tsconfig.json ./apps/web/tsconfig.json
COPY --from=builder /app/apps/web/app ./apps/web/app
COPY --from=builder /app/apps/web/.next ./apps/web/.next

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=crypto-market-monitor-web"]
