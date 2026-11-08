# VPS 部署与运维指南

适用场景：**Docker Compose + 宿主机 Caddy**，VPS 只有公网 IP、暂未绑定域名。

```
浏览器
  │  http://<公网IP>:80
  ▼
Caddy（宿主机）
  ├─ /api/*  → 127.0.0.1:4000（server 容器，Worker + API）
  └─ 其他     → 127.0.0.1:3000（web 容器，Next.js）
```

- server / web 端口只绑定 `127.0.0.1`，公网只能访问 Caddy。
- SQLite 数据保存在 Docker 卷 `monitor-data`。
- 只运行 **一个** server 容器；多副本会导致 Worker 重复拉取与重复通知。

> **安全提示**：仅 IP 的阶段只能用 HTTP，账号密码和登录 Cookie 会明文传输。建议尽快绑定域名启用 HTTPS，或使用 Cloudflare Tunnel（见第 10 节）。

---

## 1. VPS 准备

推荐 Ubuntu 22.04 / 24.04，至少 1 vCPU / 1GB 内存 / 10GB 磁盘；**2GB 内存更稳妥**（构建 better-sqlite3 需要编译）。

```bash
sudo apt update && sudo apt upgrade -y

# 时区（可选，便于看日志）
sudo timedatectl set-timezone Asia/Shanghai
```

### 1.1 内存不足时加 swap

1GB 机型建议先加 2GB swap，避免 `npm ci` 编译阶段被 OOM kill：

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

### 1.2 安装 Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker

# 让当前用户可以直接使用 docker（执行后重新登录 SSH）
sudo usermod -aG docker "$USER"

# 重新登录后确认
docker --version
docker compose version
```

### 1.3 防火墙

只开放 SSH 和 HTTP；以后启用 HTTPS 再加 443。

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status
```

> 云厂商控制台里的安全组/防火墙也要放行 80（或之后的 443/8080），ufw 只管系统内部。

如果 80 端口被云厂商封锁，改用 8080（见 5.3）。

---

## 2. 代码上 VPS

当前本地仓库没有配置 remote，先推到私有仓库（GitHub / Gitee 均可）。

### 2.1 本机推送

```bash
cd D:\trade\code\crypto-market-monitor

git remote add origin git@github.com:<你的账号>/crypto-market-monitor.git
git push -u origin main
```

### 2.2 VPS 生成只读 Deploy Key

```bash
ssh-keygen -t ed25519 -C "cmm-vps" -f ~/.ssh/cmm_deploy -N ""

cat ~/.ssh/cmm_deploy.pub
```

把公钥添加到仓库的 **Deploy Key**，只勾选读权限。然后配置 SSH：

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/cmm_deploy
  IdentitiesOnly yes
EOF

chmod 600 ~/.ssh/config
```

Gitee 把 `Host github.com` 换成 `gitee.com` 即可，公钥同样加到部署公钥。

### 2.3 克隆

```bash
sudo mkdir -p /opt
sudo chown "$USER":"$USER" /opt

git clone git@github.com:<你的账号>/crypto-market-monitor.git /opt/crypto-market-monitor
cd /opt/crypto-market-monitor
```

后续更新统一在 `/opt/crypto-market-monitor` 执行 `git pull --ff-only`。

---

## 3. `.env` 配置

```bash
cd /opt/crypto-market-monitor
cp .env.example .env
chmod 600 .env
nano .env
```

生成强随机值：

```bash
openssl rand -base64 48   # AUTH_SECRET
openssl rand -base64 24   # ADMIN_PASSWORD
```

### 3.1 仅 IP / HTTP 的初始配置

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD="<上面生成的管理员密码>"

AUTH_SECRET=<上面生成的 AUTH_SECRET>

PORT=4000
HOST=0.0.0.0
COOKIE_SECURE=false
FRONTEND_ORIGIN=http://<公网IP>

DATABASE_PATH=./data/crypto-market-monitor.db

BINANCE_BASE_URL=https://fapi.binance.com

POLL_INTERVAL_MS=15000
MAX_CONCURRENT_SYMBOLS=3
KLINE_LIMIT=300

PROXY_URL=

SERVERCHAN_SENDKEY=
GLOBAL_WECHAT_ENABLED=false
```

### 3.2 变量说明

| 变量 | 说明 |
|---|---|
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | 页面登录账号；密码含 `#`、空格等字符时用双引号包起来 |
| `AUTH_SECRET` | 会话签名密钥，至少 32 字节；修改后所有人需要重新登录 |
| `PORT` / `HOST` | 容器内部监听地址，不要改（改了要同步 compose / Caddy / healthcheck） |
| `COOKIE_SECURE` | HTTP 阶段必须 `false`；启用 HTTPS 后改 `true`，否则登录会反复失败 |
| `FRONTEND_ORIGIN` | 浏览器实际访问地址，必须完全一致、**不能带结尾斜杠**；例如 `http://203.0.113.10` |
| `DATABASE_PATH` | 本地开发路径；Docker 部署时 compose 会覆盖为 `/app/data/...` |
| `BINANCE_BASE_URL` | 一般不改 |
| `POLL_INTERVAL_MS` | worker 扫描节拍；请求频率仍由各标的 K 线周期决定 |
| `MAX_CONCURRENT_SYMBOLS` | 同时拉取的标的数，建议 3–5 |
| `KLINE_LIMIT` | 每次取多少根 K 线，同时限制 EMA 慢线与 KDJ 周期 |
| `PROXY_URL` | VPS 直连 Binance 不通时填 `socks5h://user:pass@host:port` |
| `SERVERCHAN_SENDKEY` | Server酱 SendKey，先留空 |
| `GLOBAL_WECHAT_ENABLED` | 全局通知开关，先 `false`，验证后再开 |

> `.env` 已在 `.gitignore` 中，不要提交到仓库。

---

## 4. 构建与启动

```bash
cd /opt/crypto-market-monitor

# 检查 compose 语法
docker compose config

# 首次构建（会编译 better-sqlite3，可能需要几分钟）
docker compose build

# 启动
docker compose up -d

# 查看状态
docker compose ps
```

正常应该看到两个服务都是 `healthy`。查看日志：

```bash
docker compose logs -f server
```

预期日志：

```
[Server] API 服务已启动: http://0.0.0.0:4000
[Server] 数据库: /app/data/crypto-market-monitor.db
[Worker] 启动，扫描间隔 15000ms，并发 3
[Worker] ETHUSDT 预热完成: ...
```

如果持续出现 `Binance API request timeout` 或 `ECONNREFUSED`，先看第 12 节。

常用控制命令：

```bash
docker compose restart server
docker compose stop
docker compose up -d
docker compose down        # 保留数据卷
```

> 绝对不要执行 `docker compose down -v`，`-v` 会删除数据库卷。

---

## 5. 安装并配置 Caddy

### 5.1 安装

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg

curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list

sudo apt update
sudo apt install -y caddy
```

### 5.2 使用仓库内的 Caddyfile

```bash
cd /opt/crypto-market-monitor

sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable caddy
sudo systemctl reload caddy

sudo journalctl -u caddy -f
```

Caddyfile 内容（仅 IP / HTTP）：

```caddyfile
:80 {
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:4000
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

### 5.3 如果 80 端口不可用

把 Caddyfile 的 `:80` 改成 `:8080`，放行端口，并同步修改 `.env`：

```bash
sudo ufw allow 8080/tcp
sudo sed -i 's/^:80/:8080/' /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

`.env`：

```dotenv
FRONTEND_ORIGIN=http://<公网IP>:8080
```

修改后：

```bash
docker compose up -d --force-recreate server web
```

### 5.4 为什么现在不用自动 HTTPS

公共 CA 不给裸 IP 签发证书，Caddy 的自动 HTTPS 需要域名。绑定域名后的升级步骤见第 10 节。

---

## 6. 部署验收

```bash
# 1. 健康检查（无需登录）
curl -s http://<公网IP>/api/health

# 2. 容器状态
docker compose ps

# 3. 最近日志
docker compose logs --tail=100 server
```

浏览器打开 `http://<公网IP>/`：

1. 使用 `.env` 里的账号密码登录成功。
2. 页面能看到标的、状态、信号记录。
3. DevTools → Application → Cookies：
   - 名称 `cmm_session`
   - `HttpOnly` 为 true
   - `SameSite=Strict`
   - `Secure` 为 false（HTTP 阶段正常；HTTPS 后应为 true）
4. 再执行一次 `docker compose restart server`，刷新页面数据仍在（卷持久化）。
5. 公网端口只应看到 80：

```bash
sudo ss -ltnp | grep -E ':(80|3000|4000)'
```

`3000/4000` 应只监听 `127.0.0.1`。

6. 可选：把 `SERVERCHAN_SENDKEY` 填好，在页面开启全局开关、标的开关、策略开关，等一个真实信号验证微信推送；不想等可以先保持关闭。

---

## 7. 数据库备份与恢复

SQLite 正在运行时不能直接复制主文件（WAL 可能丢数据），脚本使用 `better-sqlite3` 的备份 API 生成一致性快照。

### 7.1 备份

```bash
cd /opt/crypto-market-monitor
chmod +x scripts/*.sh

./scripts/backup-db.sh
ls -lh backups/
```

脚本会：

1. 在容器内生成 `/app/data/backup-<时间戳>.db`；
2. 用 `docker cp` 拷回宿主机 `backups/`；
3. 清理容器内临时文件与 7 天前的本地备份。

建议加到 cron，每天 4 点执行：

```bash
crontab -e
```

```cron
0 4 * * * cd /opt/crypto-market-monitor && mkdir -p backups && ./scripts/backup-db.sh >> backups/cron.log 2>&1
```

备份文件建议定期同步到另一台机器或对象存储：

```bash
scp backups/backup-*.db user@backup-host:/backups/cmm/
```

### 7.2 恢复

```bash
cd /opt/crypto-market-monitor
./scripts/restore-db.sh backups/backup-20260101-040000.db
```

脚本会停止 server、覆盖数据库、删除 `-wal/-shm`、重新启动。输入 `y` 确认。

注意：

- 备份文件的结构版本应与当前代码兼容；跨大版本恢复前先看第 9 节。
- 恢复后查看 `docker compose logs -f server`，确认没有 SQLite 错误。
- 恢复期间 Web 可能短暂 502，属正常。

---

## 8. 日常更新流程

### 8.1 标准步骤

```bash
cd /opt/crypto-market-monitor

# 1. 先备份
./scripts/backup-db.sh

# 2. 拉代码
git status
git pull --ff-only

# 3. 重建镜像（代码进镜像，restart 不会更新代码）
docker compose build

# 4. 重新创建容器
docker compose up -d

# 5. 看迁移与启动日志
docker compose logs -f --tail=100 server

# 6. 验证
curl -s http://127.0.0.1/api/health
```

### 8.2 版本与迁移日志

- 首次部署会直接创建 v3 结构，没有迁移。
- 以后从 v1 升级：首次启动会把旧库移到 `data/archive/v1-<时间戳>/` 并重建。
- 以后从 v2 升级：日志出现 `[DB] 已升级到 v3，策略状态已重置，等待静默预热`；历史 `signals` 保留，策略状态清空后静默预热。
- 升级后**不会补发历史信号**，也不会重复推送旧信号。
- 未来如果出现 v4/v5，按同样方式处理：升级前备份，升级后先看 `[DB]` 日志。

### 8.3 修改 `.env`

`.env` 只在创建容器时读取，修改后必须重建容器：

```bash
nano .env
docker compose up -d --force-recreate server web
```

常见需要重建的改动：

- `FRONTEND_ORIGIN`
- `COOKIE_SECURE`
- `ADMIN_*` / `AUTH_SECRET`
- `POLL_INTERVAL_MS` / `MAX_CONCURRENT_SYMBOLS`

### 8.4 回滚

```bash
cd /opt/crypto-market-monitor

git log --oneline -5
git checkout <上一个稳定提交>

docker compose build
docker compose up -d
```

如果本次更新包含数据库结构升级，旧代码可能不兼容新结构，回滚需要按“先换代码、再恢复备份”的顺序：

```bash
cd /opt/crypto-market-monitor

# 1. 停止应用
docker compose stop

# 2. 切回上一个稳定版本并重新构建镜像
git checkout <上一个稳定提交>
docker compose build

# 3. 恢复升级前的数据库（脚本会用当前已构建的旧版本镜像重建 server）
./scripts/restore-db.sh backups/backup-<升级前时间戳>.db --yes

# 4. 确认 web 等容器也处于运行状态
docker compose up -d
```

### 8.5 更新时的注意事项

1. **先备份**，尤其是带 schema 迁移的版本。
2. 只跑一个 server 容器，避免 Worker 重复拉取、重复通知。
3. 不要在 VPS 上 `npm run dev`；生产一律用镜像。
4. 不要 `docker compose down -v`。
5. 代码更新必须 `docker compose build`，`restart` 不会换镜像。
6. `.env` 改动后要 `--force-recreate`。
7. `AUTH_SECRET` 一改，所有已登录会话失效，需要重新登录。
8. 升级后先看 `[DB]` 迁移日志与 worker 预热日志，再打开页面。
9. 定期检查磁盘：`df -h`、`docker system df`；日志已限制为 10MB × 3。
10. 未来数据库迁移同样会保留历史信号、清空策略状态并静默预热；升级前备份即可。

---

## 9. 升级到 HTTPS（有域名后）

推荐尽早切到 HTTPS，HTTP 阶段只适合临时使用。

### 9.1 域名 + Caddy 自动证书

1. 域名 A 记录指向 VPS 公网 IP。
2. 修改 `/etc/caddy/Caddyfile`：

```caddyfile
monitor.example.com {
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:4000
    }

    handle {
        reverse_proxy 127.0.0.1:3000
    }
}
```

3. 放行 443：

```bash
sudo ufw allow 443/tcp
sudo systemctl reload caddy
```

4. 修改 `.env`：

```dotenv
FRONTEND_ORIGIN=https://monitor.example.com
COOKIE_SECURE=true
```

5. 重建容器并验证：

```bash
docker compose up -d --force-recreate server web
curl -s https://monitor.example.com/api/health
```

Caddy 会自动申请/续期证书；`journalctl -u caddy -f` 可查看。

### 9.2 Cloudflare Tunnel（可选）

不想暴露 80/443 时，可以用 Cloudflare Tunnel 把域名指向本机 Caddy（或直接指向 web/server）：

- 公网入口由 Cloudflare 提供 HTTPS；
- `.env` 同样使用 `FRONTEND_ORIGIN=https://<域名>`、`COOKIE_SECURE=true`；
- VPS 不需要开放 80/443，只保留 SSH。

具体命令以 Cloudflare Zero Trust 控制台生成的 `cloudflared` 安装与 tunnel 配置为准。

### 9.3 仅 IP 阶段的替代加固

- 用 Caddy 的 `remote_ip` 匹配器限制来源 IP（适合固定出口 IP），只允许自己的地址访问。
- 或只通过 SSH 隧道访问，不长期暴露公网 80。
- 最推荐的仍是尽快绑定域名启用 HTTPS，或使用 Cloudflare Tunnel。

---

## 10. 排查手册

| 现象 | 原因 | 处理 |
|---|---|---|
| 登录接口 200，但页面仍显示未登录 | HTTP 下 `COOKIE_SECURE=true`，Cookie 不保存 | 改成 `false` 后 `up -d --force-recreate server web`；或启用 HTTPS |
| 写操作返回 `请求来源不合法` | `FRONTEND_ORIGIN` 与浏览器地址不一致（协议/端口/尾斜杠） | 按实际地址修改并重建容器 |
| 页面 502 | 容器不健康、端口未监听、server 启动失败 | `docker compose ps`、`docker compose logs server`、`curl 127.0.0.1:4000/api/health` |
| Worker 日志 `ECONNREFUSED / timeout` | VPS 无法访问 Binance 或代理未启动 | 先直连测试；需要代理时填写 `PROXY_URL=socks5h://...` |
| 代理配置了但仍失败 | VPS 到代理不通、代理格式错误 | `docker compose exec -T server node -e "fetch('https://fapi.binance.com/fapi/v1/ping').then(r=>console.log(r.status)).catch(e=>{console.error(e.message);process.exit(1)})"` |
| Server酱没收到 | 全局/标的/策略开关任一关闭、SendKey 空、出网失败 | 页面看 `push_error`；逐步打开开关；检查 SendKey |
| 构建时 `Killed` / OOM | better-sqlite3 编译内存不足 | 加 swap 或换 2GB 机型后重试 |
| `docker: permission denied` | 当前用户不在 docker 组 | `sudo usermod -aG docker $USER` 后重新登录 |
| `port is already allocated` | 80/3000/4000 被占用 | `sudo ss -ltnp | grep -E ':(80|3000|4000)'`，停掉冲突服务或改端口 |
| `database is locked` | 跑了多个 server 实例或把库放在 NFS | 只保留一个 server；SQLite 必须放本地卷 |
| 磁盘满 | 镜像/日志/备份堆积 | `df -h`、`docker system df`、清理旧镜像与备份 |

---

## 11. 常用命令速查

```bash
cd /opt/crypto-market-monitor

docker compose ps
docker compose logs -f --tail=100 server
docker compose logs -f --tail=100 web

docker compose restart server
docker compose up -d
docker compose build
docker compose up -d --force-recreate server web

curl -s http://127.0.0.1/api/health
curl -s http://<公网IP>/api/health

./scripts/backup-db.sh
./scripts/restore-db.sh backups/backup-xxxx.db

sudo systemctl status caddy
sudo journalctl -u caddy -f
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
