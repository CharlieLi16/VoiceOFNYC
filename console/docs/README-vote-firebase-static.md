# Firebase 静态投票页（`public/vote/`）

## 入口分工

| 文件 | 受众 | 说明 |
|------|------|------|
| **`vote.html`** | 观众 | 实际投票页；支持 `?roundId=`；按当前轮读取 **`voteUi.rounds.{roundId}`**（或旧版顶层字段），与 [`vote-config.js`](../frontend/public/vote/vote-config.js) 互补兜底。 |
| **`index.html`** | 工作人员 | **调度后台**：12 个环节的链接（复制 / 打开）、**按环节**编辑选手与标题并 **发布** 到 Firestore（Callable **`publishVoteUi`**，`voteUi.rounds.{roundId}`）。若 URL **已带 `roundId`**，会 **自动跳转到 `vote.html`**，因此旧链接 `…/vote/?roundId=…` 仍给观众用。 |

构建后路径在 **`dist/vote/`** 下同名文件。

**容量**：页面为纯静态资源（HTML/CSS/JS + CDN），Vercel / CDN 可轻松承载 **200+** 观众同时打开；写票走 **Firebase Callable + Firestore**，一般现场规模下无需自建动态站点。

## 远程选手与标题（`voteUi`）

- Firestore 文档：`events/voiceofnyc-revival/site/voteUi`  
  - **推荐（v2）**：`voteUiVersion: 2`，`rounds`：`{ [roundId]: { candidates, pageTitle?, subtitle? } }`，与 `vote-config.js` 中「每轮一份」的语义一致；另保留顶层 `candidates` / `pageTitle` / `subtitle` 作为复活等环节的**镜像**，供旧逻辑或未填某轮时的兜底。  
  - **旧版**：仅顶层 `candidates`、`pageTitle`、`subtitle`（全场共用一份选手列表）。  
- **规则**：[`firebase-vote/firestore.rules`](../firebase-vote/firestore.rules) 允许该文档 **公开读**、**禁止客户端写**；写入仅通过 Cloud Function。  
- **发布**：在 **`index.html`** 按环节折叠编辑后点「发布全部环节」。**`VOTE_UI_PUBLISH_SECRET` 为可选**（在 `functions/.env` 或 deploy 参数里配置）：默认不校验，调度页密钥可留空。若曾用 Secret Manager 配置过 **`STAFF_PUBLISH_SECRET`**，Cloud Run 会继续注入该 Secret，旧版若与参数同名会误触发校验；当前代码已改用 **`VOTE_UI_PUBLISH_SECRET`** 避免与 GCP Secret 同名冲突。仍支持 Callable 仅传顶层 `candidates` 的**旧版发布**（不写 `rounds`）。

```bash
cd console/firebase-vote
npx firebase-tools@latest deploy --only functions,firestore:rules
```

**安全**：无密钥时任何拿到 **`index.html` 链接**的人均可调用 `publishVoteUi` 改 `voteUi`；勿向观众展示该页。GCP 里遗留的 Secret **`STAFF_PUBLISH_SECRET`** 可在 Secret Manager 中删除（若已无其它用途），以免与历史 Cloud Run 配置混淆。

## 票码与轮次（`VOTE_CODES=__TICKETS__`）

- Firestore：`events/{eventId}/tickets/{CODE}`。每个码在 **每个 `roundId` 下各可成功投 1 次**（`usedRounds`）。
- Cloud Function [`firebase-vote/functions/index.js`](../firebase-vote/functions/index.js) 内 **`ALLOWED_ROUND_IDS`** 为唯一合法值。
- **轮次**：`vote.html` 上 **`?roundId=` 优先**，否则用 **`vote-config.js` 的 `voteRoundId`**。也可使用 **`…/vote/?roundId=…`**（经 `index.html` 跳转至 `vote.html`）。工作人员也可在 **`index.html`** 表格里复制各环节完整链接。

**合法 `roundId`（共 12 个）**：`round1_pk_1`～`5`、`round2_revival`、`final_perf_1`～`6`。

**无需**为每轮重新印票码（同一批码可跨轮使用，每轮各 1 次）。

### 把投票码顺利交给观众

- **码的形态**：`seed-tickets.mjs` 默认生成 **12 位**（如 `XXXX-XXXX-XXXX`），已用分隔符方便朗读与核对。
- **现场常见做法**：入场发**小卡/贴纸**印码；签到处**打印带码的名单**；志愿者用手机**短信/微信私发**一人一链（勿把「带个人码的链接」投屏或发大群）。
- **减少手输**：`vote.html` 支持在链接上带 **`?voteCode=码`**（或 `?code=`），打开后自动填入投票码，可与 `roundId` 同用，例如  
  `…/vote.html?roundId=round2_revival&voteCode=SXY3-YVFR-C3AE`（码中的空格会被去掉并转大写）。不需要时在 `vote-config.js` 设 `allowVoteCodeFromUrl: false`。
- **完全不想发码**（仅限可信封闭场）：Secret `VOTE_CODES=DISABLED` 且 `vote-config` 里 `requireVoteCode: false`（见下文），否则服务端会拒票。

## 其它 `VOTE_CODES` 模式

- **`DISABLED`**：不校验码。
- **内联码列表**：不扣 Firestore 票；多轮防刷请用 `__TICKETS__`。

## 联调：测试投票码（`VOTE_TEST_CODE`）

用于 **`VOTE_CODES=__TICKETS__`** 或**内联码列表**时，在不消耗 **Firestore 真实票**（不更新 `tickets`、不占内联列表名额）的前提下，反复走通 **`submitVote` → 写 Google 表 → 写 `votes` 审计**。  
**仍会真实写表**，联调后请在表里核对或手工回滚测试行。

### Cloud Functions

- 参数名：**`VOTE_TEST_CODE`**（[`functions/index.js`](../firebase-vote/functions/index.js) 内 `defineString`，默认空）。
- **未配置或为空**：行为与原来一致，无测试码通道。
- **配置为非空字符串**：观众提交的投票码**与之完全相同（忽略大小写）**时，**直接通过验票**，且不执行 Firestore 扣票逻辑。
- **本地 / 部署**：在 `console/firebase-vote/functions/` 下使用 **`.env`**（勿提交仓库，见 [`functions/.env.example`](../firebase-vote/functions/.env.example)），例如 `VOTE_TEST_CODE=你的测试串`；或使用 Firebase 控制台为 Functions 配置同名**环境变量**，再 **`deploy --only functions`**。

### 投票页（`vote-config.js`）

- 字段 **`testVoteCode`**：须与云端 **`VOTE_TEST_CODE` 字符串一致**，否则前端不会显示联调辅助，且用户手输的码也无法与云端规则对齐。
- 非空时，[`vote.html`](../frontend/public/vote/vote.html) 在投票码区域显示 **「填入测试码」** 按钮，并有一段简短说明。
- **URL 预填**：`?testVote=1` 或 `?test=1` 会在已配置 `testVoteCode` 时自动把该码填入输入框（与 `?voteCode=` 不同，后者用于真实个人码）。

### 正式现场前必做

1. 删除或清空 Functions 的 **`VOTE_TEST_CODE`**（及本地 **`.env`** 中对应行），重新部署 Functions。  
2. 将 **`vote-config.js` 的 `testVoteCode` 改回 `""`**，重新发布静态资源 **`dist/vote/`**。  

否则观众若知道测试串即可绕过真实票校验（仍受「每机一票」等前端习惯限制，但**不属于正式票务模型**）。

### 排查「投票码无效或已使用」

该提示来自 **Callable `submitVote`**，与 **Firestore 规则无关**。部署较新的 Functions 后，失败时会返回**更具体的中文原因**（无此票 / 本环节已用 / 内联白名单不匹配等）。

- **`__TICKETS__`**：票必须是 `events/{eventId}/tickets/{投票码}` 文档 ID，与观众输入**完全一致**（建议统一大写、保留横杠）。测试码 **`cssa2026`** 仅在云端配置了 **`VOTE_TEST_CODE`** 且已 **`deploy --only functions`** 后才会放行且不扣票；只改前端 `vote-config.js` 不够。  
- **内联列表**：码必须在 Secret `VOTE_CODES` 的列表里。  
- **本地 `.env` 里的 `VOTE_TEST_CODE`**：只对**从你本机执行 `firebase deploy` 时打进包里的配置**生效；若用 CI/CD 或未把变量配到 Firebase，线上仍为空。

## 浏览器「每机一票」

localStorage 按 **`eventId` + 实际 roundId** 区分环节。

## 部署顺序

1. **Google 表**：运行 **`setupVoiceOfNYCConsoleSheets`**，使 `Round3Audience` 含 **H/I** 列与 **B** 均分公式（见 `README-audience-vote.md`）。
2. 部署 / 更新 **`vote-ingest.gs`** Web App（含 **`addRound3AudienceScore`**）。
3. `firestore:rules` + `functions`（含 **`submitVote`** 决赛校验 **`audienceScore`**、**`publishVoteUi`**、可选 **`VOTE_UI_PUBLISH_SECRET`**）。
4. 发布前端 **`dist`**（含 **`vote/index.html`**、**`vote/vote.html`**）。

## 旧数据（仅 `used: true`、无 `usedRounds`）

旧版「全局一次」票码无法再用于 `__TICKETS__` 新轮次，除非在 Firestore 中重置或重 seed。见前文「票码」说明。

## 选手与行号

- **复活 / 决赛**：`submitVote` 仍只允许 **`s1`～`s6`**、**`sheetRow` 2～7`。写表：**`round2_revival`** → **`Round2Audience`** B 列 **`addFinalVote`**。**`final_perf_*`**（**`vote.html`** 竖条打分）须传 **`audienceScore`（1～10 整数）** → **`addRound3AudienceScore`** 写 **`Round3Audience` 的 H/I**；**B** 为公式均分。无 `audienceScore` 的旧客户端仍走 **`addRound3Vote`**（H/I +1 权重）。评委分填 **C–E** 或 **`setRound3Judge`**（见 `README-audience-vote.md`）。
- **决赛 UI**：`final_perf_1`～`6` 为 **单人照片 + 竖向 1～10 分条**；`sheetRow` 建议与表行一致（第 n 唱 → 第 **n+1** 行），与 `voteUi` 中该轮唯一选手对齐。
- **`publishVoteUi`**：允许 **`s1`～`s10`**、**`sheetRow` 2～11**。初赛两人若对应 **Round1 同一数据行（B/C）**，允许 **两行号相同**（须为 2～6 且整份 candidates 恰好 2 人）。复活/决赛等多人发布仍须行号互不相同。
- 大屏 lineup 仍在主站 **`/admin`**。

### 初赛 PK（`round1_pk_1`～`round1_pk_5`）

- 投票页为 **左右 1v1**：须 **恰好 2 人**——**第 1 位 = 左侧**（表 **B** 列观众票），**第 2 位 = 右侧**（**C** 列）。
- **`vote-config.js`** 的 **`round1PkByRoundId`**：当 Firestore **未**发布该轮的 `voteUi.rounds.{roundId}.candidates` 时，观众页使用该映射；若调度台已为该初赛轮发布选手，则以 **Firestore 该轮为准**。
- Cloud Function 对 Apps Script 发 **`addPairVote`**（`pairRow` = 表第 2～6 行对应五组 PK），不再使用 `addFinalVote`。
