import { Router } from "express";

import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
  verifyCredentials
} from "../auth";
import { failure, success } from "../middleware";

export const authRouter: Router = Router();

authRouter.post("/login", (req, res) => {
  const { username, password } = req.body ?? {};

  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username ||
    !password
  ) {
    res.status(400).json(failure("请输入用户名和密码"));
    return;
  }

  if (!verifyCredentials(username, password)) {
    res.status(401).json(failure("用户名或密码错误"));
    return;
  }

  setSessionCookie(res, username);

  res.json(success({ username }, "登录成功"));
});

authRouter.post("/logout", (_req, res) => {
  clearSessionCookie(res);

  res.json(success(null, "已退出登录"));
});

authRouter.get("/me", requireAuth, (_req, res) => {
  res.json(
    success({
      authenticated: true,
      username: process.env.ADMIN_USERNAME
    })
  );
});
