# QR

在浏览器内生成和识别二维码的轻量网站。文本、照片和摄像头画面均在本地处理，服务器只提供静态资源。

## 功能

- 从链接或文本生成二维码，支持中文、换行和 Emoji。
- 选择颜色和尺寸，下载 PNG 或 SVG。
- 上传、拖入或粘贴图片，提取二维码内容。
- 使用摄像头识别二维码，支持切换镜头。
- 复制识别结果，或将结果重新生成为二维码。
- 适配桌面和手机浏览器。

## 本地运行

需要 Node.js 20 或更高版本，以及 npm。在项目目录中运行：

```shell
npm ci
npm run build
npm start
```

默认访问 `http://127.0.0.1:3000`。使用环境变量修改监听地址或端口：

```shell
HOST=127.0.0.1 PORT=3000 npm start
```

修改源码后重新执行 `npm run build`。摄像头功能需要 HTTPS 或 localhost 安全上下文，并需要用户授权。

## 部署

构建产物位于 `dist/`，可以由静态网站托管服务提供，也可以使用项目内的 Node.js 静态服务器。

通用配置示例位于：

- `deploy/qr.service.example`：systemd 服务示例。
- `deploy/Caddyfile.example`：Caddy HTTPS 反向代理示例。

按自己的运行账号、项目位置、Node.js 路径、域名和端口调整示例，再将实际配置安装到服务器。示例中的域名和路径都是占位值。

实际部署配置、运维记录、证书和密钥应保存在仓库外。仓库已忽略 `.local/`、`*.local.*`、环境变量文件、证书文件及常用的本地部署配置文件名。

健康检查：`GET /healthz`。

## 检查

```shell
npm run build
npm test
```

## 目录

- `src/`：页面、样式及浏览器内的二维码功能。
- `scripts/build.mjs`：前端构建。
- `server.mjs`：静态文件服务器。
- `deploy/`：通用部署示例。
- `tests/`：HTTP 服务检查。
