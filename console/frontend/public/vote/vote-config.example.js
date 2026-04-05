/**
 * 复制为 vote-config.js 后填写；勿把含真实密钥的文件提交到公开仓库（若介意 apiKey 可见性）。
 */
window.__VOTE_PAGE_CONFIG = {
  /** 须与 Cloud Function ALLOWED_EVENT_ID、firestore.rules 一致 */
  eventId: "voiceofnyc",
  /** 默认轮次；可被 URL ?roundId= 覆盖（与 functions/index.js ALLOWED_ROUND_IDS 一致） */
  voteRoundId: "round2_revival",
  firebase: {
    apiKey: "REPLACE_ME",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    appId: "REPLACE_ME",
  },
  /**
   * 可选：初赛五组固定 1v2、3v4…（round1_pk_* 时 vote.html 优先于此，覆盖 Firestore candidates）。
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
   */
  candidates: [
    { id: "s1", sheetRow: 2, label: "选手 1", img: "/img/contestants/1.jpg" },
  ],
  oneVotePerBrowser: true,
  requireVoteCode: true,
  lockBrowserAfterSubmit: false,
  functionsRegion: "us-east4",
  /** 任意环境强制不读 Firestore voteUi（仅用本文件） */
  // ignoreFirestoreVoteUi: true,
  /** 在 localhost 上仍要合并线上 voteUi 时设为 true（默认本机不合并） */
  // mergeFirestoreVoteUi: true,
};
