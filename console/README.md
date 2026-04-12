# Voice of NYC Console

独立 **Python（FastAPI）+ React（TypeScript / TSX）** 控制台：选手名单与打分存 **SQLite**；数据变更后后端可通过 **WebSocket** 向已连接客户端广播状态。与仓库根目录静态站点 **互不修改**；首次启动若数据库为空，会自动从上级仓库的 `assets/js/mydata.json` 导入种子数据（路径相对于本目录的 `backend/app/main.py` 解析到 `CSSA-voiceOfNYC` 根）。

## 环境

- Python **3.10+**
- Node.js **18+**

## 目录结构

```text
voiceOfNYC-console/
  backend/app/       # FastAPI：/api/*、/ws/display
  frontend/src/      # Vite + React
  frontend/public/img/  # 现场背景图（如 background1.png，从仓库 assets/img 复制）
  docs/              # README-audience-vote.md 等
  scripts/google-apps-script/  # 可选 vote-ingest.gs
  data/              # voiceofnyc.db（自动生成，勿提交）
  .venv/             # 本地虚拟环境（勿提交）
```

## 算分公式

与根目录 `assets/js/backend.js` 一致：

`total = audience/2 + judges_avg/6`

其中 `judges_avg` 为 4 个评委分的算术平均（由后台 PATCH 接口根据 `judge_scores` 计算）。

## 启动（开发）

**不要用 `sudo apt install uvicorn`**：系统自带的 uvicorn 缺少本项目的 Python 依赖（如 `python-dotenv`、Google 库等），进程会启动失败，前端 Vite 会报 **`connect ECONNREFUSED 127.0.0.1:8765`**。请始终在 **虚拟环境** 里用 **`pip install -r backend/requirements.txt`**，并用下面的 **`python -m uvicorn`** 启动。

**终端 1 — 后端**（在 `console` 下建 venv，只需一次）：

```bash
cd console
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r backend/requirements.txt
cd backend
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
```

看到日志里出现 `Uvicorn running on http://0.0.0.0:8765` 且无报错后，再开前端。

**终端 2 — 前端**：

```bash
cd console/frontend
npm install
npm run dev
```

浏览器打开 Vite 提示的地址（默认 `http://127.0.0.1:5173`）。`/api` 与 `/ws` 由 Vite 代理到 `8765`。

- **控分后台**：`/admin`（选手名单导入见 [`docs/README-contestant-import.md`](docs/README-contestant-import.md)；**现场大屏选手 lineup**（第一轮 PK 五组、复活投票等）可在同页底部编辑并写入 SQLite，见 [`docs/README-audience-vote.md`](docs/README-audience-vote.md)）
- **观众投票柱图（全屏，Google 表轮询）**：`/stage/round1/1`～`/stage/round1/5`（每组单独 score11 式布局）、`/stage/round2`（**复活投票五人** + 揭晓流程；`/stage/final` 重定向至此）、`/stage/final-reveal`  
  配置见 [`docs/README-audience-vote.md`](docs/README-audience-vote.md)，前端复制 `frontend/.env.example` → `.env.local` 填写 `VITE_GOOGLE_SHEET_ID` 与 `VITE_GOOGLE_SHEETS_API_KEY`。

## 生产构建（可选）

```bash
cd voiceOfNYC-console/frontend
npm run build
```

生成 `frontend/dist`。详细步骤（环境变量、`VITE_API_BASE`、Nginx SPA、Pages 类平台）见 **[`docs/README-static-deploy.md`](docs/README-static-deploy.md)**。要点：`npm run dev` 的代理在静态包中**不存在**，须在 build 前配置 **`.env.production`**；托管时需 **`try_files` → `index.html`** 以支持 React 路由刷新。本仓库未把 SPA 挂进 FastAPI，以免与 `/docs` 等路由冲突；若需一体化部署，可自行在 FastAPI 中挂载 `StaticFiles` 并配置 catch-all。

## API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/state` | 当前 `contestants`（按 id）与 `ranked`（按总分） |
| PATCH | `/api/contestants/{id}/scores` | JSON：`judge_scores`（长度 4）、`audience`（至少填一项） |
| POST | `/api/import` | JSON：`{ "contestants": [ ... ] }`，与 `mydata.json` 同结构 |
| GET/PUT | `/api/stage/round1-pairs` | 第一轮 PK 五组 lineup（表 `round1_pair_meta`；路由名为历史兼容） |
| POST | `/api/stage/round1-pairs/import-from-files` | 从 `frontend/public/stage/round1/1.json`～`5.json` 导入库 |
| GET/PUT | `/api/stage/round2-lineup` | Round2 lineup 6 槽（表 `round2_lineup_meta`；复活屏用前 5） |
| POST | `/api/stage/round2-lineup/import-from-files` | 从 `frontend/public/stage/round2/1.json`～`6.json` 导入库 |
| WS | `/ws/display` | 连接后推送当前 state；服务端在数据变更后广播（仓库内无独立大屏页，可自行对接） |

OpenAPI：`http://127.0.0.1:8765/docs`

**Google 表格后台写入（OAuth）**：配置与授权步骤见 [`docs/README-google-sheets-oauth.md`](docs/README-google-sheets-oauth.md)。完成后可 `POST /api/sheets/round1-votes` 等，令牌存 `backend/data/google_oauth_token.json`（勿提交）。

## 与旧版静态后台的关系

根目录 `backend.html` 仍使用浏览器 `localStorage`；本控制台使用 **服务端数据库**，适合多标签页、多设备或需要持久化文件的场景。两者可并行存在，数据不自动互通。
