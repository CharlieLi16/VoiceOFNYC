/**
 * 在当前表格中创建 / 重置 Voice of NYC 控制台所需的观众投票 Tab。
 *
 * 用法（须打开目标 Google 表格）：
 * 1. 扩展程序 → Apps Script → 粘贴本文件全部内容 → 保存
 * 2. 选中函数 setupVoiceOfNYCConsoleSheets → 运行
 * 3. 首次运行按提示授权「编辑自己的 Google 表格」
 *
 * 会写入：
 * - Round1Audience：覆盖 A1:E6（表头 + 五轮 PK：组次 + 观众左/右 + 评委折算左/右）
 * - Round2Audience：覆盖 A1:B7（表头 + 6 人姓名/票数，复活投票）
 * - Round3Audience：覆盖 A1:I7（B=观众均分公式 H/I；C–E 三评委；F/G 公式；H/I 投票页累计列）
 *
 * 评委两列：现场可把 3 位评委的 10 票按规则拆成左右两格（建议两格合计=10，亦可自定）。
 * 大屏柱高 = (观众左+评委左) : (观众右+评委右) 的占比。
 *
 * 若 Tab 已有数据，请先备份再运行。
 */
var SETUP_R1 = "Round1Audience";
var SETUP_R2 = "Round2Audience";
var SETUP_R3 = "Round3Audience";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("VoiceOfNYC 控制台")
    .addItem("初始化观众投票表（Round1 + Round2 + Round3）", "setupVoiceOfNYCConsoleSheets")
    .addToUi();
}

function getOrCreateSheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (sh) return sh;
  return ss.insertSheet(name);
}

function setupVoiceOfNYCConsoleSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error("请从 Google 表格里打开本脚本（扩展程序 → Apps Script），不要独立创建无绑定表格的脚本。");
  }

  var r1 = getOrCreateSheet_(ss, SETUP_R1);
  var r2 = getOrCreateSheet_(ss, SETUP_R2);
  var r3 = getOrCreateSheet_(ss, SETUP_R3);

  // 与 VITE_ROUND1_AUDIENCE_RANGE 默认 Round1Audience!A2:E6 配套（第 1 行表头）
  r1.getRange(1, 1, 6, 5).setValues([
    [
      "组次/PK",
      "观众票·左",
      "观众票·右",
      "评委票·左（折算）",
      "评委票·右（折算）",
    ],
    ["第一轮", 0, 0, 0, 0],
    ["第二轮", 0, 0, 0, 0],
    ["第三轮", 0, 0, 0, 0],
    ["第四轮", 0, 0, 0, 0],
    ["第五轮", 0, 0, 0, 0],
  ]);

  r2.getRange(1, 1, 7, 2).setValues([
    ["姓名", "票数"],
    ["选手1", 0],
    ["选手2", 0],
    ["选手3", 0],
    ["选手4", 0],
    ["选手5", 0],
    ["选手6", 0],
  ]);

  var r3Headers = [
    "姓名",
    "观众均分",
    "评委1",
    "评委2",
    "评委3",
    "评委均分",
    "最终分（0.6×评委+0.4×观众）",
    "观众打分累计",
    "观众投票人次",
  ];
  // C–E 留空（勿填 0）：否则 COUNT(C:E)=3，评委均分 F 会显示 0.00，最终分 G 会误用 0.6×0
  var r3Rows = [
    r3Headers,
    ["选手1", "", "", "", "", "", "", 0, 0],
    ["选手2", "", "", "", "", "", "", 0, 0],
    ["选手3", "", "", "", "", "", "", 0, 0],
    ["选手4", "", "", "", "", "", "", 0, 0],
    ["选手5", "", "", "", "", "", "", 0, 0],
    ["选手6", "", "", "", "", "", "", 0, 0],
  ];
  r3.getRange(1, 1, 7, 9).setValues(r3Rows);
  for (var rr = 2; rr <= 7; rr++) {
    r3.getRange(rr, 2).setFormula(
      '=IF(I' + rr + '=0,"",ROUND(H' + rr + "/I" + rr + ",4))"
    );
    r3.getRange(rr, 6).setFormula(
      "=IF(COUNT(C" + rr + ":E" + rr + ')=0,"",ROUND(AVERAGE(C' + rr + ":E" + rr + "),4))"
    );
    r3.getRange(rr, 7).setFormula(
      "=IF(AND(ISNUMBER(B" +
        rr +
        "),ISNUMBER(F" +
        rr +
        ")),ROUND(0.6*F" +
        rr +
        "+0.4*B" +
        rr +
        ',4),"")'
    );
  }

  SpreadsheetApp.getUi().alert(
    "已完成",
    "已写入「" +
      SETUP_R1 +
      "」（A1:E6）、「" +
      SETUP_R2 +
      "」（A1:B7，复活票数）与「" +
      SETUP_R3 +
      "」（A1:I7，决赛含 H/I 观众累计列）。请将表格共享为「知道链接的任何人可查看」以便前端 API Key 读取。",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}
