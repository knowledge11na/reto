// file: app/api/story/data/route.js
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';

function toStr(v) {
  if (v == null) return '';
  return String(v).trim();
}
function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick(obj, key) {
  if (!obj) return '';
  const v = obj[key];
  return v == null ? '' : v;
}

export async function GET() {
  try {
    const xlsxPath = path.join(process.cwd(), 'public', 'story', 'story.xlsx');
    if (!fs.existsSync(xlsxPath)) {
      return NextResponse.json(
        { ok: false, error: 'story.xlsx not found', path: '/public/story/story.xlsx' },
        { status: 404 }
      );
    }

    const buf = fs.readFileSync(xlsxPath);
    const wb = XLSX.read(buf, { type: 'buffer' });

    const readSheet = (name) => {
      const ws = wb.Sheets[name];
      if (!ws) return [];
      // defval: '' で空セルもキーを維持
      return XLSX.utils.sheet_to_json(ws, { defval: '' });
    };

    // あなたのExcel構造
    const linesRaw = readSheet('lines'); // chapter,bg,left,center,right,speaker,text,bigTitle,command,quiz_tag,sfx,shake,wait_ms
    const charsRaw = readSheet('characters'); // key,display_name,default_image,notes
    const bgsRaw = readSheet('backgrounds'); // bg_key,image_path

    const characters = {};
    for (const r of charsRaw) {
      const key = toStr(pick(r, 'key'));
      if (!key) continue;
      characters[key] = {
        key,
        display_name: toStr(pick(r, 'display_name')),
        default_image: toStr(pick(r, 'default_image')),
        notes: toStr(pick(r, 'notes')),
      };
    }

    const backgrounds = {};
    for (const r of bgsRaw) {
      const bg_key = toStr(pick(r, 'bg_key'));
      if (!bg_key) continue;
      backgrounds[bg_key] = {
        bg_key,
        image_path: toStr(pick(r, 'image_path')),
      };
    }

    const lines = linesRaw.map((r, idx) => ({
      _i: idx,
      chapter: toStr(pick(r, 'chapter')),
      bg: toStr(pick(r, 'bg')),
      left: toStr(pick(r, 'left')),
      center: toStr(pick(r, 'center')),
      right: toStr(pick(r, 'right')),
      speaker: toStr(pick(r, 'speaker')),
      text: toStr(pick(r, 'text')),
      bigTitle: toStr(pick(r, 'bigTitle')),
      command: toStr(pick(r, 'command')),
      quiz_tag: toStr(pick(r, 'quiz_tag')),
      sfx: toStr(pick(r, 'sfx')),
      shake: toStr(pick(r, 'shake')),
      wait_ms: toNum(pick(r, 'wait_ms')),
    }));

    // 章一覧
    const chapterSet = new Set(lines.map((l) => l.chapter).filter(Boolean));
    const chapters = Array.from(chapterSet);

    return NextResponse.json({
      ok: true,
      chapters,
      lines,
      characters,
      backgrounds,
    });
  } catch (e) {
    console.error('[api/story/data]', e);
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
