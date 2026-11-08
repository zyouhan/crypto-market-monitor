
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# better-sqlite3 需要本地编译工具
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# 先复制 Workspace 清单，利用 Docker 缓存依赖安装
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json

RUN npm ci

# 复制后端源码
COPY apps/server ./apps/server

# 编译 TypeScript
RUN npm run build --workspace=crypto-market-monitor-server

# 只保留生产依赖
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

# better-sqlite3 运行时需要 C++ 标准库
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist

EXPOSE 4000

CMD ["npm", "run", "start", "--workspace=crypto-market-monitor-server"]
