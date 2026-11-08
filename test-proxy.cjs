
const path = require("node:path");
const https = require("node:https");
const dotenv = require("dotenv");
const { SocksProxyAgent } = require("socks-proxy-agent");

dotenv.config({
  path: path.resolve(__dirname, ".env")
});

const proxyUrl = process.env.PROXY_URL;

if (!proxyUrl) {
  console.error("PROXY_URL 未配置");
  process.exit(1);
}

const agent = new SocksProxyAgent(proxyUrl);

const url =
  "https://fapi.binance.com/fapi/v1/klines?symbol=ETHUSDT&interval=1m&limit=5";

console.log("开始测试 Binance API...");
console.log("代理协议:", proxyUrl.split(":")[0]);

const start = Date.now();

const req = https.get(
  url,
  {
    agent,
    timeout: 20000,
    headers: {
      "User-Agent": "crypto-market-monitor"
    }
  },
  (res) => {
    let body = "";

    res.setEncoding("utf8");

    res.on("data", (chunk) => {
      body += chunk;
    });

    res.on("end", () => {
      console.log("HTTP 状态:", res.statusCode);
      console.log("耗时:", Date.now() - start, "ms");

      try {
        const data = JSON.parse(body);
        console.log("返回数据:", JSON.stringify(data).slice(0, 1000));
      } catch {
        console.log("返回内容:", body.slice(0, 1000));
      }
    });
  }
);

req.on("timeout", () => {
  console.error("请求超时");
  req.destroy();
});

req.on("error", (error) => {
  console.error("请求失败:", error.message);
});
