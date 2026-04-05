# 观众投票（在 voiceOfNYC-console 内）

## 一键初始化（推荐）：在表格里跑 Apps Script

我无法代你登录 Google，但你可以 **30 秒内在本表内自动生成三个 Tab 和初始格子**：

1. 用浏览器打开你的 **[比赛分数 / 目标表格](https://docs.google.com/spreadsheets)**。
2. **扩展程序** → **Apps Script**。
3. 删除默认的 `function myFunction() {}`，把仓库里 **[`scripts/google-apps-script/setup-audience-sheets.gs`](../scripts/google-apps-script/setup-audience-sheets.gs)** 的**全部内容**粘贴进去 → **保存**（磁盘图标）。
4. 上方函数下拉选 **`setupVoiceOfNYCConsoleSheets`** → 点 **运行**。首次需 **审查权限** → 选你的 Google 账号 → **高级** → **前往…（不安全）** → **允许**（这是你自己写的脚本，仅改当前表）。
5. 回到表格刷新：应出现 **`Round1Audience`**、**`Round2Audience`**、**`Round3Audience`**，且数据区已写好。之后菜单栏会出现 **VoiceOfNYC 控制台** → 同一功能可重复执行（**会覆盖** Round1 **A1:E6**、Round2 **A1:B7**、Round3 **A1:I7**，有旧数据请先备份）。

然后再做：**共享** → 知道链接的任何人 **查看者**（前端 API Key 才能读）。

---

## 从零设置 Google 表格（与本项目默认配置一致）

1. **打开你的表格**（或新建一个），记下 URL 里 `/d/` 与 `/edit` 之间的 **表格 ID**，填入 `frontend/.env.local` 的 `VITE_GOOGLE_SHEET_ID`。
2. **共享（API Key 读表必需）**  
   点 **共享** → 将访问权限设为 **知道链接的任何人** → **查看者**（或「互联网上知道链接的任何人」）。仅自己可见时，浏览器用 API Key 读不到。
3. **新建工作表（底部 Tab）**，名称必须**完全一致**（区分大小写）：  
   - `Round1Audience`（初赛 PK）  
   - `Round2Audience`（复活投票 · 票数）  
   - `Round3Audience`（**决赛打分** · 总分，供 `/stage/final-reveal` 默认读取）  
   若你想用中文 Tab 名，改 **`frontend/src/config/audienceSheetRanges.ts`** 里的默认范围字符串（例如 `你的Tab名!A2:E6`）。
4. **导入模板（可选）**  
   在对应 Tab 里：**文件 → 导入 → 上传**，选择本仓库内：  
   - [`sheet-templates/Round1Audience.csv`](sheet-templates/Round1Audience.csv)  
   - [`sheet-templates/Round2Audience.csv`](sheet-templates/Round2Audience.csv)  
   - [`sheet-templates/Round3Audience.csv`](sheet-templates/Round3Audience.csv)  
   每个 CSV 导入到**对应名称**的 Tab；导入位置选 **替换当前工作表** 或粘贴到 A1。  
   - Round1：第 1 行为表头，**数据占用 A2:E6**（5 行 = 第一轮～第五轮 PK），与默认 `Round1Audience!A2:E6` 一致。  
   - Round2：第 1 行为表头，**数据占用 A2:B7**（6 人），与默认 `Round2Audience!A2:B7` 一致。  
   - Round3：第 1 行为表头，**数据区 `A2:I7`**：`B` 观众均分（公式 **=H/I**），`C–E` 评委，`F/G` 公式，`H` 观众打分累计、`I` 观众投票人次（**`vote.html` 决赛提交 1–10 分**由 ingest 写入）。与默认 `Round3Audience!A2:I7` 一致。
5. **揭晓页读哪张表**  
   `/stage/final-reveal` **默认读 `Round3Audience!A2:I7`**（与复活 `Round2` 分离）。排序与揭晓以 **G 列最终分**为准。若要改范围或 Tab，在 **`audienceSheetRanges.ts`** 或 **`VITE_FINAL_AUDIENCE_RANGE`** 覆盖。
6. **本地验证**  
   `cd frontend && npm run dev`，打开 `/stage/round1/1`、`/stage/round2` 与 `/stage/final-reveal`，改对应 Tab 保存后，应在轮询间隔内（默认 5s）更新。

---

大屏路由（全屏、背景为 `frontend/public/img/background1.png`，从仓库根目录 `assets/img` 复制）：

- `/stage/round1/1` … `/stage/round1/5` — **每一组单独一页**，布局对齐根目录 `score11.html`（双 3D 柱 + 头图/姓名 + PK）。`/stage/round1` 会重定向到 `/stage/round1/1`。键盘 **1–5** 切换组别。
- `/stage/round2` — **复活投票（五人制）**：按票数排序的声量柱；表与 lineup 取 **前 5 行 / 前 5 槽**。**揭晓流程**（每次 <kbd>空格</kbd>）：①按当下名次揭晓 **后三名**（身份+票）；② **前两名**只显示 **百分比与票数**（纯黑头、`???`）；③前两名 **身份一起揭晓**（按选手 id 记忆，换位后已揭身份仍显示）；④对 **当前第一名** **复活高亮**。揭晓过程中票数变化仍会 **实时换位** 与上升动效，仅控制是否显示姓名/头像。**R** 重置。旧链接 **`/stage/final`** 会重定向到本页。
- `/stage/final-reveal` — 总决赛 **总分揭晓**：**最终分**（**G** 列或 0.6×评委+0.4×观众）显示为 `x.xx/10`，揭晓后附 **观众均分 / 评委均分**；**空格**逐个揭晓 → 再排序发奖 → 再仅保留前三；**R** 重置。默认 **`Round3Audience!A2:I7`**；lineup 仍同 **`/stage/round2`**。
- **`/vote/vote.html?roundId=final_perf_1`～`final_perf_6`** — 决赛 **单人照 + 竖向 1～10 分条**，提交后 Cloud Function 调 **`addRound3AudienceScore`** 写 **H/I**，**B** 为均分公式。

## 配置放哪

- **表格 ID、API Key（敏感）**：`frontend/.env.local`（从 `.env.example` 复制），变量 `VITE_GOOGLE_SHEET_ID`、`VITE_GOOGLE_SHEETS_API_KEY`。
- **读哪个范围、轮询间隔（不敏感）**：直接改 **`frontend/src/config/audienceSheetRanges.ts`**，改完保存并重新 `npm run dev` / 重新 build 即可，不必动 `.env`。

## 工作表布局（与旧版静态站文档一致）

### Round1Audience（第一轮～第五轮 PK）

表头在第 1 行，**第 2～6 行**对应大屏 `/stage/round1/1`～`/5`（第 `n` 对 = 第 `n+1` 行）。  
视觉上整块是 **A1:E6**，但 API 读取范围请配 **`A2:E6`**（不含第 1 行表头，且**必须包含 A～E 列**，与代码约定一致）。

| 列 | 含义 |
|----|------|
| **A** | **组次**（如「第一轮」…「第五轮」），给人看的说明，**不参与**柱图计算 |
| **B** | 观众票·左 |
| **C** | 观众票·右 |
| **D** | 评委票·左（**折算票**；例如 3 位评委共 10 票时，按规则拆到左右两格，**建议 D+E=10**，也可现场自定） |
| **E** | 评委票·右（折算） |

**柱图逻辑**：左侧总量 = `B+D`，右侧 = `C+E`，再算两侧占本对总和的**百分比**作为两根柱的高度。

### 多环节 lineup（大屏选手：SQLite + `public/stage/<环节>/`）

各环节的**头像与默认姓名**与 Google **票数表**分开配置：约定静态目录 **`frontend/public/stage/<环节>/`**，并可由 **`/admin`** 写入 SQLite。API 路由名里仍含 `round1` 等为历史兼容，语义是「该环节的 lineup」。

| 环节 | 大屏路由 | 数据库表 | 读 lineup API | public JSON（可导入库） |
|------|-----------|-----------|----------------|---------------------------|
| 第一轮 PK 五组 | `/stage/round1/1`～`/5` | `round1_pair_meta` | `GET /api/stage/round1-pairs` | `stage/round1/1.json`～`5.json` |
| 复活投票（大屏 5 人） | `/stage/round2` | `round2_lineup_meta`（存 6 槽） | `GET /api/stage/round2-lineup` | `stage/round2/1.json`～`5.json` 用于兜底前 5 |

### 第一轮 PK：姓名与头像（推荐：浏览器 + SQLite）

大屏 **`/stage/round1/1`～`/5` 优先**从 **`GET /api/stage/round1-pairs`** 读取（表 **`round1_pair_meta`**），约每 5 秒刷新；在 **`/admin`** **「现场大屏 · PK 选手（五组）」** 中编辑并 **保存五组到数据库**。

- **从 public JSON 导入到库**：维护 `frontend/public/stage/round1/1.json`～`5.json` 时，可在 Admin 点 **「从 public JSON 导入到库」**（`POST /api/stage/round1-pairs/import-from-files`）。
- **首次启动**：若库中尚无 round1 记录且上述 5 个文件存在，后端会尝试自动导入。

**回退**（接口失败时）：`frontend/public/stage/round1/{n}.json` → `frontend/public/round1-pairs.json` → 默认「左侧 / 右侧」。

**照片命名（10 人）**：`frontend/public/img/contestants/1.jpg`～`10.jpg`（`scripts/setup-contestant-photos-1-10.sh`）。第 `n` 对常见约定：**左**=`2n-1`、**右**=`2n`。 **「应用 1–10 照片模板到库」**：`POST /api/stage/round1-pairs/apply-numbered-defaults`。

### 复活投票（Round2Audience）：姓名、头像与表对齐规则

- **人数**：复活大屏为 **5 人**，使用表 **第 2～6 行**（数据行）与 **slot 1～5**；若表仍为 `A2:B7`（6 行），**第 7 行不参与**复活屏。
- **票数与占比**：来自上述 5 行的 **`B` 列**票数，`A` 为姓名；大屏按这 5 人总票算比例并实时排序。
- **显示姓名**：**Google 表 A 列优先**；若该格为空，则用 lineup 里对应 slot 的默认姓名。
- **头像**：来自 **`GET /api/stage/round2-lineup`**（约每 5 秒刷新）；接口不可用时回退 **`/stage/round2/1.json`～`5.json`**（字段 `name`、`img`）。
- **行与 slot 对应**：表数据行依次对应 **slot 1～5**（与排序无关：排序只改变展示顺序）。

在 **`/admin`** **「现场大屏 · 复活投票 lineup」** 可编辑 6 个 slot（**复活屏用前 5**）、保存到库，或 **从 public JSON 导入**（`POST /api/stage/round2-lineup/import-from-files`，仍要求 6 个 JSON 齐全以兼容后端）。首次启动若库为空且 6 个 JSON 齐全，后端会尝试自动导入。

### 静态 JSON（可选、兜底）

- `frontend/public/stage/round1/1.json` … `5.json`：对象字段 `leftName`、`rightName`、`leftImg`、`rightImg`。
- **`frontend/public/round1-pairs.json`**：5 元素数组，同上；兜底用。
- `frontend/public/stage/round2/1.json` … `6.json`：对象字段 `name`、`img`。

### Round2Audience（表结构）

- `A2:B7`：6 行，`A` 姓名，`B` 票数；柱高为占本表总票比例。

### Round3Audience（决赛打分 · 表结构）

- **用途**：与复活 **Round2** 分离；`/stage/final-reveal` 轮询 **`Round3Audience!A2:I7`**。
- **列**：`A` 姓名 · `B` **观众均分**（公式 `=IF(I=0,"",ROUND(H/I,4))`）· `C/D/E` 评委 · `F/G` 公式 · **`H` 观众打分累计** · **`I` 观众投票人次**。
- **人工改评委分**：改 `C–E`；**勿手改 `B`**（公式列）。若需手改观众结果可改 **H/I** 或清人后重投。
- **Firebase `submitVote`（`vote.html` 决赛）**：`final_perf_*` 传 **`audienceScore` 1～10** → Web App **`addRound3AudienceScore`**（`H+=score`，`I+=1`）。旧客户端无分数时仍走 **`addRound3Vote`**（`H+=delta`，`I+=1`，`delta` 默认 1）。

### 决赛投票页上线顺序（避免「提交了但表没列」）

1. 在 Google 表运行 **`setupVoiceOfNYCConsoleSheets`**（或手建 **H/I** 与 **B** 公式，与脚本一致）。  
2. 部署 / 更新绑定该表的 **`vote-ingest.gs`** Web App（含 **`addRound3AudienceScore`**）。  
3. 部署 **Cloud Functions**（`submitVote` 决赛分支）。  
4. 部署静态资源 **`vote-app.js` / `vote.css`**。  
5. 若使用 **Firestore 直写** `vote-static-page`，需部署更新后的 **`firestore.rules`**（可选字段 **`audienceScore`**）。

## 自动化写入

- **观众扫码投票（Google 表单或自研页）**：步骤与脚本示例见 **[`README-google-vote-forms.md`](README-google-vote-forms.md)**（表单提交 → 累加 `Round2Audience`/`Round1Audience`；决赛见 **`addRound3AudienceScore`** / `addRound3Vote`；或 Web App `addFinalVote` / `addPairVote`）。
- **Google 表单** 也可仅用公式汇总到上述 Tab（不实时累加时）；实时 **`B` 列 +1** 推荐用该文档里的 **`form-submit-to-round2.gs` 触发器**。
- 可选 HTTP 写入：见 [`scripts/google-apps-script/vote-ingest.gs`](../scripts/google-apps-script/vote-ingest.gs)。**`addRound3AudienceScore`** `{row,score:1-10}` → **H/I**；**`addRound3Vote`** `{row,delta?}` → **H/I**；**`setRound3Judge`** → **C/D/E**；**`setRound3Name`** → **A**；**`setRound3Score`** 直接写 **B**（会**覆盖**观众均分公式，仅应急）。

- **后端 OAuth**：`round3-score` 写 **B**（慎用，易破坏公式）；**`round3-judge`** → **C/D/E**；**`round3-name`** → **A**（见 [`README-google-sheets-oauth.md`](README-google-sheets-oauth.md)）。
