// file: app/api/waza/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

export const runtime = 'nodejs';

function safeString(v) {
  if (v == null) return '';
  return String(v).trim();
}

export async function GET() {
  try {
    // ここ固定：プロジェクト直下の data/waza.xlsx
    const filePath = path.join(process.cwd(), 'data', 'waza.xlsx');

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { ok: false, error: `not found: ${filePath}` },
        { status: 404 }
      );
    }

    const buf = fs.readFileSync(filePath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const sheetName = wb.SheetNames?.[0];
    if (!sheetName) {
      return NextResponse.json({ ok: false, error: 'sheet not found' }, { status: 400 });
    }

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false });

    // A列: 技名, B列: 使用者
    const items = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] || [];
      const name = safeString(row[0]);
      const user = safeString(row[1]);

      if (!name && !user) continue;

      // たまにヘッダ行がある想定：Aが "技名" とかなら除外
      if (i === 0 && (name.includes('技') || name.includes('技名'))) continue;

      items.push({
        idx: items.length + 1, // 並び順用
        name,
        user,
      });
    }

    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e?.message || 'unknown error' },
      { status: 500 }
    );
  }
}
