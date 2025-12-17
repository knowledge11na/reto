'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * chapter: 'ch0' など
 * public/story/data/{chapter}.json をfetchして再生
 *
 * データのleft/center/right/speakerは
 * 例）tarou / tarou2 / hero / narrator など
 * - 数字つきは表情差分として扱い、画像パスは /story/char/{base}{num}.png
 * - 数字なしはデフォ /story/char/{key}.png
 */

const BG = {
  black: '/story/bg/black.png',
  home: '/story/bg/home.png',
  stadium: '/story/bg/stadium.png',
};

// 表示名（必要なら増やす）
const NAME = {
  narrator: 'ナレーション',
  hero: '主人公',
  harimimizu: 'ハリミミズ',
  ban: 'バン',

  tarou: 'たろう牛丼',
  fuyu: 'ふゆ',
  dragon50: 'ドラゴン50號',
  ohayou: 'おはようございます',
  north: 'ノースちゃん',
  maxeast: 'MAXイースト',
  westito: 'ウエスト伊藤',
  djsouth: 'DJサウス',
  mentaiudon: 'めんたいうどん',
  grand: 'グランド',
};

function splitExpressionKey(key) {
  const k = String(key || '').trim();
  if (!k) return { base: null, expr: null };
  const m = k.match(/^(.+?)(\d+)$/); // tarou2
  if (!m) return { base: k, expr: null };
  return { base: m[1], expr: m[2] };
}

function speakerDisplayName(speakerKey) {
  if (!speakerKey) return '';
  const { base } = splitExpressionKey(speakerKey);
  return NAME[base] || NAME[speakerKey] || base || String(speakerKey);
}

function bgUrl(bgKey) {
  return BG[bgKey] || BG.black;
}

function charImagePath(charKey) {
  if (!charKey) return null;
  if (charKey === 'narrator') return null;

  const { base, expr } = splitExpressionKey(charKey);
  if (!base) return null;

  // デフォは /story/char/{base}.png（今まで通り）
  // 表情は /story/char/{base}{expr}.png（例 tarou2.png）
  if (expr) return `/story/char/${base}${expr}.png`;
  return `/story/char/${base}.png`;
}

export default function StoryPlayer({ chapter = 'ch0' }) {
  const [lines, setLines] = useState([]);
  const [loadErr, setLoadErr] = useState('');

  const [idx, setIdx] = useState(0);

  // タイプライター
  const [shown, setShown] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const typingRef = useRef(null);

  const line = lines[idx] || null;

  function stopTyping() {
    if (typingRef.current) {
      clearInterval(typingRef.current);
      typingRef.current = null;
    }
  }

  function startTyping(text) {
    stopTyping();
    const full = String(text ?? '');
    setShown('');
    setIsTyping(true);

    let i = 0;
    typingRef.current = setInterval(() => {
      i += 1;
      setShown(full.slice(0, i));
      if (i >= full.length) {
        stopTyping();
        setIsTyping(false);
      }
    }, 18);
  }

  // 章データ読み込み
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoadErr('');
        setLines([]);
        setIdx(0);

        const res = await fetch(`/story/data/${chapter}.json`, { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !Array.isArray(json.lines)) {
          setLoadErr(`章データが読み込めません: ${chapter}`);
          return;
        }
        if (cancelled) return;
        setLines(json.lines);
      } catch (e) {
        console.error(e);
        if (!cancelled) setLoadErr(`章データが読み込めません: ${chapter}`);
      }
    }

    load();
    return () => {
      cancelled = true;
      stopTyping();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter]);

  useEffect(() => {
    if (!line) return;
    startTyping(line.text);
    return () => stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, lines.length]);

  function next() {
    if (!line) return;

    if (isTyping) {
      stopTyping();
      setShown(String(line.text ?? ''));
      setIsTyping(false);
      return;
    }

    const ni = idx + 1;
    if (ni >= lines.length) return;
    setIdx(ni);
  }

  function prev() {
    stopTyping();
    setIsTyping(false);
    setIdx((v) => Math.max(0, v - 1));
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        next();
      }
      if (e.key === 'ArrowRight') next();
      if (e.key === 'ArrowLeft') prev();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, isTyping, line, lines.length]);

  const bg = useMemo(() => bgUrl(line?.bg), [line]);
  const leftImg = useMemo(() => charImagePath(line?.left), [line]);
  const centerImg = useMemo(() => charImagePath(line?.center), [line]);
  const rightImg = useMemo(() => charImagePath(line?.right), [line]);

  const speakerName = useMemo(() => speakerDisplayName(line?.speaker), [line]);

  const activePos = useMemo(() => {
    if (!line?.speaker) return null;
    return line.left === line.speaker ? 'left' : line.center === line.speaker ? 'center' : line.right === line.speaker ? 'right' : null;
  }, [line]);

  if (loadErr) {
    return (
      <main className="min-h-screen bg-sky-50 text-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow p-6 space-y-3">
          <h1 className="text-lg font-extrabold">ストーリー</h1>
          <p className="text-sm text-rose-700 font-bold">{loadErr}</p>
          <div className="flex gap-2">
            <Link href="/solo" className="flex-1 py-2 rounded-2xl bg-sky-600 text-white text-sm font-extrabold text-center">
              ソロメニュー
            </Link>
            <Link href="/" className="flex-1 py-2 rounded-2xl border border-sky-500 text-sky-700 text-sm font-extrabold text-center">
              ホーム
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!line) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm font-bold">読み込み中...</p>
      </main>
    );
  }

  const atEnd = idx >= lines.length - 1;

  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden select-none">
      {/* 横持ち要求（スマホ縦持ちのときだけ表示） */}
      <div className="rotateOverlay">
        <div className="rounded-3xl border border-white/15 bg-black/70 p-6 text-center shadow-2xl">
          <div className="text-2xl font-extrabold">📱 横持ちで遊んでね</div>
          <p className="mt-2 text-sm text-white/80 font-bold">スマホを横向きにすると続行できます</p>
        </div>
      </div>

      {/* 背景 */}
      <div className="absolute inset-0">
        <img src={bg} alt="bg" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      {/* 上部 */}
      <div className="relative z-10 px-4 pt-3 flex items-center justify-between text-[12px] font-bold text-white/90">
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 rounded-full bg-black/50 border border-white/10">
            {chapter} {idx + 1}/{lines.length}
          </span>
          <span className="text-white/80">Space / Enter / Tap で進む</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/solo" className="underline hover:text-white">
            ソロメニュー
          </Link>
          <Link href="/" className="underline hover:text-white">
            ホーム
          </Link>
        </div>
      </div>

      {/* 立ち絵 */}
      <div className="relative z-10 w-full h-[72vh] sm:h-[74vh] flex items-end justify-center px-4 pb-28">
        <Portrait pos="left" img={leftImg} active={activePos === 'left'} />
        <Portrait pos="center" img={centerImg} active={activePos === 'center'} />
        <Portrait pos="right" img={rightImg} active={activePos === 'right'} />

        {line.bigTitle ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bigTitle">
              <div className="bigTitleInner">{line.bigTitle}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 会話ウィンドウ（テキスト少し大きめ） */}
      <button type="button" onClick={next} className="absolute left-0 right-0 bottom-0 z-20 px-3 pb-4 pt-2 text-left">
        <div className="max-w-5xl mx-auto">
          <div className="window">
            <div className="namePlate">
              <span className="nameText">{speakerName || ' '}</span>
            </div>

            <div className="message">
              <p className="messageText whitespace-pre-wrap">{shown}</p>
              <div className="hintRow">
                {atEnd ? (
                  <span className="text-[11px] text-white/70">（終わり）</span>
                ) : (
                  <span className={'triangle ' + (isTyping ? 'opacity-20' : 'opacity-100')}>▶</span>
                )}
              </div>
            </div>
          </div>

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              className="px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-[12px] font-extrabold hover:bg-white/15"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (!atEnd) next();
              }}
              className="flex-1 px-3 py-2 rounded-xl bg-emerald-500/80 border border-emerald-200/20 text-[12px] font-extrabold hover:bg-emerald-500"
            >
              進む
            </button>
          </div>
        </div>
      </button>

      <style jsx>{`
        /* ===== 横持ち要求（縦持ちスマホだけブロック） ===== */
        .rotateOverlay {
          display: none;
          position: absolute;
          inset: 0;
          z-index: 999;
          align-items: center;
          justify-content: center;
          padding: 16px;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(6px);
        }
        @media (orientation: portrait) and (max-width: 900px) {
          .rotateOverlay {
            display: flex;
          }
        }

        .window {
          position: relative;
          border-radius: 18px;
          border: 2px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.55);
          backdrop-filter: blur(6px);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
          overflow: hidden;
          padding: 14px 14px 10px;
        }
        .namePlate {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 999px;
          border: 1px solid rgba(255, 255, 255, 0.18);
          background: rgba(0, 0, 0, 0.35);
          margin-bottom: 10px;
        }
        .nameText {
          font-weight: 900;
          font-size: 13px;
          color: rgba(255, 255, 255, 0.95);
          letter-spacing: 0.02em;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        }
        .message {
          min-height: 74px;
        }
        /* ★テキストを「もう少しだけ」大きく */
        .messageText {
          font-weight: 900;
          font-size: 16px; /* ←ここ */
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.96);
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.55);
        }
        @media (max-width: 520px) {
          .messageText {
            font-size: 17px; /* スマホはちょい大きめ */
          }
        }

        .hintRow {
          margin-top: 10px;
          display: flex;
          justify-content: flex-end;
          align-items: center;
          height: 16px;
        }
        .triangle {
          font-size: 12px;
          font-weight: 900;
          color: rgba(255, 255, 255, 0.85);
          animation: blink 0.9s ease-in-out infinite;
        }
        @keyframes blink {
          0%,
          100% {
            transform: translateY(0);
            opacity: 0.35;
          }
          50% {
            transform: translateY(-2px);
            opacity: 1;
          }
        }

        .bigTitle {
          padding: 12px 18px;
          border-radius: 18px;
          background: rgba(0, 0, 0, 0.55);
          border: 2px solid rgba(255, 255, 255, 0.2);
          box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
          transform: scale(0.8);
          animation: pop 0.55s ease-out forwards;
        }
        .bigTitleInner {
          font-weight: 1000;
          font-size: 34px;
          letter-spacing: 0.04em;
          color: rgba(255, 255, 255, 0.98);
          text-shadow: 0 4px 22px rgba(0, 0, 0, 0.6);
          padding: 6px 10px;
        }
        @keyframes pop {
          0% {
            transform: scale(0.65);
            opacity: 0;
          }
          60% {
            transform: scale(1.06);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </main>
  );
}

function Portrait({ pos, img, active }) {
  if (!img) return null;

  const place =
    pos === 'left'
      ? 'absolute left-2 sm:left-10 bottom-0 w-[42%] sm:w-[30%] max-w-[340px]'
      : pos === 'right'
      ? 'absolute right-2 sm:right-10 bottom-0 w-[42%] sm:w-[30%] max-w-[340px]'
      : 'absolute left-1/2 -translate-x-1/2 bottom-0 w-[48%] sm:w-[34%] max-w-[380px]';

  const tone = active ? 'opacity-100 brightness-100' : 'opacity-80 brightness-[0.78]';

  return (
    <div className={place}>
      <img
        src={img}
        alt="portrait"
        className={`pointer-events-none drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)] transition duration-200 ${tone} w-full h-auto object-contain`}
        draggable={false}
      />
    </div>
  );
}
