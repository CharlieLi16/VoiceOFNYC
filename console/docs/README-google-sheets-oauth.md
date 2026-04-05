# 后端 OAuth 写入 Google 表格

用 **你自己的 Google 账号** 授权一次后，FastAPI 把 **refresh token** 存在 `backend/data/google_oauth_token.json`，之后可自动刷新 **access token** 并调用 Sheets API **写入**（无需把表格设为全网公开，只要该账号对表格有编辑权限即可）。

与 [`scripts/google-apps-script/vote-ingest.gs`](../scripts/google-apps-script/vote-ingest.gs) 写入的同一张表、同一布局（`Round1Audience` / `Round2Audience` / **`Round3Audience`** 决赛打分）。

## 1. Google Cloud Console

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)，选中你的项目（可与 API Key 同一项目）。
2. **API 和服务** → **库** → 启用 **Google Sheets API**。
3. **API 和服务** → **OAuth 同意屏幕**  
   - 用户类型选 **外部**（个人 Google 账号够用）→ 填写应用名称、你的邮箱 → 保存。  
   - **作用域**：添加 `https://www.googleapis.com/auth/spreadsheets`（或稍后在首次授权时由客户端请求）。  
   - 若处于「测试」状态，在 **测试用户** 里加入你要用来登录授权的 Google 账号。
4. **API 和服务** → **凭据** → **创建凭据** → **OAuth 2.0 客户端 ID**  
   - 应用类型：**Web 应用**。  
   - **已授权的重定向 URI**（须与后端环境变量 **一字不差**）：  
     `http://127.0.0.1:8765/api/sheets/oauth/callback`  
     （若你改 `uvicorn` 端口或域名，这里和下面的 `GOOGLE_OAUTH_REDIRECT_URI` 要一起改。）

## 2. 后端环境变量

```bash
cd voiceOfNYC-console/backend
cp .env.example .env
```

编辑 `backend/.env`：

| 变量 | 说明 |
|------|------|
| `GOOGLE_SHEET_ID` | 表格 ID（与前端 `VITE_GOOGLE_SHEET_ID` 相同） |
| `GOOGLE_OAUTH_CLIENT_ID` | OAuth 客户端 ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth 客户端密钥 |
| `GOOGLE_OAUTH_REDIRECT_URI` | 默认与上节重定向 URI 一致 |

可选：`GOOGLE_SHEET_ROUND1_TAB`、`GOOGLE_SHEET_ROUND2_TAB`、`GOOGLE_SHEET_ROUND3_TAB`（默认 `Round1Audience` / `Round2Audience` / `Round3Audience`）。

## 3. 安装依赖并启动后端

```bash
cd voiceOfNYC-console
source .venv/bin/activate   # 若无 venv 先 python3 -m venv .venv && pip install -r backend/requirements.txt
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8765
```

## 4. 完成授权（一次性）

在浏览器打开（直接访问后端，不要省略端口）：

**http://127.0.0.1:8765/api/sheets/oauth/start**

登录 Google → 允许访问表格 → 成功后 JSON 会提示已保存令牌。  
检查：**http://127.0.0.1:8765/api/sheets/oauth/status** 应显示 `configured: true`、`has_refresh_token: true`。

`backend/data/google_oauth_token.json` 已在 `.gitignore`，**勿提交**。

若始终没有 `refresh_token`，删除 token 文件后，用**无痕窗口**再打开一次 `/api/sheets/oauth/start`（本后端已带 `prompt=consent` 以尽量拿到 refresh token）。

## 5. 写入接口（需已 OAuth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/sheets/round1-votes` | JSON：`{ "pair": 1-5, "left": 票数, "right": 票数 }` → 对应 `Round1Audience` 第 `pair+1` 行 |
| POST | `/api/sheets/round2-votes` | JSON：`{ "row": 2-7, "votes": 票数 }` → `Round2Audience` 的 B 列 |
| POST | `/api/sheets/round2-name` | JSON：`{ "row": 2-7, "name": "姓名" }` → A 列 |
| POST | `/api/sheets/round3-score` | JSON：`{ "row": 2-7, "score": 8.2 }` → **B**（会**覆盖**「观众均分」公式；新表请用 **H/I** + 投票页或 **`addRound3AudienceScore`**） |
| POST | `/api/sheets/round3-judge` | JSON：`{ "row": 2-7, "judge": 1, "score": 8.5 }`（`judge` 为 1、2 或 3）→ **C / D / E** |
| POST | `/api/sheets/round3-name` | JSON：`{ "row": 2-7, "name": "姓名" }` → **A** 列 |

可在 **http://127.0.0.1:8765/docs** 里试调。

**安全提示**：这些接口目前**无额外鉴权**，仅适合内网或受信环境。若暴露到公网，应加 API Key、IP 限制或登录态。

## 与 Service Account 的对比

| 方式 | 适用场景 |
|------|----------|
| **OAuth（本文）** | 表格归个人/组织 Drive，用「你的账号」写入，无需把表共享给机器人邮箱。 |
| **Service Account** | 服务器放 JSON 私钥，表格需 **共享给** `xxx@...iam.gserviceaccount.com`；无浏览器授权步骤。 |

若你更倾向 Service Account，可另用 `google-auth` 的 `service_account.Credentials` 换 `sheets_oauth.load_credentials()` 一类逻辑；当前仓库实现的是 OAuth 路径。
