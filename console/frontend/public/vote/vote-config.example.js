/**
 * 复制为 vote-config.js 后填写；勿把含真实密钥的文件提交到公开仓库（若介意 apiKey 可见性）。
 */
window.__VOTE_PAGE_CONFIG = {
  eventId: "your-event-id",
  /** 默认轮次；可被 URL ?roundId= 覆盖（与 functions/index.js ALLOWED_ROUND_IDS 一致） */
  voteRoundId: "round2_revival",
  firebase: {
    apiKey: "REPLACE_ME",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    appId: "REPLACE_ME",
  },
  /**
   * 可选：初赛五组固定 1v2、3v4…（仅当未发布 voteUi.rounds.{roundId}.candidates 时生效）。
   * 同组两人 sheetRow 相同 = Round1Audience 该对数据行（2～6）；写表仍由 roundId + pairSide。
   */
  round1PkByRoundId: {
    round1_pk_1: [
      { id: "s1", sheetRow: 2, label: "选手 1", img: "/img/contestants/1.jpg" },
      { id: "s2", sheetRow: 2, label: "选手 2", img: "/img/contestants/2.jpg" },
    ],
  },
  /**
   * 多人轮次（复活/决赛）：1～6 人，sheetRow 2～7。
   * 初赛若未配 round1PkByRoundId 某组，可在此写恰好 2 人作兜底。
   * 工作人员可在 vote/index.html 按环节发布到 Firestore voteUi.rounds（字段与此相同）；某轮未发布选手时观众端回退到本文件。
   */
  candidates: [
    { id: "s1", sheetRow: 2, label: "选手 1", img: "/img/contestants/1.jpg" },
  ],
  oneVotePerBrowser: true,
  requireVoteCode: true,
  /**
   * 联调用：与 Functions 的 VOTE_TEST_CODE 一致时 Callable 放行且不扣票。
   * 非空时：仅当本浏览器已在控台 /login 工作人员登录后，投票页才显示「填入测试码」与 ?testVote=1 预填（与 staffPortal 同源）。
   * 正式现场留空。
   */
  // testVoteCode: "CSSA-VOTE-TEST",
  /** 设为 false 则忽略 URL 里的 voteCode/code（默认会从 ?voteCode= 预填，方便短信私发） */
  // allowVoteCodeFromUrl: false,
  lockBrowserAfterSubmit: true,
  functionsRegion: "us-east4",
  /** 任意环境强制不读 Firestore voteUi（仅用本文件） */
  // ignoreFirestoreVoteUi: true,
  /** 在 localhost 上仍要合并线上 voteUi 时设为 true（默认本机不合并） */
  // mergeFirestoreVoteUi: true,
};
