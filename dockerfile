FROM denoland/deno:alpine

WORKDIR /app

# 复制配置文件目录
COPY config ./config
COPY main.ts .

# 创建并复制静态文件目录
RUN mkdir -p ./static
COPY static ./static

# 预加载依赖
RUN deno cache --reload main.ts

# 环境变量设置
ENV ADMIN_PASSWORD=admin

EXPOSE 5000
CMD ["run", "--allow-all", "main.ts"]



