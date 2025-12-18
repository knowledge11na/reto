import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs'; // fs を使うので必須

function toInt(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

function toStr(v) {
  return String(v ?? '').trim();
}

export async function GET() {
  try {
    // プロジェクト直下/data/subtitles.xlsx を読む
    const filePath = path.join(process.cwd(), 'data', 'subtitles.xlsx');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { ok: false, error: 'data/subtitles.xlsx が見つかりません。' },
        { status: 404 }
      );
    }

    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      return NextResponse.json({ ok: false, error: 'Excelにシートがありません。' }, { status: 400 });
    }

    const ws = wb.Sheets[sheetName];

    // 2次元配列で取得（A列=話数、B列=サブタイトル想定）
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

    const items = [];
    for (const row of rows) {
      if (!row || row.length === 0) continue;

      const no = toInt(row[0]);      // A列
      const title = toStr(row[1]);   // B列

      if (!no && !title) continue;
      if (!no || !title) continue; // 片方欠けは無視（必要なら変えてOK）

      items.push({ no, title });
    }

    items.sort((a, b) => a.no - b.no);

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
