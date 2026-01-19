// file: app/api/solo/before/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

function toNum(v) {
  const n = Number(String(v ?? '').trim());
  return Number.isFinite(n) ? n : null;
}

export async function GET() {
  try {
    const xlsxPath = path.join(process.cwd(), 'data', 'before.xlsx');

    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json({
        ok: false,
        message: `before.xlsx が見つかりません：${xlsxPath}`,
      });
    }

    // ★ Windows/OneDrive/Excelロック対策：readFileSyncでBuffer読み
    let buf;
    try {
      buf = fs.readFileSync(xlsxPath);
    } catch (e) {
      const hint =
        'before.xlsx をExcelで開いている/OneDriveでオンラインのみ/権限 の可能性。Excelを閉じて、ファイルを「このデバイス上に常に保持」にして再試行してね。';
      return NextResponse.json({
        ok: false,
        message: `before.xlsx を読み取れませんでした。\n${hint}\npath=${xlsxPath}\nerror=${String(
          e?.message || e
        )}`,
      });
    }

    const xlsx = await import('xlsx');
    const wb = xlsx.read(buf, { type: 'buffer' });

    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      return NextResponse.json({ ok: false, message: 'before.xlsx のシートが見つかりません' });
    }

    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1 });

    // 期待：A列=出来事, B列=何年前(数字 大きいほど古い)
    const list = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const event = cleanStr(r[0]);
      const yearsAgo = toNum(r[1]);
      if (!event || yearsAgo === null) continue;
      list.push({ event, yearsAgo });
    }

    if (list.length === 0) {
      return NextResponse.json({
        ok: false,
        message: 'before.xlsx から有効データが取れませんでした（A列=出来事 / B列=何年前）',
      });
    }

    // yearsAgo 大きいほど古い（ここはそのまま返す）
    return NextResponse.json({ ok: true, list });
  } catch (e) {
    console.error(e);
    return NextResponse.json({
      ok: false,
      message: `before データの読み込みに失敗しました: ${String(e?.message || e)}`,
    });
  }
}
