# syntax=docker/dockerfile:1

# ---------- 构建阶段 ----------
FROM node:22-alpine AS build
WORKDIR /app

# better-sqlite3 在 musl (alpine) 无预编译产物，需要本地编译
RUN apk add --no-cache python3 make g++

# 先复制清单安装依赖，最大化层缓存命中
COPY package*.json ./
COPY server/package.json server/
COPY frontend/package.json frontend/
# 有 lockfile 时用 npm ci 保证可复现；没有 lockfile 时回退到 npm install
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi

COPY . .
RUN npm run build -w frontend \
  && npm run build -w server \
  && npm prune --omit=dev

# ---------- 运行阶段 ----------
FROM node:22-alpine

LABEL org.opencontainers.image.title="PrintVault 印库" \
      org.opencontainers.image.description="自托管 3D 打印模型管理系统：项目与版本管理、STL/3MF/STEP/OBJ 在线预览、语音转文字备注" \
      org.opencontainers.image.url="https://hub.docker.com/r/feitianzzo/printvault" \
      org.opencontainers.image.source="https://github.com/feitianzzo/printvault" \
      org.opencontainers.image.licenses="MIT"

WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=8001 \
    HOST=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/frontend/dist ./frontend/dist
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /data
VOLUME /data
EXPOSE 8001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8001/api/stats > /dev/null || exit 1

CMD ["node", "server/dist/index.js"]
