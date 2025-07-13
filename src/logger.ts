import { cyan, green, yellow, red } from "https://deno.land/std/fmt/colors.ts";
import { state } from "./state.ts";

// 请求日志存储，按路径前缀分组
export const requestLogs: Record<string, RequestLog[]> = {};
// 最多保存每个路径的最近100条日志
const MAX_LOGS_PER_PATH = 100;

export const log = (level: string, message: string) => {
  if (state.config && (state.config.log_level === "debug" || (state.config.log_level === "info" && level !== "debug"))) {
    const timestamp = new Date().toISOString();
    let colorFunc = cyan;
    if (level === "info") colorFunc = green;
    else if (level === "warn") colorFunc = yellow;
    else if (level === "error") colorFunc = red;

    console.log(`${timestamp} [${colorFunc(level.toUpperCase())}] ${message}`);
  }
};

export const saveRequestLog = (prefix: string, log: RequestLog) => {
  if (!requestLogs[prefix]) {
    requestLogs[prefix] = [];
  }
  
  requestLogs[prefix].unshift(log);
  
  // 限制日志数量
  if (requestLogs[prefix].length > MAX_LOGS_PER_PATH) {
    requestLogs[prefix] = requestLogs[prefix].slice(0, MAX_LOGS_PER_PATH);
  }
};
