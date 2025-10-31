import { log, saveRequestLog } from "./logger.ts";
import { tempRedirects, cleanupExpiredRedirects, saveTempRedirects } from "./redirects.ts";
import { state } from "./state.ts";
import { isInternalURL } from "./network_filter.ts";

// 处理文件下载的响应头
const processFileDownloadHeaders = (responseHeaders: Headers, targetUrl: string): void => {
    // 如果服务器已经明确指定了 content-disposition，则尊重服务器的意图
    if (responseHeaders.has('content-disposition')) {
        return;
    }

    const contentType = responseHeaders.get('content-type')?.split(';')[0].trim() || '';

    // 预设一组明确的“非下载”内容类型，当响应头匹配时，不进行任何修改
    const nonDownloadContentTypes = new Set([
        'text/html',
        'text/css',
        'text/plain', // Add text/plain to prevent download of raw text/code files
        'text/javascript', // Common for JS files
        'application/javascript', // Also common for JS files
        'application/json',
        'application/xml',
        'image/svg+xml', // SVGs are typically rendered inline
    ]);

    if (contentType && nonDownloadContentTypes.has(contentType)) {
        return; // 如果是明确的非下载类型，则不进行任何处理
    }

    // --- 以下逻辑仅在 Content-Type 不明确且没有 Content-Disposition 时执行 ---

    // 尝试从URL中推断文件名并设置 Content-Disposition
    const urlPath = new URL(targetUrl).pathname;
    const fileName = urlPath.split('/').pop();

    // 如果URL路径中有文件名（包含扩展名），则认为它是一个下载项
    if (fileName && fileName.includes('.')) {
        const decodedFileName = decodeURIComponent(fileName);
        responseHeaders.set('content-disposition', `attachment; filename="${decodedFileName}"; filename*=UTF-8''${encodeURIComponent(decodedFileName)}`);
    }

    // 如果 Content-Type 是通用的或缺失的，尝试根据文件扩展名进行修正
    if (!contentType || contentType === 'application/octet-stream') {
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
                'csv': 'text/csv',
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
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

export const handleProxyRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const config = state.config!;

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

            // 检查目标 URL 是否为内网地址
            const internalCheck = isInternalURL(tempRedirect.target_url);
            if (internalCheck.isInternal) {
                log("warn", `Blocked internal network access: ${tempRedirect.target_url} - ${internalCheck.reason}`);
                return new Response(
                    `Access Denied: Proxy to internal network addresses is not allowed.\nReason: ${internalCheck.reason}`,
                    { status: 403 }
                );
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

                // 设置 Host 头为目标服务器的主机名
                const targetHost = new URL(tempRedirect.target_url).host;
                headers.set('Host', targetHost);

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
            // 检查目标 URL 是否为内网地址
            const internalCheck = isInternalURL(routeConfig.target_url);
            if (internalCheck.isInternal) {
                log("warn", `Blocked internal network access: ${routeConfig.target_url} - ${internalCheck.reason}`);
                return new Response(
                    `Access Denied: Proxy to internal network addresses is not allowed.\nReason: ${internalCheck.reason}`,
                    { status: 403 }
                );
            }

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

                // 设置 Host 头为目标服务器的主机名
                const targetHost = new URL(routeConfig.target_url).host;
                headers.set('Host', targetHost);

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
                const proxyHeaders = Object.fromEntries(new Headers(request.headers).entries());
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
}
