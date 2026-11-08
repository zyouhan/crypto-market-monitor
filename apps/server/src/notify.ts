
import https from "node:https";

const SENDKEY = process.env.SERVERCHAN_SENDKEY || "";

interface ServerChanResponse {
  code?: number;
  message?: string;
  data?: unknown;
  errno?: number;
  error?: string;
}

/**
 * 发送 Server酱微信通知。
 *
 * 未配置 SendKey 时直接报错，由调用方决定如何记录错误。
 */
export async function sendWechatNotification(
  title: string,
  description: string
): Promise<void> {
  if (!SENDKEY) {
    throw new Error("SERVERCHAN_SENDKEY is not configured");
  }

  const url = new URL(
    `https://sctapi.ftqq.com/${encodeURIComponent(SENDKEY)}.send`
  );

  const body = new URLSearchParams({
    title,
    desp: description
  }).toString();

  await new Promise<void>((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body)
        },
        timeout: 15000
      },
      (response) => {
        let responseBody = "";

        response.setEncoding("utf8");

        response.on("data", (chunk: string) => {
          responseBody += chunk;
        });

        response.on("end", () => {
          const statusCode = response.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `Server酱 HTTP ${statusCode}: ${responseBody.slice(0, 500)}`
              )
            );
            return;
          }

          try {
            const result = JSON.parse(
              responseBody
            ) as ServerChanResponse;

            if (result.code !== 0) {
              reject(
                new Error(
                  `Server酱发送失败: ${result.message || result.error || responseBody.slice(0, 300)}`
                )
              );
              return;
            }

            resolve();
          } catch (error) {
            reject(
              error instanceof Error
                ? error
                : new Error("无法解析 Server酱响应")
            );
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("Server酱请求超时"));
    });

    request.on("error", reject);

    request.write(body);
    request.end();
  });
}
