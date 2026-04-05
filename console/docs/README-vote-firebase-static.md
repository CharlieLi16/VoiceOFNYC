# Firebase 静态投票页（`public/vote/`）

## 入口分工

| 文件 | 受众 | 说明 |
|------|------|------|
| **`vote.html`** | 观众 | 实际投票页；支持 `?roundId=`；启动时读取 Firestore **`events/{eventId}/site/voteUi`** 覆盖选手与标题（无文档则用 [`vote-config.js`](../frontend/public/vote/vote-config.js)）。 |
| **`index.html`** | 工作人员 | **调度后台**：12 个环节的链接（复制 / 打开）、编辑选手与标题并 **发布** 到 Firestore（Callable **`publishVoteUi`**）。若 URL **已带 `roundId`**，会 **自动跳转到 `vote.html`**，因此旧链接 `…/vote/?roundId=…` 仍给观众用。 |

构建后路径在 **`dist/vote/`** 下同名文件。

**容量**：页面为纯静态资源（HTML/CSS/JS + CDN），Vercel / CDN 可轻松承载 **200+** 观众同时打开；写票走 **Firebase Callable + Firestore**，一般现场规模下无需自建动态站点。

## 远程选手与标题（`voteUi`）

- Firestore 文档：`events/voiceofnyc/site/voteUi`  
  - 若曾使用旧 ID `voiceofnyc-revival`，需在控制台将 `voteUi` / `tickets` / `votes` 迁到 `events/voiceofnyc/` 下，或在新路径下重新发布与 seed 票码。  
  字段：`candidates`（`{ id, sheetRow, label, img }[]`）、可选 `pageTitle` / `subtitle`、`updatedAt`。  
- **规则**：[`firebase-vote/firestore.rules`](../firebase-vote/firestore.rules) 允许该文档 **公开读**、**禁止客户端写**；写入仅通过 Cloud Function。  
- **发布**：在 **`index.html`** 填 **`STAFF_PUBLISH_SECRET`**（与 Functions Secret 一致）后点「发布」。首次部署后需：

```bash
cd console/firebase-vote
firebase functions:secrets:set STAFF_PUBLISH_SECRET
npx firebase-tools@latest deploy --only functions,firestore:rules
```

**安全**：密钥会经浏览器发给 Callable；勿把 **`index.html` 链接发给观众**；生产环境可后续改为 Firebase Auth 限定工作人员。

## 票码与轮次（`VOTE_CODES=__TICKETS__`）

- Firestore：`events/{eventId}/tickets/{CODE}`。每个码在 **每个 `roundId` 下各可成功投 1 次**（`usedRounds`）。
- Cloud Function [`firebase-vote/functions/index.js`](../firebase-vote/functions/index.js) 内 **`ALLOWED_ROUND_IDS`** 为唯一合法值。
- **轮次**：`vote.html` 上 **`?roundId=` 优先**，否则用 **`vote-config.js` 的 `voteRoundId`**。也可使用 **`…/vote/?roundId=…`**（经 `index.html` 跳转至 `vote.html`）。工作人员也可在 **`index.html`** 表格里复制各环节完整链接。

**合法 `roundId`（共 12 个）**：`round1_pk_1`～`5`、`round2_revival`、`final_perf_1`～`6`。

**无需**为每轮重新印票码（同一批码可跨轮使用，每轮各 1 次）。

## 其它 `VOTE_CODES` 模式

- **`DISABLED`**：不校验码。
- **内联码列表**：不扣 Firestore 票；多轮防刷请用 `__TICKETS__`。

## 浏览器「每机一票」

localStorage 按 **`eventId` + 实际 roundId** 区分环节。

## 部署顺序

1. `firestore:rules` + `functions`（含 **`publishVoteUi`**、**`STAFF_PUBLISH_SECRET`**）。
2. 发布前端 **`dist`**（含 **`vote/index.html`**、**`vote/vote.html`**）。

## 旧数据（仅 `used: true`、无 `usedRounds`）

旧版「全局一次」票码无法再用于 `__TICKETS__` 新轮次，除非在 Firestore 中重置或重 seed。见前文「票码」说明。

## 选手与行号

- **复活 / 决赛** 等多人选：`submitVote` 仍只允许 **`s1`～`s6`**、**`sheetRow` 2～7**（与 `Round2Audience` 六行一致）。
- **`publishVoteUi`**：允许 **`s1`～`s10`**、**`sheetRow` 2～11**。初赛两人若对应 **Round1 同一数据行（B/C）**，允许 **两行号相同**（须为 2～6 且整份 candidates 恰好 2 人）。复活/决赛等多人发布仍须行号互不相同。
- 大屏 lineup 仍在主站 **`/admin`**。

### 初赛 PK（`round1_pk_1`～`round1_pk_5`）

- 投票页为 **左右 1v1**：须 **恰好 2 人**——**第 1 位 = 左侧**（表 **B** 列观众票），**第 2 位 = 右侧**（**C** 列）。
- 可在 **`vote-config.js`** 里配置 **`round1PkByRoundId`**（五组各两人）；`vote.html` 在初赛 `roundId` 下会 **优先用该映射**，覆盖 Firestore `voteUi.candidates`，便于固定 **1v2、3v4、…、9v10** 而无需每场改发布内容。
- Cloud Function 对 Apps Script 发 **`addPairVote`**（`pairRow` = 表第 2～6 行对应五组 PK），不再使用 `addFinalVote`。
