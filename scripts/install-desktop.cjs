const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const desktop = path.join(root, "apps", "desktop");
const npmCli =
  process.env.npm_execpath ||
  path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js"
  );

const result = spawnSync(
  process.execPath,
  [npmCli, "install", "--prefix", desktop],
  {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_MIRROR:
        process.env.ELECTRON_MIRROR ||
        "https://npmmirror.com/mirrors/electron/"
    },
    stdio: "inherit",
    shell: false
  }
);

process.exit(result.status ?? 1);
