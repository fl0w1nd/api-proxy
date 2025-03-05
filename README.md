# api-proxy
基于deno的一个简单的API转发器

这是一个基于 Deno 构建的轻量级、可配置的 API 代理转发器。它允许你通过简单的 JSON 配置文件，将不同的 URL 路径映射到不同的后端 API 服务。

## 启动方式

### 1. 普通 Docker 启动

```bash
docker run -d \
  -p <宿主机端口>:5000 \
  -v <本地配置文件路径>:/app/config/config.json \
  --name api-proxy \
  fl0w1nd/api-proxy:<标签>
```

**参数说明：**

-   `-d`: 后台运行容器。
-   `-p <宿主机端口>:5000`: 将容器的 5000 端口映射到宿主机的指定端口。
-   `-v <本地配置文件路径>:/app/config/config.json`: 将本地配置文件目录挂载到容器的 `/app/config/config.json`。
-   `--name api-proxy`: 给容器命名为 `api-proxy`。

**运行示例：**

```bash
docker run -d \
  -p 8080:5000 \
  -v ./config.json:/app/config/config.json \
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
      - <本地配置文件路径>:/app/config/config.json
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
