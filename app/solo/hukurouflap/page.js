// file: app/solo/hukurouflap/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

/**
 * フラッピーバード風（フクロウ）
 * - 1回プレイするには「クイズ1問正解」が必要
 * - クイズは /api/solo/questions?mode=boss を参照（ボスバトル方式）
 * - 正誤に関わらず答え表示 → 正解ならゲーム開始、不正解なら再挑戦
 * - 障害物を1個くぐるとスコア+1
 * - ジャンプ時に波紋（リップル）
 */

const PLAYER_IMG_SRC = '/hukurou/player.png';

// localStorage key
const BEST_KEY = 'hukurouflap_best_score';

// Canvas size (スマホ想定)
const W = 360;
const H = 520;

// Game params
const GRAVITY = 0.42;
const FLAP_VY = -7.6;
const SCROLL_SPEED = 2.4;

const PIPE_W = 56;
const PIPE_GAP = 150;
const PIPE_SPACING = 220;

const REVEAL_MS = 2500;

// ====== ボスバトル参照の柔軟取得 ======
function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

function shuffleArray(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getAltAnswersArray(q) {
  if (!q) return [];
  if (Array.isArray(q.altAnswers)) return q.altAnswers;
  if (Array.isArray(q.alt_answers)) return q.alt_answers;

  if (typeof q.alt_answers_json === 'string') {
    try {
      const parsed = JSON.parse(q.alt_answers_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function getBaseOptions(q) {
  if (!q) return [];
  if (Array.isArray(q.options)) return [...q.options];
  if (Array.isArray(q.choices)) return [...q.choices];

  if (typeof q.options_json === 'string') {
    try {
      const parsed = JSON.parse(q.options_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

function getTextCorrectBase(q) {
  if (!q) return '';
  if (typeof q.correct === 'string' && q.correct.trim() !== '') return q.correct;
  if (typeof q.answerText === 'string' && q.answerText.trim() !== '') return q.answerText;
  if (typeof q.answer_text === 'string' && q.answer_text.trim() !== '') return q.answer_text;
  if (typeof q.correct_answer === 'string') return q.correct_answer;
  if (typeof q.answer === 'string') return q.answer;
  return '';
}

function getSingleCorrectAnswer(q) {
  if (!q) return '';
  const opts = getBaseOptions(q);

  if (typeof q.correctIndex === 'number') return opts[q.correctIndex] ?? '';
  if (typeof q.correct_index === 'number') return opts[q.correct_index] ?? '';

  if (typeof q.correct === 'string') {
    if (opts.some((o) => o === q.correct)) return q.correct;
  }
  return getTextCorrectBase(q);
}

// ===== multi / order 対応 =====
function getMultiCorrectList(q) {
  if (!q) return [];
  const opts = getBaseOptions(q);

  const idxs =
    (Array.isArray(q.correctIndices) && q.correctIndices) ||
    (Array.isArray(q.correct_indices) && q.correct_indices) ||
    (Array.isArray(q.correct_indexes) && q.correct_indexes) ||
    null;

  if (idxs) {
    return idxs.map((i) => opts[i]).filter((v) => v != null);
  }

  const arr =
    (Array.isArray(q.correct) && q.correct) ||
    (Array.isArray(q.corrects) && q.corrects) ||
    (Array.isArray(q.answers) && q.answers) ||
    null;

  if (arr) return arr.map((v) => String(v));
  return [];
}

function sameSet(a, b) {
  const A = new Set((a || []).map((x) => String(x)));
  const B = new Set((b || []).map((x) => String(x)));
  if (A.size !== B.size) return false;
  for (const x of A) if (!B.has(x)) return false;
  return true;
}

function getOrderCorrectList(q) {
  if (!q) return [];
  const opts = getBaseOptions(q);

  const idxs =
    (Array.isArray(q.correctOrder) && q.correctOrder) ||
    (Array.isArray(q.correct_order) && q.correct_order) ||
    (Array.isArray(q.order) && q.order) ||
    null;

  if (idxs && idxs.length && typeof idxs[0] === 'number') {
    return idxs.map((i) => opts[i]).filter((v) => v != null);
  }

  const arr =
    (Array.isArray(q.correct) && q.correct) ||
    (Array.isArray(q.corrects) && q.corrects) ||
    (Array.isArray(q.answers) && q.answers) ||
    null;

  if (arr) return arr.map((v) => String(v));
  return [];
}

function judgeAnswer(q, userAnswer) {
  if (!q) return false;
  const type = q.type;

  if (type === 'single') {
    if (!userAnswer) return false;
    const ua = String(userAnswer);
    const correct = String(getSingleCorrectAnswer(q));
    const alts = getAltAnswersArray(q).map((a) => String(a));
    return ua === correct || alts.includes(ua);
  }

  if (type === 'text') {
    if (!userAnswer) return false;
    const ua = normalizeText(userAnswer);
    const correct = normalizeText(getTextCorrectBase(q));
    if (ua === correct) return true;
    const alts = getAltAnswersArray(q);
    return alts.some((a) => ua === normalizeText(a));
  }

  if (type === 'multi') {
    const picked = Array.isArray(userAnswer) ? userAnswer : [];
    if (!picked.length) return false;
    const correctList = getMultiCorrectList(q);
    return sameSet(picked, correctList);
  }

  if (type === 'order') {
    const picked = Array.isArray(userAnswer) ? userAnswer : [];
    if (!picked.length) return false;
    const correctList = getOrderCorrectList(q);
    if (picked.length !== correctList.length) return false;
    for (let i = 0; i < picked.length; i++) {
      if (String(picked[i]) !== String(correctList[i])) return false;
    }
    return true;
  }

  return false;
}

// 答え表示の行を作る
function buildRevealLines(q) {
  if (!q) return [];

  if (q.type === 'single') {
    const main = String(getSingleCorrectAnswer(q));
    const alts = getAltAnswersArray(q).map((a) => String(a)).filter(Boolean);
    return Array.from(new Set([main, ...alts].filter(Boolean)));
  }

  if (q.type === 'text') {
    const main = String(getTextCorrectBase(q));
    const alts = getAltAnswersArray(q).map((a) => String(a)).filter(Boolean);
    return Array.from(new Set([main, ...alts].filter(Boolean)));
  }

  if (q.type === 'multi') {
    const correctList = getMultiCorrectList(q).map((v) => String(v)).filter(Boolean);
    return Array.from(new Set(correctList));
  }

  if (q.type === 'order') {
    const correctList = getOrderCorrectList(q).map((v) => String(v)).filter(Boolean);
    // orderは順番が大事なので Set にしない
    return correctList;
  }

  return [];
}

function loadBest() {
  if (typeof window === 'undefined') return 0;
  const n = Number(window.localStorage.getItem(BEST_KEY));
  return Number.isFinite(n) ? n : 0;
}
function saveBest(score) {
  if (typeof window === 'undefined') return false;
  const cur = loadBest();
  if (score > cur) {
    window.localStorage.setItem(BEST_KEY, String(score));
    return true;
  }
  return false;
}

export default function HukurouFlapPage() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  const [phase, setPhase] = useState('gate'); // gate | playing | over
  const [best, setBest] = useState(0);

  // ===== ゲート（クイズ） =====
  const [gateLoading, setGateLoading] = useState(true);
  const [gateErr, setGateErr] = useState('');
  const [gateQuestion, setGateQuestion] = useState(null);

  const [gatePick, setGatePick] = useState(null); // single
  const [gateText, setGateText] = useState(''); // text
  const [gateMulti, setGateMulti] = useState([]); // multi: string[]
  const [gateOrder, setGateOrder] = useState([]); // order: string[]

  const [reveal, setReveal] = useState(null);
  // { ok:boolean, userAnswerText:string, lines:string[] }

  const revealTimerRef = useRef(null);

  // ===== order 用の「次に選べる候補」 =====
  const orderOptions = useMemo(() => {
    if (!gateQuestion || gateQuestion.type !== 'order') return [];
    return gateQuestion.options || getBaseOptions(gateQuestion);
  }, [gateQuestion]);

  const remainingOrderOptions = useMemo(() => {
    if (!gateQuestion || gateQuestion.type !== 'order') return [];
    return orderOptions.filter((o) => !gateOrder.includes(o));
  }, [gateQuestion, orderOptions, gateOrder]);

  // ===== ゲーム state（ref中心）=====
  const imgRef = useRef(null);
  const dprRef = useRef(1);

  const stateRef = useRef({
    tPrev: 0,
    started: false,
    score: 0,
    passed: 0,
    alive: true,
    // player
    x: 96,
    y: H * 0.45,
    vy: 0,
    // pipes
    pipes: [],
    // ripple
    ripples: [], // {x,y,r,a}
  });

  const scoreRef = useRef(0);
  const [scoreUI, setScoreUI] = useState(0);

  useEffect(() => {
    setBest(loadBest());
  }, []);

  // 画像ロード
  useEffect(() => {
    const img = new Image();
    img.src = PLAYER_IMG_SRC;
    img.onload = () => {
      imgRef.current = img;
    };
  }, []);

  // クイズ取得（ボスと同様のAPI）
  async function fetchGateQuestion() {
    setGateLoading(true);
    setGateErr('');
    setGateQuestion(null);
    setGatePick(null);
    setGateText('');
    setGateMulti([]);
    setGateOrder([]);
    setReveal(null);

    try {
      const res = await fetch('/api/solo/questions?mode=boss', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok || !Array.isArray(data.questions)) {
        throw new Error(data.error || '問題の取得に失敗しました');
      }

      const raw = data.questions || [];

      // single/text/multi/order を優先して抽出
      const candidates = raw.filter(
        (q) => q && (q.type === 'single' || q.type === 'text' || q.type === 'multi' || q.type === 'order')
      );

      const pool = candidates.length ? candidates : raw;
      if (!pool.length) throw new Error('使用できる問題がありません');

      const picked = pool[Math.floor(Math.random() * pool.length)];

      // single/multi/order の時は選択肢シャッフル（ただし正解index系は壊れるのでシャッフルしない）
      // ここでは「choicesをそのまま表示」優先。singleだけは以前の仕様を維持（文字正解ならOKなので安全）。
      const q = { ...picked };
      if (q.type === 'single') {
        const opts = getBaseOptions(q);
        q.options = shuffleArray(opts);
      } else if (q.type === 'multi' || q.type === 'order') {
        // idx 正解の可能性があるので、基本は並びを変えない（壊れる）
        const opts = getBaseOptions(q);
        q.options = opts;
      }

      setGateQuestion(q);
    } catch (e) {
      setGateErr(e?.message || '読み込みに失敗しました');
    } finally {
      setGateLoading(false);
    }
  }

  useEffect(() => {
    fetchGateQuestion();
    return () => {
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopRaf() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }

  function resetGame() {
    const s = stateRef.current;
    s.tPrev = 0;
    s.started = true;
    s.score = 0;
    s.passed = 0;
    s.alive = true;

    s.x = 96;
    s.y = H * 0.45;
    s.vy = 0;

    s.pipes = [];
    s.ripples = [];
    scoreRef.current = 0;
    setScoreUI(0);

    // 初期パイプ生成
    const firstX = W + 120;
    for (let i = 0; i < 4; i++) {
      s.pipes.push(makePipe(firstX + i * PIPE_SPACING));
    }
  }

  // gapTop がマイナスにならないよう center を制限
  function makePipe(x) {
    const margin = 60;
    const minCenter = margin + PIPE_GAP / 2;
    const maxCenter = H - margin - PIPE_GAP / 2;

    const center = minCenter + Math.random() * Math.max(1, maxCenter - minCenter);
    const gapTop = center - PIPE_GAP / 2;
    const gapBottom = center + PIPE_GAP / 2;

    return {
      x,
      gapTop,
      gapBottom,
      passed: false,
    };
  }

  function spawnRipple() {
    const s = stateRef.current;
    s.ripples.push({ x: s.x, y: s.y + 24, r: 4, a: 0.9 });
  }

  function flap() {
    if (phase !== 'playing') return;
    const s = stateRef.current;
    if (!s.alive) return;
    s.vy = FLAP_VY;
    spawnRipple();
  }

  // input: tap/click/space
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        flap();
      }
    }
    function onTouch() {
      flap();
    }
    window.addEventListener('keydown', onKey, { passive: false });
    window.addEventListener('pointerdown', onTouch, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onTouch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function setupCanvas() {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    dprRef.current = dpr;
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function updateAndDraw(ts) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;

  useEffect(() => {
    if (phase !== 'playing') return;

    // playing に入った後（canvasがDOMに乗った後）に確実にセットアップして開始
    setupCanvas();
    stopRaf();

    // 1フレーム遅らせて ref を確実に掴む
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(updateAndDraw);
    });

    return () => {
      stopRaf();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

    // roundRect 互換（Safari等で ctx.roundRect が無いケース対策）
    function drawRoundRect(_ctx, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      _ctx.beginPath();
      _ctx.moveTo(x + rr, y);
      _ctx.arcTo(x + w, y, x + w, y + h, rr);
      _ctx.arcTo(x + w, y + h, x, y + h, rr);
      _ctx.arcTo(x, y + h, x, y, rr);
      _ctx.arcTo(x, y, x + w, y, rr);
      _ctx.closePath();
    }

    const s = stateRef.current;
    const t = ts || performance.now();

    const dt = s.tPrev ? Math.min(33, t - s.tPrev) : 16;
    s.tPrev = t;

    // ===== update =====
    if (s.alive) {
      // physics
      s.vy += GRAVITY;
      s.y += s.vy;

      // pipes move
      for (const p of s.pipes) p.x -= SCROLL_SPEED;

      // recycle pipes
      const first = s.pipes[0];
      if (first && first.x < -PIPE_W - 10) {
        s.pipes.shift();
        const lastX = s.pipes.length ? s.pipes[s.pipes.length - 1].x : W;
        s.pipes.push(makePipe(lastX + PIPE_SPACING));
      }

      // score: pass pipe
      for (const p of s.pipes) {
        if (!p.passed && p.x + PIPE_W < s.x - 6) {
          p.passed = true;
          s.score += 1;
          scoreRef.current = s.score;
          setScoreUI(s.score);
        }
      }

      // ripple update
      s.ripples = s.ripples
        .map((r) => ({ ...r, r: r.r + 0.9, a: r.a - 0.015 }))
        .filter((r) => r.a > 0);

      // collisions
      const birdR = 14;
      // ground/ceiling
      if (s.y < birdR || s.y > H - birdR - 10) {
        s.alive = false;
      } else {
        for (const p of s.pipes) {
          // pipe rects: top (0..gapTop), bottom (gapBottom..H)
          const bx = s.x;
          const by = s.y;

          const inX = bx + birdR > p.x && bx - birdR < p.x + PIPE_W;
          if (!inX) continue;

          const hitTop = by - birdR < p.gapTop;
          const hitBottom = by + birdR > p.gapBottom;
          if (hitTop || hitBottom) {
            s.alive = false;
            break;
          }
        }
      }

      if (!s.alive) {
        // game over
        stopRaf();
        setPhase('over');

        saveBest(s.score);
        const nb = loadBest();
        setBest(nb);

        // もう一度は「再度クイズ正解が必要」なので、ここでは止めるだけ
        return;
      }
    }

    // ===== draw =====
    // bg
    ctx.clearRect(0, 0, W, H);
    // sky
    {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#bfe7ff');
      g.addColorStop(1, '#eaf8ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // subtle clouds
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 9; i++) {
      const cx = ((t * 0.02 + i * 70) % (W + 140)) - 70;
      const cy = 40 + (i % 3) * 34;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 28, 14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // pipes
    for (const p of s.pipes) {
      // pipe color
      ctx.fillStyle = 'rgba(16, 185, 129, 0.90)'; // emerald
      ctx.strokeStyle = 'rgba(5, 150, 105, 0.95)';
      ctx.lineWidth = 2;

      // top
      ctx.fillRect(p.x, 0, PIPE_W, p.gapTop);
      ctx.strokeRect(p.x, 0, PIPE_W, p.gapTop);

      // bottom
      const bh = H - p.gapBottom;
      ctx.fillRect(p.x, p.gapBottom, PIPE_W, bh);
      ctx.strokeRect(p.x, p.gapBottom, PIPE_W, bh);

      // caps
      ctx.fillStyle = 'rgba(52, 211, 153, 0.95)';
      ctx.fillRect(p.x - 4, p.gapTop - 12, PIPE_W + 8, 12);
      ctx.fillRect(p.x - 4, p.gapBottom, PIPE_W + 8, 12);
    }

    // ground
    ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
    ctx.fillRect(0, H - 22, W, 22);

    // ripples
    for (const r of s.ripples) {
      ctx.globalAlpha = Math.max(0, r.a);
      ctx.strokeStyle = 'rgba(56, 189, 248, 1)'; // sky-400
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, r.r * 1.8, r.r, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // player
    const img = imgRef.current;
    const bw = 48;
    const bh = 48;
    const tilt = Math.max(-0.5, Math.min(0.6, s.vy / 10));
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(tilt);
    if (img) {
      ctx.imageSmoothingEnabled = false; // ドット絵感
      ctx.drawImage(img, -bw / 2, -bh / 2, bw, bh);
    } else {
      // fallback circle
      ctx.fillStyle = '#111827';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // HUD score
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 2;
    drawRoundRect(ctx, 10, 10, 92, 34, 14);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0b1b2a';
    ctx.font = '900 16px system-ui, -apple-system, Segoe UI, Roboto';
    ctx.fillText(`SCORE ${s.score}`, 18, 32);

    // loop
    rafRef.current = requestAnimationFrame(updateAndDraw);
  }

    function startGame() {
    // ここではRAFを回さない（canvasがまだ無い瞬間がある）
    setPhase('playing');
    resetGame();
  }

  // ====== gate submit ======
  function gateSubmit() {
    if (!gateQuestion || gateLoading) return;

    const q = gateQuestion;

    let userAnswer = null;
    let userAnswerText = '';

    if (q.type === 'single') {
      userAnswer = gatePick;
      userAnswerText = gatePick || '';
    } else if (q.type === 'text') {
      userAnswer = gateText;
      userAnswerText = gateText || '';
    } else if (q.type === 'multi') {
      userAnswer = gateMulti;
      userAnswerText = gateMulti.join(' / ');
    } else if (q.type === 'order') {
      userAnswer = gateOrder;
      userAnswerText = gateOrder.join(' → ');
    } else {
      userAnswer = null;
      userAnswerText = '';
    }

    const ok = judgeAnswer(q, userAnswer);
    const lines = buildRevealLines(q);

    setReveal({
      ok,
      userAnswerText: userAnswerText || '（未回答）',
      lines,
    });

    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    revealTimerRef.current = setTimeout(() => {
      if (ok) {
        // 正解 → ゲーム開始
        setReveal(null);
        startGame();
      } else {
        // 不正解 → 次のゲート問題に（再抽選）
        setReveal(null);
        fetchGateQuestion();
      }
    }, REVEAL_MS);
  }

  const canGateSubmit = useMemo(() => {
    if (!gateQuestion) return false;
    if (gateQuestion.type === 'single') return !!gatePick;
    if (gateQuestion.type === 'text') return normalizeText(gateText).length > 0;
    if (gateQuestion.type === 'multi') return gateMulti.length > 0;
    if (gateQuestion.type === 'order') return gateOrder.length > 0;
    return false;
  }, [gateQuestion, gatePick, gateText, gateMulti, gateOrder]);

  // Over → もう一度（クイズへ戻る）
  function backToGate() {
    stopRaf();
    setPhase('gate');
    fetchGateQuestion();
  }

  return (
    <main className="min-h-screen bg-sky-50 text-slate-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold">🦉 フクロウフラップ</h1>
            <p className="text-[12px] text-slate-700 mt-1">
              タップ/クリック/Spaceで上昇。障害物をくぐると +1。
            </p>
          </div>
          <Link href="/solo" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
            ソロへ戻る
          </Link>
        </header>

        {/* BEST */}
        <div className="rounded-2xl border border-violet-300 bg-violet-50 px-3 py-3 shadow-sm mb-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-violet-900">自己ベスト</p>
            <p className="text-sm font-extrabold text-violet-900">{best}</p>
          </div>
          <p className="text-[11px] text-violet-950 mt-1">※ ブラウザ保存（localStorage）</p>
        </div>

        {/* ===== GATE ===== */}
        {phase === 'gate' && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-extrabold text-slate-900">プレイするにはクイズ1問正解！</p>
              <button
                type="button"
                onClick={() => fetchGateQuestion()}
                className="text-[11px] font-bold text-sky-700 underline hover:text-sky-500"
              >
                問題を引き直す
              </button>
            </div>

            {gateLoading ? (
              <p className="text-sm text-slate-700 mt-3">問題を読み込み中...</p>
            ) : gateErr ? (
              <div className="mt-3">
                <p className="text-sm text-rose-700 font-bold">読み込み失敗</p>
                <p className="text-[12px] text-slate-700 mt-1 whitespace-pre-wrap">{gateErr}</p>
              </div>
            ) : !gateQuestion ? (
              <p className="text-sm text-slate-700 mt-3">問題がありません。</p>
            ) : (
              <>
                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-bold text-slate-700">
                    ゲート問題（
                    {gateQuestion.type === 'single'
                      ? '単一選択'
                      : gateQuestion.type === 'text'
                        ? '記述'
                        : gateQuestion.type === 'multi'
                          ? '複数選択'
                          : '順番'}
                    ）
                  </p>
                  <p className="text-sm text-slate-900 mt-1 whitespace-pre-wrap">
                    {gateQuestion.question || gateQuestion.text || ''}
                  </p>
                </div>

                {/* answer ui */}
                <div className="mt-3 space-y-2">
                  {gateQuestion.type === 'single' && (
                    <div className="space-y-2">
                      {(gateQuestion.options || getBaseOptions(gateQuestion)).map((opt, idx) => {
                        const active = gatePick === opt;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setGatePick(opt)}
                            className={
                              'w-full text-left text-[12px] px-3 py-2 rounded-2xl border flex items-center justify-between ' +
                              (active
                                ? 'border-violet-400 bg-violet-100 text-slate-900'
                                : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50')
                            }
                          >
                            <span>{opt}</span>
                            {active && <span className="text-[11px] font-extrabold text-violet-700">選択中</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {gateQuestion.type === 'text' && (
                    <textarea
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
                      rows={3}
                      placeholder="答えを入力"
                      value={gateText}
                      onChange={(e) => setGateText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (canGateSubmit && !reveal) gateSubmit();
                        }
                      }}
                    />
                  )}

                  {gateQuestion.type === 'multi' && (
                    <div className="space-y-2">
                      {(gateQuestion.options || getBaseOptions(gateQuestion)).map((opt, idx) => {
                        const active = gateMulti.includes(opt);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              setGateMulti((cur) => {
                                const has = cur.includes(opt);
                                return has ? cur.filter((x) => x !== opt) : [...cur, opt];
                              });
                            }}
                            className={
                              'w-full text-left text-[12px] px-3 py-2 rounded-2xl border flex items-center justify-between ' +
                              (active
                                ? 'border-violet-400 bg-violet-100 text-slate-900'
                                : 'border-slate-200 bg-white text-slate-900 hover:bg-slate-50')
                            }
                          >
                            <span>{opt}</span>
                            {active && <span className="text-[11px] font-extrabold text-violet-700">選択中</span>}
                          </button>
                        );
                      })}
                      <div className="text-[11px] text-slate-600">
                        選択中: {gateMulti.length ? gateMulti.join(' / ') : '（なし）'}
                      </div>
                    </div>
                  )}

                  {gateQuestion.type === 'order' && (
                    <div className="space-y-2">
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                        <p className="text-[11px] font-bold text-slate-700">選んだ順</p>
                        <p className="text-[12px] text-slate-900 mt-1 whitespace-pre-wrap">
                          {gateOrder.length ? gateOrder.join(' → ') : '（まだ選んでない）'}
                        </p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => setGateOrder((cur) => cur.slice(0, -1))}
                            disabled={gateOrder.length === 0}
                            className="px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-800 disabled:opacity-40"
                          >
                            1つ戻す
                          </button>
                          <button
                            type="button"
                            onClick={() => setGateOrder([])}
                            disabled={gateOrder.length === 0}
                            className="px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-800 disabled:opacity-40"
                          >
                            リセット
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {remainingOrderOptions.map((opt, idx) => (
                          <button
                            key={`${idx}_${opt}`}
                            type="button"
                            onClick={() => setGateOrder((cur) => [...cur, opt])}
                            className="w-full text-left text-[12px] px-3 py-2 rounded-2xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={gateSubmit}
                    disabled={!canGateSubmit || !!reveal}
                    className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-extrabold hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    判定！
                  </button>

                  {/* reveal */}
                  {reveal && (
                    <div
                      className={
                        'mt-2 rounded-2xl border p-3 ' +
                        (reveal.ok ? 'border-emerald-300 bg-emerald-50' : 'border-rose-300 bg-rose-50')
                      }
                    >
                      <p className={'text-sm font-extrabold ' + (reveal.ok ? 'text-emerald-800' : 'text-rose-800')}>
                        {reveal.ok ? '✅ 正解！ゲーム開始！' : '❌ 不正解…もう一度！'}
                      </p>

                      <div className="mt-2 text-[12px] text-slate-800">
                        <p className="font-bold">あなたの回答</p>
                        <p className="mt-0.5 whitespace-pre-wrap">{reveal.userAnswerText}</p>
                      </div>

                      <div className="mt-2">
                        <p className="text-[12px] font-bold text-slate-800">正解になり得る答え</p>
                        <div className="mt-1 max-h-40 overflow-auto space-y-1">
                          {(reveal.lines || []).map((t, idx) => (
                            <div
                              key={`${idx}_${t}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-slate-900"
                            >
                              {t}
                            </div>
                          ))}
                          {(!reveal.lines || reveal.lines.length === 0) && (
                            <p className="text-[12px] text-slate-700">（答え情報がありません）</p>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-2">{REVEAL_MS / 1000}秒後に自動で進みます</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {/* ===== PLAYING / OVER ===== */}
        {(phase === 'playing' || phase === 'over') && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-extrabold text-slate-900">SCORE: {scoreUI}</div>
              <div className="text-[11px] text-slate-600">Tap / Click / Space</div>
            </div>

            <div className="flex justify-center">
              <canvas ref={canvasRef} className="rounded-2xl border border-slate-200 bg-white" />
            </div>

            {phase === 'over' && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-extrabold text-slate-900">ゲームオーバー</p>
                <p className="text-[12px] text-slate-700 mt-1">
                  今回: <span className="font-extrabold">{scoreRef.current}</span> ／ ベスト:{' '}
                  <span className="font-extrabold">{best}</span>
                </p>

                <div className="mt-3 grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={backToGate}
                    className="w-full py-2 rounded-full bg-violet-600 text-white text-sm font-extrabold hover:bg-violet-700"
                  >
                    もう一度（クイズから）
                  </button>
                  <Link
                    href="/solo"
                    className="w-full text-center py-2 rounded-full border border-sky-500 bg-white text-sm font-extrabold text-sky-700 hover:bg-sky-50"
                  >
                    ソロメニューへ
                  </Link>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}