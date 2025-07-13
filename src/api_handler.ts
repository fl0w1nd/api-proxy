import { isAuthenticated, unauthorized, validatePassword, generateJWT, loginSuccess, logoutSuccess } from "./auth.ts";
import { saveConfig } from "./config.ts";
import { requestLogs } from "./logger.ts";
import { tempRedirects, cleanupExpiredRedirects, generateRandomPath, saveTempRedirects } from "./redirects.ts";
import { state } from "./state.ts";
import { TempRedirect } from "./types.ts";

export const handleApiRequest = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 登录端点 - 不需要认证
    if (pathname === "/api/login" && request.method === "POST") {
        try {
            const body = await request.json();
            const { username, password } = body;

            if (!password) {
                return new Response(JSON.stringify({ success: false, error: "密码不能为空" }), {
                    status: 400,
                    headers: { "Content-Type": "application/json" },
                });
            }

            if (validatePassword(password)) {
                const token = await generateJWT("admin");
                return loginSuccess(token);
            } else {
                return new Response(JSON.stringify({ success: false, error: "密码错误" }), {
                    status: 401,
                    headers: { "Content-Type": "application/json" },
                });
            }
        } catch (error) {
            return new Response(JSON.stringify({ success: false, error: "请求格式错误" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
    }

    // 登出端点 - 需要认证
    if (pathname === "/api/logout" && request.method === "POST") {
        const isAuth = await isAuthenticated(request);
        if (!isAuth) {
            return unauthorized();
        }
        return logoutSuccess();
    }

    // 检查认证状态端点 - 不需要认证（用于前端检查状态）
    if (pathname === "/api/auth/status" && request.method === "GET") {
        const isAuth = await isAuthenticated(request);
        return new Response(JSON.stringify({ authenticated: isAuth }), {
            headers: { "Content-Type": "application/json" },
        });
    }

    // 需要认证的 API 端点
    if (pathname === "/api/config" || pathname === "/api/logs" || pathname.startsWith("/api/temp-redirects")) {
        const isAuth = await isAuthenticated(request);
        
        if (!isAuth) {
            return unauthorized();
        }

        if (pathname === "/api/config") {
            if (request.method === "GET") {
                return new Response(JSON.stringify(state.config), {
                    headers: { "Content-Type": "application/json" },
                });
            } else if (request.method === "PUT") {
                try {
                    const newConfig = await request.json();
                    const saveResult = await saveConfig(newConfig);

                    if (saveResult) {
                        state.config = newConfig;
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
                // 更新临时转发配置
                if (tempRedirects.has(pathId)) {
                    try {
                        const body = await request.json();
                        const { name, target_url, extra_headers, timeout, connect_timeout, redirect_only } = body;

                        // 验证必填字段
                        if (name !== undefined && (!name || !name.trim())) {
                            return new Response(JSON.stringify({ success: false, error: "Name cannot be empty" }), {
                                status: 400,
                                headers: { "Content-Type": "application/json" },
                            });
                        }

                        if (target_url !== undefined && (!target_url || !target_url.trim())) {
                            return new Response(JSON.stringify({ success: false, error: "Target URL cannot be empty" }), {
                                status: 400,
                                headers: { "Content-Type": "application/json" },
                            });
                        }

                        const redirect = tempRedirects.get(pathId)!;

                        // 更新字段（只更新提供的字段）
                        if (name !== undefined) {
                            redirect.name = name.trim();
                        }
                        if (target_url !== undefined) {
                            redirect.target_url = target_url.trim();
                        }
                        if (extra_headers !== undefined) {
                            redirect.extra_headers = extra_headers;
                        }
                        if (timeout !== undefined) {
                            redirect.timeout = timeout;
                        }
                        if (connect_timeout !== undefined) {
                            redirect.connect_timeout = connect_timeout;
                        }
                        if (redirect_only !== undefined) {
                            redirect.redirect_only = redirect_only;
                        }

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
