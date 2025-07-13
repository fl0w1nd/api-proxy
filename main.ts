import { serve } from "https://deno.land/std/http/server.ts";
import { green, red } from "https://deno.land/std/fmt/colors.ts";
import { loadConfig } from "./src/config.ts";
import { loadTempRedirects, cleanupExpiredRedirects } from "./src/redirects.ts";
import { serveStaticFile } from "./src/static.ts";
import { handleApiRequest } from "./src/api_handler.ts";
import { handleProxyRequest } from "./src/proxy_handler.ts";
import { state } from "./src/state.ts";

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
    return handleApiRequest(request);
  }

  // 代理请求
  return handleProxyRequest(request);
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

// 定期清理过期的临时转发（每分钟检查一次）
setInterval(cleanupExpiredRedirects, 60000);

// 初始化配置和临时转发数据
state.config = await loadConfig();
await loadTempRedirects();

serve(handler, { port: 5000 });
console.log(green("🚀 Proxy running on port 5000"));
console.log(green("📊 WebUI available at http://localhost:5000"));
