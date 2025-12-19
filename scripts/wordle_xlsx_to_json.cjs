// scripts/wordle_xlsx_to_json.cjs
// Excel(A=5,B=6,C=7,D=8,E=9) → public/wordle/words.json を生成
// 使い方: node scripts/wordle_xlsx_to_json.cjs "C:\path\words.xlsx"

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

function normalizeWord(s) {
  if (s == null) return '';
  return String(s)
    .trim()
    .normalize('NFKC')
    .replace(/\s+/g, '') // 空白削除
    .replace(/[　]/g, ''); // 全角スペース削除
}

function charLen(s) {
  // ひらがな想定。念のためコードポイントで数える
  return Array.from(s).length;
}

const inputPath = process.argv[2];
if (!inputPath) {
  console.log('Usage: node scripts/wordle_xlsx_to_json.cjs "C:\\path\\words.xlsx"');
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error('File not found:', inputPath);
  process.exit(1);
}

const wb = XLSX.readFile(inputPath);
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];

// 2次元配列として読む（ヘッダなし）
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false });

const colMap = {
  0: 5, // A
  1: 6, // B
  2: 7, // C
  3: 8, // D
  4: 9, // E
};

const out = { 5: [], 6: [], 7: [], 8: [], 9: [] };
const seen = { 5: new Set(), 6: new Set(), 7: new Set(), 8: new Set(), 9: new Set() };

for (const r of rows) {
  for (let c = 0; c <= 4; c++) {
    const len = colMap[c];
    const w = normalizeWord(r?.[c]);
    if (!w) continue;

    // 念のため文字数が合わないものは弾く（Excel側のミス対策）
    if (charLen(w) !== len) continue;

    if (!seen[len].has(w)) {
      seen[len].add(w);
      out[len].push(w);
    }
  }
}

const outDir = path.join(process.cwd(), 'public', 'wordle');
fs.mkdirSync(outDir, { recursive: true });

const outPath = path.join(outDir, 'words.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');

console.log('✅ Generated:', outPath);
console.log('counts:', Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
