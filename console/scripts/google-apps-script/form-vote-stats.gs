  /**
  * Google 表单回复表 → 统计「请选择你心动的声音」票数
  *
  * 用法：
  * 1. 打开承载「表单回复」的 Google 表格 → 扩展程序 → Apps Script
  * 2. 新建脚本，粘贴本文件全部内容并保存
  * 3. 改下方 CFG.RESPONSE_SHEET_NAMES；若某轮左下角是中文（如「表单回复 4」）与英文不一致，把实际名称填进 RESPONSE_SHEET_ALIASES 同下标
  * 4. 首次运行需在授权对话框中允许访问当前表格
  * 5. 回到表格刷新页面，菜单「心动统计」→ 运行对应统计
  *
  * 列约定（第 1 行为表头）：
  *   Timestamp | 请选择你心动的声音 | 投票码
  *
  * 白名单（vote-codes 工作表）：
  * - PER_ROUND_VOTE_CODES = true（默认）：第 A 列只用于第 1 轮、B 列只用于第 2 轮……与 RESPONSE_SHEET_NAMES 顺序一一对应；
  *   每轮单独计数、去重也只在当轮表单内进行，互不混用。
  * - PER_ROUND_VOTE_CODES = false：仅读 A 列，各轮共用同一列表（旧行为）。
  * 每列首格可为表头 code（与 CSV 一致），其余行为单元格为投票码。
  */

  var CFG = {
    /** 多轮表单：每个标签各统计一块；表结构需一致（Timestamp / 心动选项 / 投票码） */
    RESPONSE_SHEET_NAMES: [
      "Form Responses 1",
      "Form Responses 2",
      "Form Responses 3",
    "Form Responses 4",
    "Form Responses 5",
  ],
  /**
  * 与 RESPONSE_SHEET_NAMES 同下标；某轮左下角标签与上面英文不一致时在此写实际名称（如第 4 轮常见为「表单回复 4」）
  */
  RESPONSE_SHEET_ALIASES: [null, null, null, null, null],
  /**
  * true：vote-codes 表中第 1～N 列分别对应第 1～N 个表单回复表，各轮投票码白名单独立。
    * false：只读 A 列，所有轮次共用同一白名单。
    */
    PER_ROUND_VOTE_CODES: true,
    OUTPUT_SHEET_NAME: "统计",
    /** 粘贴各轮投票码的工作表名；按列分轮时填满 A～E（或更多列与轮次对齐） */
    VALID_CODES_SHEET_NAME: "vote-codes",
    HEADER_TIMESTAMP: "Timestamp",
    HEADER_CHOICE: "请选择你心动的声音",
    HEADER_CODE: "投票码",
  };

  function onOpen() {
    SpreadsheetApp.getUi()
      .createMenu("心动统计")
      .addItem("全量计数（1～5 各表；每轮独立白名单列）", "runStatsCountAllRows")
      .addItem("按投票码去重（每轮表内去重，轮次不合并）", "runStatsDedupeByVoteCode")
      .addSeparator()
      .addItem("清空统计表", "clearOutputSheet")
      .addToUi();
  }

  function findColIndex_(headers, name) {
    for (var i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === name) {
        return i;
      }
    }
    throw new Error("找不到表头列：「" + name + "」");
  }

  /** 工作表标签：去首尾空白、合并连续空格、NBSP→空格、忽略大小写（用于与左下角名称对齐） */
  function normalizeSheetTitle_(name) {
    return String(name || "")
      .replace(/\u00a0/g, " ")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function listSheetNames_(ss) {
    return ss
      .getSheets()
      .map(function (s) {
        return s.getName();
      })
      .join(" | ");
  }

  function formatMissingSheetError_(ss, roundNumber1Based, configuredName, roundIndex0) {
    return (
      "找不到第 " +
      roundNumber1Based +
      " 轮回复表（已尝试「" +
      configuredName +
      "」及别名）。当前表格左下角全部标签：" +
      listSheetNames_(ss) +
      "。请把该轮实际名称填进 CFG.RESPONSE_SHEET_NAMES 或 RESPONSE_SHEET_ALIASES[" +
      roundIndex0 +
      "]（须与标签完全一致）。"
    );
  }

  /**
  * 先精确 getSheetByName，再对别名与配置名做「忽略大小写/多空格」全表扫描
  */
  function findResponseSheetForRound_(ss, roundIndex) {
    var aliases = CFG.RESPONSE_SHEET_ALIASES || [];
    var tryNames = [];
    var a = aliases[roundIndex];
    if (a != null && String(a).replace(/\s/g, "") !== "") {
      tryNames.push(String(a).trim());
    }
    tryNames.push(CFG.RESPONSE_SHEET_NAMES[roundIndex]);

    var t;
    var sh;
    for (t = 0; t < tryNames.length; t++) {
      sh = ss.getSheetByName(tryNames[t]);
      if (sh) {
        return sh;
      }
    }

    var sheets = ss.getSheets();
    for (t = 0; t < tryNames.length; t++) {
      var want = normalizeSheetTitle_(tryNames[t]);
      for (var s = 0; s < sheets.length; s++) {
        if (normalizeSheetTitle_(sheets[s].getName()) === want) {
          return sheets[s];
        }
      }
    }
    return null;
  }

  /**
  * @return {{ body: Array, error: string|null, displaySheetName: string }}
  */
  function readResponseBodyFromSheet_(sh) {
    var displaySheetName = sh.getName();
    var data = sh.getDataRange().getValues();
    if (data.length < 2) {
      return {
        body: [],
        error: null,
        displaySheetName: displaySheetName,
      };
    }
    var headers = data[0];
    var colTs;
    var colChoice;
    var colCode;
    try {
      colTs = findColIndex_(headers, CFG.HEADER_TIMESTAMP);
      colChoice = findColIndex_(headers, CFG.HEADER_CHOICE);
      colCode = findColIndex_(headers, CFG.HEADER_CODE);
    } catch (e) {
      return {
        body: [],
        error:
          "「" +
          displaySheetName +
          "」表头不匹配（须含 Timestamp / 请选择你心动的声音 / 投票码）：" +
          String(e.message),
        displaySheetName: displaySheetName,
      };
    }

    var body = [];
    for (var r = 1; r < data.length; r++) {
      body.push({
        ts: data[r][colTs],
        choice: data[r][colChoice],
        code: String(data[r][colCode] || "").trim(),
      });
    }
    return { body: body, error: null, displaySheetName: displaySheetName };
  }

  /**
  * @return {{ body: Array, error: string|null, displaySheetName: string }}
  */
  function loadResponseBodyForRound_(ss, roundIndex) {
    var configured = CFG.RESPONSE_SHEET_NAMES[roundIndex];
    var sh = findResponseSheetForRound_(ss, roundIndex);
    if (!sh) {
      return {
        body: [],
        error: formatMissingSheetError_(ss, roundIndex + 1, configured, roundIndex),
        displaySheetName: configured,
      };
    }
    return readResponseBodyFromSheet_(sh);
  }

  /** 与后端/签到一致：去空格、大写 */
  function normalizeVoteCode_(raw) {
    return String(raw || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();
  }

  function getVoteCodesSheet_() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(CFG.VALID_CODES_SHEET_NAME);
    if (!sh) {
      throw new Error(
        "找不到白名单工作表「" +
          CFG.VALID_CODES_SHEET_NAME +
          "」。请将各轮投票码粘贴到该表（按列分轮时 A～E 对应 1～5 轮）。"
      );
    }
    return sh;
  }

  /**
  * 读取 vote-codes 指定列（1-based）为白名单；首行可为表头 CODE
  * @return {Object<string, boolean>}
  */
  function loadValidCodeSetFromColumn_(sh, col1Based) {
    var last = sh.getLastRow();
    if (last < 1) {
      return {};
    }
    var vals = sh.getRange(1, col1Based, last, col1Based).getValues();
    var set = {};
    for (var i = 0; i < vals.length; i++) {
      var c = normalizeVoteCode_(vals[i][0]);
      if (!c) {
        continue;
      }
      if (i === 0 && c === "CODE") {
        continue;
      }
      set[c] = true;
    }
    return set;
  }

  /**
  * 各轮共用：只读 A 列，须非空
  * @return {Object<string, boolean>}
  */
  function loadValidCodeSet_() {
    var sh = getVoteCodesSheet_();
    var set = loadValidCodeSetFromColumn_(sh, 1);
    if (Object.keys(set).length === 0) {
      throw new Error(
        "白名单内没有有效投票码（请检查「" +
          CFG.VALID_CODES_SHEET_NAME +
          "」A 列是否与 vote-codes.csv 一致）。"
      );
    }
    return set;
  }

  /**
  * 第 roundIndex 轮（0-based，对应 Form Responses 1）的白名单
  * @return {{ set: Object<string, boolean>, empty: boolean, col: number }}
  */
  function loadValidCodeSetForRoundIndex_(roundIndex) {
    var sh = getVoteCodesSheet_();
    var col = roundIndex + 1;
    var set = loadValidCodeSetFromColumn_(sh, col);
    return {
      set: set,
      empty: Object.keys(set).length === 0,
      col: col,
    };
  }

  /**
  * 只保留投票码在白名单内的行
  */
  function filterBodyByWhitelist_(body, validSet) {
    var out = [];
    for (var i = 0; i < body.length; i++) {
      var n = normalizeVoteCode_(body[i].code);
      if (n && validSet[n]) {
        out.push(body[i]);
      }
    }
    return out;
  }

  function rowTimeMs_(ts) {
    if (ts instanceof Date) {
      return ts.getTime();
    }
    var t = new Date(ts).getTime();
    return isNaN(t) ? 0 : t;
  }

  /**
  * 同一投票码（规范化后）只保留时间戳最大的一行
  */
  function dedupeByCodeKeepLatest_(body) {
    var best = {};
    for (var i = 0; i < body.length; i++) {
      var row = body[i];
      var key = normalizeVoteCode_(row.code);
      if (!key) {
        continue;
      }
      var ms = rowTimeMs_(row.ts);
      var prev = best[key];
      if (!prev || ms >= rowTimeMs_(prev.ts)) {
        best[key] = row;
      }
    }
    var out = [];
    for (var code in best) {
      if (best.hasOwnProperty(code)) {
        out.push(best[code]);
      }
    }
    return out;
  }

  function countByChoice_(rows) {
    var counts = {};
    for (var i = 0; i < rows.length; i++) {
      var choice = String(rows[i].choice || "").trim();
      if (!choice) {
        continue;
      }
      counts[choice] = (counts[choice] || 0) + 1;
    }
    return counts;
  }

  /**
  * @param {Array<{ sheetName: string, counts: Object<string,number>, note: string }>} sections
  * @param {string} titleSuffix 弹窗说明用
  */
  function writeStatsSheetSections_(sections, titleSuffix) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var name = CFG.OUTPUT_SHEET_NAME;
    var out = ss.getSheetByName(name);
    if (!out) {
      out = ss.insertSheet(name);
    }
    out.clearContents();

    var header = [["工作表", "选项", "票数", "占比", "说明"]];
    var allRows = header.slice();
    var totalVotes = 0;

    for (var s = 0; s < sections.length; s++) {
      var sec = sections[s];
      var keys = [];
      for (var k in sec.counts) {
        if (sec.counts.hasOwnProperty(k)) {
          keys.push(k);
        }
      }
      keys.sort();
      var sectionTotal = 0;
      for (var i = 0; i < keys.length; i++) {
        sectionTotal += sec.counts[keys[i]];
      }
      totalVotes += sectionTotal;

      if (keys.length === 0) {
        allRows.push([sec.sheetName, "（无）", 0, 0, sec.note || ""]);
        continue;
      }
      for (var j = 0; j < keys.length; j++) {
        var label = keys[j];
        var n = sec.counts[label];
        var pct = sectionTotal > 0 ? n / sectionTotal : 0;
        allRows.push([sec.sheetName, label, n, pct, j === 0 ? sec.note : ""]);
      }
    }

    out.getRange(1, 1, allRows.length, 5).setValues(allRows);
    if (allRows.length > 1) {
      out.getRange(2, 4, allRows.length, 4).setNumberFormat("0.00%");
    }

    out.setFrozenRows(1);
    out.autoResizeColumns(1, 5);

    SpreadsheetApp.getUi().alert(
      "已写入「" +
        name +
        "」（" +
        titleSuffix +
        "）。占比按各工作表内合计；合计有效票：" +
        totalVotes
    );
  }

  function runStatsCountAllRows() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sharedSet = null;
    if (!CFG.PER_ROUND_VOTE_CODES) {
      sharedSet = loadValidCodeSet_();
    }
    var names = CFG.RESPONSE_SHEET_NAMES;
    var sections = [];
    for (var i = 0; i < names.length; i++) {
      var sn = names[i];
      var validSet;
      var whitelistHint = "";
      if (CFG.PER_ROUND_VOTE_CODES) {
        var loadedW = loadValidCodeSetForRoundIndex_(i);
        if (loadedW.empty) {
          sections.push({
            sheetName: sn,
            counts: {},
            note:
              "第 " +
              loadedW.col +
              " 列（本轮白名单）无有效码；请在「" +
              CFG.VALID_CODES_SHEET_NAME +
              "」该列粘贴本轮 vote-codes",
          });
          continue;
        }
        validSet = loadedW.set;
        whitelistHint = "本轮仅第 " + loadedW.col + " 列白名单";
      } else {
        validSet = sharedSet;
        whitelistHint = "共用 A 列白名单";
      }

      var loaded = loadResponseBodyForRound_(ss, i);
      var tabLabel = loaded.displaySheetName || sn;
      if (loaded.error) {
        sections.push({
          sheetName: tabLabel,
          counts: {},
          note: loaded.error,
        });
        continue;
      }
      if (!loaded.body.length) {
        sections.push({
          sheetName: tabLabel,
          counts: {},
          note: "无数据行（仅表头或空表）",
        });
        continue;
      }
      var before = loaded.body.length;
      var filtered = filterBodyByWhitelist_(loaded.body, validSet);
      if (!filtered.length) {
        sections.push({
          sheetName: tabLabel,
          counts: {},
          note:
            "白名单过滤后无数据；原始 " +
            before +
            " 行（" +
            whitelistHint +
            "）",
        });
        continue;
      }
      var counts = countByChoice_(filtered);
      var note =
        "全量：每轮单独计票；" +
        whitelistHint +
        "；原始 " +
        before +
        " → 有效 " +
        filtered.length;
      sections.push({ sheetName: tabLabel, counts: counts, note: note });
    }
    writeStatsSheetSections_(sections, "全量计数");
  }

  function runStatsDedupeByVoteCode() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sharedSet = null;
    if (!CFG.PER_ROUND_VOTE_CODES) {
      sharedSet = loadValidCodeSet_();
    }
    var names = CFG.RESPONSE_SHEET_NAMES;
    var sections = [];
    for (var i = 0; i < names.length; i++) {
      var sn = names[i];
      var validSet;
      var whitelistHint = "";
      if (CFG.PER_ROUND_VOTE_CODES) {
        var loadedW = loadValidCodeSetForRoundIndex_(i);
        if (loadedW.empty) {
          sections.push({
            sheetName: sn,
            counts: {},
            note:
              "第 " +
              loadedW.col +
              " 列（本轮白名单）无有效码；请在「" +
              CFG.VALID_CODES_SHEET_NAME +
              "」该列粘贴本轮 vote-codes",
          });
          continue;
        }
        validSet = loadedW.set;
        whitelistHint = "本轮仅第 " + loadedW.col + " 列白名单";
      } else {
        validSet = sharedSet;
        whitelistHint = "共用 A 列白名单";
      }

      var loaded = loadResponseBodyForRound_(ss, i);
      var tabLabel = loaded.displaySheetName || sn;
      if (loaded.error) {
        sections.push({
          sheetName: tabLabel,
          counts: {},
          note: loaded.error,
        });
        continue;
      }
      if (!loaded.body.length) {
        sections.push({
          sheetName: tabLabel,
          counts: {},
          note: "无数据行（仅表头或空表）",
        });
        continue;
      }
      var before = loaded.body.length;
      var filtered = filterBodyByWhitelist_(loaded.body, validSet);
      if (!filtered.length) {
        sections.push({
          sheetName: tabLabel,
          counts: {},
          note:
            "白名单过滤后无数据；原始 " +
            before +
            " 行（" +
            whitelistHint +
            "）",
        });
        continue;
      }
      var deduped = dedupeByCodeKeepLatest_(filtered);
      var counts = countByChoice_(deduped);
      var note =
        "去重：每轮内每码取最新（轮与轮之间不合并）；" +
        whitelistHint +
        "；原始 " +
        before +
        " → 有效行 " +
        filtered.length +
        " → 去重后 " +
        deduped.length +
        " 票";
      sections.push({ sheetName: tabLabel, counts: counts, note: note });
    }
    writeStatsSheetSections_(sections, "按投票码去重");
  }

  function clearOutputSheet() {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var out = ss.getSheetByName(CFG.OUTPUT_SHEET_NAME);
    if (out) {
      out.clearContents();
    }
    SpreadsheetApp.getUi().alert("已清空「" + CFG.OUTPUT_SHEET_NAME + "」。");
  }
