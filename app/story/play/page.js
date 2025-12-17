// file: app/story/play/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';

/* =========================
   キャラ定義（画像パス）
   ※ public/story/char に統一！
========================= */
const CHAR = {
  narrator: { name: 'ナレーション', img: null },

  hero: { name: '主人公', img: '/story/char/hero.png' },
  harimimizu: { name: 'ハリミミズ', img: '/story/char/harimimizu.png' },
  ban: { name: 'バン', img: '/story/char/ban.png' },

  tarou: { name: 'たろう牛丼', img: '/story/char/tarou.png' },
  fuyu: { name: 'ふゆ', img: '/story/char/fuyu.png' },
  dragon50: { name: 'ドラゴン50號', img: '/story/char/dragon50.png' },
  ohayou: { name: 'おはようございます', img: '/story/char/ohayou.png' },
  north: { name: 'ノースちゃん', img: '/story/char/north.png' },
  maxeast: { name: 'MAXイースト', img: '/story/char/maxeast.png' },
  westito: { name: 'ウエスト伊藤', img: '/story/char/westito.png' },
  djsouth: { name: 'DJサウス', img: '/story/char/djsouth.png' },
  mentaiudon: { name: 'めんたいうどん', img: '/story/char/mentaiudon.png' },
  grand: { name: 'グランド', img: '/story/char/grand.png' },
};

/* =========================
   背景定義
========================= */
const BG = {
  black: '/story/bg/black.png',
  home: '/story/bg/home.png',
  stadium: '/story/bg/stadium.png',
};

/* =========================
   値の正規化（空白を殺す）
========================= */
function normKey(v) {
  const t = String(v ?? '').replace(/\u3000/g, ' ').trim();
  return t ? t : null;
}

function getCharSafe(key) {
  const k = normKey(key);
  if (!k) return null;
  return CHAR[k] || null;
}

function getBgUrl(bgKey) {
  const k = normKey(bgKey) || 'black';
  return BG[k] || BG.black;
}

/* =========================
   セーブ/状態（分岐に使う）
========================= */
const LS_FLAGS = 'story:flags'; // ["flagA","flagB"...]
const LS_OUTCOME = 'story:lastOutcome'; // "win" | "lose" | "draw"（バトル後に保存しておく想定）

function loadFlags() {
  try {
    const raw = localStorage.getItem(LS_FLAGS);
    const v = JSON.parse(raw || '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function saveFlags(flagsArr) {
  try {
    localStorage.setItem(LS_FLAGS, JSON.stringify([...new Set(flagsArr)]));
  } catch {}
}
function loadOutcome() {
  try {
    const v = localStorage.getItem(LS_OUTCOME);
    return normKey(v);
  } catch {
    return null;
  }
}

function normalizeChapterParam(raw) {
  const t = String(raw ?? '').trim().toLowerCase();
  // "chapter0" / "0" / "０" → "ch0"
  const n = Number(t.replace(/^chapter/, '').replace(/[^\d]/g, ''));
  if (Number.isFinite(n)) return `ch${n}`;
  if (t.startsWith('ch')) return t;
  return 'ch0';
}

/* =========================
   本体
========================= */
export default function StoryPlayPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const chapter = normalizeChapterParam(sp.get('chapter') ?? '0');


  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState('');

  // lines は “idベース” で扱う
  const [lines, setLines] = useState([]);
  const [byId, setById] = useState(new Map());

  // 現在行（id）
  const [curId, setCurId] = useState(null);

  // フラグ（分岐条件）
  const [flags, setFlags] = useState([]);
  const outcome = useMemo(() => (typeof window !== 'undefined' ? loadOutcome() : null), []);

  // タイプライター
  const [shown, setShown] = useState('');
  const [isTyping, setIsTyping] = useState(true);
  const typingRef = useRef(null);

  // セリフ枠スクロール
  const msgScrollRef = useRef(null);

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
    }, 16);
  }

  // 初回：flagsロード
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setFlags(loadFlags());
  }, []);

  // 章ロード
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setLoadErr('');

        const r = await fetch(`/api/story/load?chapter=${encodeURIComponent(chapter)}`, {
          cache: 'no-store',
        });
        const d = await r.json().catch(() => ({}));

        if (!r.ok || !d.ok || !Array.isArray(d.story)) {
          throw new Error(d?.error || 'ストーリー取得に失敗');
        }

        // 正規化（空白→null）
        const normalized = d.story.map((x, i) => ({
          id: normKey(x.id) ?? String(i + 1),
          bg: normKey(x.bg) || 'black',
          left: normKey(x.left),
          center: normKey(x.center),
          right: normKey(x.right),
          speaker: normKey(x.speaker),
          text: String(x.text ?? ''),
          bigTitle: normKey(x.bigTitle),

          next: normKey(x.next),
          choices: Array.isArray(x.choices) ? x.choices : [],

          needFlags: Array.isArray(x.needFlags) ? x.needFlags : [],
          needOutcome: normKey(x.needOutcome),

          setFlags: Array.isArray(x.setFlags) ? x.setFlags : [],
        }));

        const map = new Map();
        for (const ln of normalized) map.set(ln.id, ln);

        // 開始行：先頭の行
        const firstId = normalized[0]?.id ?? null;

        if (!cancelled) {
          setLines(normalized);
          setById(map);
          setCurId(firstId);
        }
      } catch (e) {
        if (!cancelled) setLoadErr(String(e?.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [chapter]);

  const line = useMemo(() => (curId ? byId.get(curId) : null), [curId, byId]);

  // 条件判定（need_flags / need_outcome）
  const isLineAvailable = useMemo(() => {
    if (!line) return false;

    // outcome 条件
    if (line.needOutcome) {
      if (!outcome) return false;
      if (line.needOutcome !== outcome) return false;
    }

    // flags 条件
    if (line.needFlags && line.needFlags.length > 0) {
      const set = new Set(flags);
      for (const f of line.needFlags) {
        if (!set.has(f)) return false;
      }
    }

    return true;
  }, [line, flags, outcome]);

  // タイピング開始
  useEffect(() => {
    if (!line) return;

    // 条件未達なら “次へスキップ”
    if (!isLineAvailable) {
      // next があれば next へ、なければ順番で次へ
      const fallbackNext = line.next || getNextSequentialId(lines, line.id);
      if (fallbackNext) setCurId(fallbackNext);
      return;
    }

    startTyping(line.text);

    setTimeout(() => {
      if (msgScrollRef.current) {
        msgScrollRef.current.scrollTop = msgScrollRef.current.scrollHeight;
      }
    }, 0);

    return () => stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line?.id]);

  function applySetFlags(setFlags) {
    if (!setFlags || setFlags.length === 0) return;
    setFlags((prev) => {
      const next = [...new Set([...prev, ...setFlags.map(String)])];
      saveFlags(next);
      return next;
    });
  }

  function goToId(nextId) {
    const nid = normKey(nextId);
    if (!nid) return;
    if (!byId.has(nid)) return; // Excelの参照ミス防止
    setCurId(nid);
  }

  function next() {
    if (!line) return;

    // 選択肢がある行は、クリックで勝手に進めない（選ばせる）
    if (line.choices && line.choices.length > 0) {
      // タイピング中だけは全文表示にする
      if (isTyping) {
        stopTyping();
        setShown(String(line.text ?? ''));
        setIsTyping(false);
      }
      return;
    }

    // 途中なら全文表示
    if (isTyping) {
      stopTyping();
      setShown(String(line.text ?? ''));
      setIsTyping(false);
      return;
    }

    // 行に setFlags があるなら付与
    applySetFlags(line.setFlags);

    // 次（idベース）
    const nid = line.next || getNextSequentialId(lines, line.id);
    if (!nid) return;
    goToId(nid);
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        next();
      }
      if (e.key === 'Escape') router.push('/solo');
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [line, isTyping]);

  const speakerName = useMemo(() => {
    const s = line?.speaker ? CHAR[line.speaker] : null;
    return s?.name ?? '';
  }, [line?.speaker]);

  const bgUrl = useMemo(() => getBgUrl(line?.bg), [line?.bg]);
  const leftChar = useMemo(() => getCharSafe(line?.left), [line?.left]);
  const centerChar = useMemo(() => getCharSafe(line?.center), [line?.center]);
  const rightChar = useMemo(() => getCharSafe(line?.right), [line?.right]);

  // chapter日付（とりあえず固定ルール）
  const dateLabel = useMemo(() => {
    const c = String(chapter);
    if (c === '0' || c === 'chapter0') return '12/19';
    return '12/20';
  }, [chapter]);

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-sm font-extrabold">ストーリーを読み込み中...</p>
      </main>
    );
  }

  if (loadErr) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
          <h1 className="text-lg font-extrabold">ストーリー読み込みエラー</h1>
          <p className="text-sm text-rose-300 whitespace-pre-wrap">{loadErr}</p>
          <div className="flex gap-2">
            <button
              onClick={() => location.reload()}
              className="flex-1 py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 font-extrabold"
            >
              再読み込み
            </button>
            <Link
              href="/solo"
              className="flex-1 py-2 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 text-center font-extrabold"
            >
              戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!line) {
    return (
      <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center">
        <p className="text-sm font-extrabold">ストーリーがありません</p>
      </main>
    );
  }

  const hasChoices = line.choices && line.choices.length > 0;

  return (
    <main className="min-h-screen bg-black text-white relative overflow-hidden select-none">
      {/* 背景 */}
      <div className="absolute inset-0">
        <img src={bgUrl} alt="bg" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/25" />
      </div>

      {/* 上部ナビ + 日付 */}
      <div className="relative z-10 px-4 pt-3 flex items-center justify-between text-[12px] font-bold text-white/90">
        <div className="flex items-center gap-2">
          <span className="text-white/80">Space / Enter / Tap で進む</span>
        </div>

        <div className="flex items-center gap-3">
          <span className="px-2 py-1 rounded-full bg-black/45 border border-white/10 text-white/90">
            {dateLabel}
          </span>

          <Link href="/solo" className="underline hover:text-white">
            ソロメニュー
          </Link>
          <Link href="/" className="underline hover:text-white">
            ホーム
          </Link>
        </div>
      </div>

      {/* キャラレイヤ */}
      <div className="relative z-10 w-full h-[74vh] flex items-end justify-center px-3">
        <Portrait
          key={`L-${line.id}-${leftChar?.img || 'none'}`}
          pos="left"
          ch={leftChar}
          active={!!line.speaker && line.left === line.speaker}
        />
        <Portrait
          key={`C-${line.id}-${centerChar?.img || 'none'}`}
          pos="center"
          ch={centerChar}
          active={!!line.speaker && line.center === line.speaker}
        />
        <Portrait
          key={`R-${line.id}-${rightChar?.img || 'none'}`}
          pos="right"
          ch={rightChar}
          active={!!line.speaker && line.right === line.speaker}
        />

        {line.bigTitle ? (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bigTitle">
              <div className="bigTitleInner">{line.bigTitle}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 会話ウィンドウ */}
      <button
        type="button"
        onClick={next}
        className="absolute left-0 right-0 bottom-0 z-20 px-3 pb-4 pt-2 text-left"
      >
        <div className="max-w-5xl mx-auto">
          <div className="window">
            <div className="namePlate">
              <span className="nameText">{speakerName || ' '}</span>
            </div>

            <div className="message" ref={msgScrollRef}>
              <p className="messageText whitespace-pre-wrap">{shown}</p>

              <div className="hintRow">
                {hasChoices ? (
                  <span className="text-[11px] text-white/70">（選択してください）</span>
                ) : (
                  <span className={'triangle ' + (isTyping ? 'opacity-20' : 'opacity-100')}>▶</span>
                )}
              </div>
            </div>
          </div>

          {/* ★選択肢UI */}
          {hasChoices && (
            <div className="mt-2 grid grid-cols-1 gap-2">
              {line.choices.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();

                    // 行に setFlags があるなら付与
                    applySetFlags(line.setFlags);

                    // 選択肢ジャンプ
                    goToId(c.to);
                  }}
                  className="px-4 py-3 rounded-2xl bg-white/10 border border-white/10 text-[13px] font-extrabold hover:bg-white/15"
                >
                  {c.text}
                </button>
              ))}
            </div>
          )}

          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // “順番戻し”は id方式だと難しいので、とりあえず無効化したくなければ実装する
                // 必要なら「履歴スタック」で戻るにする
              }}
              className="px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[12px] font-extrabold opacity-50"
              disabled
              title="戻るは次で履歴方式にする"
            >
              戻る
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              className="flex-1 px-3 py-2 rounded-xl bg-emerald-500/80 border border-emerald-200/20 text-[12px] font-extrabold hover:bg-emerald-500"
            >
              進む
            </button>
          </div>
        </div>
      </button>

      <style jsx>{`
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
          font-size: 12px;
          color: rgba(255, 255, 255, 0.95);
          letter-spacing: 0.02em;
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
        }

        .message {
          height: 110px;
          overflow: auto;
          padding-right: 6px;
        }
        .message::-webkit-scrollbar {
          width: 8px;
        }
        .message::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.18);
          border-radius: 999px;
        }

        .messageText {
          font-weight: 900;
          font-size: 15px;
          line-height: 1.7;
          color: rgba(255, 255, 255, 0.95);
          text-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
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

        @media (max-height: 740px) {
          .message {
            height: 96px;
          }
        }
      `}</style>
    </main>
  );
}

/* =========================
   次の行（順番）を id で返す
========================= */
function getNextSequentialId(lines, currentId) {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const idx = lines.findIndex((x) => x.id === currentId);
  if (idx < 0) return null;
  const next = lines[idx + 1];
  return next?.id ?? null;
}

/* =========================
   立ち絵コンポーネント
   - bottom はユーザー指定で 50px がベスト
========================= */
function Portrait({ pos, ch, active }) {
  if (!ch || !ch.img) return null;

  const base =
    'pointer-events-none drop-shadow-[0_14px_30px_rgba(0,0,0,0.55)] transition duration-200';

  const bottom = 'bottom-[50px] sm:bottom-[120px]';

  const place =
    pos === 'left'
      ? `absolute left-2 sm:left-10 ${bottom} w-[44%] sm:w-[30%] max-w-[340px]`
      : pos === 'right'
      ? `absolute right-2 sm:right-10 ${bottom} w-[44%] sm:w-[30%] max-w-[340px]`
      : `absolute left-1/2 -translate-x-1/2 ${bottom} w-[52%] sm:w-[34%] max-w-[380px]`;

  const tone = active ? 'opacity-100 brightness-100' : 'opacity-82 brightness-[0.78]';

  return (
    <div className={place}>
      <img
        src={ch.img}
        alt={ch.name}
        className={`${base} ${tone} w-full h-auto object-contain`}
        draggable={false}
      />
    </div>
  );
}
