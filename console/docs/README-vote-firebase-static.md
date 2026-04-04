# Firebase 静态投票页（`public/vote/`）

构建后路径：`dist/vote/index.html`（Vite 会把 `public/vote` 拷进 `dist/vote`）。

## 票码与轮次（`VOTE_CODES=__TICKETS__`）

- Firestore：`events/{eventId}/tickets/{CODE}`。每个码在 **每个 `voteRoundId` 下各可成功投 1 次**（字段 `usedRounds` 记录已用轮次）。
- Cloud Function [`firebase-vote/functions/index.js`](../firebase-vote/functions/index.js) 内 **`ALLOWED_ROUND_IDS`** 为唯一合法值；前端 **`vote-config.js` 的 `voteRoundId`** 必须与之一致。
- **合法 `voteRoundId`（共 12 个）**  
  - 第一轮 PK 五组：`round1_pk_1` … `round1_pk_5`  
  - 复活投票：`round2_revival`  
  - 决赛每人一场：`final_perf_1` … `final_perf_6`

换环节时：改 `voteRoundId`（及 `candidates` / `sheetRow` 与 Google 表一致）→ **`npm run build`** → 重新部署静态资源；**无需**为每轮重新印票码（同一批码可跨轮使用，每轮各 1 次）。

## 其它 `VOTE_CODES` 模式

- **`DISABLED`**：不校验码；`roundId` 可不传（仍建议在 config 里写 `voteRoundId` 便于审计）。
- **内联码列表**：不扣 Firestore 票；`roundId` 不参与扣次（多轮防刷请用 `__TICKETS__`）。

## 浏览器「每机一票」

`vote-app.js` 的 localStorage key 含 **`eventId` + `voteRoundId`**，因此 **每一轮** 在同一浏览器可各投一次（与 `oneVotePerBrowser` / `lockBrowserAfterSubmit` 配置一致）。

## 部署顺序

1. 部署 **Firestore 规则**：[`firebase-vote/firestore.rules`](../firebase-vote/firestore.rules)（静态 `vote-static-page` 写入需带 `roundId`）。
2. 部署 **Cloud Functions**（`firebase deploy --only functions` 等）。
3. 发布前端 **`dist`**（含 `vote/`）。

## 旧数据（仅 `used: true`、无 `usedRounds`）

此类文档来自旧版「全局一次」逻辑：**该码在 `__TICKETS__` 下无法再投任何新轮次**。若需同一批码参与多轮，请在 Firestore 中删除对应 ticket 文档后重新 `seed-tickets.mjs` 写入，或手工改为 `used: false` 并补上合适的 `usedRounds`（慎用）。

## 选手与行号

Callable 与规则允许 **`s1`～`s6`**、**`sheetRow` 2～7**（决赛第六人可用 `s6` + 第 7 行）。当前示例页为 5 人复活；决赛 6 人时在 `vote-config.js` 里增加候选人并核对 Google 表行号。
