// 添加请求日志存储
export interface RequestLog {
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

export interface TempRedirect {
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

export interface Config {
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
