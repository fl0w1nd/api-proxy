import { create, verify, getNumericDate } from "https://deno.land/x/djwt@v3.0.2/mod.ts";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";

// 管理员密码，默认从环境变量获取，如果没有则使用默认值
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin";

// JWT密钥，从环境变量获取或生成一个默认密钥
const JWT_SECRET = Deno.env.get("JWT_SECRET") || "your-secret-key-change-in-production";

// 将密钥转换为CryptoKey对象
const key = await crypto.subtle.importKey(
  "raw",
  new TextEncoder().encode(JWT_SECRET),
  { name: "HMAC", hash: "SHA-256" },
  false,
  ["sign", "verify"]
);

// JWT配置
const JWT_EXPIRY_HOURS = 24; // JWT有效期24小时
const COOKIE_NAME = "auth_token";

// 生成JWT令牌
export const generateJWT = async (username: string): Promise<string> => {
  const payload = {
    sub: username,
    iat: getNumericDate(new Date()),
    exp: getNumericDate(new Date(Date.now() + JWT_EXPIRY_HOURS * 60 * 60 * 1000)),
  };

  return await create({ alg: "HS256", typ: "JWT" }, payload, key);
};

// 验证JWT令牌
export const verifyJWT = async (token: string): Promise<{ sub: string } | null> => {
  try {
    const payload = await verify(token, key);
    return payload as { sub: string };
  } catch (error) {
    console.error("JWT验证失败:", error);
    return null;
  }
};

// 验证用户凭证（简化为只验证密码）
export const validatePassword = (password: string): boolean => {
  return password === ADMIN_PASSWORD;
};

// 从Cookie中提取JWT令牌
export const extractJWTFromCookie = (request: Request): string | null => {
  const cookieHeader = request.headers.get("Cookie");
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";").map(c => c.trim());
  for (const cookie of cookies) {
    const [name, value] = cookie.split("=");
    if (name === COOKIE_NAME) {
      return value;
    }
  }
  return null;
};

// 检查是否是管理员身份（新的JWT验证方式）
export const isAuthenticated = async (request: Request): Promise<boolean> => {
  const token = extractJWTFromCookie(request);
  if (!token) return false;

  const payload = await verifyJWT(token);
  return payload !== null;
};

// 移除Basic认证相关代码，简化认证逻辑
// 如果需要API客户端访问，可以考虑使用API密钥的方式

// 创建HttpOnly Cookie
export const createAuthCookie = (token: string): string => {
  const maxAge = JWT_EXPIRY_HOURS * 60 * 60; // 24小时，以秒为单位
  const isDevelopment = Deno.env.get("NODE_ENV") !== "production";
  
  // 在开发环境中不使用Secure属性（因为使用HTTP而不是HTTPS）
  const secureFlag = isDevelopment ? "" : " Secure;";
  
  return `${COOKIE_NAME}=${token}; HttpOnly;${secureFlag} SameSite=Strict; Max-Age=${maxAge}; Path=/`;
};

// 创建清除Cookie的响应头
export const createLogoutCookie = (): string => {
  const isDevelopment = Deno.env.get("NODE_ENV") !== "production";
  const secureFlag = isDevelopment ? "" : " Secure;";
  
  return `${COOKIE_NAME}=; HttpOnly;${secureFlag} SameSite=Strict; Max-Age=0; Path=/`;
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

// 登录成功响应
export const loginSuccess = (token: string): Response => {
  const cookieValue = createAuthCookie(token);
  
  return new Response(JSON.stringify({ success: true, message: "登录成功" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": cookieValue,
    },
  });
};

// 登出成功响应
export const logoutSuccess = (): Response => {
  return new Response(JSON.stringify({ success: true, message: "已退出登录" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Set-Cookie": createLogoutCookie(),
    },
  });
};
