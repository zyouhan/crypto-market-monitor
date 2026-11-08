#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FILE="${1:-}"

if [ -z "$FILE" ] || [ ! -f "$FILE" ]; then
  echo "用法: $0 <backup.db> [--yes]" >&2
  exit 1
fi

if [ "${2:-}" != "--yes" ]; then
  read -r -p "将覆盖当前数据库，确认恢复？[y/N] " answer

  case "$answer" in
    y | Y | yes | YES) ;;
    *)
      echo "已取消"
      exit 1
      ;;
  esac
fi

BACKUP_DIR="$(cd "$(dirname "$FILE")" && pwd)"
BACKUP_NAME="$(basename "$FILE")"

echo "停止 server..."
docker compose stop server

echo "复制备份到数据卷并清理 WAL/SHM..."
docker compose run --rm --no-deps \
  -v "${BACKUP_DIR}:/backup:ro" \
  --entrypoint sh server -c \
  "cp \"/backup/${BACKUP_NAME}\" /app/data/crypto-market-monitor.db && rm -f /app/data/crypto-market-monitor.db-wal /app/data/crypto-market-monitor.db-shm"

echo "启动 server（如镜像已重建会自动使用新镜像）..."
docker compose up -d server

docker compose ps
echo "恢复完成，请检查: docker compose logs -f server"
