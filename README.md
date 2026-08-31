# DropLink

设备间互传文字和图片的极简网页（单房间 + 访问口令）。

## 功能

- 口令登录（一次登录后浏览器记住一年）
- 文字消息：Enter 发送，一键复制，链接自动可点
- 图片：粘贴（Ctrl/⌘+V）、拖拽、选择文件均可发送，点击可放大
- 历史记录保留（SQLite），支持加载更早消息
- WebSocket 实时同步，多设备同时在线即时收到

## 服务器部署（Docker）

```bash
# 1. 把整个目录传到服务器，例如 /opt/droplink
# 2. 编辑 docker-compose.yml，把 ACCESS_TOKEN 改成你自己的口令
# 3. 启动
docker compose up -d --build
```

访问 `http://服务器IP:3000`。数据（数据库 + 图片）保存在 `./data` 目录，备份该目录即可。

建议用 Nginx/Caddy 反代并配置 HTTPS（反代需支持 WebSocket，Nginx 需加
`proxy_set_header Upgrade $http_upgrade;` 和 `proxy_set_header Connection "upgrade";`）。

## 本地运行

```bash
npm install
ACCESS_TOKEN=你的口令 node server.js
```

## 环境变量

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `ACCESS_TOKEN` | 访问口令（必填） | 无 |
| `PORT` | 监听端口 | 3000 |
| `DATA_DIR` | 数据目录 | ./data |
| `MAX_IMAGE_MB` | 单张图片大小上限 | 10 |
