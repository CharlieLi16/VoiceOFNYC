/**
 * 观众票 HTTP 写入（与 voiceOfNYC-console 读表布局一致）
 * 部署为 Web 应用后，仅内部工具 POST，勿公开滥用。
 */
var ROUND1_SHEET = "Round1Audience";
var ROUND2_SHEET = "Round2Audience";

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: "empty body" });
    }
    var body = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (body.action === "setPair") {
      var sh = ss.getSheetByName(ROUND1_SHEET);
      if (!sh) return jsonOut({ ok: false, error: "missing " + ROUND1_SHEET });
      var r = parseInt(body.pairRow, 10);
      // 新表：A=组次 B=观众左 C=观众右 D=评委左 E=评委右（1-based 列号）
      var part = String(body.part || "audience").toLowerCase();
      var side = String(body.side || "left");
      var col;
      if (body.column != null) {
        col = parseInt(body.column, 10);
      } else if (part === "judge") {
        col =
          side.toLowerCase() === "right" || side.toUpperCase() === "B" ? 5 : 4;
      } else {
        // 观众票；兼容旧参数 side A/B → 左/右
        col =
          side.toLowerCase() === "right" || side.toUpperCase() === "B" ? 3 : 2;
      }
      if (col < 2 || col > 5) {
        return jsonOut({ ok: false, error: "column must be 2–5 (B–E)" });
      }
      sh.getRange(r, col).setValue(Number(body.value) || 0);
      return jsonOut({ ok: true });
    }

    if (body.action === "setFinal") {
      var sh2 = ss.getSheetByName(ROUND2_SHEET);
      if (!sh2) return jsonOut({ ok: false, error: "missing " + ROUND2_SHEET });
      var row = parseInt(body.row, 10);
      sh2.getRange(row, 2).setValue(Number(body.votes) || 0);
      return jsonOut({ ok: true });
    }

    if (body.action === "setFinalName") {
      var sh3 = ss.getSheetByName(ROUND2_SHEET);
      if (!sh3) return jsonOut({ ok: false, error: "missing " + ROUND2_SHEET });
      var row3 = parseInt(body.row, 10);
      sh3.getRange(row3, 1).setValue(String(body.name || ""));
      return jsonOut({ ok: true });
    }

    /** 累加票（适合自研投票页每次 POST +1）；可选脚本属性 VOTE_INGEST_SECRET 与 body.secret 一致 */
    if (body.action === "addFinalVote") {
      if (!checkVoteIngestSecret_(body)) {
        return jsonOut({ ok: false, error: "unauthorized" });
      }
      var sh4 = ss.getSheetByName(ROUND2_SHEET);
      if (!sh4) return jsonOut({ ok: false, error: "missing " + ROUND2_SHEET });
      var row4 = parseInt(body.row, 10);
      var d = Number(body.delta);
      if (!d) d = 1;
      var prev = sh4.getRange(row4, 2).getValue();
      var base = Number(prev) || 0;
      sh4.getRange(row4, 2).setValue(base + d);
      return jsonOut({ ok: true });
    }

    /** Round1 观众左/右或评委列累加；pairRow 为表数据行号（通常 2–6） */
    if (body.action === "addPairVote") {
      if (!checkVoteIngestSecret_(body)) {
        return jsonOut({ ok: false, error: "unauthorized" });
      }
      var sh5 = ss.getSheetByName(ROUND1_SHEET);
      if (!sh5) return jsonOut({ ok: false, error: "missing " + ROUND1_SHEET });
      var r5 = parseInt(body.pairRow, 10);
      var part5 = String(body.part || "audience").toLowerCase();
      var side5 = String(body.side || "left");
      var col5;
      if (body.column != null) {
        col5 = parseInt(body.column, 10);
      } else if (part5 === "judge") {
        col5 =
          side5.toLowerCase() === "right" || side5.toUpperCase() === "B" ? 5 : 4;
      } else {
        col5 =
          side5.toLowerCase() === "right" || side5.toUpperCase() === "B" ? 3 : 2;
      }
      if (col5 < 2 || col5 > 5) {
        return jsonOut({ ok: false, error: "column must be 2–5 (B–E)" });
      }
      var d5 = Number(body.delta);
      if (!d5) d5 = 1;
      var prev5 = sh5.getRange(r5, col5).getValue();
      var base5 = Number(prev5) || 0;
      sh5.getRange(r5, col5).setValue(base5 + d5);
      return jsonOut({ ok: true });
    }

    return jsonOut({ ok: false, error: "unknown action" });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err.message || err) });
  }
}

function checkVoteIngestSecret_(body) {
  var props = PropertiesService.getScriptProperties();
  var want = props.getProperty("VOTE_INGEST_SECRET");
  if (!want) return true;
  return String(body.secret || "") === want;
}

function doGet() {
  return jsonOut({
    ok: true,
    hint:
      "POST JSON: setPair | setFinal | setFinalName | addFinalVote {row,delta?,secret?} | addPairVote {pairRow,side,part?,delta?,secret?}；可选脚本属性 VOTE_INGEST_SECRET",
  });
}
