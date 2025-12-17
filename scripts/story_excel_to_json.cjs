/* scripts/story_excel_to_json.cjs
   Excel（story.xlsx）から章ごとのJSONを生成して public/story/data に出力する

   想定Excel構成（最低限これだけでOK）：
   - Sheet名: lines
     列:
       chapter (例: ch0, ch1)
       bg (例: black, home, stadium)
       left (例: hero / tarou / tarou2 / 空なら空)
       center
       right
       speaker (例: hero / narrator / tarou / tarou2)
       text
       bigTitle (任意)
*/

const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const INPUT = path.join(process.cwd(), 'story_excel', 'story.xlsx');
const OUT_DIR = path.join(process.cwd(), 'public', 'story', 'data');

function norm(v) {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('[story_excel_to_json] not found:', INPUT);
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  const wb = xlsx.readFile(INPUT);
  const sheet = wb.Sheets['lines'];
  if (!sheet) {
    console.error('[story_excel_to_json] Sheet "lines" がありません');
    process.exit(1);
  }

  const rows = xlsx.utils.sheet_to_json(sheet, { defval: '' });

  /** @type {Record<string, any[]>} */
  const byChapter = {};

  for (const r of rows) {
    const chapter = norm(r.chapter) || 'ch0';
    const item = {
      bg: norm(r.bg) || 'black',
      left: norm(r.left),
      center: norm(r.center),
      right: norm(r.right),
      speaker: norm(r.speaker) || 'narrator',
      text: String(r.text ?? ''),
      bigTitle: norm(r.bigTitle),
    };

    if (!byChapter[chapter]) byChapter[chapter] = [];
    // textが空の行は無視（空行混入対策）
    if (item.text.trim() !== '') byChapter[chapter].push(item);
  }

  const chapters = Object.keys(byChapter).sort();
  for (const ch of chapters) {
    const outPath = path.join(OUT_DIR, `${ch}.json`);
    fs.writeFileSync(outPath, JSON.stringify({ chapter: ch, lines: byChapter[ch] }, null, 2), 'utf8');
    console.log('[story_excel_to_json] wrote:', outPath, `(${byChapter[ch].length} lines)`);
  }

  console.log('[story_excel_to_json] done. chapters:', chapters.join(', '));
}

main();
