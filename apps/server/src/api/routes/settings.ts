import { Router } from "express";

import {
  getSetting,
  setSetting
} from "../../db/repo";
import { isServerchanConfigured } from "../../engine/notify";
import { failure, success } from "../middleware";

export const settingsRouter: Router = Router();

/**
 * 获取全局设置。
 * 不向前端返回 SendKey。
 */
settingsRouter.get("/", (_req, res) => {
  const globalWechatEnabled =
    getSetting("global_wechat_enabled") === "true";
  const globalMonitorEnabled =
    getSetting("global_monitor_enabled") !== "false";

  res.json(
    success({
      global_monitor_enabled: globalMonitorEnabled,
      global_wechat_enabled: globalWechatEnabled,
      serverchan_configured: isServerchanConfigured()
    })
  );
});

/**
 * 更新全局设置（支持只更新其中一个开关）。
 */
settingsRouter.put("/", (req, res) => {
  const body = req.body ?? {};
  const hasMonitor = body.global_monitor_enabled !== undefined;
  const hasWechat = body.global_wechat_enabled !== undefined;

  if (!hasMonitor && !hasWechat) {
    res.status(400).json(
      failure("至少提供一个全局设置项")
    );
    return;
  }

  if (
    hasMonitor &&
    typeof body.global_monitor_enabled !== "boolean"
  ) {
    res.status(400).json(
      failure("global_monitor_enabled 必须为布尔值")
    );
    return;
  }

  if (
    hasWechat &&
    typeof body.global_wechat_enabled !== "boolean"
  ) {
    res.status(400).json(
      failure("global_wechat_enabled 必须为布尔值")
    );
    return;
  }

  if (hasMonitor) {
    setSetting(
      "global_monitor_enabled",
      body.global_monitor_enabled ? "true" : "false"
    );
  }

  if (hasWechat) {
    setSetting(
      "global_wechat_enabled",
      body.global_wechat_enabled ? "true" : "false"
    );
  }

  res.json(
    success(
      {
        global_monitor_enabled:
          getSetting("global_monitor_enabled") !== "false",
        global_wechat_enabled:
          getSetting("global_wechat_enabled") === "true"
      },
      "全局设置已更新"
    )
  );
});
