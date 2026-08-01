// file: app/api/solo/height-sort/route.js

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
    const filePath = path.join(process.cwd(), "data", "height.xlsx");

    if (!fs.existsSync(filePath)) {
      return NextResponse.json({
        ok: false,
        message: `profile.xlsx が見つかりません：${filePath}`,
      });
    }

    let buffer;
    try {
      buffer = fs.readFileSync(filePath);
    } catch (e) {
      return NextResponse.json({
        ok: false,
        message: `profile.xlsx を読み取れませんでした\n${String(
          e?.message || e
        )}`,
      });
    }

    const workbook = XLSX.read(buffer, { type: "buffer" });

    const sheetName = workbook.SheetNames?.[0];

    if (!sheetName) {
      return NextResponse.json({
        ok: false,
        message: "profile.xlsx のシートが見つかりません",
      });
    }

    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
    });

    const list = [];

    // 2行目以降
    for (let i = 1; i < rows.length; i++) {
  const r = rows[i] || [];

  const name = cleanStr(r[0]);
  if (!name) continue;

  const heightText = cleanStr(r[1]);

  if (
    !heightText ||
    heightText === "不明"
  ) {
    continue;
  }

  const height = Number(heightText);

  if (!Number.isFinite(height)) continue;

  list.push({
    name,
    height,
  });
}

    if (list.length === 0) {
      return NextResponse.json({
        ok: false,
        message: "身長データが取得できませんでした",
      });
    }

    return NextResponse.json({
      ok: true,
      list,
    });
  } catch (e) {
    console.error("[solo-height-sort]", e);

    return NextResponse.json({
      ok: false,
      message: `height-sort データの読み込みに失敗しました: ${String(
        e?.message || e
      )}`,
    });
  }
}