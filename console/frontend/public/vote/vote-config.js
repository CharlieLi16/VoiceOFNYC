/**
 * 现场投票页配置（可提交到仓库；Firebase Web API Key 可公开，靠 Firestore 规则防刷）
 * 复制自 vote-config.example.js 后按项目修改即可。
 */
window.__VOTE_PAGE_CONFIG = {
  /** Firestore 里用于分区投票；Cloud Function 可按 eventId 过滤 */
  eventId: "voiceofnyc-revival",
  /**
   * 默认投票轮次（与 Cloud Function ALLOWED_ROUND_IDS 一致）。
   * 若 URL 带 ?roundId=xxx 则优先用链接（现场 PPT 可只换链接、不重新部署）。
   * 例：round1_pk_1～5、round2_revival、final_perf_1～6
   */
  voteRoundId: "round2_revival",
  firebase: {
    apiKey: "AIzaSyDvzMnypwlgztNNPG_T6BJbbQ-FzzGp9MU",
    authDomain: "voiceofnyc-e8f3b.firebaseapp.com",
    storageBucket: "voiceofnyc-e8f3b.firebasestorage.app",
    projectId: "voiceofnyc-e8f3b",
    appId: "1:797810284806:web:3616adb3b1949919bb2687",
  },
  /**
   * sheetRow：与 Round2Audience 数据行一致（第 1 行表头，选手 1 常为第 2 行 → 2）
   * img：相对当前站点根路径，部署时与 console 的 public/img 一致即可
   */
  candidates: [
    { id: "s1", sheetRow: 2, label: "选手 1", img: "/img/contestants/1.jpg" },
    { id: "s2", sheetRow: 3, label: "选手 2", img: "/img/contestants/2.jpg" },
    { id: "s3", sheetRow: 4, label: "选手 3", img: "/img/contestants/3.jpg" },
    { id: "s4", sheetRow: 5, label: "选手 4", img: "/img/contestants/4.jpg" },
    { id: "s5", sheetRow: 6, label: "选手 5", img: "/img/contestants/5.jpg" },
  ],
  /** 同一浏览器是否只允许投一票（localStorage，按浏览器配置而非设备指纹；换浏览器/无痕可再投） */
  oneVotePerBrowser: true,
  /** 是否显示投票码输入框（false 时需 Secret VOTE_CODES=DISABLED，否则服务端会拒写入表格） */
  requireVoteCode: true,
  /**
   * 是否在提交成功后锁本机一次：默认「要投票码时不锁」（避免错码仍占死一次），「不要投票码时锁」。
   * 现场每人只投一票且码必对时，可设 requireVoteCode:true + lockBrowserAfterSubmit:true
   */
  lockBrowserAfterSubmit: false,
  /** 与 Cloud Functions 中 submitVote 部署区域一致 */
  functionsRegion: "us-east4",
};
