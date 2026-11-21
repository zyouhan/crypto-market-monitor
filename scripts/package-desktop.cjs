const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const desktop = path.join(root, "apps", "desktop");
const localCli = path.join(
  desktop,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js"
);
const rootCli = path.join(
  root,
  "node_modules",
  "electron-builder",
  "out",
  "cli",
  "cli.js"
);

if (
  !fs.existsSync(localCli) &&
  !fs.existsSync(rootCli)
) {
  const install = spawnSync(
    process.execPath,
    [
      process.env.npm_execpath ||
        path.join(
          path.dirname(process.execPath),
          "node_modules",
          "npm",
          "bin",
          "npm-cli.js"
        ),
      "install",
      "--prefix",
      desktop
    ],
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

  if (install.status !== 0) {
    process.exit(install.status ?? 1);
  }
}

const cli = fs.existsSync(localCli) ? localCli : rootCli;
const args = process.argv.slice(2);
const outputArg = args.find((arg) =>
  arg.startsWith("--config.directories.output=")
);
const outputDir =
  outputArg?.split("=").slice(1).join("=") ||
  process.env.DESKTOP_OUTPUT ||
  "dist";

if (!outputArg && process.env.DESKTOP_OUTPUT) {
  args.push(
    `--config.directories.output=${process.env.DESKTOP_OUTPUT}`
  );
}

if (process.platform === "win32") {
  const running = spawnSync(
    "tasklist",
    [
      "/FI",
      "IMAGENAME eq Crypto Market Monitor.exe",
      "/NH"
    ],
    { encoding: "utf8", shell: false }
  );

  if (
    (running.stdout ?? "")
      .toLowerCase()
      .includes("crypto market monitor.exe")
  ) {
    console.error(
      "[desktop] Crypto Market Monitor 正在运行，app.asar 被占用。"
    );
    console.error(
      "[desktop] 请先完全退出程序后再执行 npm run desktop:pack。"
    );
    process.exit(1);
  }
}

const outputAsar = path.join(
  desktop,
  outputDir,
  "win-unpacked",
  "resources",
  "app.asar"
);

if (fs.existsSync(outputAsar)) {
  const lockProbe = `${outputAsar}.locktest`;

  try {
    fs.renameSync(outputAsar, lockProbe);
    fs.renameSync(lockProbe, outputAsar);
  } catch {
    console.error(
      "[desktop] app.asar 仍被其他进程占用，无法覆盖。"
    );
    console.error(
      "[desktop] 请关闭 Crypto Market Monitor、等待杀毒/资源管理器扫描结束后重试。"
    );
    process.exit(1);
  }
}

const result = spawnSync(process.execPath, [cli, ...args], {
  cwd: desktop,
  env: {
    ...process.env,
    ELECTRON_MIRROR:
      process.env.ELECTRON_MIRROR ||
      "https://npmmirror.com/mirrors/electron/",
    ELECTRON_BUILDER_BINARIES_MIRROR:
      process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
      "https://npmmirror.com/mirrors/electron-builder-binaries/"
  },
  stdio: "inherit",
  shell: false
});

process.exit(result.status ?? 1);
