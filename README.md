# api-proxy
这是一个基于 Deno 构建的轻量级、可配置的 API 代理转发器。它允许你通过简单的 JSON 配置文件，将不同的 URL 路径映射到不同的后端 API 服务。

**新功能**: 
- 支持WebUI界面，可以在浏览器中直观地管理配置和查看请求日志！
- 无需预先配置，系统启动时会自动创建默认配置文件

## 启动方式

### 1. 普通 Docker 启动

```bash
docker run -d \
  -p <宿主机端口>:5000 \
  -v <本地配置目录>:/app/config \
  -e ADMIN_PASSWORD=<管理密码> \
  --name api-proxy \
  fl0w1nd/api-proxy:main
```

**参数说明：**

-   `-d`: 后台运行容器。
-   `-p <宿主机端口>:5000`: 将容器的 5000 端口映射到宿主机的指定端口。
-   `-v <本地配置目录>:/app/config`: 将本地配置目录挂载到容器的 `/app/config`（系统会自动创建配置文件）。
-   `-e ADMIN_PASSWORD=<管理密码>`: 设置WebUI的管理员密码，默认为 `admin`。
-   `--name api-proxy`: 给容器命名为 `api-proxy`。

**运行示例：**

```bash
docker run -d \
  -p 8080:5000 \
  -v ./config:/app/config \
  -e ADMIN_PASSWORD=mypassword \
  --name my-proxy \
  fl0w1nd/api-proxy:main
```

---

### 2. Docker Compose 启动

创建一个 `docker-compose.yml` 文件：

```yaml
version: '3.8'
services:
  api-proxy:
    image: fl0w1nd/api-proxy:main
    ports:
      - "<宿主机端口>:5000"
    volumes:
      - <本地配置目录>:/app/config
    environment:
      - ADMIN_PASSWORD=<管理密码>  # 若不设置则默认为 admin
    restart: always
```

**启动：**

```bash
docker-compose up -d
```

**停止：**

```bash
docker-compose down
```

---

## 配置文件示例 (config.json)

> 注意：系统会在首次启动时自动创建默认配置文件，您可以通过WebUI或直接编辑该文件进行修改。

```json
{
  "api_mappings": {
    "/gemini": {
      "target_url": "https://generativelanguage.googleapis.com"
    },
    "/openai": {
      "target_url": "https://api.openai.com"
    },
    "/openrouter": {
      "target_url": "https://openrouter.ai/api",
      "extra_headers": {
        "HTTP-Referer": "https://example.com",
        "X-Title": "EXAMPLE"
      }
    },
    "/github": {
      "target_url": "https://models.inference.ai.azure.com"
    },
    "/xai": {
      "target_url": "https://api.x.ai"
    }
  },
  "log_level": "info"
}
```

**说明：**

-   `api_mappings`：定义 URL 路径前缀到后端 API 地址的映射。
-   可以添加任意多个映射。
-   `extra_headers`可添加自定义请求 header

---

## WebUI 管理界面

启动服务后，访问 `http://<宿主机IP>:<端口>` 即可打开WebUI管理界面。

### 主要功能

1. **配置管理**：可视化管理API代理配置
   - 添加、修改、删除API映射
   - 为每个API映射添加自定义请求头
   - 修改日志级别
   - 一键保存配置到本地文件

2. **请求日志**：查看每个API路径的请求日志
   - 按API前缀筛选日志
   - 显示请求方法、路径、目标URL、状态码和响应时间

### 安全性

WebUI界面受密码保护，密码通过环境变量 `ADMIN_PASSWORD` 设置。默认密码为 `admin`，强烈建议在生产环境中修改。
