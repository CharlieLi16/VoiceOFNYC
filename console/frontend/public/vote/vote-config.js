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
   */
  voteRoundId: "round1_pk_1",
  firebase: {
    apiKey: "AIzaSyDvzMnypwlgztNNPG_T6BJbbQ-FzzGp9MU",
    authDomain: "voiceofnyc-e8f3b.firebaseapp.com",
    storageBucket: "voiceofnyc-e8f3b.firebasestorage.app",
    projectId: "voiceofnyc-e8f3b",
    appId: "1:797810284806:web:3616adb3b1949919bb2687",
  },
  /**
   * 初赛五组固定对阵（与大屏 /img 1～10、Round1Audience 第 2～6 行五对 PK 一致）。
   * 当 Firestore 未发布该轮的 voteUi.rounds.{roundId}.candidates 时，vote.html 用本映射；若已按轮发布则以 Firestore 为准。
   * 左=较小号码、右=较大号码。**sheetRow 填该组在表上的数据行（2～6），两人相同**（左 B 列 / 右 C 列）；写票只认 roundId+pairSide。
   */
  round1PkByRoundId: {
    round1_pk_1: [
      { id: "s1", sheetRow: 2, label: "选手 1", img: "/img/contestants/1.jpg" },
      { id: "s2", sheetRow: 2, label: "选手 2", img: "/img/contestants/2.jpg" },
    ],
    round1_pk_2: [
      { id: "s3", sheetRow: 3, label: "选手 3", img: "/img/contestants/3.jpg" },
      { id: "s4", sheetRow: 3, label: "选手 4", img: "/img/contestants/4.jpg" },
    ],
    round1_pk_3: [
      { id: "s5", sheetRow: 4, label: "选手 5", img: "/img/contestants/5.jpg" },
      { id: "s6", sheetRow: 4, label: "选手 6", img: "/img/contestants/6.jpg" },
    ],
    round1_pk_4: [
      { id: "s7", sheetRow: 5, label: "选手 7", img: "/img/contestants/7.jpg" },
      { id: "s8", sheetRow: 5, label: "选手 8", img: "/img/contestants/8.jpg" },
    ],
    round1_pk_5: [
      { id: "s9", sheetRow: 6, label: "选手 9", img: "/img/contestants/9.jpg" },
      { id: "s10", sheetRow: 6, label: "选手 10", img: "/img/contestants/10.jpg" },
    ],
  },
  /**
   * 复活赛 / 决赛等多人选一轮：与 Round2Audience 6 人、表行 2～7 对齐。
   * 初赛仅作兜底（无 round1PkByRoundId 条目时）；有映射时以 round1PkByRoundId 为准。
   */
  candidates: [
    { id: "s1", sheetRow: 2, label: "Siwei", img: "/img/contestants/1.jpg" },
    { id: "s2", sheetRow: 3, label: "选手 2", img: "/img/contestants/2.jpg" },
    { id: "s3", sheetRow: 4, label: "选手 3", img: "/img/contestants/3.jpg" },
    { id: "s4", sheetRow: 5, label: "选手 4", img: "/img/contestants/4.jpg" },
    { id: "s5", sheetRow: 6, label: "选手 5", img: "/img/contestants/5.jpg" },
    { id: "s6", sheetRow: 7, label: "选手 6", img: "/img/contestants/6.jpg" },
  ],
  /** 同一浏览器是否只允许投一票（localStorage，按浏览器配置而非设备指纹；换浏览器/无痕可再投） */
  oneVotePerBrowser: true,
  /** 是否显示投票码输入框（false 时需 Secret VOTE_CODES=DISABLED，否则服务端会拒写入表格） */
  requireVoteCode: true,
  /**
   * 联调用：与 Firebase `VOTE_TEST_CODE` 一致时显示「填入测试码」，且不消耗 Firestore 真实票。
   * 正式现场改回 ""（空字符串）。
   */
  testVoteCode: "cssa2026",
  /**
   * 是否在提交成功后锁本机一次：默认「要投票码时不锁」（避免错码仍占死一次），「不要投票码时锁」。
   * 现场每人只投一票且码必对时，可设 requireVoteCode:true + lockBrowserAfterSubmit:true
   */
  lockBrowserAfterSubmit: false,
  /** 与 Cloud Functions 中 submitVote 部署区域一致 */
  functionsRegion: "us-east4",
  /** 本机 http://localhost:5173 默认已跳过 voteUi；用手机扫局域网 IP 打开时若被线上 voteUi 搞乱，可取消下行注释 */
  // ignoreFirestoreVoteUi: true,
};
