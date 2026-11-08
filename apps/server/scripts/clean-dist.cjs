const fs = require("node:fs");
const path = require("node:path");

const target = path.resolve(__dirname, "../dist");

fs.rmSync(target, { recursive: true, force: true });

console.log(`[build] 已清理 ${target}`);
