const { app, BrowserWindow, Menu, shell } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_URL = "http://localhost:3000";
const FALLBACK_URL = "http://***prod-url***/";

function readConfiguredUrl() {
  const candidates = [
    process.env.MONITOR_URL,
    process.resourcesPath
      ? path.join(process.resourcesPath, "app-config.json")
      : null,
    path.join(__dirname, "config.json")
  ];

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    try {
      if (candidate === process.env.MONITOR_URL) {
        return candidate;
      }

      const value = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (typeof value.url === "string" && value.url.trim()) {
        return value.url.trim();
      }
    } catch {
      // Try the next configuration source.
    }
  }

  return DEFAULT_URL;
}

function normalizeUrl(raw) {
  try {
    const url = new URL(raw);
    return url.toString();
  } catch {
    return DEFAULT_URL;
  }
}

app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-backgrounding-occluded-windows");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  let mainWindow = null;
  const monitorUrl = normalizeUrl(
    process.env.MONITOR_URL || readConfiguredUrl()
  );

  app.setAppUserModelId("com.crypto.marketmonitor");

  function createWindow() {
    mainWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 640,
      backgroundColor: "#080d14",
      show: false,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true
      }
    });

    mainWindow.once("ready-to-show", () => {
      mainWindow.show();
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) {
        void shell.openExternal(url);
      }

      return { action: "deny" };
    });

    mainWindow.loadURL(monitorUrl).catch(() => {
      mainWindow
        .loadURL(FALLBACK_URL)
        .catch(() => {
          mainWindow.loadURL(
            `data:text/html;charset=utf-8,${encodeURIComponent(
              `<body style="background:#080d14;color:#dbe4ef;font-family:system-ui;padding:40px">
                <h1>Crypto Market Monitor</h1>
                <p>无法连接监控页面。</p>
                <p>当前地址：${monitorUrl}</p>
                <p>备用地址：${FALLBACK_URL}</p>
                <p>请确认服务已经启动，然后按 Ctrl+R 重试。</p>
              </body>`
            )}`
          );
        });
    });

    mainWindow.on("closed", () => {
      mainWindow = null;
    });

    return mainWindow;
  }

  app.on("second-instance", () => {
    if (!mainWindow) {
      createWindow();
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
