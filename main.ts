import { serve } from "https://deno.land/std/http/server.ts";
import { cyan, green, yellow, red } from "https://deno.land/std/fmt/colors.ts";
import { decodeBase64 } from "https://deno.land/std/encoding/base64.ts";
import * as path from "https://deno.land/std/path/mod.ts";

// 添加请求日志存储
interface RequestLog {
  timestamp: string;
  method: string;
  path: string;
  targetUrl: string;
  status: number;
  duration: number;
}

interface Config {
  api_mappings: Record<string, {
    name?: string; // 映射名称，默认为"default"
    target_url: string;
    extra_headers?: Record<string, string>;
    timeout?: number; // 请求超时时间（毫秒）
    connect_timeout?: number; // 连接超时时间（毫秒）
  }>;
  log_level: string;
  default_timeout?: number; // 默认请求超时时间（毫秒）
  default_connect_timeout?: number; // 默认连接超时时间（毫秒）
}

// 请求日志存储，按路径前缀分组
const requestLogs: Record<string, RequestLog[]> = {};
// 最多保存每个路径的最近100条日志
const MAX_LOGS_PER_PATH = 100;

// 管理员密码，默认从环境变量获取，如果没有则使用默认值
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin";

const CONFIG_FILE_PATH = "./config/config.json";

// 默认配置模板
const DEFAULT_CONFIG: Config = {
  api_mappings: {
    "/default/": {
      name: "default",
      target_url: "https://example.com/api",
      extra_headers: {
        "X-Proxy-User": "default"
      },
      timeout: 30000, // 30秒请求超时
      connect_timeout: 10000 // 10秒连接超时
    }
  },
  log_level: "info",
  default_timeout: 60000, // 默认60秒请求超时
  default_connect_timeout: 15000 // 默认15秒连接超时
};

const loadConfig = async (): Promise<Config> => {
  try {
    const configText = await Deno.readTextFile(CONFIG_FILE_PATH);
    const config = JSON.parse(configText);
    
    // 配置迁移：为没有名称的映射添加默认名称
    let needsSave = false;
    for (const [prefix, mapping] of Object.entries(config.api_mappings)) {
      if (!mapping.name) {
        mapping.name = "default";
        needsSave = true;
      }
    }
    
    // 如果有配置变更，保存配置
    if (needsSave) {
      console.log(`${new Date().toISOString()} [INFO] Migrating config: adding default names to mappings`);
      await Deno.writeTextFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
    }
    
    return config;
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      // 配置文件不存在，创建默认配置
      console.log(`${new Date().toISOString()} [INFO] Config file not found, creating default config`);
      try {
        // 确保 config 目录存在
        try {
          await Deno.mkdir("./config", { recursive: true });
        } catch (dirError) {
          // 如果目录已存在，忽略错误
          if (!(dirError instanceof Deno.errors.AlreadyExists)) {
            throw dirError;
          }
        }
        
        // 写入默认配置
        await Deno.writeTextFile(CONFIG_FILE_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
        return DEFAULT_CONFIG;
      } catch (createError) {
        console.error("Failed to create default config:", red(createError.message));
        Deno.exit(1);
      }
    } else {
      console.error("Config load failed:", red(error.message));
      Deno.exit(1);
    }
  }
};

const saveConfig = async (config: Config): Promise<boolean> => {
  try {
    await Deno.writeTextFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Config save failed:", red(error.message));
    return false;
  }
};

let config = await loadConfig();

const log = (level: string, message: string) => {
  if (config.log_level === "debug" || (config.log_level === "info" && level !== "debug")) {
    const timestamp = new Date().toISOString();
    let colorFunc = cyan;
    if (level === "info") colorFunc = green;
    else if (level === "warn") colorFunc = yellow;
    else if (level === "error") colorFunc = red;

    console.log(`${timestamp} [${colorFunc(level.toUpperCase())}] ${message}`);
  }
};

const saveRequestLog = (prefix: string, log: RequestLog) => {
  if (!requestLogs[prefix]) {
    requestLogs[prefix] = [];
  }
  
  requestLogs[prefix].unshift(log);
  
  // 限制日志数量
  if (requestLogs[prefix].length > MAX_LOGS_PER_PATH) {
    requestLogs[prefix] = requestLogs[prefix].slice(0, MAX_LOGS_PER_PATH);
  }
};

// 检查是否是管理员身份
const isAuthenticated = (request: Request): boolean => {
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
const unauthorized = (): Response => {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Admin Area"',
    },
  });
};

// 服务静态文件
const serveStaticFile = async (filePath: string, contentType: string): Promise<Response> => {
  try {
    const data = await Deno.readFile(`./static/${filePath}`);
    return new Response(data, {
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    return new Response("Not Found", { status: 404 });
  }
};

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;
  
  // 处理 WebUI 路由
  if (pathname === "/" || pathname === "/index.html") {
    return serveStaticFile("index.html", "text/html");
  }
  
  if (pathname.startsWith("/static/")) {
    const filePath = pathname.replace("/static/", "");
    let contentType = "text/plain";
    
    if (filePath.endsWith(".css")) contentType = "text/css";
    else if (filePath.endsWith(".js")) contentType = "application/javascript";
    else if (filePath.endsWith(".html")) contentType = "text/html";
    else if (filePath.endsWith(".svg")) contentType = "image/svg+xml";
    else if (filePath.endsWith(".png")) contentType = "image/png";
    
    return serveStaticFile(filePath, contentType);
  }
  
  // API 路由
  if (pathname.startsWith("/api/")) {
    // 需要认证的 API 端点
    if (pathname === "/api/config" || pathname === "/api/logs") {
      if (!isAuthenticated(request)) {
        return unauthorized();
      }
      
      if (pathname === "/api/config") {
        if (request.method === "GET") {
          return new Response(JSON.stringify(config), {
            headers: { "Content-Type": "application/json" },
          });
        } else if (request.method === "PUT") {
          try {
            const newConfig = await request.json();
            const saveResult = await saveConfig(newConfig);
            
            if (saveResult) {
              config = newConfig;
              return new Response(JSON.stringify({ success: true }), {
                headers: { "Content-Type": "application/json" },
              });
            } else {
              return new Response(JSON.stringify({ success: false, error: "Failed to save config" }), {
                status: 500,
                headers: { "Content-Type": "application/json" },
              });
            }
          } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error.message }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
        } else {
          return new Response("Method Not Allowed", { status: 405 });
        }
      } else if (pathname === "/api/logs") {
        const prefix = url.searchParams.get("prefix");
        
        if (prefix && requestLogs[prefix]) {
          return new Response(JSON.stringify(requestLogs[prefix]), {
            headers: { "Content-Type": "application/json" },
          });
        } else if (!prefix) {
          return new Response(JSON.stringify(Object.keys(requestLogs)), {
            headers: { "Content-Type": "application/json" },
          });
        } else {
          return new Response(JSON.stringify([]), {
            headers: { "Content-Type": "application/json" },
          });
        }
      }
    }
    
    return new Response("Not Found", { status: 404 });
  }

  // 代理 API 请求
  for (const [prefix, routeConfig] of Object.entries(config.api_mappings)) {
    if (pathname.startsWith(prefix)) {
      const targetUrl = `${routeConfig.target_url}${pathname.replace(prefix, "")}${url.search}`;
      log("info", `Proxying ${pathname} to ${targetUrl}`);
      
      const startTime = performance.now();
      
      // 获取超时配置
      const requestTimeout = routeConfig.timeout || config.default_timeout || 60000;
      const connectTimeout = routeConfig.connect_timeout || config.default_connect_timeout || 15000;
      
      // 创建 AbortController 用于超时控制
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, requestTimeout);
      
      try {
        const headers = new Headers(request.headers);

        if (routeConfig.extra_headers) {
          for (const [key, value] of Object.entries(routeConfig.extra_headers)) {
            headers.set(key, value);
          }
        }

        const response = await fetch(targetUrl, {
          method: request.method,
          headers: headers,
          body: request.body,
          signal: abortController.signal,
        });
        
        clearTimeout(timeoutId);
        const endTime = performance.now();
        
        // 记录请求日志
        saveRequestLog(prefix, {
          timestamp: new Date().toISOString(),
          method: request.method,
          path: pathname + url.search,
          targetUrl,
          status: response.status,
          duration: Math.round(endTime - startTime),
        });

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      } catch (error) {
        clearTimeout(timeoutId);
        const endTime = performance.now();
        
        let status = 502;
        let errorMessage = error.message;
        
        // 检查是否是超时错误
        if (error.name === 'AbortError') {
          status = 504;
          errorMessage = `Request timeout after ${requestTimeout}ms`;
          log("warn", `Request timeout for ${pathname}: ${requestTimeout}ms exceeded`);
        } else {
          log("error", `API ${pathname} failed: ${error.message}`);
        }
        
        // 记录错误请求日志
        saveRequestLog(prefix, {
          timestamp: new Date().toISOString(),
          method: request.method,
          path: pathname + url.search,
          targetUrl,
          status: status,
          duration: Math.round(endTime - startTime),
        });
        
        return new Response(`API Connection Failed: ${errorMessage}`, { status: status });
      }
    }
  }

  log("warn", `Path not found: ${pathname}`);
  return new Response("Path not configured", { status: 404 });
};

// 确保静态文件目录存在
try {
  const staticDirInfo = await Deno.stat("./static");
  if (!staticDirInfo.isDirectory) {
    await Deno.mkdir("./static", { recursive: true });
    console.log(green("Static directory created"));
  } else {
    console.log(green("Static directory already exists"));
  }
} catch (error) {
  if (error instanceof Deno.errors.NotFound) {
    // 目录不存在，创建它
    await Deno.mkdir("./static", { recursive: true });
    console.log(green("Static directory created"));
  } else {
    console.error(red(`Failed to create static directory: ${error.message}`));
  }
}

serve(handler, { port: 5000 });
console.log(green("🚀 Proxy running on port 5000"));
console.log(green("📊 WebUI available at http://localhost:5000"));