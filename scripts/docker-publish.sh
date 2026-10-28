#!/usr/bin/env bash
# 一键构建并发布 PrintVault 镜像到 Docker Hub
#
# 用法：
#   ./scripts/docker-publish.sh <dockerhub用户名> [标签]
#
# 示例：
#   ./scripts/docker-publish.sh zhangsan          # 发布 latest
#   ./scripts/docker-publish.sh zhangsan 1.0.0    # 发布 1.0.0 和 latest
#
# 前置条件：已安装 Docker，且已执行 docker login
set -euo pipefail

USER_NAME="${1:-}"
TAG="${2:-}"
IMAGE="${USER_NAME}/printvault"

if [[ -z "$USER_NAME" ]]; then
  echo "用法: $0 <dockerhub用户名> [标签]" >&2
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  echo "错误: Docker 未运行或当前用户无权限访问" >&2
  exit 1
fi

if ! docker info 2>/dev/null | grep -q "Username:"; then
  echo "提示: 尚未登录 Docker Hub，请先执行: docker login" >&2
  exit 1
fi

cd "$(dirname "$0")/.."

echo "==> 构建镜像 ${IMAGE}:latest"
docker compose build

if [[ -n "$TAG" ]]; then
  echo "==> 打标签 ${IMAGE}:${TAG}"
  docker tag "${IMAGE}:latest" "${IMAGE}:${TAG}"
fi

echo "==> 推送 ${IMAGE}:latest"
docker push "${IMAGE}:latest"

if [[ -n "$TAG" ]]; then
  echo "==> 推送 ${IMAGE}:${TAG}"
  docker push "${IMAGE}:${TAG}"
fi

echo
echo "完成。使用方式："
echo "  docker run -d --name printvault -p 8001:8001 -v \"\$PWD/data:/data\" --restart unless-stopped ${IMAGE}:latest"
