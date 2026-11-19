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
