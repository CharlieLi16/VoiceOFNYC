# 前端静态部署（`frontend/dist`）

开发时 `npm run dev` 会把 `/api`、`/ws` **代理**到本机 `8765`；打成静态包后**没有代理**，必须在 **build 之前**写好环境变量，并用 **HTTPS 可访问的后端地址**（或与现场约定好的内网 IP）。

## 1. 环境变量（构建时写入，不是运行时读文件）

在 **`console/frontend/`** 下：

```bash
cp .env.example .env.production
```

编辑 **`.env.production`**（或继续用 `.env.local`，但生产建议专用 `.env.production`）：

```env
# 必填：静态页在浏览器里直接请求后端（无 Vite 代理）
VITE_API_BASE=https://你的后端域名或 https://现场路由器给的电脑IP:8765

VITE_GOOGLE_SHEET_ID=...
VITE_GOOGLE_SHEETS_API_KEY=...
```

- **`VITE_API_BASE`**：不要尾斜杠；与打开投票页的 **协议一致**（页面是 `https` 时 API 也尽量 `https`，否则浏览器会拦**混合内容**）。
- 改完 **必须重新** `npm run build`，否则包里仍是旧地址。

## 2. 构建

```bash
cd console/frontend
npm install
npm run build
```

产物在 **`console/frontend/dist/`**（`index.html` + `assets/*`）。这是 **React Router SPA**：除静态资源外，所有路径都应回到 **`index.html`**（见下 nginx）。

## 3. 本地先验收（可选）

```bash
cd console/frontend
npx --yes serve dist -s
```

`-s` 表示 **单页应用模式**（任意路径 fallback 到 `index.html`）。浏览器打开提示的地址，确认 `/admin`、`/stage/round2` 能刷新打开。

## 4. 托管方式（任选）

### A. 任意机器 + Nginx

把 `dist/` 里文件拷到站点根目录，例如 `/var/www/voiceofnyc/`：

```nginx
server {
    listen 443 ssl;
    server_name vote.example.com;
    root /var/www/voiceofnyc;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # 可选：同域反代 API，这样前端可设 VITE_API_BASE 为空或相对路径 /api
    # location /api/ {
    #     proxy_pass http://127.0.0.1:8765/api/;
    # }
}
```

若用 **同域反代**，构建时可以把 `VITE_API_BASE` 留空并在代码里用相对路径——**当前仓库默认用 `VITE_API_BASE`**，见 `api/client.ts`；不配则走相对 URL，需 Nginx 把 `/api` 转到 FastAPI。

### B. Cloudflare Pages / GitHub Pages / Vercel / Netlify

- **构建命令**：`cd console/frontend && npm install && npm run build`
- **发布目录**：`console/frontend/dist`
- **环境变量**：在平台后台填与上文相同的 `VITE_*`，再触发构建。
- **SPA**：在平台里打开 “Single Page App” / 重写规则：**全部 → `/index.html`**。

注意：浏览器会访问你填的 **`VITE_API_BASE`**，FastAPI 必须 **允许该静态站的 Origin**（CORS），且若静态站是 **HTTPS**，后端也建议 **HTTPS** 或同域反代。

#### Vercel（Root Directory 必须指向前端）

配置在 **`console/frontend/vercel.json`**（Vite、`dist`、SPA 回退）。导入仓库后请在项目里把 **Root Directory** 设为 **`console/frontend`**，否则构建产物路径会对不上，部署后容易出现 **`404 NOT_FOUND`（平台级，带 `Code: NOT_FOUND`）**。

1. [Vercel](https://vercel.com) → New Project → 导入本仓库 → **Settings → General → Root Directory** 填 **`console/frontend`** 并保存，再 **Redeploy**。
2. **Environment Variables** 里添加与 `.env.production` 相同的 `VITE_*`（至少按需填 `VITE_API_BASE`、`VITE_GOOGLE_SHEET_ID`、`VITE_GOOGLE_SHEETS_API_KEY` 等），保存后 Redeploy。
3. **`VITE_API_BASE`**：填你 **HTTPS** 可访问的 FastAPI 根地址（无尾斜杠）。大屏 **`/display`** 的 WebSocket 会从该地址推导 `wss://…/ws/display`；静态站本身没有后端 WebSocket 时必须设置此项。

**不要**在「仓库根 + Root Directory = `console/frontend`」时再用「输出目录 = `console/frontend/dist`」这类**双重路径**；本仓库已改为只在子目录内使用相对路径 **`dist`**。

### C. 仅现场局域网：一台电脑当服务器

1. 后端：`uvicorn` `--host 0.0.0.0 --port 8765`。
2. 用 Nginx/Caddy 在 **80/443** 上托管 `dist`，并反代 `/api` 到 `8765`，或 `VITE_API_BASE=http://那台电脑局域网IP:8765`（**HTTP 仅适合全站 HTTP**，否则手机浏览器可能拦截）。

## 5. 与「纯投票落地页」的区别

若你只做 **一张投票页**、提交走 **Google Apps Script Web App**，可以 **不用** 整包 React：一个 `index.html` + `fetch` 即可，丢进 `dist` 或任意静态空间都行。本仓库 **整包控制台** 仍按上面 **Vite build** 流程部署。

另有一套 **Firebase 写入** 的独立静态包，源码在 **`console/frontend/public/vote/`**，构建后位于 **`dist/vote/`**（例如 `dist/vote/index.html`）。配置与 Firestore 结构说明见 **[README-vote-firebase-static.md](./README-vote-firebase-static.md)**。

## 6. 常见坑

| 现象 | 原因 |
|------|------|
| Vercel 整站 `NOT_FOUND` / `Code: NOT_FOUND` | Root Directory 未设为 **`console/frontend`**，或输出目录配置成了错误的嵌套路径 |
| 刷新 `/admin` 404 | 静态服务器未做 **SPA fallback** 到 `index.html` |
| API `Failed to fetch` | 未设 `VITE_API_BASE`、CORS、或 https 页面请求了 http |
| Google 表读不到 | 未在 build 前配置 `VITE_GOOGLE_*`，或表未对「知道链接的人」只读共享 |
