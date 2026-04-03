#!/usr/bin/env node
/**
 * 批量生成一次性投票码并写入 Firestore：events/{eventId}/tickets/{CODE}
 *
 * 用法：
 *   cd console/firebase-vote/scripts && npm install
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *   node seed-tickets.mjs --event voiceofnyc-revival -n 300
 *
 * 默认 CSV 路径：../data/vote-codes.csv（与仓库内 console/firebase-vote/data/ 一致）
 *
 * 选项：
 *   --event   与 vote-config.js 的 eventId 一致（必填）
 *   -n        生成数量（默认 300）
 *   -o        覆盖默认 CSV 路径
 *   --dry-run 只写 CSV / 或仅生成不写 Firestore（见下）
 */

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomInt } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import admin from "firebase-admin";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** 与 console/firebase-vote/data 对齐 */
const DEFAULT_CSV = join(__dirname, "..", "data", "vote-codes.csv");

const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function parseArgs() {
  const a = process.argv.slice(2);
  const out = { event: "", n: 300, file: "", dry: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--event") out.event = a[++i] || "";
    else if (a[i] === "-n") out.n = Math.max(1, parseInt(a[++i], 10) || 300);
    else if (a[i] === "-o") out.file = a[++i] || "";
    else if (a[i] === "--dry-run") out.dry = true;
  }
  if (!out.file) out.file = DEFAULT_CSV;
  return out;
}

function makeCode() {
  let s = "";
  for (let i = 0; i < 12; i++) {
    if (i === 4 || i === 8) s += "-";
    s += CHARS[randomInt(CHARS.length)];
  }
  return s;
}

async function main() {
  const { event, n, file, dry } = parseArgs();
  if (!event) {
    console.error("缺少 --event（与 vote-config eventId 相同）");
    process.exit(1);
  }

  const codes = new Set();
  while (codes.size < n) {
    codes.add(makeCode());
  }
  const list = [...codes];

  const outDir = dirname(file);
  await mkdir(outDir, { recursive: true });

  const ws = createWriteStream(file, { encoding: "utf8" });
  ws.write("code\n");
  for (const c of list) ws.write(`${c}\n`);
  ws.end();
  await new Promise((resolve, reject) => {
    ws.on("finish", resolve);
    ws.on("error", reject);
  });
  console.log(`已写入 ${list.length} 条到 ${file}`);

  if (dry) {
    console.log("--dry-run：未写 Firestore");
    process.exit(0);
  }

  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.FIREBASE_CONFIG) {
    console.warn(
      "提示：未设置 GOOGLE_APPLICATION_CREDENTIALS；将尝试本机 Application Default Credentials（如 gcloud auth application-default login）"
    );
  }

  admin.initializeApp();
  const db = admin.firestore();
  const col = db.collection("events").doc(event).collection("tickets");

  const batchSize = 400;
  for (let i = 0; i < list.length; i += batchSize) {
    const batch = db.batch();
    const chunk = list.slice(i, i + batchSize);
    for (const code of chunk) {
      const ref = col.doc(code);
      batch.set(ref, {
        used: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
    console.log(`已写入 Firestore ${Math.min(i + batchSize, list.length)} / ${list.length}`);
  }

  console.log("完成。CSV 在 console/firebase-vote/data/；Cloud Function 会在首次有效投票后将对应票标记为 used。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
