// file: app/solo/wallkick/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

// ====== クイズ（ボスと同様の方式：必要部分だけ同梱）======
const TIME_SINGLE = 30000;
const TIME_MULTI_ORDER = 40000;
const TIME_TEXT_SHORT = 60000;
const TIME_TEXT_LONG = 80000;

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
  if (typeof q.answerText === 'string' && q.answerText.trim() !== '')
    return q.answerText;
  if (typeof q.answer_text === 'string' && q.answer_text.trim() !== '')
    return q.answer_text;
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

function getCorrectArrayFlexible(q) {
  if (!q) return [];
  const opts = getBaseOptions(q);

  let arr = [];

  if (Array.isArray(q.correct)) {
    arr = q.correct;
  } else if (typeof q.correct === 'string') {
    const t = q.correct.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) arr = parsed;
      } catch {}
    } else if (opts.length && opts.some((o) => o === q.correct)) {
      arr = [q.correct];
    }
  } else if (Array.isArray(q.correctIndexes)) {
    arr = q.correctIndexes;
  } else if (Array.isArray(q.correct_indexes)) {
    arr = q.correct_indexes;
  } else if (typeof q.correct_indexes_json === 'string') {
    try {
      const parsed = JSON.parse(q.correct_indexes_json);
      if (Array.isArray(parsed)) arr = parsed;
    } catch {}
  }

  if (!Array.isArray(arr)) arr = [];

  if (opts.length && arr.length && typeof arr[0] === 'number') {
    return arr.map((idx) => opts[idx]).filter((v) => v != null);
  }
  return arr.map((v) => String(v));
}

function getTimeLimitMs(question) {
  if (!question) return TIME_SINGLE;
  const type = question.type;
  if (type === 'single') return TIME_SINGLE;
  if (type === 'multi' || type === 'order') return TIME_MULTI_ORDER;
  if (type === 'text') {
    const base = String(getTextCorrectBase(question));
    const len = base.length;
    return len > 15 ? TIME_TEXT_LONG : TIME_TEXT_SHORT;
  }
  return TIME_SINGLE;
}

function normalizeQuestionForBossLike(raw, index) {
  const baseOpts = getBaseOptions(raw);
  const type = raw.type;

  const q = {
    ...raw,
    _gateId: `${raw.id ?? raw.question_id ?? 'q'}_${index}`,
  };

  if (type === 'single') {
    const correctText = getSingleCorrectAnswer(raw);
    const shuffled = shuffleArray(baseOpts);
    q.options = shuffled;
    q.correct = correctText;
    return q;
  }

  if (type === 'multi' || type === 'order') {
    const correctTexts = getCorrectArrayFlexible(raw);
    const shuffled = shuffleArray(baseOpts);
    q.options = shuffled;
    q.correct = correctTexts; // テキストで判定
    return q;
  }

  return q; // textなど
}

function judgeAnswerBossLike(q, userAnswer) {
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
    const uaArr = Array.isArray(userAnswer) ? userAnswer : [];
    if (uaArr.length === 0) return false;
    const correctArr = getCorrectArrayFlexible(q);
    if (correctArr.length === 0) return false;

    const normSort = (arr) =>
      Array.from(new Set(arr.map((v) => String(v)))).sort();

    const uaNorm = normSort(uaArr);
    const cNorm = normSort(correctArr);

    if (uaNorm.length !== cNorm.length) return false;
    for (let i = 0; i < uaNorm.length; i++) {
      if (uaNorm[i] !== cNorm[i]) return false;
    }
    return true;
  }

  if (type === 'order') {
    const uaArr = Array.isArray(userAnswer) ? userAnswer : [];
    const correctArr = getCorrectArrayFlexible(q);
    if (uaArr.length !== correctArr.length || uaArr.length === 0) return false;

    for (let i = 0; i < correctArr.length; i++) {
      if (String(uaArr[i]) !== String(correctArr[i])) return false;
    }
    return true;
  }

  return false;
}

function getCorrectAnswerText(q) {
  if (!q) return '';

  if (q.type === 'multi') {
    const arr = getCorrectArrayFlexible(q);
    return arr.join(' / ');
  }
  if (q.type === 'order') {
    const arr = getCorrectArrayFlexible(q);
    return arr.join(' → ');
  }
  if (q.type === 'single') {
    return String(getSingleCorrectAnswer(q));
  }
  if (q.type === 'text') {
    return String(getTextCorrectBase(q));
  }
  return String(getTextCorrectBase(q));
}

// ====== ゲーム設定 ======
const W = 360;
const H = 560;

const WALL_PAD = 26; // 壁の内側位置
const PLAYER_R = 10;

const KICK_VY = -360; // キック上昇
const CROSS_VX = 520; // 壁から壁へ横移動速度

const GRAVITY = 980; // 空中重力
const STICK_SLIDE = 120; // 張り付き中の「じわ下がり」(px/s)

const OB_BASE_SPEED = 240; // 障害物落下速度
const OB_SPAWN_BASE = 760; // 生成間隔(ms) (徐々に短く)
const OB_W_MIN = 60;
const OB_W_MAX = 140;
const OB_H = 18;

// 衝突：円 vs 矩形
function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function WallKickPage() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  // phases: gate_quiz -> playing -> gameover
  const [phase, setPhase] = useState('gate_quiz');

  // best score
  const [best, setBest] = useState(0);

  // score
  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);

  // ===== gate quiz state =====
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState('');
  const [q, setQ] = useState(null);

  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const timerRef = useRef(null);

  const [selectedOption, setSelectedOption] = useState(null); // single
  const [textAnswer, setTextAnswer] = useState('');
  const [multiSelected, setMultiSelected] = useState([]);
  const [orderSelected, setOrderSelected] = useState([]);

  const [gateMsg, setGateMsg] = useState('');

const [gateShowAnswer, setGateShowAnswer] = useState(false);
const [gateJudge, setGateJudge] = useState(null); // true/false
const [gateUserAnswerText, setGateUserAnswerText] = useState('');
const [gateCorrectAnswerText, setGateCorrectAnswerText] = useState('');
const gateRevealTimeoutRef = useRef(null);

  // ===== game state refs =====
  const stateRef = useRef(null);

  // best load
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem('wallkick_best_score');
      const n = raw ? Number(raw) : 0;
      setBest(Number.isFinite(n) ? n : 0);
    } catch {}
  }, []);

  // gate quiz: load 1 question
  const loadGateQuiz = async () => {
    setGateLoading(true);
    setGateError('');
    setGateMsg('');
    setQ(null);

    setSelectedOption(null);
    setTextAnswer('');
    setMultiSelected([]);
    setOrderSelected([]);

    try {
      const res = await fetch('/api/solo/questions?mode=boss', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !Array.isArray(data.questions)) {
        setGateError('クイズの取得に失敗しました。');
        return;
      }
      const rawQs = data.questions;
      if (!rawQs.length) {
        setGateError('使用できる問題がありません。');
        return;
      }

      const pick = rawQs[Math.floor(Math.random() * rawQs.length)];
      const nq = normalizeQuestionForBossLike(pick, 0);
      setQ(nq);

      const limit = getTimeLimitMs(nq);
      setTimeLeftMs(limit);
    } catch (e) {
      console.error(e);
      setGateError('クイズの取得に失敗しました。');
    } finally {
      setGateLoading(false);
    }
  };

  // 初回ロード
  useEffect(() => {
    loadGateQuiz();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // quiz timer
  useEffect(() => {
    if (phase !== 'gate_quiz') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }
    if (!q) return;

    const limit = getTimeLimitMs(q);
    setTimeLeftMs(limit);

    const start = Date.now();
    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const rest = limit - elapsed;
if (rest <= 0) {
  clearInterval(timerRef.current);
  timerRef.current = null;
  setTimeLeftMs(0);

  // ★ 時間切れでも答え表示（2秒）
  const correctText = getCorrectAnswerText(q);
  revealGateResult(false, '（時間切れ）', correctText);
} else {
  setTimeLeftMs(rest);
}
    }, 200);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q && (q.id ?? q.question_id ?? q._gateId), phase]);

  const timeSeconds = Math.max(0, Math.floor(timeLeftMs / 1000));

  const canSubmitQuiz = useMemo(() => {
    if (!q) return false;
    if (timeLeftMs <= 0) return false;

    if (q.type === 'single') return !!selectedOption;
    if (q.type === 'text') return !!textAnswer;
    if (q.type === 'multi') return multiSelected.length > 0;
    if (q.type === 'order')
      return orderSelected.length === (q.options?.length || 0);
    return false;
  }, [q, timeLeftMs, selectedOption, textAnswer, multiSelected, orderSelected]);

  const toggleMulti = (opt) => {
    setMultiSelected((prev) => {
      if (prev.includes(opt)) return prev.filter((v) => v !== opt);
      return [...prev, opt];
    });
  };
  const toggleOrder = (opt) => {
    setOrderSelected((prev) => {
      if (prev.includes(opt)) return prev.filter((v) => v !== opt);
      return [...prev, opt];
    });
  };

const revealGateResult = (isCorrect, userAnswerText, correctAnswerText) => {
  // タイマー停止
  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }

  setGateShowAnswer(true);
  setGateJudge(isCorrect);
  setGateUserAnswerText(userAnswerText || '');
  setGateCorrectAnswerText(correctAnswerText || '');

  // 2秒固定
  if (gateRevealTimeoutRef.current) {
    clearTimeout(gateRevealTimeoutRef.current);
  }

  gateRevealTimeoutRef.current = setTimeout(() => {
    setGateShowAnswer(false);
    setGateJudge(null);
    setGateUserAnswerText('');
    setGateCorrectAnswerText('');

    if (isCorrect) {
      startGame(); // 正解ならゲーム開始
    } else {
      loadGateQuiz(); // 不正解なら次の問題へ
    }
  }, 2000);
};

  const submitGateQuiz = () => {
  if (!q || timeLeftMs <= 0) return;
  if (gateShowAnswer) return; // ★ 表示中は無効

  let userAnswer = null;
  let userAnswerText = '';

  if (q.type === 'single') {
    userAnswer = selectedOption;
    userAnswerText = selectedOption || '';
  }
  if (q.type === 'text') {
    userAnswer = textAnswer;
    userAnswerText = textAnswer || '';
  }
  if (q.type === 'multi') {
    userAnswer = multiSelected;
    userAnswerText = (multiSelected || []).join(' / ');
  }
  if (q.type === 'order') {
    userAnswer = orderSelected;
    userAnswerText = (orderSelected || []).join(' → ');
  }

  const ok = judgeAnswerBossLike(q, userAnswer);
  const correctText = getCorrectAnswerText(q);

  // ★ 正解でも不正解でも 2秒見せる
  revealGateResult(ok, userAnswerText, correctText);
};

    setGateMsg('正解！ゲーム開始！');
    // タイマー停止
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 少し間を置いて開始（演出）
    setTimeout(() => {
      startGame();
    }, 250);
  };

  // ===== game loop =====
  const resetGameState = () => {
    scoreRef.current = 0;
    setScore(0);

    // 初期位置：左壁に張り付き
    stateRef.current = {
      t0: performance.now(),
      last: performance.now(),
      alive: true,

      // player
      side: 'left', // left|right|air
      x: WALL_PAD + PLAYER_R,
      y: H - 120,
      vx: 0,
      vy: 0,

      // difficulty
      level: 0,

      // obstacles
      obstacles: [],

      // spawn
      nextSpawnAt: performance.now() + 400,
      spawnInterval: OB_SPAWN_BASE,
      obSpeed: OB_BASE_SPEED,
    };
  };

  const stopLoop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  };

  const endGame = () => {
    stopLoop();
    setPhase('gameover');

    const finalScore = Math.floor(scoreRef.current);
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('wallkick_best_score');
        const prev = raw ? Number(raw) : 0;
        const nextBest = Math.max(Number.isFinite(prev) ? prev : 0, finalScore);
        window.localStorage.setItem('wallkick_best_score', String(nextBest));
        setBest(nextBest);
      } catch {}
    }
  };

  const draw = (ctx, st) => {
    // background
    ctx.clearRect(0, 0, W, H);

    // 背景：読みやすい薄色
    ctx.fillStyle = '#f8fafc'; // slate-50
    ctx.fillRect(0, 0, W, H);

    // walls
    ctx.fillStyle = '#1e293b'; // slate-800
    ctx.fillRect(0, 0, WALL_PAD, H);
    ctx.fillRect(W - WALL_PAD, 0, WALL_PAD, H);

    // danger/top indicator
    ctx.fillStyle = '#0f172a'; // slate-900
    ctx.font = '12px sans-serif';
    ctx.fillText(`SCORE ${Math.floor(scoreRef.current)}`, 10, 18);

    // obstacles
    for (const ob of st.obstacles) {
      ctx.fillStyle = ob.kind === 'hard' ? '#111827' : '#0b1220';
      ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    }

    // player
    ctx.beginPath();
    ctx.fillStyle = '#ef4444'; // red-500
    ctx.arc(st.x, st.y, PLAYER_R, 0, Math.PI * 2);
    ctx.fill();

    // hint
    ctx.fillStyle = '#334155'; // slate-700
    ctx.font = '11px sans-serif';
    ctx.fillText('Tap: wall-kick', 10, H - 10);
  };

  const step = () => {
    const canvas = canvasRef.current;
    const st = stateRef.current;
    if (!canvas || !st || !st.alive) return;

    const ctx = canvas.getContext('2d');
    const now = performance.now();
    const dt = Math.min(0.033, (now - st.last) / 1000);
    st.last = now;

    // score（生存時間ベース）
    scoreRef.current += dt * 10; // 0.1秒=1点くらいの体感
    setScore(Math.floor(scoreRef.current));

    // 難易度：時間で増加
    st.level += dt;
    st.obSpeed = OB_BASE_SPEED + st.level * 18;
    st.spawnInterval = Math.max(320, OB_SPAWN_BASE - st.level * 30);

    // player physics
    if (st.side === 'air') {
      st.vy += GRAVITY * dt;
      st.x += st.vx * dt;
      st.y += st.vy * dt;

      // wall attach
      const leftX = WALL_PAD + PLAYER_R;
      const rightX = W - WALL_PAD - PLAYER_R;

      if (st.vx < 0 && st.x <= leftX) {
        st.x = leftX;
        st.side = 'left';
        st.vx = 0;
        st.vy = 0;
      } else if (st.vx > 0 && st.x >= rightX) {
        st.x = rightX;
        st.side = 'right';
        st.vx = 0;
        st.vy = 0;
      }
    } else {
      // 張り付き中：じわじわ落ちる
      st.y += STICK_SLIDE * dt;
      st.y = clamp(st.y, PLAYER_R + 2, H - PLAYER_R - 2);
    }

    // spawn obstacles (from top)
    if (now >= st.nextSpawnAt) {
      const w = Math.floor(
        OB_W_MIN + Math.random() * (OB_W_MAX - OB_W_MIN)
      );
      const xMin = WALL_PAD + 6;
      const xMax = W - WALL_PAD - 6 - w;
      const x = Math.floor(xMin + Math.random() * Math.max(1, xMax - xMin));
      st.obstacles.push({
        x,
        y: -OB_H - 10,
        w,
        h: OB_H,
        vy: st.obSpeed,
        kind: 'hard',
      });

      st.nextSpawnAt = now + st.spawnInterval;
    }

    // move obstacles & collision
    const nextObs = [];
    let hit = false;

    for (const ob of st.obstacles) {
      ob.y += ob.vy * dt;
      // 画面外
      if (ob.y > H + 40) continue;

      // collision
      if (circleRectHit(st.x, st.y, PLAYER_R, ob.x, ob.y, ob.w, ob.h)) {
        hit = true;
      } else {
        nextObs.push(ob);
      }
    }

    st.obstacles = nextObs;

    // out of bounds (下に落ちすぎ)
    if (st.y >= H - PLAYER_R - 1) hit = true;

    // draw
    draw(ctx, st);

    if (hit) {
      st.alive = false;
      endGame();
      return;
    }

    rafRef.current = requestAnimationFrame(step);
  };

  const startGame = () => {
    setPhase('playing');
    resetGameState();

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = W;
      canvas.height = H;
    }

    stopLoop();
    rafRef.current = requestAnimationFrame(step);
  };

  const kick = () => {
    if (phase !== 'playing') return;
    const st = stateRef.current;
    if (!st || !st.alive) return;

    const leftX = WALL_PAD + PLAYER_R;
    const rightX = W - WALL_PAD - PLAYER_R;

    // air中は無視（連打で壊れないように）
    if (st.side === 'air') return;

    if (st.side === 'left') {
      st.side = 'air';
      st.vx = +CROSS_VX;
      st.vy = KICK_VY;
      st.x = leftX;
    } else if (st.side === 'right') {
      st.side = 'air';
      st.vx = -CROSS_VX;
      st.vy = KICK_VY;
      st.x = rightX;
    }
  };

  // page events
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        kick();
      }
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // cleanup
  useEffect(() => {
    return () => stopLoop();
  }, []);

  // retry = quiz again
  const retry = () => {
    stopLoop();
    setGateMsg('');
    setPhase('gate_quiz');
    loadGateQuiz();
  };

  const typeLabel = useMemo(() => {
    if (!q) return '';
    if (q.type === 'single') return '単一選択';
    if (q.type === 'multi') return '複数選択';
    if (q.type === 'order') return '並び替え';
    if (q.type === 'text') return '記述';
    return q.type || '';
  }, [q]);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">🧗 ウォールエスケープ</h1>
            <p className="text-[11px] text-slate-600 mt-1">
              壁キックで生き延びろ（障害物は上から落ちる）
            </p>
          </div>
          <Link
            href="/"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-600"
          >
            ホームへ戻る
          </Link>
        </header>

        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 mb-3">
          <div className="flex items-center justify-between text-[12px]">
            <div>
              <span className="font-bold">スコア：</span>
              <span className="font-extrabold">{score}</span>
            </div>
            <div>
              <span className="font-bold">自己ベスト：</span>
              <span className="font-extrabold">{best}</span>
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <Link
              href="/solo/wallkick/rules"
              className="text-[11px] font-bold text-slate-700 underline hover:text-slate-500"
            >
              ルールを見る
            </Link>
            <Link
              href="/solo"
              className="text-[11px] font-bold text-sky-700 underline hover:text-sky-500"
            >
              ソロメニューへ戻る
            </Link>
          </div>
        </div>

        {/* ====== GATE QUIZ ====== */}
        {phase === 'gate_quiz' && (
          <section className="rounded-2xl border border-purple-200 bg-purple-50 shadow-sm p-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-extrabold text-purple-900">
                🎫 挑戦券クイズ（1問正解で挑戦）
              </p>
              <span className="text-[11px] text-purple-900">
                残り <span className="font-extrabold">{timeSeconds}</span> 秒
              </span>
            </div>

            {gateLoading ? (
              <p className="text-[12px] text-purple-900">クイズを読み込み中...</p>
            ) : gateError ? (
              <div className="space-y-2">
                <p className="text-[12px] text-rose-700">{gateError}</p>
               <button
  type="button"
  onClick={loadGateQuiz}
  disabled={gateShowAnswer}
  className="text-[11px] font-bold text-purple-800 underline hover:text-purple-600 disabled:opacity-40 disabled:cursor-not-allowed"
>
  別の問題にする
</button>
              </div>
            ) : q ? (
              <>
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white border border-purple-300 text-[10px] font-bold text-purple-900">
                    {typeLabel}
                  </span>
                  <button
                    type="button"
                    onClick={loadGateQuiz}
                    className="text-[11px] font-bold text-purple-800 underline hover:text-purple-600"
                  >
                    別の問題にする
                  </button>
                </div>

                <div className="mb-2 max-h-32 overflow-y-auto bg-white rounded-xl border border-purple-200 px-3 py-2">
                  <p className="text-[12px] whitespace-pre-wrap leading-relaxed text-slate-900">
                    {q.question || q.text}
                  </p>
                </div>

                {/* answers */}
                <div className="space-y-2">
                  {q.type === 'single' &&
                    (q.options || []).map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        className={
                          'w-full text-left px-3 py-2 rounded-2xl border text-[12px] ' +
                          (selectedOption === opt
                            ? 'border-purple-500 bg-purple-100 text-purple-950'
                            : 'border-purple-200 bg-white text-slate-900 hover:bg-purple-50')
                        }
                      >
                        {opt}
                      </button>
                    ))}

                  {q.type === 'multi' && (
                    <>
                      <p className="text-[11px] text-purple-900">
                        当てはまるものをすべて選択
                      </p>
                      {(q.options || []).map((opt, idx) => {
                        const active = multiSelected.includes(opt);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleMulti(opt)}
                            className={
                              'w-full text-left px-3 py-2 rounded-2xl border text-[12px] flex items-center justify-between ' +
                              (active
                                ? 'border-purple-500 bg-purple-100 text-purple-950'
                                : 'border-purple-200 bg-white text-slate-900 hover:bg-purple-50')
                            }
                          >
                            <span>{opt}</span>
                            <span className="font-extrabold">{active ? '✔' : ''}</span>
                          </button>
                        );
                      })}
                    </>
                  )}

                  {q.type === 'order' && (
                    <>
                      <p className="text-[11px] text-purple-900">
                        正しい順になるようにタップして並べる
                      </p>

                      <div className="space-y-2">
                        {(q.options || []).map((opt, idx) => {
                          const selected = orderSelected.includes(opt);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => toggleOrder(opt)}
                              className={
                                'w-full text-left px-3 py-2 rounded-2xl border text-[12px] ' +
                                (selected
                                  ? 'border-slate-300 bg-slate-100 text-slate-500'
                                  : 'border-purple-200 bg-white text-slate-900 hover:bg-purple-50')
                              }
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>

                      <div className="mt-2 rounded-xl border border-purple-200 bg-white p-2">
                        <p className="text-[10px] text-slate-600 mb-1">現在の並び</p>
                        {orderSelected.length ? (
                          <ol className="list-decimal list-inside text-[11px] text-slate-900 space-y-0.5">
                            {orderSelected.map((x, i) => (
                              <li key={i}>{x}</li>
                            ))}
                          </ol>
                        ) : (
                          <p className="text-[11px] text-slate-500">まだ選択されていません</p>
                        )}
                      </div>
                    </>
                  )}

                  {q.type === 'text' && (
                    <textarea
                      className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2 text-[12px] text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400"
                      rows={3}
                      placeholder="答えを入力"
                      value={textAnswer}
                      onChange={(e) => setTextAnswer(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          if (canSubmitQuiz) submitGateQuiz();
                        }
                      }}
                    />
                  )}
                </div>

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={submitGateQuiz}
                    disabled={!canSubmitQuiz}
                    className="flex-1 py-2 rounded-full bg-purple-600 text-white text-sm font-extrabold hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    解答して挑戦する
                  </button>
{gateShowAnswer && (
  <div className="mt-3 rounded-xl border border-purple-200 bg-white p-3">
    <p
      className={
        'text-sm font-extrabold ' +
        (gateJudge ? 'text-emerald-700' : 'text-rose-700')
      }
    >
      {gateJudge ? '正解！' : '不正解'}
    </p>
    <p className="text-[12px] text-slate-800 mt-1">
      あなたの回答：{' '}
      <span className="font-bold">
        {gateUserAnswerText || '（未回答）'}
      </span>
    </p>
    <p className="text-[12px] text-slate-800 mt-1">
      正解： <span className="font-extrabold">{gateCorrectAnswerText}</span>
    </p>
    <p className="text-[11px] text-slate-500 mt-2">2秒後に自動で進みます…</p>
  </div>
)}
                </div>

                {gateMsg && (
                  <p className="mt-2 text-[12px] font-bold text-purple-900">
                    {gateMsg}
                  </p>
                )}

                <p className="mt-2 text-[11px] text-purple-900">
                  ※ このゲームは<strong>毎回</strong>「1問正解」しないと挑戦できません。
                </p>
              </>
            ) : null}
          </section>
        )}

        {/* ====== PLAYING ====== */}
        {phase === 'playing' && (
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3">
            <p className="text-[11px] text-slate-600 mb-2">
              操作：<span className="font-bold">タップ</span>（または Space）で反対の壁へキック
              ／ 壁に張り付いてる間は<span className="font-bold">徐々に下がる</span>
            </p>

            <div className="rounded-2xl border border-slate-200 overflow-hidden">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="block w-full touch-none select-none"
                onPointerDown={(e) => {
                  e.preventDefault();
                  kick();
                }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  // 即終了扱い
                  if (stateRef.current) stateRef.current.alive = false;
                  endGame();
                }}
                className="py-2 rounded-full border border-slate-300 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50"
              >
                終了
              </button>
              <button
                type="button"
                onClick={() => {
                  // リトライはクイズ必須
                  retry();
                }}
                className="py-2 rounded-full bg-purple-600 text-white text-sm font-extrabold hover:bg-purple-500"
              >
                リトライ（クイズへ）
              </button>
            </div>
          </section>
        )}

        {/* ====== GAME OVER ====== */}
        {phase === 'gameover' && (
          <section className="rounded-2xl border border-rose-200 bg-rose-50 shadow-sm p-3">
            <p className="text-base font-extrabold text-rose-900">
              💥 ゲームオーバー
            </p>
            <p className="text-[12px] text-rose-900 mt-1">
              今回スコア：<span className="font-extrabold">{score}</span>
              ／ 自己ベスト：<span className="font-extrabold">{best}</span>
            </p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={retry}
                className="py-2 rounded-full bg-purple-600 text-white text-sm font-extrabold hover:bg-purple-500"
              >
                再挑戦（クイズへ）
              </button>
              <Link
                href="/solo"
                className="py-2 rounded-full border border-rose-300 bg-white text-rose-900 text-sm font-bold hover:bg-rose-50 text-center"
              >
                ソロメニューへ
              </Link>
            </div>

            <p className="mt-2 text-[11px] text-rose-900">
              ※ 再挑戦もクイズ1問正解が必要
            </p>
          </section>
        )}
      </div>
    </main>
  );
}