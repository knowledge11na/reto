// file: app/api/solo/age-sort/route.js


import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

function cleanStr(v) {
  return String(v ?? "").trim();
}

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), "data", "age.xlsx");

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        ok: false,
        message: `age.xlsx が見つかりません：${filePath}`,
      });
    }

    const buffer = fs.readFileSync(filePath);

    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames?.[0];

    if (!sheetName) {
      return NextResponse.json({
        ok: false,
        message: "age.xlsx のシートが見つかりません",
      });
    }

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    const list = [];

// 1行目からデータ
for (let i = 0; i < rows.length; i++) {
  const r = rows[i] || [];

  const name = cleanStr(r[0]);
  if (!name) continue;

  const ageText = cleanStr(r[1]);

  if (
    !ageText ||
    ageText === "不明"
  ) {
    continue;
  }

  const age = Number(ageText);

  if (!Number.isFinite(age)) continue;

  list.push({
    name,
    age,
  });
}

    if (list.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "年齢データが取得できませんでした",
      });
    }

    return NextResponse.json({
      ok: true,
      list,
    });

  } catch (e) {
    console.error("[solo-age-sort]", e);

    return NextResponse.json({
      ok: false,
      message: `age-sort データの読み込みに失敗しました: ${String(
        e?.message || e
      )}`,
    });
  }
}