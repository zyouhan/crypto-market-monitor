#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p backups

STAMP="$(date +%Y%m%d-%H%M%S)"
CONTAINER_FILE="/app/data/backup-${STAMP}.db"
HOST_FILE="backups/backup-${STAMP}.db"

CONTAINER_ID="$(docker compose ps -q server || true)"

if [ -z "$CONTAINER_ID" ]; then
  echo "server 容器未运行，请先 docker compose up -d" >&2
  exit 1
fi

cleanup() {
  docker compose exec -T server rm -f "$CONTAINER_FILE" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "创建 SQLite 一致性快照..."
docker compose exec -T server node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/crypto-market-monitor.db', { readonly: true });
db.backup('${CONTAINER_FILE}')
  .then(() => {
    db.close();
    console.log('snapshot-created');
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
"

docker cp "${CONTAINER_ID}:${CONTAINER_FILE}" "$HOST_FILE"

find backups -type f -name 'backup-*.db' -mtime +7 -delete

echo "备份完成: $HOST_FILE"
