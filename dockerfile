FROM denoland/deno:alpine

WORKDIR /app

# 复制配置文件目录
COPY config ./config
COPY main.ts .

EXPOSE 5000
CMD ["run", "--allow-all", "main.ts"]



