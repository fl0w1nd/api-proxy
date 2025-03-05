import { serve } from "https://deno.land/std/http/server.ts";
import { cyan, green, yellow, red } from "https://deno.land/std/fmt/colors.ts";

interface Config {
  api_mappings: Record<string, {
    target_url: string;
    extra_headers?: Record<string, string>;
  }>;
  log_level: string;
}

const loadConfig = async (): Promise<Config> => {
  try {
    const configText = await Deno.readTextFile("./config/config.json");
    return JSON.parse(configText);
  } catch (error) {
    console.error("Config load failed:", red(error.message));
    Deno.exit(1);
  }
};

const config = await loadConfig();


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

const handler = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const pathname = url.pathname;

  for (const [prefix, routeConfig] of Object.entries(config.api_mappings)) {
    if (pathname.startsWith(prefix)) {
      const targetUrl = `${routeConfig.target_url}${pathname.replace(prefix, "")}${url.search}`;
      log("info", `Proxying ${pathname} to ${targetUrl}`);

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
        });

        return new Response(response.body, {
          status: response.status,
          headers: response.headers,
        });
      } catch (error) {
        log("error", `API ${pathname} failed: ${error.message}`);
        return new Response(`API Connection Failed: ${error.message}`, { status: 502 });
      }
    }
  }

  log("warn", `Path not found: ${pathname}`);
  return new Response("Path not configured", { status: 404 });
};

serve(handler, { port: 5000 });
console.log(green("🚀 Proxy running on port 5000"));