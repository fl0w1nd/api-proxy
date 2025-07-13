import { log } from "./logger.ts";
import { TempRedirect } from "./types.ts";

const TEMP_REDIRECTS_FILE_PATH = "./config/temp-redirects.json";
export const tempRedirects: Map<string, TempRedirect> = new Map();

// 加载临时转发数据
export const loadTempRedirects = async (): Promise<void> => {
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
export const saveTempRedirects = async (): Promise<void> => {
  try {
    const redirectsArray = Array.from(tempRedirects.values());
    await Deno.writeTextFile(TEMP_REDIRECTS_FILE_PATH, JSON.stringify(redirectsArray, null, 2));
  } catch (error) {
    log("error", `Failed to save temporary redirects: ${error.message}`);
  }
};

// 生成5位随机字符串（大小写字母+数字）
export const generateRandomPath = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// 清理过期的临时转发
export const cleanupExpiredRedirects = async () => {
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
