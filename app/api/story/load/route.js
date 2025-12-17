// file: app/api/story/load/route.js
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs/promises';
import * as XLSX from 'xlsx';

/* =========================
   共通ユーティリティ
========================= */
function norm(v) {
  return String(v ?? '').replace(/\u3000/g, ' ').trim();
}

function asNull(v) {
  const t = norm(v);
  return t ? t : null;
}

function parseArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.map(String);
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// chapter=0 / chapter0 / ch0 → ch0
function normalizeChapterParam(raw) {
  const t = norm(raw).toLowerCase();
  if (t.startsWith('ch')) return t;
  const n = Number(t.replace(/^chapter/, '').replace(/[^\d]/g, ''));
  if (Number.isFinite(n)) return `ch${n}`;
  return 'ch0';
}

/* =========================
   GET
========================= */
export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const chapterRaw = searchParams.get('chapter') ?? '0';
    const chapter = normalizeChapterParam(chapterRaw);

    const xlsxPath = path.join(
      process.cwd(),
      'app',
      'story',
      'data',
      'story.xlsx'
    );

    await fs.access(xlsxPath);
    const buf = await fs.readFile(xlsxPath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) {
      return NextResponse.json(
        { ok: false, error: 'story.xlsx にシートがありません' },
        { status: 404 }
      );
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const story = rows
      .filter((r) => norm(r.chapter) === chapter)
      .map((r, i) => ({
        id: asNull(r.id) ?? `${chapter}_${i + 1}`,

        bg: asNull(r.bg) || 'black',
        left: asNull(r.left),
        center: asNull(r.center),
        right: asNull(r.right),
        speaker: asNull(r.speaker),
        text: String(r.text ?? ''),
        bigTitle: asNull(r.bigTitle),

        // 分岐系（空でもOK）
        next: asNull(r.next),
        choices: r.choices ? JSON.parse(r.choices) : [],

        needFlags: parseArray(r.needFlags),
        needOutcome: asNull(r.needOutcome),
        setFlags: parseArray(r.setFlags),
      }));

    if (story.length === 0) {
      return NextResponse.json(
        { ok: false, error: `chapter=${chapter} の行が見つかりません` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      chapter,
      story,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e) },
      { status: 500 }
    );
  }
}
