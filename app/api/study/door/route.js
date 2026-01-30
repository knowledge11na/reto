// file: app/api/study/door/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

export const runtime = 'nodejs';

function cleanStr(v) {
  return String(v ?? '').trim();
}

function statSafe(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

export async function GET() {
  const xlsxPath = path.join(process.cwd(), 'data', 'door.xlsx');

  try {
    const st = statSafe(xlsxPath);
    if (!st) {
      return NextResponse.json(
        { ok: false, error: `ファイルが見つかりません: ${xlsxPath}` },
        { status: 404 }
      );
    }

    // 読めるかどうか（ロック/権限の切り分け）
    try {
      fs.accessSync(xlsxPath, fs.constants.R_OK);
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `ファイルにアクセスできません（R_OK）: ${xlsxPath}`,
          detail: String(e?.message || e),
        },
        { status: 500 }
      );
    }

    const XLSX = await import('xlsx');

let wb;
try {
  const buf = fs.readFileSync(xlsxPath); // ← ここで読めるかが勝負
  wb = XLSX.read(buf, { type: 'buffer' });
} catch (e) {
  return NextResponse.json(
    {
      ok: false,
      error: `XLSX.read(buffer) で失敗: ${xlsxPath}`,
      detail: String(e?.message || e),
      hint: 'Excelで開いている/OneDrive同期/権限/Defenderブロックが多いです。OneDrive外へ移すのが最速。',
    },
    { status: 500 }
  );
}


    const sheetNames = (wb.SheetNames || []).filter(Boolean);
    if (!sheetNames.length) {
      return NextResponse.json({ ok: false, error: 'Excelのシートが見つかりません' }, { status: 400 });
    }

    const rows = [];
    let globalId = 1;

    for (const sheet of sheetNames) {
      const ws = wb.Sheets[sheet];
      if (!ws) continue;

      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

      let localIndex = 0;

      for (let r = 0; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const a = cleanStr(row[0]);
        const b = cleanStr(row[1]);
        if (!a && !b) continue;

        if (sheet === 'ALL') {
          const q = a;
          const ans = b;
          if (!q || !ans) continue;

          rows.push({
            id: globalId++,
            sheet,
            q,
            a: ans,
            a_col: a,
            b_col: b,
          });
        } else {
          const ans = a;
          if (!ans) continue;

          localIndex += 1;
          const q = `${sheet} ${localIndex}`;

          rows.push({
            id: globalId++,
            sheet,
            q,
            a: ans,
            index_in_sheet: localIndex,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, sheets: sheetNames, rows }, { status: 200 });
  } catch (e) {
    console.error('[study/door] error:', e);
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
