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
  candidates: [
    { id: "s1", sheetRow: 2, label: "选手 1", img: "/img/contestants/1.jpg" },
  ],
  oneVotePerBrowser: true,
  requireVoteCode: true,
  lockBrowserAfterSubmit: false,
  functionsRegion: "us-east4",
};
