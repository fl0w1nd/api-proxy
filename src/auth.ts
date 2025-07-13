import { decodeBase64 } from "https://deno.land/std/encoding/base64.ts";

// 管理员密码，默认从环境变量获取，如果没有则使用默认值
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin";

// 检查是否是管理员身份
export const isAuthenticated = (request: Request): boolean => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = new TextDecoder().decode(decodeBase64(base64Credentials));
  const [username, password] = credentials.split(":");

  return password === ADMIN_PASSWORD;
};

// 请求认证响应
export const unauthorized = (): Response => {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Area"',
    },
  });
};
