import type {
  NextFunction,
  Request,
  RequestHandler,
  Response
} from "express";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:3000";

/**
 * 统一 API 响应格式
 */
export function success(
  data: unknown,
  message = "操作成功"
): {
  success: true;
  message: string;
  data: unknown;
} {
  return {
    success: true,
    message,
    data
  };
}

export function failure(message: string): {
  success: false;
  message: string;
} {
  return {
    success: false,
    message
  };
}

/**
 * API 来源校验。
 *
 * 浏览器写请求必须来自配置的前端 Origin。
 * 不带 Origin 的服务端请求允许通过。
 */
export const apiOriginGuard: RequestHandler = (req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD") {
    next();
    return;
  }

  const origin = req.headers.origin;

  if (origin && origin !== FRONTEND_ORIGIN) {
    res.status(403).json(failure("请求来源不合法"));
    return;
  }

  next();
};

export function isPositiveInteger(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0
  );
}

export function isValidThreshold(
  value: unknown
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0
  );
}

export function isValidSymbol(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Z0-9]{2,30}$/.test(value)
  );
}

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json(failure("API 不存在"));
};

/**
 * 全局错误处理
 */
export function errorHandler(
  error: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[API] 未处理错误:", error);

  if (res.headersSent) {
    return;
  }

  res.status(500).json(failure("服务器内部错误"));
}
