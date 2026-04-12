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

4. **后端 CORS（本地能开、Vercel 报 `Failed to fetch` 时最常见原因）**：默认 FastAPI 只允许 `localhost` / `127.0.0.1` 开发端口。部署在公网的后端须在运行环境里增加：
   - **`CORS_EXTRA_ORIGINS`**：逗号分隔，例如 `https://你的项目.vercel.app`（生产域名）；若有 Preview 分支，把 `https://xxx-git-yyy-team.vercel.app` 一并写上，或
   - **`CORS_ALLOW_ORIGIN_REGEX`**：例如 `https://.*\.vercel\.app`（匹配所有 Vercel 子域，按需使用）。
   配置写在 **`console/backend/.env`**（与 `GOOGLE_*` 同级），重启 uvicorn 后生效。详见 **`console/backend/.env.example`**。

5. **混合内容**：Vercel 页面是 **HTTPS** 时，`VITE_API_BASE` 也必须是 **`https://`**，否则浏览器会拦截对 `http://` API 的请求。

**不要**在「仓库根 + Root Directory = `console/frontend`」时再用「输出目录 = `console/frontend/dist`」这类**双重路径**；本仓库已改为只在子目录内使用相对路径 **`dist`**。

### C. 仅现场局域网：一台电脑当服务器

1. 后端：`uvicorn` `--host 0.0.0.0 --port 8765`。
2. 用 Nginx/Caddy 在 **80/443** 上托管 `dist`，并反代 `/api` 到 `8765`，或 `VITE_API_BASE=http://那台电脑局域网IP:8765`（**HTTP 仅适合全站 HTTP**，否则手机浏览器可能拦截）。

### D. 会场：Vercel 托管前端 + 笔记本只跑 uvicorn（隧道）

**不能**指望「Vercel 直连你电脑」：打开 Vercel 页面的是**观众手机/自己的浏览器**，请求 `VITE_API_BASE` 也是从**这些设备**发出。你笔记本上的 `http://127.0.0.1:8765` 在观众手机里指的是**手机自己**，不是你的电脑。

同时，Vercel 是 **HTTPS**，若把 `VITE_API_BASE` 设成会场 **`http://192.168.x.x:8765`**，浏览器通常会 **拦截混合内容**（HTTPS 页请求 HTTP），仍不可用。

**可行做法**：在笔记本上让 **`8765` 经隧道暴露成一个公网 HTTPS 地址**，再把该地址填进 Vercel 的 **`VITE_API_BASE`**，并已在后端配置 **`CORS_EXTRA_ORIGINS`** / **`CORS_ALLOW_ORIGIN_REGEX`**（见上文 B.4）。

1. **笔记本**：照常 `uvicorn` 监听 `0.0.0.0:8765`（或只本机 + 隧道指向本机端口，按隧道文档）。
2. **隧道**（任选其一，均需你先注册/安装）：
   - **Cloudflare Tunnel（cloudflared）**：可配置**固定子域**（需 Cloudflare 托管的域名）或快速试用域名；把公网 HTTPS 指到 `http://127.0.0.1:8765`。
   - **ngrok** 等：`ngrok http 8765` 会得到 `https://xxxx.ngrok-free.app`；**免费随机域名每次重启会变**——若变了，须在 Vercel 里**改 `VITE_API_BASE` 并 Redeploy**（或购买**固定域名**）。
3. **Vercel**：`VITE_API_BASE=https://（隧道给你的主机名，无路径无尾斜杠）`。
4. **开场前检查**：用手机 **蜂窝网络**（别连会场 Wi‑Fi）打开 Vercel 上的 `/admin`，能加载选手即隧道 + CORS 正常。

**若不想依赖隧道 / 公网**：会场可改用在笔记本上 **`npm run build` + 静态服务** 同机打开（与 C 类似，全站 HTTP 同网段），不必用 Vercel；观众投票若用 Firebase 静态页则另见 `README-vote-firebase-static.md`。

## 5. 与「纯投票落地页」的区别

若你只做 **一张投票页**、提交走 **Google Apps Script Web App**，可以 **不用** 整包 React：一个 `index.html` + `fetch` 即可，丢进 `dist` 或任意静态空间都行。本仓库 **整包控制台** 仍按上面 **Vite build** 流程部署。

另有一套 **Firebase 写入** 的独立静态包，源码在 **`console/frontend/public/vote/`**：观众 **`dist/vote/vote.html`**，工作人员调度 **`dist/vote/index.html`**。说明见 **[README-vote-firebase-static.md](./README-vote-firebase-static.md)**。

## 6. 观众现场签到 `/check-in`

React 构建里包含 **`/check-in`**：观众填写姓名、邮箱、可选手机号后，请求后端 **`POST /api/checkin`**，从票码池分配码、**追加一行到 Google Sheet**（需配置 **`GOOGLE_SHEET_CHECKIN_TAB`**，并在表格中预先创建同名工作表），并发送 **邮件（Resend 或 SMTP）**。邮件中为 **每个环节各一条** 带 `roundId` 与 `voteCode` 的链接（默认与 `vote-app.js` 的轮次列表一致，可用 **`VOTE_CHECKIN_ROUND_IDS`** 覆盖）。环境变量见 **`console/backend/.env.example`**（`VOTE_PAGE_BASE_URL`、`CHECKIN_CODES_CSV`、邮件等）。

与整站其它页相同：静态托管时须配置 **`VITE_API_BASE`** 指向可 HTTPS 访问的 FastAPI，并在后端配置 **`CORS_EXTRA_ORIGINS`**（或 **`CORS_ALLOW_ORIGIN_REGEX`**）放行你的前端域名。未完成 Google OAuth 或表格写入失败时，接口会返回错误；请先在能访问后端的环境里完成 **Sheets OAuth**（见后端 README 中表格相关说明）。

## 7. 常见坑

| 现象 | 原因 |
|------|------|
| Vercel 整站 `NOT_FOUND` / `Code: NOT_FOUND` | Root Directory 未设为 **`console/frontend`**，或输出目录配置成了错误的嵌套路径 |
| 刷新 `/admin` 404 | 静态服务器未做 **SPA fallback** 到 `index.html` |
| API `Failed to fetch` | 未设 `VITE_API_BASE`、**后端未放行 Vercel 域名（`CORS_EXTRA_ORIGINS`）**、或 HTTPS 页面请求了 `http://` API |
| Google 表读不到 | 未在 build 前配置 `VITE_GOOGLE_*`，或表未对「知道链接的人」只读共享 |
| Vercel + 会场笔记本 uvicorn | 观众浏览器无法访问你电脑的 `localhost`；HTTPS 页也不能打 `http://` 局域网 API；须 **隧道 HTTPS** 指向 `8765` 作 `VITE_API_BASE`（见 **D**） |
