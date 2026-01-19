// file: app/solo/whois/play/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const SHOW_ANSWER_MS = 2000;

const IMG_FRAME = '/whois/frame.PNG';
const IMG_LEAF = '/whois/leaf.PNG';
const IMG_SIL = '/whois/silhouette.PNG';

// ===== 判定（ゆるめ）=====
function stripParens(s) {
  return (s || '').toString().replace(/（[^）]*）/g, '').replace(/\([^)]*\)/g, '');
}
function normalizeLoose(s) {
  return stripParens(s)
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(
      /[・、，,./／\u30fb\u3001\u3002\-ー―—_~!！?？:：;；"'“”‘’\[\]{}()（）<>＜＞@#＃$％%^&＆*＋+=|｜\\]/g,
      ''
    );
}
function isCorrectWhois(correctName, altAnswers, userInput) {
  const inN = normalizeLoose(userInput);
  if (!inN) return false;

  const main = normalizeLoose(correctName || '');
  if (main && (main === inN || main.includes(inN) || inN.includes(main))) return true;

  const alts = Array.isArray(altAnswers) ? altAnswers : [];
  for (const a of alts) {
    const an = normalizeLoose(a);
    if (an && (an === inN || an.includes(inN) || inN.includes(an))) return true;
  }
  return false;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

// ===== シャッフル（Fisher–Yates）=====
function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

// ===== 安定した乱数（レンダー毎に変わらない）=====
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeSeedFromQuestion(q) {
  const base = Number(q?.id ?? 0) || 0;
  // idが無いケースでも安定するように軽く混ぜる
  const a = (base * 2654435761) >>> 0;
  const b = (String(q?.answer ?? '').length * 1013904223) >>> 0;
  return (a ^ b) >>> 0;
}


// ===== ヒント配列化（DBが text[] / text の両対応）=====
function splitHintsAny(v) {
  const raw = Array.isArray(v) ? v.map((s) => String(s ?? '')).join('\n') : String(v ?? '');

  const text = raw
    .replace(/\r/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\n/g, '\n')
    .trim();

  if (!text) return [];

  const hintNumberSplit =
    /(?:^|\n)\s*(?:ヒント\s*\d+\s*[:：]|hint\s*\d+\s*[:：])/i.test(text) ? true : false;

  let chunks = [];
  if (hintNumberSplit) {
    const tmp = text.split(/(?=(?:^|\n)\s*(?:ヒント\s*\d+\s*[:：]|hint\s*\d+\s*[:：]))/i);
    chunks = tmp
      .map((s) => s.replace(/^(?:\n\s*)?/, '').trim())
      .filter(Boolean)
      .map((s) => s.replace(/^(?:ヒント|hint)\s*\d+\s*[:：]\s*/i, '').trim())
      .filter(Boolean);
  } else {
    chunks = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const out = [];
  const bulletRe = /^[・•\-\*\u2022●◯]+/;

  for (const lineRaw of chunks) {
    const line = String(lineRaw ?? '').trim();
    if (!line) continue;

    if (/[・•\-\*\u2022●◯]/.test(line)) {
      const parts = line.split(/(?=[・•\-\*\u2022●◯])/g);
      if (parts.length >= 2) {
        for (const p of parts) {
          const t = String(p ?? '').replace(bulletRe, '').trim();
          if (t) out.push(t);
          if (out.length >= 5) break;
        }
        if (out.length >= 5) break;
        continue;
      }
    }

    const parts2 = line
      .split(/[，,、]/g)
      .map((s) => s.trim())
      .filter(Boolean);

    if (parts2.length >= 2) {
      for (const t of parts2) {
        if (t) out.push(t);
        if (out.length >= 5) break;
      }
      if (out.length >= 5) break;
    } else {
      const t = line.replace(bulletRe, '').trim();
      if (t) out.push(t);
      if (out.length >= 5) break;
    }
  }

  if (out.length <= 1) {
    const more = text
      .split(/[。！？!？]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (more.length >= 2) {
      out.splice(0, out.length, ...more);
    }
  }

  return out
    .map((s) => String(s ?? '').trim())
    .filter(Boolean)
    .slice(0, 5);
}

export default function WhoIsPlayPage() {
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [session, setSession] = useState(null);
  const [idx, setIdx] = useState(0);

  const [phase, setPhase] = useState('idle'); // idle | question | show-answer | finished
  const [doorOpen, setDoorOpen] = useState(false);

  const [answer, setAnswer] = useState('');
  const inputRef = useRef(null);

  const [correctCount, setCorrectCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [streak, setStreak] = useState(0);

  const [lastCorrect, setLastCorrect] = useState(null);
  const [message, setMessage] = useState('');

  const [answerHistory, setAnswerHistory] = useState([]);

  // ===== 扉の比率（frame画像に追従）=====
  const [frameRatio, setFrameRatio] = useState(3 / 4);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const img = new Image();
    img.src = IMG_FRAME;
    img.onload = () => {
      const w = img.naturalWidth || 1;
      const h = img.naturalHeight || 1;
      setFrameRatio(w / h);
    };
  }, []);

  // ===== セッション読み込み（ここで1回だけシャッフル）=====
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('whois_session');
      if (!raw) {
        setErrorMessage('セッションが見つかりません。トップから開始してください。');
        setLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setErrorMessage('出題する問題がありません。');
        setLoaded(true);
        return;
      }

      const qs = Array.isArray(parsed.questions) ? [...parsed.questions] : [];
      shuffleInPlace(qs);

      const nextSession = {
        ...parsed,
        questions: qs,
      };

      setSession(nextSession);
      setIdx(0);
      setPhase('idle');
      setDoorOpen(false);
      setAnswer('');

      setCorrectCount(0);
      setMissCount(0);
      setStreak(0);

      setLastCorrect(null);
      setMessage('');
      setAnswerHistory([]);
    } catch (e) {
      console.error(e);
      setErrorMessage('セッションの読み込みに失敗しました。');
    } finally {
      setLoaded(true);
    }
  }, []);

  const bestKey = useMemo(() => {
    const m = session?.mode || 'timed';
    const mins = session?.mode === 'timed' ? Number(session?.minutes || 5) : 0;
    return `whois_best_${m}${m === 'timed' ? `_${mins}` : ''}`;
  }, [session?.mode, session?.minutes]);

  const [bestScore, setBestScore] = useState(0);

  useEffect(() => {
    if (!bestKey) return;
    try {
      const raw = window.localStorage.getItem(bestKey);
      const n = raw ? Number(raw) : 0;
      if (!Number.isNaN(n) && n > 0) setBestScore(n);
      else setBestScore(0);
    } catch {
      setBestScore(0);
    }
  }, [bestKey]);

  const current = useMemo(() => {
    if (!session?.questions) return null;
    return session.questions[idx] ?? null;
  }, [session, idx]);

  const totalMs = useMemo(() => {
    if (session?.mode !== 'timed') return 0;
    const m = Number(session?.minutes || 5);
    return Math.max(1, m) * 60 * 1000;
  }, [session]);

  // ===== タイマー =====
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!session) return;

    if (session.mode === 'timed' && (phase === 'idle' || phase === 'finished')) {
      setTimeLeftMs(totalMs);
      return;
    }

    if (session.mode !== 'timed') return;
    if (phase !== 'question' && phase !== 'show-answer') return;

    const startAt = startedAtRef.current || session.startedAt || Date.now();
    startedAtRef.current = startAt;

    const tick = () => {
      const rest = totalMs - (Date.now() - startAt);
      if (rest <= 0) {
        setTimeLeftMs(0);
        setPhase('finished');
        setDoorOpen(false);
        return;
      }
      setTimeLeftMs(rest);
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [session, totalMs, phase]);

  const timeRatio = useMemo(() => {
    if (session?.mode !== 'timed') return 1;
    if (!totalMs) return 0;
    return clamp(timeLeftMs / totalMs, 0, 1);
  }, [session?.mode, timeLeftMs, totalMs]);

  // ===== ヒント：最初から全部表示（最大5）=====
  const hintsAll = useMemo(() => splitHintsAny(current?.hints), [current]);
  const hintsShown = useMemo(() => hintsAll.slice(0, 5), [hintsAll]); // 常に全部
const floatCfg = useMemo(() => {
  const seed = makeSeedFromQuestion(current);
  const rnd = mulberry32(seed);
  return hintsShown.map(() => {
    // ふわふわ周期と位相を固定
    const floatDur = (5.6 + rnd() * 2.4).toFixed(2); // 5.6〜8.0
    const floatDelay = (-rnd() * 2.5).toFixed(2); // -2.5〜0（開始位相ズラし）
    const rot = (rnd() * 0.18 - 0.09).toFixed(3); // -0.09〜0.09deg
    const amp = (8 + rnd() * 10).toFixed(2); // 8〜18px
    return { floatDur, floatDelay, rot, amp };
  });
}, [current?.id, current?.answer, hintsShown.length]);


  const hintPositions = [
    { x: 18, y: 30 },
    { x: 82, y: 30 },
    { x: 50, y: 14 },
    { x: 18, y: 68 },
    { x: 82, y: 68 },
  ];

  const title =
    session?.mode === 'timed'
      ? `私は誰でしょう（${Number(session?.minutes || 5)}分）`
      : '私は誰でしょう（エンドレス）';

  const start = () => {
    if (!session) return;
    if (phase !== 'idle') return;

    startedAtRef.current = session.startedAt || Date.now();
    setPhase('question');
    setDoorOpen(true);
    setMessage('人物シルエットが現れた…ヒントを読んで答えろ。');
    setAnswer('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const pushHistory = (userAnswerText, correctAnswerText) => {
    const qid = current?.id ?? null;
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: qid,
        text: `【私は誰でしょう】\n${hintsAll.map((h, i) => `ヒント${i + 1}: ${h}`).join('\n')}`,
        userAnswerText,
        correctAnswerText: String(correctAnswerText ?? ''),
      },
    ]);
  };

  const goNext = () => {
    if (!session?.questions?.length) return;

    const next = idx + 1;
    setIdx(next >= session.questions.length ? 0 : next);

    setLastCorrect(null);
    setMessage('人物シルエットが現れた…ヒントを読んで答えろ。');

    setAnswer('');

    setDoorOpen(false);
    setTimeout(() => {
      setDoorOpen(true);
      setPhase('question');
      setTimeout(() => inputRef.current?.focus(), 0);
    }, 420);
  };

  const submit = (giveUp = false) => {
    if (!current) return;
    if (phase !== 'question') return;

    const ok = giveUp ? false : isCorrectWhois(current.answer, current.altAnswers, answer);

    setLastCorrect(ok);
    setPhase('show-answer');

    pushHistory(giveUp ? '（ギブアップ）' : answer || '（未入力）', current.answer);

    if (ok) {
      setCorrectCount((c) => c + 1);
      setStreak((s) => s + 1);
      setMessage(`正解！（答え: ${current.answer}）`);
    } else {
      setMissCount((m) => m + 1);
      setStreak(0);
      setMessage(`不正解…（答え: ${current.answer}）`);
    }

    setTimeout(() => {
      if (session?.mode === 'endless' && !ok) {
        setPhase('finished');
        setDoorOpen(false);
        return;
      }
      if (session?.mode === 'timed' && timeLeftMs <= 0) {
        setPhase('finished');
        setDoorOpen(false);
        return;
      }
      goNext();
    }, SHOW_ANSWER_MS);
  };

  useEffect(() => {
    if (phase !== 'finished') return;
    try {
      setBestScore((prev) => {
        const next = Math.max(prev, correctCount);
        if (next > prev) window.localStorage.setItem(bestKey, String(next));
        return next;
      });
    } catch {}
  }, [phase, correctCount, bestKey]);

  const backToTop = () => {
    sessionStorage.removeItem('whois_session');
    router.push('/solo/whois');
  };

  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen p-6">
        <div className="max-w-xl mx-auto bg-white border border-rose-200 rounded-2xl p-4 text-rose-700">
          {errorMessage}
          <div className="mt-3">
            <Link href="/solo/whois" className="underline font-bold">
              トップへ戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <main className="min-h-screen bg-sky-200/60">
        <div className="max-w-5xl mx-auto px-3 pt-4 pb-10">
          <header className="flex items-center justify-between mb-3">
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide">{title}</h1>
            <div className="flex items-center gap-3">
              <Link className="text-[12px] font-extrabold underline text-slate-900" href="/solo/whois">
                種目選択
              </Link>
              <Link className="text-[12px] font-extrabold underline text-slate-900" href="/">
                ホームへ戻る
              </Link>
            </div>
          </header>

          <div className="max-w-md mx-auto bg-white/90 border border-sky-300 rounded-2xl shadow-xl p-4 sm:p-6 text-slate-900">
            <h2 className="text-lg sm:text-xl font-extrabold mb-2">結果</h2>

            <div className="space-y-1 text-sm">
              <p>
                正解： <span className="font-extrabold text-emerald-700">{correctCount}</span>
              </p>
              <p>
                ミス： <span className="font-extrabold text-rose-700">{missCount}</span>
              </p>
              <p>
                連続正解： <span className="font-extrabold text-slate-900">{streak}</span>
              </p>
              <p>
                自己ベスト： <span className="font-extrabold text-sky-700">{bestScore}</span>
              </p>
            </div>

            {message ? <p className="text-xs text-slate-600 mt-2">{message}</p> : null}

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push('/solo/whois')}
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-extrabold hover:bg-sky-400"
              >
                もう一度（トップへ）
              </button>
              <button
                type="button"
                onClick={backToTop}
                className="px-4 py-2 rounded-full border border-sky-400 bg-white text-sm font-extrabold text-slate-900 hover:bg-sky-50"
              >
                セッション破棄して戻る
              </button>
            </div>
          </div>

          <div className="max-w-3xl mx-auto mt-5">
            <QuestionReviewAndReport questions={answerHistory} sourceMode="whois" />
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="whois-nozoom min-h-screen text-slate-900 relative overflow-hidden">
      <style jsx global>{`
        @media (max-width: 640px) {
          .whois-nozoom input,
          .whois-nozoom textarea,
          .whois-nozoom select {
            font-size: 16px !important;
          }
        }

        :root {
          --doorInsetX: 245px;
          --doorInsetTop: 50px;
          --doorInsetBottom: 60px;
        }

        .whoisDoorStage {
          position: absolute;
          inset: 0;
        }
        .whoisDoorway {
          position: absolute;
          inset: 0;
          border-radius: 22px;
          border: 1px solid rgba(11, 22, 48, 0.14);
          box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35), 0 18px 40px rgba(10, 19, 42, 0.12);
          overflow: hidden;
          background: radial-gradient(900px 420px at 50% 18%, rgba(255, 255, 255, 0.92), transparent 62%),
            radial-gradient(900px 520px at 60% 95%, rgba(214, 190, 160, 0.28), transparent 62%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.12));
          isolation: isolate;
        }

        .whoisBeyond {
          position: absolute;
          inset: 0;
          z-index: 1;
          opacity: 0;
          transform: scale(1.02);
          transition: opacity 0.65s ease, transform 0.65s ease;
          background: radial-gradient(760px 360px at 50% 18%, rgba(255, 255, 255, 0.92), transparent 60%),
            radial-gradient(900px 520px at 60% 95%, rgba(214, 190, 160, 0.28), transparent 62%),
            linear-gradient(180deg, rgba(255, 255, 255, 0.58), rgba(255, 255, 255, 0.12));
        }
        .whoisDoorOpen .whoisBeyond {
          opacity: 1;
          transform: scale(1);
        }

        .whoisSpot {
          position: absolute;
          left: 50%;
          top: 40%;
          transform: translate(-50%, -50%);
          width: min(520px, 78vw);
          height: min(520px, 78vw);
          border-radius: 9999px;
          background: radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.8), rgba(255, 255, 255, 0) 62%);
          opacity: 0;
          z-index: 2;
          pointer-events: none;
        }
        .whoisDoorOpen .whoisSpot {
          animation: whoisSpotIn 0.7s ease forwards 0.08s;
        }
        @keyframes whoisSpotIn {
          from {
            opacity: 0;
            transform: translate(-50%, -48%) scale(0.98);
          }
          to {
            opacity: 0.85;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        .whoisLeafSlot {
          position: absolute;
          left: 50%;
          top: var(--doorInsetTop);
          bottom: var(--doorInsetBottom);
          width: calc(100% - (var(--doorInsetX) * 2));
          transform: translateX(-50%);
          pointer-events: none;
          overflow: hidden;
          border-radius: 14px;
          perspective: 1100px;
          transform-style: preserve-3d;
          z-index: 10;
        }

        .whoisDoorLeaf {
          position: absolute;
          top: 0;
          bottom: 0;
          width: 50%;
          overflow: hidden;
          background-image: url(${IMG_LEAF});
          background-repeat: no-repeat;
          background-size: 200% 100%;
          transform-style: preserve-3d;
          backface-visibility: hidden;
          transition: transform 1.05s cubic-bezier(0.2, 0.9, 0.2, 1);
          box-shadow: 0 26px 55px rgba(10, 19, 42, 0.22);
          filter: drop-shadow(0 8px 18px rgba(0, 0, 0, 0.1));
        }
        .whoisDoorLeaf.left {
          left: 0;
          transform-origin: left center;
          background-position: 0% 50%;
        }
        .whoisDoorLeaf.right {
          right: 0;
          transform-origin: right center;
          background-position: 100% 50%;
        }

        .whoisDoorOpen .whoisDoorLeaf {
          z-index: 60;
          transform: translateZ(40px);
        }
        .whoisDoorOpen .whoisDoorLeaf.left {
          transform: translateZ(40px) rotateY(-82deg);
        }
        .whoisDoorOpen .whoisDoorLeaf.right {
          transform: translateZ(40px) rotateY(82deg);
        }

        .whoisSeam {
          position: absolute;
          left: 50%;
          top: var(--doorInsetTop);
          bottom: var(--doorInsetBottom);
          width: 4px;
          transform: translateX(-50%);
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.06));
          opacity: 0.9;
          pointer-events: none;
          filter: blur(0.2px);
          z-index: 11;
        }

        .whoisFrameOverlay {
          position: absolute;
          inset: 0;
          background: url(${IMG_FRAME}) center/contain no-repeat;
          pointer-events: none;
          z-index: 20;
          opacity: 1;
          transition: opacity 0.25s ease;
        }
        .whoisDoorOpen .whoisFrameOverlay {
          opacity: 0;
        }

        .whoisSilWrap {
          position: absolute;
          left: 50%;
          top: 56%;
          transform: translate(-50%, -50%);
          width: min(260px, 42%);
          height: 56%;
          opacity: 0;
          pointer-events: none;
          filter: drop-shadow(0 18px 30px rgba(10, 19, 42, 0.16));
          z-index: 30;
        }
        .whoisSilImg {
          width: 100%;
          height: 100%;
          object-fit: contain;
          object-position: center;
          display: block;
        }
        .whoisDoorOpen .whoisSilWrap {
          animation: whoisSilIn 0.65s cubic-bezier(0.2, 0.9, 0.2, 1) forwards 0.1s;
        }
        @keyframes whoisSilIn {
          from {
            opacity: 0;
            transform: translate(-50%, -46%) scale(0.97);
          }
          to {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
          }
        }

        .whoisOrbs {
          position: absolute;
          inset: 0;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.25s ease;
          z-index: 40;
        }
        .whoisDoorOpen .whoisOrbs {
          opacity: 1;
        }

        .whoisHintBubble {
  position: absolute;
  min-width: 170px;
  max-width: 260px;
  padding: 12px 12px;
  border-radius: 18px;
  border: 1px solid rgba(11, 22, 48, 0.14);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 18px 42px rgba(10, 19, 42, 0.12);
  opacity: 0;
  transform: translate3d(0, 16px, 0) scale(0.98);
  animation: whoisBubbleIn 0.55s cubic-bezier(0.2, 0.9, 0.2, 1) forwards,
    whoisFloatyBox var(--floatDur, 9s) ease-in-out infinite;
  backdrop-filter: blur(10px);
  will-change: transform, opacity;
}

.whoisHintBubbleInner {
  will-change: auto;
  transform: none;
  animation: none;
}


@keyframes whoisBubbleIn {
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@keyframes whoisFloatyBox {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(var(--rot, 0deg));
  }
  50% {
    transform: translate3d(0, calc(var(--amp, 10px) * -1), 0) rotate(calc(var(--rot, 0deg) * -1));
  }
}


@keyframes whoisFloaty {
  0%,
  100% {
    transform: translate3d(0, 0, 0) rotate(var(--rot, 0deg));
  }
  50% {
    transform: translate3d(0, calc(var(--amp, 12px) * -1), 0) rotate(calc(var(--rot, 0deg) * -1));
  }
}


        .whoisOverlay {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: radial-gradient(900px 520px at 50% 40%, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0.15));
          backdrop-filter: blur(10px);
          z-index: 80;
        }
        .whoisStartCard {
          width: min(520px, 92%);
          border-radius: 22px;
          border: 1px solid rgba(11, 22, 48, 0.12);
          background: rgba(255, 255, 255, 0.86);
          box-shadow: 0 22px 60px rgba(10, 19, 42, 0.16);
          padding: 18px;
          text-align: center;
        }
        .whoisStartCard h2 {
          margin: 0;
          font-size: 18px;
          letter-spacing: 0.06em;
          font-weight: 950;
        }
        .whoisStartCard p {
          margin: 10px 0 14px;
          color: rgba(57, 82, 112, 0.95);
          font-size: 13px;
          line-height: 1.6;
          font-weight: 800;
        }
        .whoisStartBtn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 18px;
          border-radius: 16px;
          border: 1px solid rgba(18, 184, 134, 0.22);
          background: linear-gradient(135deg, rgba(99, 230, 190, 0.5), rgba(77, 171, 247, 0.24));
          font-weight: 950;
          cursor: pointer;
          box-shadow: 0 14px 32px rgba(10, 19, 42, 0.12);
        }
      `}</style>

      <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-sky-50" />
      <div className="relative z-10 flex flex-col items-center justify-start pt-3 px-3 pb-8">
        <header className="w-full max-w-5xl flex items-center justify-between mb-2">
          <h1 className="text-base sm:text-lg font-extrabold tracking-wide">{title}</h1>
          <div className="flex items-center gap-3">
            <Link className="text-[12px] font-extrabold underline text-slate-900" href="/solo/whois">
              種目選択
            </Link>
            <Link className="text-[12px] font-extrabold underline text-slate-900" href="/">
              ホームへ戻る
            </Link>
          </div>
        </header>

        <div className="w-full max-w-5xl mx-auto mt-1 mb-2 px-1 sm:px-2">
          <div className="flex items-center justify-between mb-1">
            <div className="flex flex-col">
              <span className="text-[11px] sm:text-xs text-slate-900 font-bold">
                {session?.mode === 'timed' ? '残り時間' : 'エンドレス'}
              </span>
              <span className="text-[11px] sm:text-xs text-slate-800">
                自己ベスト: <span className="font-extrabold text-sky-700">{bestScore}</span>
              </span>
            </div>

            <div className="flex gap-3 items-center text-[11px] sm:text-xs text-slate-900 font-bold">
              <span>
                Correct: <span className="font-extrabold text-emerald-700">{correctCount}</span>
              </span>
              <span>
                Miss: <span className="font-extrabold text-rose-700">{missCount}</span>
              </span>
              <span>
                Streak: <span className="font-extrabold text-slate-900">{streak}</span>
              </span>
            </div>
          </div>

          {session?.mode === 'timed' ? (
            <div className="w-full h-3 rounded-full bg-white/70 overflow-hidden border border-sky-300 shadow-inner hidden sm:block">
              <div className="h-full bg-sky-500 transition-[width] duration-200" style={{ width: `${timeRatio * 100}%` }} />
            </div>
          ) : null}
        </div>

        <div className="w-full max-w-5xl mx-auto">
          <div className="bg-white/75 border border-sky-200 rounded-3xl shadow-xl overflow-hidden">
            <div className="p-3 sm:p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] sm:text-sm font-extrabold text-slate-900">
                  STAGE {idx + 1} / {session?.questions?.length || 0}
                </div>

                <div className="flex items-center gap-2">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-700">
                    ヒント: {Math.min(5, hintsAll.length || 0)}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setDoorOpen(false);
                      setTimeout(() => setDoorOpen(true), 240);
                      setAnswer('');
                      setMessage('人物シルエットが現れた…ヒントを読んで答えろ。');
                      setLastCorrect(null);
                      setPhase('question');
                      setTimeout(() => inputRef.current?.focus(), 0);
                    }}
                    className="px-3 py-1 rounded-full border border-sky-300 bg-white text-[11px] font-extrabold hover:bg-sky-50"
                  >
                    ↺ リセット
                  </button>
                </div>
              </div>

              <div
                className="relative mt-3 w-full max-h-[70vh] mx-auto"
                style={{
                  aspectRatio: `${frameRatio}`,
                  width: 'min(900px, 100%)',
                }}
              >
                <div className={`whoisDoorStage ${doorOpen ? 'whoisDoorOpen' : ''}`}>
                  <div className="whoisDoorway" aria-hidden="true">
                    <div className="whoisBeyond" />
                    <div className="whoisSpot" />

                    <div className="whoisLeafSlot" aria-hidden="true">
                      <div className="whoisDoorLeaf left" />
                      <div className="whoisDoorLeaf right" />
                    </div>

                    <div className="whoisSeam" aria-hidden="true" />
                    <div className="whoisFrameOverlay" aria-hidden="true" />

                    <div className="whoisSilWrap" aria-hidden="true">
                      <img className="whoisSilImg" src={IMG_SIL} alt="silhouette" />
                    </div>

                   <div className="whoisOrbs" aria-hidden="true">
  {doorOpen &&
    phase !== 'idle' &&
    hintsShown.map((h, i) => {
      const p = hintPositions[i] || { x: 50, y: 50 };
      const delay = (i * 0.1).toFixed(2);

      return (
        <div
          key={`${idx}-${i}`}
          className="whoisHintBubble"
          style={{
            left: `calc(${p.x}% - 120px)`,
            top: `calc(${p.y}% - 42px)`,
            animationDelay: `${delay}s`,
          }}
        >
          <div
            className="whoisHintBubbleInner"
            style={{
              animationDelay: `${floatCfg[i]?.floatDelay ?? '0'}s`,
              animationDuration: `${floatCfg[i]?.floatDur ?? '6.5'}s`,
              ['--rot']: `${floatCfg[i]?.rot ?? '0'}deg`,
              ['--amp']: `${floatCfg[i]?.amp ?? '12'}px`,
            }}
          >
            <div className="t">HINT {i + 1}</div>
            <div className="b">{h}</div>
          </div>
        </div>
      );
    })}
</div>


                    {phase === 'idle' ? (
                      <div className="whoisOverlay">
                        <div className="whoisStartCard">
                          <h2>START</h2>
                          <p>
                            開始を押すと扉が開いて、人物シルエットとヒントが出現します。
                            <br />
                            正解で自動的に次の扉へ。
                          </p>
                          <button className="whoisStartBtn" onClick={start}>
                            ▶ 開始
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>

                {session?.mode === 'timed' ? (
                  <div className="absolute left-0 right-0 bottom-0 px-3 pb-3 sm:hidden">
                    <div className="w-full h-2 rounded-full bg-white/70 overflow-hidden border border-sky-300 shadow-inner">
                      <div className="h-full bg-sky-500 transition-[width] duration-200" style={{ width: `${timeRatio * 100}%` }} />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-3">
                <label className="block text-[11px] sm:text-xs text-slate-900 font-bold mb-1 text-center">
                  回答欄（Enterで確定）
                </label>
                <div className="flex flex-wrap gap-2">
                  <input
                    ref={inputRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submit(false);
                      }
                    }}
                    className="flex-1 min-w-[180px] rounded-full border border-sky-300 bg-white/90 px-3 py-2 text-[12px] sm:text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                    placeholder="答えを入力"
                    disabled={phase === 'idle' || phase === 'show-answer'}
                  />

                  <button
                    type="button"
                    onClick={() => submit(false)}
                    className="px-4 py-2 rounded-full bg-sky-500 text-white text-[12px] sm:text-sm font-extrabold hover:bg-sky-400 whitespace-nowrap disabled:opacity-60"
                    disabled={phase === 'idle' || phase === 'show-answer'}
                  >
                    回答
                  </button>

                  <button
                    type="button"
                    onClick={() => submit(true)}
                    className="px-4 py-2 rounded-full border border-slate-300 bg-white text-[12px] sm:text-sm font-extrabold text-slate-900 hover:bg-slate-50 whitespace-nowrap disabled:opacity-60"
                    disabled={phase === 'idle' || phase === 'show-answer'}
                  >
                    ギブ
                  </button>
                </div>

                {message ? (
                  <div
                    className={
                      'mt-2 text-[12px] font-bold ' +
                      (lastCorrect === true ? 'text-emerald-700' : lastCorrect === false ? 'text-rose-700' : 'text-slate-700')
                    }
                  >
                    {message}
                  </div>
                ) : null}
              </div>

              <div className="mt-4 flex items-center justify-between">
                <button type="button" onClick={backToTop} className="text-[12px] font-extrabold underline text-slate-900">
                  トップに戻る
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
