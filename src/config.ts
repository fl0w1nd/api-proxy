import { red } from "https://deno.land/std/fmt/colors.ts";
import { Config } from "./types.ts";

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

export const loadConfig = async (): Promise<Config> => {
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

export const saveConfig = async (config: Config): Promise<boolean> => {
  try {
    await Deno.writeTextFile(CONFIG_FILE_PATH, JSON.stringify(config, null, 2));
    return true;
  } catch (error) {
    console.error("Config save failed:", red(error.message));
    return false;
  }
};
