export async function api<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  let result: {
    success?: boolean;
    message?: string;
    data?: unknown;
  } = {};

  try {
    result = (await response.json()) as typeof result;
  } catch {
    result = {};
  }

  if (!response.ok || !result.success) {
    throw new Error(result.message || "请求失败");
  }

  return result.data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败";
}
