// file: lib/tcgQuestions.js
// TCG用クイズ生成（サーバー側で出題・判定する。答えはクライアントへ送らない）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

export const GENRE_LABELS = {
  age: '年齢',
  height: '身長',
  food: '好物',
  blood: '血液型',
  before: '何年前',
  hobby: '趣味',
  hate: '嫌いな食べ物',
  season: '季節',
  image: 'イメージ',
  hint: '技ヒント',
  between: '間の技',
  wazaKanji: '技漢字',
  subBetween: 'サブタイ間',
  subKanji: 'サブタイ漢字',
};

export const ALL_GENRES = Object.keys(GENRE_LABELS);

// ===== 汎用 =====
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function stripParens(s) {
  return String(s ?? '').replace(/（[^）]*）|\([^)]*\)/g, '');
}

function cleanCell(v) {
  const s = String(v ?? '').trim();
  return s === 'ー' ? '' : s;
}

function digitsOnly(s) {
  return stripParens(s).normalize('NFKC').replace(/[^\d]/g, '');
}

function kataToHira(s) {
  return s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function loose(s) {
  return kataToHira(
    stripParens(s)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}ー]/gu, '')
  );
}

function splitParts(s) {
  return stripParens(s)
    .split(/[・、，,/／]+/g)
    .map((x) => x.trim())
    .filter(Boolean);
}

// 風船割りと同じ判定。複数回答は順不同。（）内・記号・空白は無視
function checkLoose(answer, input) {
  const inN = loose(input);
  if (!inN) return false;
  const parts = splitParts(answer).map(loose).filter(Boolean);
  if (!parts.length) return false;
  if (parts.length === 1) {
    const a = parts[0];
    return a === inN || a.includes(inN) || inN.includes(a);
  }
  return parts.every((p) => inN.includes(p) || p.includes(inN));
}

function normBlood(s) {
  return String(s ?? '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[\s型]/g, '')
    .replace(/[−ー―‐–—]/g, '-');
}

// 技名：指定の無視ワードを落として比較
const WAZA_DROP = [
  '必殺', '緑星', 'ゴムゴムの', '奥義', '遠距離', '曲技', 'カラーズトラップ', 'オカマ拳法', '居合',
  'ロープアクション', '魚人空手', '魚人柔術', '悪魔風脚', '悪魔風', '魔神風', '武装硬化', '武装', '八衝拳',
  'r・a', 'r.a', 'おでん', '狐火流', 'ラーメン拳法',
];

function normWaza(raw) {
  let s = stripParens(raw).normalize('NFKC').toLowerCase();
  for (const t of WAZA_DROP) s = s.split(t).join('');
  s = s.replace(/(一|二|三|四|八|九)\s*刀流/gu, '');
  s = s.replace(/[っッ]/g, '').replace(/[ァィゥェォ]/g, '').replace(/[～ー]/g, '');
  s = s.replaceAll('・', '__DOT__').replace(/[\p{P}\p{S}]/gu, '').replaceAll('__DOT__', '・');
  return s.replace(/\s+/g, '');
}

// サブタイ：括弧内無視・中黒のみ判定
function normSub(raw) {
  let s = stripParens(raw).normalize('NFKC').toLowerCase();
  s = s.replaceAll('・', '__DOT__').replace(/[\p{P}\p{S}]/gu, '').replaceAll('__DOT__', '・');
  return s.replace(/\s+/g, '');
}

function hanChars(s) {
  return Array.from(new Set(stripParens(s).match(/\p{Script=Han}/gu) || []));
}

// ===== データ読み込み =====
let cache = null;

function readRows(file) {
  try {
    const buf = fs.readFileSync(path.join(DATA_DIR, file));
    const wb = XLSX.read(buf, { type: 'buffer' });
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
      header: 1,
      defval: '',
      raw: false,
    });
  } catch (e) {
    console.error(`[tcg] ${file} を読み込めませんでした:`, e?.message || e);
    return [];
  }
}

function loadAll() {
  if (cache) return cache;

  // profile2: B名前 D年齢 E身長 F血液型 R好物
  const profiles = readRows('profile2.xlsx')
    .slice(1)
    .map((r) => ({
      name: String(r[1] ?? '').trim(),
      age: String(r[3] ?? '').trim(),
      height: String(r[4] ?? '').trim(),
      blood: String(r[5] ?? '').trim(),
      food: String(r[17] ?? '').trim(),
    }))
    .filter((p) => p.name);

  // before: A出来事 B何年前
  const before = readRows('before.xlsx')
    .map((r) => ({ event: String(r[0] ?? '').trim(), years: digitsOnly(r[1]) }))
    .filter((r) => r.event && r.years);

  // other: A「名前 ラベル」 B答え
  const other = { hobby: [], hate: [], season: [], image: [] };
  for (const r of readRows('other.xlsx')) {
    const key = String(r[0] ?? '').trim();
    const ans = String(r[1] ?? '').trim();
    const m = key.match(/^(.+?)[\s\u3000]+(\S+)$/);
    if (!m || !ans) continue;
    const [, name, label] = m;
    const item = { name, label, answer: ans };
    if (label === '趣味') other.hobby.push(item);
    else if (label === '嫌いな食べ物') other.hate.push(item);
    else if (label === '季節') other.season.push(item);
    else if (['花', '動物', 'イメージ動物', '職業', '国'].includes(label)) other.image.push(item);
  }

  // Swaza: A誰が B誰に C話数 E技名 F効果音
  const waza = readRows('Swaza.xlsx')
    .slice(1)
    .map((r) => ({
      user: cleanCell(r[0]),
      target: cleanCell(r[1]),
      chapter: cleanCell(r[2]),
      name: cleanCell(r[4]),
      sfx: cleanCell(r[5]),
    }))
    .filter((r) => r.name);

  // 間の技用：連続する同名を1つにまとめた順序リスト
  const wazaSeq = [];
  for (const w of waza) {
    if (wazaSeq.length && wazaSeq[wazaSeq.length - 1] === w.name) continue;
    wazaSeq.push(w.name);
  }
  const wazaNames = Array.from(new Set(waza.map((w) => w.name)));

  // subtitles: A話数 B サブタイ
  const subs = readRows('subtitles.xlsx')
    .map((r) => ({ no: Number(String(r[0]).trim()), title: String(r[1] ?? '').trim() }))
    .filter((r) => Number.isFinite(r.no) && r.title)
    .sort((a, b) => a.no - b.no);

  cache = { profiles, before, other, waza, wazaSeq, wazaNames, subs };
  return cache;
}

// ===== 出題 =====
function make(genre, lines, reveal, check) {
  return { genre, label: GENRE_LABELS[genre], lines, reveal, check };
}

function profileQuestion(genre) {
  const { profiles } = loadAll();
  const list = profiles.filter((p) => {
    if (genre === 'age' || genre === 'height') return digitsOnly(p[genre]);
    if (genre === 'blood') return normBlood(p.blood);
    return p.food && p.food !== '不明';
  });
  if (!list.length) return null;
  const p = pick(list);

  if (genre === 'age') {
    return make(genre, [`${p.name} の年齢は？（数字のみ）`], `${p.age}歳`, (t) => digitsOnly(t) === digitsOnly(p.age));
  }
  if (genre === 'height') {
    return make(genre, [`${p.name} の身長は？（cm・数字のみ）`], `${p.height}cm`, (t) => digitsOnly(t) === digitsOnly(p.height));
  }
  if (genre === 'blood') {
    return make(
      genre,
      [`${p.name} の血液型は？`, '選択肢：X / F / S / XF / S型RH-'],
      p.blood,
      (t) => normBlood(t) === normBlood(p.blood)
    );
  }
  return make(genre, [`${p.name} の好物は？`], p.food, (t) => checkLoose(p.food, t));
}

function otherQuestion(genre) {
  const list = loadAll().other[genre];
  if (!list?.length) return null;
  const it = pick(list);
  const labelText = genre === 'image' ? `イメージ${it.label}` : it.label;
  return make(genre, [`${it.name} の ${labelText} は？`], it.answer, (t) => checkLoose(it.answer, t));
}

function beforeQuestion() {
  const { before } = loadAll();
  if (!before.length) return null;
  const it = pick(before);
  return make(
    'before',
    [`「${it.event}」は何年前？（数字のみ）`],
    `${it.years}年前`,
    (t) => digitsOnly(t) === it.years
  );
}

function hintQuestion() {
  const { waza } = loadAll();
  const list = waza.filter((w) => w.user);
  if (!list.length) return null;
  const w = pick(list);
  const accepts = waza
    .filter((x) => x.user === w.user && x.target === w.target && x.chapter === w.chapter)
    .map((x) => normWaza(x.name));
  const lines = [`使用者：${w.user}`];
  if (w.target) lines.push(`使用された相手：${w.target}`);
  if (w.chapter) lines.push(`話数：第${w.chapter}話`);
  if (w.sfx) lines.push(`効果音：${w.sfx}`);
  lines.push('この技の名前は？');
  return make('hint', lines, w.name, (t) => {
    const n = normWaza(t);
    return !!n && accepts.includes(n);
  });
}

function betweenQuestion() {
  const { wazaSeq } = loadAll();
  if (wazaSeq.length < 3) return null;
  const i = 1 + Math.floor(Math.random() * (wazaSeq.length - 2));
  const prev = wazaSeq[i - 1];
  const next = wazaSeq[i + 1];
  const accepts = [];
  for (let j = 1; j < wazaSeq.length - 1; j++) {
    if (wazaSeq[j - 1] === prev && wazaSeq[j + 1] === next) accepts.push(normWaza(wazaSeq[j]));
  }
  return make(
    'between',
    ['前後の技に挟まれた技は？', `前：${prev}`, `後：${next}`],
    wazaSeq[i],
    (t) => {
      const n = normWaza(t);
      return !!n && accepts.includes(n);
    }
  );
}

function wazaKanjiQuestion() {
  const { wazaNames } = loadAll();
  const kanjis = Array.from(new Set(wazaNames.flatMap((n) => hanChars(normWaza(n)))));
  if (!kanjis.length) return null;
  const k = pick(kanjis);
  const accepts = wazaNames.filter((n) => normWaza(n).includes(k));
  const norms = accepts.map(normWaza);
  return make(
    'wazaKanji',
    [`「${k}」を使う技を1つ答えよ`],
    accepts.slice(0, 3).join(' / '),
    (t) => {
      const n = normWaza(t);
      return !!n && norms.includes(n);
    }
  );
}

function subBetweenQuestion() {
  const { subs } = loadAll();
  if (subs.length < 3) return null;
  const i = 1 + Math.floor(Math.random() * (subs.length - 2));
  const mid = subs[i];
  return make(
    'subBetween',
    ['前後のサブタイトルに挟まれたサブタイは？', `前（${subs[i - 1].no}話）：${subs[i - 1].title}`, `後（${subs[i + 1].no}話）：${subs[i + 1].title}`],
    `${mid.no}話 ${mid.title}`,
    (t) => {
      const n = normSub(t);
      return !!n && n === normSub(mid.title);
    }
  );
}

function subKanjiQuestion() {
  const { subs } = loadAll();
  const kanjis = Array.from(new Set(subs.flatMap((s) => hanChars(s.title))));
  if (!kanjis.length) return null;
  const k = pick(kanjis);
  const accepts = subs.filter((s) => s.title.includes(k));
  const norms = accepts.map((s) => normSub(s.title));
  return make(
    'subKanji',
    [`「${k}」を使うサブタイトルを1つ答えよ`],
    accepts.slice(0, 3).map((s) => s.title).join(' / '),
    (t) => {
      const n = normSub(t);
      return !!n && norms.includes(n);
    }
  );
}

export function makeQuestion(genre) {
  try {
    switch (genre) {
      case 'age':
      case 'height':
      case 'food':
      case 'blood':
        return profileQuestion(genre);
      case 'hobby':
      case 'hate':
      case 'season':
      case 'image':
        return otherQuestion(genre);
      case 'before':
        return beforeQuestion();
      case 'hint':
        return hintQuestion();
      case 'between':
        return betweenQuestion();
      case 'wazaKanji':
        return wazaKanjiQuestion();
      case 'subBetween':
        return subBetweenQuestion();
      case 'subKanji':
        return subKanjiQuestion();
      default:
        return null;
    }
  } catch (e) {
    console.error('[tcg] makeQuestion error', genre, e);
    return null;
  }
}
