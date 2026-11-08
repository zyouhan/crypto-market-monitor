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

  res.json(
    success({
      global_wechat_enabled: globalWechatEnabled,
      serverchan_configured: isServerchanConfigured()
    })
  );
});

/**
 * 更新全局设置
 */
settingsRouter.put("/", (req, res) => {
  const { global_wechat_enabled } = req.body ?? {};

  if (typeof global_wechat_enabled !== "boolean") {
    res.status(400).json(
      failure("global_wechat_enabled 必须为布尔值")
    );
    return;
  }

  setSetting(
    "global_wechat_enabled",
    global_wechat_enabled ? "true" : "false"
  );

  res.json(
    success(
      {
        global_wechat_enabled
      },
      "全局设置已更新"
    )
  );
});
