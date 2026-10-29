# 印库 PrintVault

自托管的 3D 打印模型管理系统：按项目管理模型、在线预览 STL / 3MF / STEP / OBJ、自动缩略图、版本迭代管理、语音转文字备注。Docker 一键部署，桌面端与移动端自适应。

![技术栈](https://img.shields.io/badge/Vue3-Fastify-SQLite-teal)

## 功能

- **项目管理**：项目 CRUD、封面图（自动取用模型缩略图）、归档、统计（模型数 / 版本数 / 存储占用）
- **多格式预览**：STL、OBJ、3MF 由 three.js 解析；STEP 由 OpenCascade WASM（occt-import-js）在浏览器端解析，服务端无需 CAD 内核
- **3D 查看器**：旋转 / 平移 / 缩放（支持触摸手势）、线框模式、自动旋转、地面网格、复位视角、截图导出 PNG、尺寸 / 面数 / 体积悬浮显示
- **自动缩略图**：上传时在浏览器端离屏渲染 WebP 缩略图；缺失时列表进入视口自动懒渲染兜底
- **版本迭代**：向模型重复上传即自动生成新版本（可加版本标注），版本时间线、任意版本预览 / 下载 / 一键回滚、相邻版本差异（尺寸 / 体积 / 面数），每个版本可单独挂备注（支持语音）
- **发送到切片软件**：一键把版本文件交给本机切片软件直接切片——OrcaSlicer 与 UltiMaker Cura（5.7+）无来源限制、开箱即用；Bambu Studio / PrusaSlicer 官方版有来源白名单，弹窗内提供下载兜底与链接复制
- **元数据**：上传时自动提取三角面数、包围盒尺寸（mm）、体积、SHA-256（重复文件提示）
- **备注 + 语音输入**：备注可挂模型或具体版本；优先使用浏览器实时语音转写（Chrome / Edge / 安卓，边说边出字）；不支持的浏览器自动回退为录音上传，配合可选的 faster-whisper 容器离线转写
- **搜索与筛选**：项目内搜索（名称 / 描述 / 标签 / 备注全文）、格式与标签筛选、全局跨项目搜索
- **响应式 UI**：桌面侧边栏布局，移动端底部导航 + 底部抽屉，支持深色 / 浅色主题

## 快速开始（Docker）

```bash
# 构建并启动（数据持久化在 ./data 目录）
docker compose up -d --build

# 浏览器访问
http://localhost:8001
```

局域网其他设备（手机等）访问 `http://<主机IP>:8001` 即可。

### 使用预构建镜像（镜像发布到 Docker Hub 之后）

```bash
docker run -d --name printvault \
  -p 8001:8001 \
  -v "$PWD/data:/data" \
  --restart unless-stopped \
  feitianzzo/printvault:latest
```

或把 `docker-compose.yml` 里的 `build: .` 一行删掉，只保留 `image:`。
镜像同时提供 `linux/amd64` 与 `linux/arm64`（群晖 / 树莓派等 ARM 设备可直接用）。

## 发布镜像到 Docker Hub

镜像已由 GitHub Actions 自动构建并发布到 [Docker Hub](https://hub.docker.com/r/feitianzzo/printvault)：

| Tag | 含义 |
| --- | --- |
| `feitianzzo/printvault:latest` | `main` 分支最新构建 |
| `feitianzzo/printvault:sha-xxxxxxx` | 每个提交对应的不可变构建 |
| `feitianzzo/printvault:<版本>` | 推送 `v*.*.*` tag 时发布的语义化版本 |

流水线构建 `linux/amd64` 与 `linux/arm64` 双架构（群晖 / 树莓派等 ARM 设备可直接用）。
推送 `v1.2.3` 形式的 tag（或在 GitHub 上发布同名 Release）会额外发布 `1.2.3` 与 `1.2` 标签；也可以在 Actions 页面手动触发。

### 配置发布凭据（fork 后自建镜像时需要）

仓库 **Settings → Secrets and variables → Actions** 中添加：

| Secret | 值 |
| --- | --- |
| `DOCKERHUB_USERNAME` | 你的 Docker Hub 用户名 |
| `DOCKERHUB_TOKEN` | Docker Hub → Account settings → Security → New Access Token（Read & Write） |

### 本地手动发布（可选）

需要本机已安装 Docker 并执行过 `docker login`：

```bash
./scripts/docker-publish.sh 你的DockerHub用户名 1.0.0
```

### 启用语音转写（可选）

浏览器实时转写在 Chrome / Edge / 安卓上开箱即用，无需任何配置。Firefox / 部分 iOS 浏览器不支持时，可启用本地 Whisper 转写服务：

1. 打开 `docker-compose.yml`，将 `printvault` 服务中 `WHISPER_URL` 一行取消注释；
2. 执行：

```bash
docker compose --profile whisper up -d --build
```

首次转写会自动下载模型（约 500MB，缓存在 Docker 卷中），之后完全离线工作。

## 本地开发

```bash
npm install
npm run dev        # 并行启动 API(:8001) 与 Vite(:5173，带代理)
```

生产构建：

```bash
npm run build      # 构建前端到 frontend/dist、服务端到 server/dist
npm start          # node server/dist/index.js（自动托管前端产物）
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `8001` | 服务监听端口 |
| `HOST` | `0.0.0.0` | 监听地址 |
| `DATA_DIR` | `./data`（容器内 `/data`） | 数据目录（SQLite 库 + 模型文件 + 缩略图 + 录音） |
| `WHISPER_URL` | 空 | faster-whisper 服务地址（如 `http://whisper:9000`），为空则不启用服务端转写 |

## 数据与备份

所有数据都在 `DATA_DIR` 一个目录里，备份该目录即可：

```
data/
├── app.db          # SQLite 数据库（WAL 模式）
├── models/         # 模型文件，按模型 ID 分目录
├── thumbs/         # 缩略图（WebP）
└── audio/          # 语音备注录音
```

## 目录结构

```
├── frontend/          # Vue3 + Vite + Tailwind CSS v4 + three.js
│   └── src/
│       ├── workers/   # 模型解析 Web Worker（STL/OBJ/3MF/STEP）
│       ├── utils/     # 几何统计、缩略图渲染、语音工具
│       ├── components/# 查看器、上传面板、版本时间线、备注面板等
│       └── views/     # 仪表盘 / 项目 / 模型详情 / 搜索
├── server/            # Fastify + better-sqlite3
│   └── src/
│       ├── routes/    # projects / models / notes / stats
│       └── services/  # 文件存储、Whisper 转写
├── Dockerfile
└── docker-compose.yml
```

## 已知说明

- STEP 首次预览需加载约 7.5MB 的 WASM，之后有浏览器缓存
- 超大模型（数十万面）解析在 Web Worker 中进行，不阻塞界面
- MVP 为单用户无登录设计，请部署在可信局域网内
