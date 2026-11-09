#!/usr/bin/env bash
set -Eeuo pipefail

# 服务器端一键部署：
#   ./scripts/deploy.sh [expected-commit]
#
# 流程：锁 → 检查工作区 → 备份数据库 → 拉取 main → 构建镜像 → 重建容器 → 健康检查。
# 不会自动回滚数据库；失败时保留现场并打印回滚命令。

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

EXPECTED_COMMIT="${1:-}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1/api/health}"
LOCK_FILE="${DEPLOY_LOCK_FILE:-/tmp/crypto-market-monitor-deploy.lock}"

log() {
  printf '\n[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

fail() {
  printf '\n[部署失败] %s\n' "$*" >&2
  exit 1
}

# 同一时间只允许一个部署任务
if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  flock -n 9 || fail "已有部署任务在运行（$LOCK_FILE）"
fi

if [ ! -f docker-compose.yml ]; then
  fail "当前目录不是 crypto-market-monitor 项目根目录: $ROOT_DIR"
fi

PREVIOUS_COMMIT="$(git rev-parse HEAD)"

trap 'printf "\n[部署中断] 当前 commit: %s\n" "$PREVIOUS_COMMIT"; docker compose ps 2>/dev/null || true; docker compose logs --tail=100 server 2>/dev/null || true' ERR

log "项目目录: $ROOT_DIR"
log "部署前 commit: $PREVIOUS_COMMIT"

# 生产目录必须干净，避免覆盖服务器上的手工修改
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  git status --short
  fail "工作区存在未提交的已跟踪文件改动，请先处理后再部署"
fi

log "备份数据库"
if [ -n "$(docker compose ps -q server 2>/dev/null || true)" ]; then
  ./scripts/backup-db.sh
else
  log "server 容器未运行，跳过数据库备份"
fi

log "拉取 origin/main"
git fetch origin main
git pull --ff-only origin main

CURRENT_COMMIT="$(git rev-parse HEAD)"
log "部署 commit: $CURRENT_COMMIT"

if [ -n "$EXPECTED_COMMIT" ] && [ "$CURRENT_COMMIT" != "$EXPECTED_COMMIT" ]; then
  fail "部署 commit 与工作流期望不一致：期望 $EXPECTED_COMMIT，实际 $CURRENT_COMMIT"
fi

log "构建 Docker 镜像"
docker compose build

log "重建容器"
docker compose up -d --remove-orphans

log "等待健康检查: $HEALTH_URL"
HEALTHY=0
for _ in $(seq 1 90); do
  if curl -fsS "$HEALTH_URL" 2>/dev/null | grep -q '"status":"ok"'; then
    HEALTHY=1
    break
  fi
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  docker compose ps || true
  docker compose logs --tail=150 server || true
  fail "健康检查失败。如需回滚代码：
  git reset --hard $PREVIOUS_COMMIT
  docker compose build
  docker compose up -d
注意：数据库迁移不会自动回滚，请结合 data/archive 下的备份处理。"
fi

docker compose ps
log "部署完成: $PREVIOUS_COMMIT -> $CURRENT_COMMIT"
log "健康检查通过: $HEALTH_URL"
