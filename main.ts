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
  // 新增字段
  requestHeaders: {
    original: Record<string, string>;  // 用户原始请求头
    proxy: Record<string, string>;     // 代理发送的请求头
    added: Record<string, string>;     // 代理添加的请求头
    modified: Record<string, string>;  // 代理修改的请求头
  };
  responseHeaders: Record<string, string>;
  metadata: {
    requestSize: number;
    responseSize: number;
    contentType: string;
    userAgent: string;
  };
}

interface TempRedirect {
  id: string;
  name: string; // 显示名称，默认为随机路径（不含/）
  path: string; // 5位随机字符串路径，如 /F5i1S
  target_url: string;
  extra_headers?: Record<string, string>;
  timeout?: number; // 请求超时时间（毫秒）
  connect_timeout?: number; // 连接超时时间（毫秒）
  redirect_only?: boolean; // 是否仅跳转，而不代理请求
  created_at: number; // 创建时间戳
  expires_at: number; // 过期时间戳
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

// 临时转发存储
const tempRedirects: Map<string, TempRedirect> = new Map();

// 加载临时转发数据
const loadTempRedirects = async (): Promise<void> => {
  try {
    const data = await Deno.readTextFile(TEMP_REDIRECTS_FILE_PATH);
    const redirectsArray: TempRedirect[] = JSON.parse(data);
    
    // 清理过期的转发并加载有效的转发
    const now = Date.now();
    let hasExpired = false;
    
    for (const redirect of redirectsArray) {
      if (redirect.expires_at === -1 || redirect.expires_at > now) {
        tempRedirects.set(redirect.id, redirect);
      } else {
        hasExpired = true;
        log("info", `Expired temporary redirect skipped during load: ${redirect.id}`);
      }
    }
    
    // 如果有过期的转发，保存清理后的数据
    if (hasExpired) {
      await saveTempRedirects();
    }
    
    log("info", `Loaded ${tempRedirects.size} temporary redirects from file`);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      log("info", "No temporary redirects file found, starting with empty state");
    } else {
      log("error", `Failed to load temporary redirects: ${error.message}`);
    }
  }
};

// 保存临时转发数据
const saveTempRedirects = async (): Promise<void> => {
  try {
    const redirectsArray = Array.from(tempRedirects.values());
    await Deno.writeTextFile(TEMP_REDIRECTS_FILE_PATH, JSON.stringify(redirectsArray, null, 2));
  } catch (error) {
    log("error", `Failed to save temporary redirects: ${error.message}`);
  }
};

// 生成5位随机字符串（大小写字母+数字）
const generateRandomPath = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 清理过期的临时转发
const cleanupExpiredRedirects = async () => {
  const now = Date.now();
  let hasExpired = false;
  
  for (const [path, redirect] of tempRedirects.entries()) {
    if (redirect.expires_at !== -1 && now > redirect.expires_at) {
      tempRedirects.delete(path);
      hasExpired = true;
      log("info", `Expired temporary redirect removed: ${path}`);
    }
  }
  
  // 如果有过期的转发被删除，保存到文件
  if (hasExpired) {
    await saveTempRedirects();
  }
};

// 定期清理过期的临时转发（每分钟检查一次）
setInterval(cleanupExpiredRedirects, 60000);

// 处理文件下载的响应头
const processFileDownloadHeaders = (responseHeaders: Headers, targetUrl: string): void => {
  // 处理文件下载的文件名
  if (!responseHeaders.get('content-disposition')) {
    const urlPath = new URL(targetUrl).pathname;
    const fileName = urlPath.split('/').pop();
    
    // 如果URL路径中有文件名（包含扩展名），设置Content-Disposition
    if (fileName && fileName.includes('.')) {
      // 对文件名进行URL解码，处理可能的编码字符
      const decodedFileName = decodeURIComponent(fileName);
      responseHeaders.set('content-disposition', `attachment; filename="${decodedFileName}"; filename*=UTF-8''${encodeURIComponent(decodedFileName)}`);
    }
  }
  
  // 如果是常见的文件类型，确保设置正确的Content-Type
  const contentType = responseHeaders.get('content-type');
  if (!contentType || contentType === 'application/octet-stream') {
    const urlPath = new URL(targetUrl).pathname;
    const fileName = urlPath.split('/').pop();
    if (fileName) {
      const ext = fileName.split('.').pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        'exe': 'application/octet-stream',
        'msi': 'application/octet-stream',
        'dmg': 'application/octet-stream',
        'zip': 'application/zip',
        'rar': 'application/x-rar-compressed',
        '7z': 'application/x-7z-compressed',
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls': 'application/vnd.ms-excel',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt': 'text/plain',
        'json': 'application/json',
        'xml': 'application/xml',
        'csv': 'text/csv',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'svg': 'image/svg+xml',
        'mp4': 'video/mp4',
        'mp3': 'audio/mpeg',
        'wav': 'audio/wav'
      };
      
      if (ext && mimeTypes[ext]) {
        responseHeaders.set('content-type', mimeTypes[ext]);
      }
    }
  }
};

// 管理员密码，默认从环境变量获取，如果没有则使用默认值
const ADMIN_PASSWORD = Deno.env.get("ADMIN_PASSWORD") || "admin";

const CONFIG_FILE_PATH = "./config/config.json";
const TEMP_REDIRECTS_FILE_PATH = "./config/temp-redirects.json";

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
    if (pathname === "/api/config" || pathname === "/api/logs" || pathname.startsWith("/api/temp-redirects")) {
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
      } else if (pathname === "/api/temp-redirects") {
        // 临时转发管理API
        if (request.method === "GET") {
          // 获取所有临时转发
          cleanupExpiredRedirects(); // 清理过期的
          const redirects = Array.from(tempRedirects.values());
          return new Response(JSON.stringify(redirects), {
            headers: { "Content-Type": "application/json" },
          });
        } else if (request.method === "POST") {
          // 创建新的临时转发
          try {
            const body = await request.json();
            const { target_url, expires_in, extra_headers, timeout, connect_timeout, redirect_only } = body;
            
            if (!target_url || expires_in === undefined) {
              return new Response(JSON.stringify({ success: false, error: "Missing required fields" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }
            
            // 生成唯一路径
            let path: string;
            do {
              path = generateRandomPath();
            } while (tempRedirects.has(path));
            
            const now = Date.now();
            const redirect: TempRedirect = {
              id: path,
              name: path, // 默认名称为随机路径（不含/）
              path: `/${path}`,
              target_url,
              extra_headers,
              timeout,
              connect_timeout,
              redirect_only: redirect_only || false, // 默认不代理
              created_at: now,
              expires_at: expires_in === -1 ? -1 : now + (expires_in * 1000), // -1 表示永久
            };
            
            tempRedirects.set(path, redirect);
            
            // 保存到文件
            await saveTempRedirects();
            
            return new Response(JSON.stringify({ success: true, redirect }), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (error) {
            return new Response(JSON.stringify({ success: false, error: error.message }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }
        } else {
          return new Response("Method Not Allowed", { status: 405 });
        }
      } else if (pathname.startsWith("/api/temp-redirects/")) {
        // 删除或更新特定的临时转发
        const pathId = pathname.replace("/api/temp-redirects/", "");
        if (request.method === "DELETE") {
          if (tempRedirects.has(pathId)) {
            tempRedirects.delete(pathId);
            
            // 保存到文件
            await saveTempRedirects();
            
            return new Response(JSON.stringify({ success: true }), {
              headers: { "Content-Type": "application/json" },
            });
          } else {
            return new Response(JSON.stringify({ success: false, error: "Redirect not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
        } else if (request.method === "PUT") {
          // 更新临时转发名称
          if (tempRedirects.has(pathId)) {
            try {
              const body = await request.json();
              const { name } = body;
              
              if (!name || !name.trim()) {
                return new Response(JSON.stringify({ success: false, error: "Name is required" }), {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                });
              }
              
              const redirect = tempRedirects.get(pathId)!;
              redirect.name = name.trim();
              tempRedirects.set(pathId, redirect);
              
              // 保存到文件
              await saveTempRedirects();
              
              return new Response(JSON.stringify({ success: true, redirect }), {
                headers: { "Content-Type": "application/json" },
              });
            } catch (error) {
              return new Response(JSON.stringify({ success: false, error: error.message }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
              });
            }
          } else {
            return new Response(JSON.stringify({ success: false, error: "Redirect not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            });
          }
        } else {
          return new Response("Method Not Allowed", { status: 405 });
        }
      }
    }
    
    return new Response("Not Found", { status: 404 });
  }

  // 检查临时转发路径（优先级高于API映射）
  cleanupExpiredRedirects(); // 清理过期的临时转发
  
  // 检查是否匹配临时转发路径（格式：/xxxxx）
  const pathMatch = pathname.match(/^\/([A-Za-z0-9]{5})$/);
  if (pathMatch) {
    const pathId = pathMatch[1];
    const tempRedirect = tempRedirects.get(pathId);
    
    if (tempRedirect) {
      // 检查是否过期（永久转发不会过期）
      if (tempRedirect.expires_at !== -1 && Date.now() > tempRedirect.expires_at) {
        tempRedirects.delete(pathId);
        // 异步保存，不等待完成
        saveTempRedirects().catch(err => log("error", `Failed to save after expiry: ${err.message}`));
        log("info", `Expired temporary redirect removed: ${pathId}`);
        return new Response("Temporary redirect has expired", { status: 410 });
      }
      
      // 302 重定向
      if (tempRedirect.redirect_only) {
        log("info", `Redirecting ${pathname} to ${tempRedirect.target_url}`);
        return new Response(null, {
          status: 302,
          headers: {
            "Location": `${tempRedirect.target_url}${url.search}`,
            "Content-Type": "text/plain",
            "Content-Length": "0",
          },
        });
      }

      const targetUrl = `${tempRedirect.target_url}${url.search}`;
      log("info", `Proxying ${pathname} to ${targetUrl}`);
      
      const startTime = performance.now();
      
      // 获取超时配置
      const requestTimeout = tempRedirect.timeout || config.default_timeout || 60000;
      const connectTimeout = tempRedirect.connect_timeout || config.default_connect_timeout || 15000;
      
      // 创建 AbortController 用于超时控制
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        abortController.abort();
      }, requestTimeout);
      
      try {
        const headers = new Headers(request.headers);

        if (tempRedirect.extra_headers) {
          for (const [key, value] of Object.entries(tempRedirect.extra_headers)) {
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

        // 处理响应头，特别是文件下载相关的头信息
        const responseHeaders = new Headers(response.headers);
        processFileDownloadHeaders(responseHeaders, targetUrl);

        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders,
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
          log("warn", `Temporary redirect timeout for ${pathname}: ${requestTimeout}ms exceeded`);
        } else {
          log("error", `Temporary redirect ${pathname} failed: ${error.message}`);
        }
        
        // 临时转发不记录日志
        
        return new Response(`Temporary Redirect Failed: ${errorMessage}`, { status: status });
      }
    }
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
        
        // 计算请求头差异
        const originalHeaders = Object.fromEntries(request.headers.entries());
        const proxyHeaders = Object.fromEntries(headers.entries());
        const addedHeaders: Record<string, string> = {};
        const modifiedHeaders: Record<string, string> = {};
        
        // 找出新增和修改的请求头
        for (const [key, value] of Object.entries(proxyHeaders)) {
          const lowerKey = key.toLowerCase();
          const originalValue = originalHeaders[key] || 
                               Object.keys(originalHeaders).find(k => k.toLowerCase() === lowerKey) 
                               ? originalHeaders[Object.keys(originalHeaders).find(k => k.toLowerCase() === lowerKey)!] 
                               : undefined;
          
          if (originalValue === undefined) {
            addedHeaders[key] = value;
          } else if (originalValue !== value) {
            modifiedHeaders[key] = value;
          }
        }
        
        // 记录请求日志
        saveRequestLog(prefix, {
          timestamp: new Date().toISOString(),
          method: request.method,
          path: pathname + url.search,
          targetUrl,
          status: response.status,
          duration: Math.round(endTime - startTime),
          // 新增字段
          requestHeaders: {
            original: originalHeaders,
            proxy: proxyHeaders,
            added: addedHeaders,
            modified: modifiedHeaders
          },
          responseHeaders: Object.fromEntries(response.headers.entries()),
          metadata: {
            requestSize: request.headers.get('content-length') ? parseInt(request.headers.get('content-length')!, 10) : 0,
            responseSize: response.headers.get('content-length') ? parseInt(response.headers.get('content-length')!, 10) : 0,
            contentType: response.headers.get('content-type') || '',
            userAgent: request.headers.get('user-agent') || '',
          }
        });

        // 处理响应头，特别是文件下载相关的头信息
        const responseHeaders = new Headers(response.headers);
        processFileDownloadHeaders(responseHeaders, targetUrl);

        return new Response(response.body, {
          status: response.status,
          headers: responseHeaders,
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
        
        // 计算请求头差异（错误情况）
        const originalHeaders = Object.fromEntries(request.headers.entries());
        const proxyHeaders = Object.fromEntries(headers.entries());
        const addedHeaders: Record<string, string> = {};
        const modifiedHeaders: Record<string, string> = {};
        
        // 找出新增和修改的请求头
        for (const [key, value] of Object.entries(proxyHeaders)) {
          const lowerKey = key.toLowerCase();
          const originalValue = originalHeaders[key] || 
                               Object.keys(originalHeaders).find(k => k.toLowerCase() === lowerKey) 
                               ? originalHeaders[Object.keys(originalHeaders).find(k => k.toLowerCase() === lowerKey)!] 
                               : undefined;
          
          if (originalValue === undefined) {
            addedHeaders[key] = value;
          } else if (originalValue !== value) {
            modifiedHeaders[key] = value;
          }
        }
        
        // 记录错误请求日志
        saveRequestLog(prefix, {
          timestamp: new Date().toISOString(),
          method: request.method,
          path: pathname + url.search,
          targetUrl,
          status: status,
          duration: Math.round(endTime - startTime),
          // 新增字段
          requestHeaders: {
            original: originalHeaders,
            proxy: proxyHeaders,
            added: addedHeaders,
            modified: modifiedHeaders
          },
          responseHeaders: {}, // 没有响应头
          metadata: {
            requestSize: request.headers.get('content-length') ? parseInt(request.headers.get('content-length')!, 10) : 0,
            responseSize: 0,
            contentType: '',
            userAgent: request.headers.get('user-agent') || '',
          }
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

// 初始化配置和临时转发数据
let config = await loadConfig();
await loadTempRedirects();

serve(handler, { port: 5000 });
console.log(green("🚀 Proxy running on port 5000"));
console.log(green("📊 WebUI available at http://localhost:5000"));