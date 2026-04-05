# Firebase 静态投票页（`public/vote/`）

构建后路径：**`dist/vote/vote.html`**（主入口）。同目录下 **`index.html`** 仅作跳转 `vote.html` 并**保留查询参数**（兼容旧链接 `/vote/`）。

**容量**：页面为纯静态资源（HTML/CSS/JS + CDN），Vercel / CDN 可轻松承载 **200+** 观众同时打开；写票走 **Firebase Callable + Firestore**，一般现场规模下无需自建动态站点。

## 票码与轮次（`VOTE_CODES=__TICKETS__`）

- Firestore：`events/{eventId}/tickets/{CODE}`。每个码在 **每个 `voteRoundId` 下各可成功投 1 次**（字段 `usedRounds` 记录已用轮次）。
- Cloud Function [`firebase-vote/functions/index.js`](../firebase-vote/functions/index.js) 内 **`ALLOWED_ROUND_IDS`** 为唯一合法值。
- **轮次来源（二选一，URL 优先）**：在投票页地址后加 **`?roundId=round2_revival`**（或任一合法 id）。未带参数时使用 **`vote-config.js` 的 `voteRoundId`**。现场可在 PPT 里只放不同链接切环节，**无需每轮重新部署**（同一 build 即可）。
- **合法 `voteRoundId`（共 12 个）**  
  - 第一轮 PK 五组：`round1_pk_1` … `round1_pk_5`  
  - 复活投票：`round2_revival`  
  - 决赛每人一场：`final_perf_1` … `final_perf_6`

- **只换环节、选手与表仍与当前页一致**：改链接查询参数即可，例如  
  `https://你的域名/vote/vote.html?roundId=round1_pk_2`  
  （`https://你的域名/vote/?roundId=…` 会经 `index.html` 跳到同一页。）  
- **换环节且选手/表行不同**（如决赛 6 人）：仍需改 `vote-config.js` 里 `candidates` 等 → build → 部署；`roundId` 仍可用 URL 指定。  
- **无需**为每轮重新印票码（同一批码可跨轮使用，每轮各 1 次）。

## 其它 `VOTE_CODES` 模式

- **`DISABLED`**：不校验码；`roundId` 可不传（仍建议在 config 里写 `voteRoundId` 便于审计）。
- **内联码列表**：不扣 Firestore 票；`roundId` 不参与扣次（多轮防刷请用 `__TICKETS__`）。

## 浏览器「每机一票」

`vote-app.js` 的 localStorage key 含 **`eventId` + 实际生效的 roundId**（URL 或配置），因此 **每一轮** 在同一浏览器可各投一次（与 `oneVotePerBrowser` / `lockBrowserAfterSubmit` 配置一致）。

## 部署顺序

1. 部署 **Firestore 规则**：[`firebase-vote/firestore.rules`](../firebase-vote/firestore.rules)（静态 `vote-static-page` 写入需带 `roundId`）。
2. 部署 **Cloud Functions**（`firebase deploy --only functions` 等）。
3. 发布前端 **`dist`**（含 `vote/`）。

## 旧数据（仅 `used: true`、无 `usedRounds`）

此类文档来自旧版「全局一次」逻辑：**该码在 `__TICKETS__` 下无法再投任何新轮次**。若需同一批码参与多轮，请在 Firestore 中删除对应 ticket 文档后重新 `seed-tickets.mjs` 写入，或手工改为 `used: false` 并补上合适的 `usedRounds`（慎用）。

## 选手与行号

Callable 与规则允许 **`s1`～`s6`**、**`sheetRow` 2～7**（决赛第六人可用 `s6` + 第 7 行）。当前示例页为 5 人复活；决赛 6 人时在 `vote-config.js` 里增加候选人并核对 Google 表行号。
