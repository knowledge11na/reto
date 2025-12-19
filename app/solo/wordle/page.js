// file: app/solo/wordle/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

const LENS = [5, 6, 7, 8, 9];
const MAX_TRIES = 8;

// ===== utils =====
function toChars(s) {
  return Array.from((s ?? '').trim().normalize('NFKC').replace(/\s+/g, '').replace(/[　]/g, ''));
}
function charLen(s) {
  return toChars(s).length;
}
function scoreGuess(guess, target) {
  const g = toChars(guess);
  const t = toChars(target);

  const res = Array(g.length).fill('absent'); // correct|present|absent
  const remain = new Map();

  for (let i = 0; i < g.length; i++) {
    if (g[i] === t[i]) res[i] = 'correct';
    else remain.set(t[i], (remain.get(t[i]) || 0) + 1);
  }
  for (let i = 0; i < g.length; i++) {
    if (res[i] === 'correct') continue;
    const cnt = remain.get(g[i]) || 0;
    if (cnt > 0) {
      res[i] = 'present';
      remain.set(g[i], cnt - 1);
    }
  }
  return res;
}

// ===== keyboard (10 cols, no horizontal scroll) =====
const KB_COLS = 10;
const KB_GRID = [
  ['あ','か','さ','た','な','は','ま','や','ら','わ'],
  ['い','き','し','ち','に','ひ','み','','','り'],
  ['う','く','す','つ','ぬ','ふ','む','ゆ','る','ん'],
  ['え','け','せ','て','ね','へ','め','','','れ'],
  ['お','こ','そ','と','の','ほ','も','よ','ろ','ー'],

  ['','が','ざ','だ','','','ば','ぱ','', 'ゃ'],
  ['','ぎ','じ','ぢ','','','び','ぴ','', ''],
  ['','ぐ','ず','づ','っ','ぶ','ぷ','ゅ','', 'ゔ'],
  ['','げ','ぜ','で','','','べ','ぺ','', ''],
  ['','ご','ぞ','ど','','','ぼ','ぽ','', 'ょ'],

  ['ぁ','ぃ','ぅ','ぇ','ぉ','','','','',''],
];

function mergeKeyState(prev, next) {
  const rank = { none: 0, absent: 1, present: 2, correct: 3 };
  const p = prev ?? 'none';
  const n = next ?? 'none';
  return rank[n] > rank[p] ? n : p;
}

export default function WordleSoloPage() {
  const [len, setLen] = useState(5);
  const [answer, setAnswer] = useState('');
  const [dict, setDict] = useState([]);
  const dictSet = useMemo(() => new Set(dict), [dict]);

  const [guesses, setGuesses] = useState([]);
  const [scores, setScores] = useState([]);
  const [input, setInput] = useState('');
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState(false);

  const [vw, setVw] = useState(360);
  const inputRef = useRef(null);

  useEffect(() => {
    const onResize = () => setVw(window.innerWidth || 360);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  async function loadGame(nextLen) {
    setMsg('読み込み中...');
    setDone(false);
    setGuesses([]);
    setScores([]);
    setInput('');
    setAnswer('');
    setDict([]);

    const r1 = await fetch(`/api/wordle/list?len=${nextLen}`, { cache: 'no-store' });
    const j1 = await r1.json();
    const list = Array.isArray(j1?.list) ? j1.list : [];
    setDict(list);

    const r2 = await fetch(`/api/wordle/word?len=${nextLen}`, { cache: 'no-store' });
    const j2 = await r2.json();
    if (j2?.answer) {
      setAnswer(j2.answer);
      setMsg('');
      setTimeout(() => inputRef.current?.focus?.(), 50);
    } else {
      setMsg(j2?.error || '単語の取得に失敗しました');
    }
  }

  useEffect(() => {
    loadGame(len);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [len]);

  function submit() {
    if (done) return;
    const w = toChars(input).join('');
    if (!w) return;

    if (charLen(w) !== len) {
      setMsg(`${len}文字で入力してね`);
      return;
    }
    if (dict.length && !dictSet.has(w)) {
      setMsg('その単語はリストにないよ');
      return;
    }
    if (!answer) {
      setMsg('答えがまだ準備できてない…');
      return;
    }

    const sc = scoreGuess(w, answer);
    const nextGuesses = [...guesses, w];
    const nextScores = [...scores, sc];

    setGuesses(nextGuesses);
    setScores(nextScores);
    setInput('');
    setMsg('');

    if (w === answer) {
      setDone(true);
      setMsg('🎉 正解！');
      return;
    }
    if (nextGuesses.length >= MAX_TRIES) {
      setDone(true);
      setMsg(`終了！ 答えは「${answer}」`);
    }
  }

  function giveUp() {
    if (done) return;
    setDone(true);
    setMsg(`諦めました！ 答えは「${answer}」`);
  }

  function backspace() {
    if (done) return;
    const cs = toChars(input);
    cs.pop();
    setInput(cs.join(''));
    setTimeout(() => inputRef.current?.focus?.(), 0);
  }

  function clearAll() {
    if (done) return;
    setInput('');
    setTimeout(() => inputRef.current?.focus?.(), 0);
  }

  function addChar(ch) {
    if (done) return;
    const cs = toChars(input);
    if (cs.length >= len) return;
    cs.push(ch);
    setInput(cs.join(''));
    setTimeout(() => inputRef.current?.focus?.(), 0);
  }

  const rows = useMemo(() => {
    const out = [];
    for (let r = 0; r < MAX_TRIES; r++) {
      const g = guesses[r] ?? '';
      const sc = scores[r] ?? null;
      const chars = toChars(g);
      const row = [];
      for (let i = 0; i < len; i++) row.push({ ch: chars[i] ?? '', st: sc ? sc[i] : null });
      out.push(row);
    }
    return out;
  }, [guesses, scores, len]);

  const keyStates = useMemo(() => {
    const map = new Map();
    for (let gi = 0; gi < guesses.length; gi++) {
      const g = toChars(guesses[gi]);
      const sc = scores[gi] || [];
      for (let i = 0; i < g.length; i++) {
        const ch = g[i];
        const st = sc[i] || 'absent';
        map.set(ch, mergeKeyState(map.get(ch) || 'none', st));
      }
    }
    return map;
  }, [guesses, scores]);

  function keyClassFor(ch) {
    const st = keyStates.get(ch) || 'none';
    if (st === 'correct') return 'bg-green-500 text-sky-950 border-sky-900';
    if (st === 'present') return 'bg-amber-500 text-sky-950 border-sky-900';
    if (st === 'absent') return 'bg-slate-300 text-sky-950 border-sky-900';
    return 'bg-sky-100 text-sky-950 border-sky-900';
  }

  function tileClassFor(st) {
    if (st === 'correct') return 'bg-green-500 text-sky-950 border-sky-900';
    if (st === 'present') return 'bg-amber-500 text-sky-950 border-sky-900';
    if (st === 'absent') return 'bg-slate-300 text-sky-950 border-sky-900';
    return 'bg-white text-sky-950 border-sky-900';
  }

  // board tile size auto-fit
  const boardPadding = 40; // 少し余白多め（max-w-md内）
  const gap = 6;
  const maxTile = 44;
  const minTile = 30;
  const tileSize = useMemo(() => {
    const usable = Math.max(260, Math.min(420, vw) - boardPadding);
    const size = Math.floor((usable - gap * (len - 1)) / len);
    return Math.max(minTile, Math.min(maxTile, size));
  }, [vw, len]);

  const tileFont = Math.max(14, Math.floor(tileSize * 0.48));
  const tileRadius = Math.max(12, Math.floor(tileSize * 0.28));

  // keyboard key size auto-fit (10 cols)
  const kbGap = 6;
  const kbOuter = 40;
  const kbMax = 40;
  const kbMin = 28;
  const keySize = useMemo(() => {
    const usable = Math.max(260, Math.min(420, vw) - kbOuter);
    const size = Math.floor((usable - kbGap * (KB_COLS - 1)) / KB_COLS);
    return Math.max(kbMin, Math.min(kbMax, size));
  }, [vw]);

  const keyFont = Math.max(13, Math.floor(keySize * 0.45));
  const keyRadius = Math.max(12, Math.floor(keySize * 0.28));

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-extrabold">🧩 ワードル（{len}文字）</h1>
          <Link href="/solo" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            ソロへ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-slate-400 bg-slate-50 px-3 py-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[12px] font-bold text-slate-900">
              試行回数 <span className="font-extrabold">{guesses.length}</span> / {MAX_TRIES}
            </div>
            <div className="flex gap-2">
              <Link href="/solo/wordle/rules" className="text-[11px] underline text-slate-700 hover:text-slate-500">
                ルール
              </Link>
              <button
                onClick={() => loadGame(len)}
                className="text-[11px] font-bold rounded-full border border-slate-500 bg-white px-3 py-1 hover:bg-slate-100"
              >
                リセット
              </button>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] font-bold text-slate-900">文字数：</span>
            {LENS.map((n) => (
              <button
                key={n}
                onClick={() => setLen(n)}
                className={
                  n === len
                    ? 'text-[11px] font-extrabold rounded-full border border-slate-600 bg-slate-900 text-white px-3 py-1'
                    : 'text-[11px] font-extrabold rounded-full border border-slate-600 bg-white text-slate-900 px-3 py-1 hover:bg-slate-100'
                }
              >
                {n}文字
              </button>
            ))}
            <button
              onClick={giveUp}
              disabled={done || !answer}
              className="ml-auto text-[11px] font-extrabold rounded-full border border-rose-500 bg-rose-50 text-rose-900 px-3 py-1 hover:bg-rose-100 disabled:opacity-60"
            >
              諦める
            </button>
          </div>

          {!!msg && <div className="mt-2 text-[12px] font-bold text-slate-900">{msg}</div>}
        </div>

        {/* board */}
        <div className="mt-4 grid gap-2 justify-center">
          {rows.map((row, rIdx) => (
            <div
              key={rIdx}
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${len}, ${tileSize}px)`,
                gap: `${gap}px`,
                justifyContent: 'center',
              }}
            >
              {row.map((t, i) => (
                <div
                  key={i}
                  className={`border-2 font-extrabold flex items-center justify-center ${tileClassFor(t.st)}`}
                  style={{
                    width: tileSize,
                    height: tileSize,
                    borderRadius: tileRadius,
                    fontSize: tileFont,
                  }}
                >
                  {t.ch}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* input */}
        <div className="mt-4 rounded-2xl border border-slate-400 bg-white px-3 py-3 shadow-sm">
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              disabled={done || !answer}
              placeholder={`${len}文字で入力（ひらがな）`}
              className="flex-1 min-w-[180px] rounded-xl border-2 border-slate-700 px-3 py-2 text-[14px] font-bold text-slate-900 focus:outline-none"
            />
            <button
              onClick={backspace}
              disabled={done || !answer}
              className="rounded-xl border border-slate-600 bg-slate-700 text-white px-3 py-2 text-[12px] font-extrabold hover:bg-slate-800 disabled:opacity-60"
            >
              1文字消す
            </button>
            <button
              onClick={clearAll}
              disabled={done || !answer}
              className="rounded-xl border border-slate-600 bg-slate-500 text-white px-3 py-2 text-[12px] font-extrabold hover:bg-slate-600 disabled:opacity-60"
            >
              全消し
            </button>
            <button
              onClick={submit}
              disabled={done || !answer}
              className="rounded-xl border border-slate-800 bg-slate-900 text-white px-4 py-2 text-[12px] font-extrabold hover:bg-black disabled:opacity-60"
            >
              ENTER
            </button>
          </div>

          {/* keyboard */}
          <div className="mt-3">
            <div className="text-[11px] text-slate-800 font-bold mb-2">
              文字を押して入力（横スクロールなし）
            </div>

            <div className="grid gap-2 justify-center">
              {KB_GRID.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${KB_COLS}, ${keySize}px)`,
                    gap: `${kbGap}px`,
                    justifyContent: 'center',
                  }}
                >
                  {row.map((ch, i) => {
                    if (!ch) return <div key={i} style={{ width: keySize, height: keySize }} />;
                    return (
                      <button
                        key={`${idx}-${i}-${ch}`}
                        onClick={() => addChar(ch)}
                        disabled={done || !answer}
                        className={`border-2 font-extrabold ${keyClassFor(ch)} disabled:opacity-60`}
                        style={{
                          width: keySize,
                          height: keySize,
                          borderRadius: keyRadius,
                          fontSize: keyFont,
                        }}
                      >
                        {ch}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="mt-2 text-[11px] text-slate-800">
              入力中：<span className="font-extrabold">{input || '（なし）'}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/solo"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ソロへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
