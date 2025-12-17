import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';
import * as XLSX from 'xlsx';

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const chapter = String(searchParams.get('chapter') || '1');

    // ★ Excelファイルは public に置く（Vercelでも確実）
    const filePath = path.join(process.cwd(), 'public', 'story', 'story.xlsx');
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ ok: false, error: 'public/story.xlsx が見つかりません' }, { status: 404 });
    }

    const wb = XLSX.readFile(filePath);

    // ★ シート名ルール：chapter1 / chapter2 ...
    const sheetName = `chapter${chapter}`;
    const ws = wb.Sheets[sheetName];
    if (!ws) {
      return NextResponse.json(
        { ok: false, error: `シート ${sheetName} が見つかりません` },
        { status: 404 }
      );
    }

    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    // 必要な形に正規化
    const lines = rows
      .map((r) => ({
        bg: String(r.bg || '').trim(),
        left: String(r.left || '').trim(),
        center: String(r.center || '').trim(),
        right: String(r.right || '').trim(),
        speaker: String(r.speaker || '').trim(),
        text: String(r.text || '').trim(),
        bigTitle: String(r.bigTitle || '').trim(),
      }))
      .filter((x) => x.text || x.bigTitle); // 空行除外

    return NextResponse.json({ ok: true, chapter, lines });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ ok: false, error: 'story load failed' }, { status: 500 });
  }
}
