// file: app/solo/before/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const GAME_W = 360;
const GAME_H = 520;

// ====== 迷路（0=通路, 1=壁） ======
const MAZE = [
  '1111111111111111111',
  '1000000001000000001',
  '1011111101011111101',
  '1010000101010000101',
  '1010110101010110101',
  '1000100000000100001',
  '1110101110111010111',
  '1000100010001000101',
  '1011101011101011101',
  '1000001000001000001',
  '1011111011111011111',
  '1000000010000000001',
  '1111111010111011111',
  '1000001000100010001',
  '1011101110101110111',
  '1010000000000000101',
  '1010111110111110101',
  '1000100001000000101',
  '1011101101011011101',
  '1000000001000000001',
  '1111111111111111111',
];

const ROWS = MAZE.length;
const COLS = MAZE[0].length;

const STEP_MS = 140; // プレイヤー移動（タイル）
const GHOST_STEP_MS = 175; // ゴースト移動（少し遅め）

const PELLET_COUNT = 5;
const LETTERS = 'ABCDE'.split('');

const PREVIEW_SEC = 10; // ★問題を見せる時間（各WAVE開始前）

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isWall(x, y) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return true;
  return MAZE[y][x] === '1';
}

function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function dirToVec(dir) {
  if (dir === 'UP') return { dx: 0, dy: -1 };
  if (dir === 'DOWN') return { dx: 0, dy: 1 };
  if (dir === 'LEFT') return { dx: -1, dy: 0 };
  if (dir === 'RIGHT') return { dx: 1, dy: 0 };
  return { dx: 0, dy: 0 };
}

function oppositeDir(dir) {
  if (dir === 'UP') return 'DOWN';
  if (dir === 'DOWN') return 'UP';
  if (dir === 'LEFT') return 'RIGHT';
  if (dir === 'RIGHT') return 'LEFT';
  return null;
}

function nextCell(pos, dir) {
  const v = dirToVec(dir);
  return { x: pos.x + v.dx, y: pos.y + v.dy };
}

function canMove(pos, dir) {
  const n = nextCell(pos, dir);
  return !isWall(n.x, n.y);
}

function choicesFrom(pos) {
  const dirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
  return dirs.filter((d) => canMove(pos, d));
}

function findLookaheadTarget(p, tiles = 4) {
  const v = dirToVec(p.dir);
  let tx = p.x;
  let ty = p.y;

  for (let i = 0; i < tiles; i++) {
    const nx = tx + v.dx;
    const ny = ty + v.dy;
    if (isWall(nx, ny)) break;
    tx = nx;
    ty = ny;
  }
  return { x: tx, y: ty };
}

function chooseDirTowardTarget(g, target, opts) {
  if (!target || !opts || opts.length === 0) return g.dir || opts[0];

  const opp = oppositeDir(g.dir);
  const filtered = opts.filter((d) => d !== opp);
  const usable = filtered.length ? filtered : opts;

  let best = usable[0];
  let bestScore = Infinity;

  for (const d of usable) {
    const n = nextCell(g, d);
    const sc = manhattan(n, target);
    if (sc < bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return best;
}

function inRect(x, y, rect) {
  if (!rect) return true;
  return x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;
}

// ===== 壁じゃないスポーン地点を4つ確保する =====
function findSpawnPoints4() {
  const cx = Math.floor(COLS / 2);
  const cy = Math.floor(ROWS / 2);

  const cells = [];
  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (isWall(x, y)) continue;
      cells.push({ x, y, d: Math.abs(x - cx) + Math.abs(y - cy) });
    }
  }
  cells.sort((a, b) => a.d - b.d);

  const picked = [];
  for (const c of cells) {
    if (picked.length >= 4) break;
    if (!picked.some((p) => p.x === c.x && p.y === c.y)) picked.push({ x: c.x, y: c.y });
  }

  if (picked.length < 4) {
    const fallback = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 1 },
      { x: 1, y: 3 },
    ].filter((p) => !isWall(p.x, p.y));

    for (const f of fallback) {
      if (picked.length >= 4) break;
      if (!picked.some((p) => p.x === f.x && p.y === f.y)) picked.push(f);
    }
  }

  while (picked.length < 4) picked.push({ x: 1, y: 1 });
  return picked.slice(0, 4);
}

function buildYearMap(list) {
  const m = new Map();
  for (const it of list || []) {
    const y = Number(it.yearsAgo);
    if (!Number.isFinite(y)) continue;
    const e = String(it.event || '').trim();
    if (!e) continue;
    if (!m.has(y)) m.set(y, []);
    m.get(y).push({ event: e, yearsAgo: y });
  }
  return m;
}

function pickWaveNearN(list, n, rng = Math.random) {
  const yearMap = buildYearMap(list);
  const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
  if (years.length === 0) return [];

  const want = Math.min(n, years.length);
  const maxStart = Math.max(0, years.length - want);
  const start = Math.floor(rng() * (maxStart + 1));
  const windowYears = years.slice(start, start + want);

  return windowYears.map((y) => {
    const arr = yearMap.get(y) || [];
    const idx = Math.floor(rng() * arr.length);
    return arr[idx] || { event: String(y), yearsAgo: y };
  });
}

function SoloLayout({ title, children }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900">
     

      <div className="max-w-3xl mx-auto px-4 py-4 sm:py-6">
        <header className="mb-2 flex items-center justify-between">
          <h1 className="text-lg sm:text-2xl font-bold">{title}</h1>
          <Link href="/" className="text-xs text-sky-700 hover:underline">
            ホームへ戻る
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}

function formatStartYears(mode, wave) {
  if (!mode || !wave || wave.length === 0) return null;
  let v = wave[0]?.yearsAgo;
  for (const it of wave) {
    if (mode === 'OLD') v = Math.max(v, it.yearsAgo);
    else v = Math.min(v, it.yearsAgo);
  }
  return Number.isFinite(v) ? v : null;
}

// ====== BFS（壁 + ブロックセル回避） ======
function bfsReachable(start, goal, blockedSet) {
  if (!start || !goal) return false;
  const sk = `${start.x},${start.y}`;
  const gk = `${goal.x},${goal.y}`;
  if (blockedSet?.has(gk)) return false;

  const q = [start];
  const seen = new Set([sk]);

  while (q.length) {
    const cur = q.shift();
    const ck = `${cur.x},${cur.y}`;
    if (ck === gk) return true;

    const ns = [
      { x: cur.x + 1, y: cur.y },
      { x: cur.x - 1, y: cur.y },
      { x: cur.x, y: cur.y + 1 },
      { x: cur.x, y: cur.y - 1 },
    ];

    for (const n of ns) {
      if (isWall(n.x, n.y)) continue;
      const nk = `${n.x},${n.y}`;
      if (seen.has(nk)) continue;
      if (blockedSet?.has(nk)) continue;
      seen.add(nk);
      q.push(n);
    }
  }
  return false;
}

function pickEmptyCellsValidated(count, forbiddenSet, orderCells, startPos) {
  const maxTry = 2200;

  for (let attempt = 0; attempt < maxTry; attempt++) {
    const cells = [];
    const localForbid = new Set(forbiddenSet);

    let guard = 0;
    while (cells.length < count && guard < 12000) {
      guard++;

      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);

      if (isWall(x, y)) continue;
      const key = `${x},${y}`;
      if (localForbid.has(key)) continue;

      const n =
        (isWall(x + 1, y) ? 1 : 0) +
        (isWall(x - 1, y) ? 1 : 0) +
        (isWall(x, y + 1) ? 1 : 0) +
        (isWall(x, y - 1) ? 1 : 0);
      if (n >= 3) continue;

      localForbid.add(key);
      cells.push({ x, y });
    }

    if (cells.length < count) continue;

    const placed = orderCells.map((it, idx) => ({ ...it, x: cells[idx].x, y: cells[idx].y }));

    let ok = true;
    let curPos = { ...startPos };

    for (let i = 0; i < placed.length; i++) {
      const target = placed[i];

      const blocked = new Set();
      for (let j = i + 1; j < placed.length; j++) {
        blocked.add(`${placed[j].x},${placed[j].y}`);
      }

      if (blocked.has(`${curPos.x},${curPos.y}`)) {
        ok = false;
        break;
      }

      if (!bfsReachable(curPos, { x: target.x, y: target.y }, blocked)) {
        ok = false;
        break;
      }

      curPos = { x: target.x, y: target.y };
    }

    if (ok) return placed.map((p) => ({ x: p.x, y: p.y }));
  }

  const cellsFallback = [];
  const localForbid = new Set(forbiddenSet);
  while (cellsFallback.length < count) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (isWall(x, y)) continue;
    const key = `${x},${y}`;
    if (localForbid.has(key)) continue;
    localForbid.add(key);
    cellsFallback.push({ x, y });
  }
  return cellsFallback;
}

export default function BeforePacmanPage() {
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');

  const [rawList, setRawList] = useState([]);

  const [wave, setWave] = useState([]);
  const [mode, setMode] = useState(null);
  const [expectedIndex, setExpectedIndex] = useState(0);

  const [previewLeft, setPreviewLeft] = useState(PREVIEW_SEC);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const [bestScore, setBestScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [answerHistory, setAnswerHistory] = useState([]);

  const waveRef = useRef([]);
  useEffect(() => {
    waveRef.current = wave;
  }, [wave]);

  const modeRef = useRef(null);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const expectedIndexRef = useRef(0);
  useEffect(() => {
    expectedIndexRef.current = expectedIndex;
  }, [expectedIndex]);

  const eatenIdsRef = useRef(new Set());

  // 盤サイズ
  const boardRef = useRef(null);
  const [boardRect, setBoardRect] = useState({ w: GAME_W, h: GAME_H });
  useEffect(() => {
    const update = () => {
      const el = boardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBoardRect({ w: r.width, h: r.height });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [status]);

  const tilePx = useMemo(() => {
    const w = boardRect.w || GAME_W;
    const h = boardRect.h || GAME_H;
    const s = Math.floor(Math.min(w / COLS, h / ROWS));
    return clamp(s, 14, 26);
  }, [boardRect.w, boardRect.h]);

  const pelletLabelFont = useMemo(() => clamp(Math.floor(tilePx * 0.33), 8, 11), [tilePx]);

  const boardW = tilePx * COLS;
  const boardH = tilePx * ROWS;

  // ===== プレイヤー / ゴースト =====
  const [player, setPlayer] = useState({ x: 1, y: 1, dir: 'RIGHT', nextDir: 'RIGHT' });
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const [ghosts, setGhosts] = useState([]);
  const ghostsRef = useRef([]);
  useEffect(() => {
    ghostsRef.current = ghosts;
  }, [ghosts]);

  const ordered = useMemo(() => {
    const arr = [...(wave || [])];
    if (!mode) return arr;
    if (mode === 'OLD') return arr.sort((a, b) => b.yearsAgo - a.yearsAgo);
    return arr.sort((a, b) => a.yearsAgo - b.yearsAgo);
  }, [wave, mode]);

  const expected = ordered[expectedIndex] || null;

  const startYears = useMemo(() => formatStartYears(mode, wave), [mode, wave]);

  const compactLegend = useMemo(() => {
    const arr = [...(wave || [])].sort((a, b) => (a.letter < b.letter ? -1 : 1));
    const left = arr.slice(0, Math.ceil(arr.length / 2));
    const right = arr.slice(Math.ceil(arr.length / 2));
    return { left, right };
  }, [wave]);

  // ===== 初期化 =====
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('before_pac_best_score');
        const n = raw ? Number(raw) : 0;
        if (!Number.isNaN(n) && n >= 0) setBestScore(n);
      } catch {}
    }

    const load = async () => {
      try {
        const res = await fetch('/api/solo/before', { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'failed');
        setRawList(data.list || []);
        setStatus('choose');
      } catch (e) {
        console.error(e);
        setStatus('finished');
        setMessage('before データの取得に失敗しました（before.xlsx）');
      }
    };

    load();
  }, []);

  const resetActors = () => {
    setPlayer({ x: 1, y: 1, dir: 'RIGHT', nextDir: 'RIGHT' });

    const sp = findSpawnPoints4();
    const cx = Math.floor(COLS / 2);
    const cy = Math.floor(ROWS / 2);

    const patrolRect = {
      x0: clamp(cx - 5, 1, COLS - 2),
      x1: clamp(cx + 5, 1, COLS - 2),
      y0: clamp(cy - 4, 1, ROWS - 2),
      y1: clamp(cy + 4, 1, ROWS - 2),
    };

    const patrolPoints = [
      { x: patrolRect.x0, y: patrolRect.y0 },
      { x: patrolRect.x1, y: patrolRect.y0 },
      { x: patrolRect.x1, y: patrolRect.y1 },
      { x: patrolRect.x0, y: patrolRect.y1 },
    ].filter((pt) => !isWall(pt.x, pt.y));

    const gs = [
      { id: 'g_red', x: sp[0].x, y: sp[0].y, dir: 'LEFT', kind: 'chase' },
      {
        id: 'g_yellow',
        x: sp[1].x,
        y: sp[1].y,
        dir: 'RIGHT',
        kind: 'patrol',
        patrolRect,
        patrolPoints,
        patrolIndex: 0,
      },
      { id: 'g_pink', x: sp[2].x, y: sp[2].y, dir: 'UP', kind: 'random' },
      { id: 'g_green', x: sp[3].x, y: sp[3].y, dir: 'DOWN', kind: 'ambush' },
    ];

    setGhosts(gs);
  };

  const makeWave = (m) => {
    const picked = pickWaveNearN(rawList, PELLET_COUNT);

    const base = picked.map((it, idx) => {
      const letter = LETTERS[idx] || '?';
      const id = `p_${it.yearsAgo}_${idx}_${Math.random().toString(16).slice(2)}`;
      return { ...it, letter, id };
    });

    const orderForCheck = [...base].sort((a, b) => {
      if (m === 'OLD') return b.yearsAgo - a.yearsAgo;
      return a.yearsAgo - b.yearsAgo;
    });

    const forbidden = new Set();
    forbidden.add('1,1');

    const sp = findSpawnPoints4();
    for (const p of sp) forbidden.add(`${p.x},${p.y}`);

    const startPos = { x: 1, y: 1 };
    const cells = pickEmptyCellsValidated(orderForCheck.length, forbidden, orderForCheck, startPos);

    const posById = new Map();
    for (let i = 0; i < orderForCheck.length; i++) {
      posById.set(orderForCheck[i].id, cells[i]);
    }

    const wave2 = base.map((it) => {
      const c = posById.get(it.id) || { x: 2, y: 2 };
      return { ...it, x: c.x, y: c.y };
    });

    eatenIdsRef.current = new Set();
    setWave(wave2);
    setExpectedIndex(0);
  };

  const startWaveWithMode = (m) => {
    setMode(m);
    modeRef.current = m;
    setMessage('');
    resetActors();
    makeWave(m);
    setPreviewLeft(PREVIEW_SEC);
    setStatus('preview');
  };

  useEffect(() => {
    if (status !== 'preview') return;

    let alive = true;
    const t0 = Date.now();
    const id = setInterval(() => {
      if (!alive) return;
      const elapsed = Math.floor((Date.now() - t0) / 1000);
      const left = clamp(PREVIEW_SEC - elapsed, 0, PREVIEW_SEC);
      setPreviewLeft(left);
      if (left <= 0) {
        clearInterval(id);
        setStatus('playing');
      }
    }, 200);

    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [status]);

  const nextWave = () => {
    setMode(null);
    setStatus('choose');
  };

  const pushDir = (dir) => {
    if (status !== 'playing') return;
    setPlayer((p) => ({ ...p, nextDir: dir }));
  };

  useEffect(() => {
    if (status !== 'playing') return;

    const onKey = (e) => {
      if (e.key === 'ArrowUp') pushDir('UP');
      if (e.key === 'ArrowDown') pushDir('DOWN');
      if (e.key === 'ArrowLeft') pushDir('LEFT');
      if (e.key === 'ArrowRight') pushDir('RIGHT');
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status]);

  const swipeRef = useRef({ active: false, sx: 0, sy: 0, decided: false });

  const decideSwipeDir = (dx, dy) => {
    if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
    return dy > 0 ? 'DOWN' : 'UP';
  };

  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    if (status !== 'playing') return;

    const onDown = (e) => {
      swipeRef.current.active = true;
      swipeRef.current.sx = e.clientX;
      swipeRef.current.sy = e.clientY;
      swipeRef.current.decided = false;
      try {
        el.setPointerCapture(e.pointerId);
      } catch {}
      e.preventDefault?.();
    };

    const onMove = (e) => {
      if (!swipeRef.current.active) return;

      const dx = e.clientX - swipeRef.current.sx;
      const dy = e.clientY - swipeRef.current.sy;

      const d = decideSwipeDir(dx, dy);
      if (d && !swipeRef.current.decided) {
        swipeRef.current.decided = true;
        pushDir(d);
      }

      if (swipeRef.current.decided && (Math.abs(dx) > 60 || Math.abs(dy) > 60)) {
        swipeRef.current.sx = e.clientX;
        swipeRef.current.sy = e.clientY;
        swipeRef.current.decided = false;
      }

      e.preventDefault?.();
    };

    const onUp = (e) => {
      swipeRef.current.active = false;
      swipeRef.current.decided = false;
      e.preventDefault?.();
    };

    el.addEventListener('pointerdown', onDown, { passive: false });
    el.addEventListener('pointermove', onMove, { passive: false });
    el.addEventListener('pointerup', onUp, { passive: false });
    el.addEventListener('pointercancel', onUp, { passive: false });

    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [status]);

  const gameOver = ({ reason, wrongPellet }) => {
    const finalScore = scoreRef.current;

    setStatus('finished');
    setMessage(reason ? `ゲームオーバー：${reason}` : 'ゲームオーバー');

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('before_pac_best_score');
        const oldBest = raw ? Number(raw) : 0;

        if (Number.isNaN(oldBest) || finalScore > oldBest) {
          window.localStorage.setItem('before_pac_best_score', String(finalScore));
          setBestScore(finalScore);
          setIsNewRecord(finalScore > 0);
        } else {
          setBestScore(Number.isNaN(oldBest) ? 0 : oldBest);
          setIsNewRecord(false);
        }
      } catch {}
    }

    const w = waveRef.current || [];
    const m = modeRef.current;
    const idx = expectedIndexRef.current || 0;

    const ord = [...w].sort((a, b) => {
      if (m === 'OLD') return b.yearsAgo - a.yearsAgo;
      return a.yearsAgo - b.yearsAgo;
    });

    const expectedNow = ord[idx] || null;
    const remaining = ord.slice(idx);

    setAnswerHistory((prev) => {
      const seen = new Set(prev.map((x) => x.question_id));
      const added = [];

      if (wrongPellet && expectedNow) {
        const qid = `before_${wrongPellet.id}_mistake`;
        if (!seen.has(qid)) {
          seen.add(qid);
          added.push({
            question_id: qid,
            text: `順番ミス`,
            userAnswerText: `${wrongPellet.letter}：${wrongPellet.event}（${wrongPellet.yearsAgo}年前）`,
            correctAnswerText: `${expectedNow.letter}：${expectedNow.event}（${expectedNow.yearsAgo}年前）`,
          });
        }
      }

      const wrongId = wrongPellet?.id || null;
      for (const q of remaining) {
        if (wrongId && q.id === wrongId) continue;
        const qid = `before_${q.id}_remain`;
        if (seen.has(qid)) continue;
        seen.add(qid);
        added.push({
          question_id: qid,
          text: `未回答`,
          userAnswerText: `—`,
          correctAnswerText: `${q.letter}：${q.event}（${q.yearsAgo}年前）`,
        });
      }

      return [...prev, ...added];
    });
  };

  // ===== メインループ =====
  const rafRef = useRef(null);
  const lastRef = useRef(nowMs());
  const accRef = useRef({ p: 0, g: 0 });

  useEffect(() => {
    if (status !== 'playing') return;

    lastRef.current = nowMs();
    accRef.current = { p: 0, g: 0 };

    const loop = () => {
      const t = nowMs();
      const dt = Math.min(50, t - lastRef.current);
      lastRef.current = t;

      accRef.current.p += dt;
      accRef.current.g += dt;

      if (accRef.current.p >= STEP_MS) {
        accRef.current.p -= STEP_MS;

        setPlayer((p0) => {
          let p = p0;

          if (p.nextDir && canMove(p, p.nextDir)) {
            p = { ...p, dir: p.nextDir };
          }

          if (p.dir && canMove(p, p.dir)) {
            const n = nextCell(p, p.dir);
            p = { ...p, x: n.x, y: n.y };
          }

          return p;
        });
      }

      if (accRef.current.g >= GHOST_STEP_MS) {
        accRef.current.g -= GHOST_STEP_MS;

        setGhosts((gs0) => {
          const gs1 = (gs0 || []).map((g0) => {
            let g = { ...g0 };
            const p = playerRef.current;

            let opts = choicesFrom(g);
            if (opts.length === 0) return g;

            const atJunction = opts.length >= 3 || !canMove(g, g.dir);

            if (atJunction) {
              if (g.kind === 'patrol') {
                const rect = g.patrolRect;
                const points = Array.isArray(g.patrolPoints) ? g.patrolPoints : [];
                let idx = Number.isFinite(g.patrolIndex) ? g.patrolIndex : 0;

                if (!inRect(g.x, g.y, rect)) {
                  let bestI = 0;
                  let bestD = Infinity;
                  for (let i = 0; i < points.length; i++) {
                    const d = manhattan({ x: g.x, y: g.y }, points[i]);
                    if (d < bestD) {
                      bestD = d;
                      bestI = i;
                    }
                  }
                  idx = bestI;
                }

                const target = points[idx] || { x: g.x, y: g.y };
                if (g.x === target.x && g.y === target.y && points.length > 0) {
                  idx = (idx + 1) % points.length;
                }

                const nextTarget = points[idx] || target;

                opts = opts.filter((d) => {
                  const n = nextCell(g, d);
                  return inRect(n.x, n.y, rect);
                });
                if (opts.length === 0) opts = choicesFrom(g);

                g.dir = chooseDirTowardTarget(g, nextTarget, opts);
                g.patrolIndex = idx;
              } else if (g.kind === 'ambush') {
                const target = findLookaheadTarget(p, 4);
                g.dir = chooseDirTowardTarget(g, target, opts);
              } else if (g.kind === 'chase') {
                g.dir = chooseDirTowardTarget(g, { x: p.x, y: p.y }, opts);
              } else {
                const opp = oppositeDir(g.dir);
                const filtered = opts.filter((d) => d !== opp);
                const usable = filtered.length ? filtered : opts;
                g.dir = usable[Math.floor(Math.random() * usable.length)];
              }
            }

            if (g.dir && canMove(g, g.dir)) {
              const n = nextCell(g, g.dir);
              g.x = n.x;
              g.y = n.y;
            } else {
              const usable = choicesFrom(g);
              if (usable.length) {
                g.dir = usable[Math.floor(Math.random() * usable.length)];
                const n = nextCell(g, g.dir);
                if (!isWall(n.x, n.y)) {
                  g.x = n.x;
                  g.y = n.y;
                }
              }
            }

            return g;
          });

          return gs1;
        });
      }

      // ゴースト接触
      {
        const p = playerRef.current;
        const gs = ghostsRef.current || [];
        const hit = gs.find((g) => g.x === p.x && g.y === p.y);
        if (hit) {
          gameOver({ reason: 'ゴーストに触れた' });
          return;
        }
      }

      // エサ判定（順番）
      {
        const p = playerRef.current;
        const currentExpected = expected;
        if (currentExpected) {
          const pelletHere = (wave || []).find((q) => q.x === p.x && q.y === p.y);
          if (pelletHere) {
            if (eatenIdsRef.current.has(pelletHere.id)) {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }

            if (pelletHere.id !== currentExpected.id) {
              eatenIdsRef.current.add(pelletHere.id);
              gameOver({ reason: '順番ミス', wrongPellet: pelletHere });
              return;
            }

            eatenIdsRef.current.add(pelletHere.id);

            setWave((prev) => prev.filter((q) => q.id !== pelletHere.id));

            setAnswerHistory((prev) => {
              const qid = `before_${pelletHere.id}`;
              if (prev.some((x) => x.question_id === qid)) return prev;
              return [
                ...prev,
                {
                  question_id: qid,
                  text: `順番OK`,
                  userAnswerText: `${pelletHere.letter}：${pelletHere.event}（${pelletHere.yearsAgo}年前）`,
                  correctAnswerText: `${pelletHere.letter}：${pelletHere.event}（${pelletHere.yearsAgo}年前）`,
                },
              ];
            });

            setScore((s) => {
              const ns = s + 1;
              scoreRef.current = ns;
              return ns;
            });

            setExpectedIndex((i) => i + 1);
          }
        }
      }

      // 5個食べたら次WAVE
      {
        const w = wave || [];
        if (mode && w.length === 0) {
          nextWave();
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [status, mode, expectedIndex, wave, expected]);

  // ===== UI =====
  if (status === 'loading') {
    return (
      <SoloLayout title="パックマン（時系列）">
        <p className="text-sm text-slate-800 bg-white/90 rounded-xl px-4 py-3 inline-block">読み込み中...</p>
      </SoloLayout>
    );
  }

  if (status === 'finished') {
    return (
      <SoloLayout title="パックマン（時系列）">
        <div className="mt-3 max-w-md mx-auto bg-white/95 rounded-2xl shadow-lg border border-slate-200 p-4 sm:p-6 space-y-3">
          <p className="text-lg font-semibold text-slate-900">結果</p>
          <p className="text-sm text-slate-900">
            スコア： <span className="font-bold text-emerald-700">{score}</span>
          </p>

          <div className="border-t border-slate-200 pt-2 text-sm">
            <p className="text-slate-800">
              このブラウザでの最高記録： <span className="font-bold text-emerald-700">{bestScore}</span>
            </p>
            {isNewRecord && <p className="text-xs text-emerald-700 mt-1 font-semibold">🎉 自己ベスト更新！</p>}
          </div>

          {message && (
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{message}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={() => {
                window.location.href = `/solo/before?ts=${Date.now()}`;
              }}
              className="px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700"
            >
              もう一度プレイ
            </button>

            <Link
              href="/solo"
              className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              ソロメニューへ戻る
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-full border border-slate-300 bg-slate-50 text-sm font-semibold text-slate-800 hover:bg-slate-100"
            >
              ホームへ戻る
            </Link>
          </div>
        </div>

        <div className="mt-6 max-w-3xl mx-auto">
          <QuestionReviewAndReport questions={answerHistory} sourceMode="solo-before-pacman" />
        </div>
      </SoloLayout>
    );
  }

  if (status === 'choose') {
    return (
      <SoloLayout title="パックマン（時系列）">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="bg-white/95 rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-sm font-bold text-slate-900">このWAVEはどっちの順で食べる？（A〜Eの5個）</p>
            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => startWaveWithMode('OLD')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
              >
                古い順
              </button>
              <button
                onClick={() => startWaveWithMode('NEW')}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-sm hover:bg-slate-50"
              >
                新しい順
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-600">次：10秒だけ問題を表示してからスタート（最初に考える時間）</p>
          </div>

          <div className="text-center">
            <Link href="/" className="text-xs text-sky-700 hover:underline">
              ホームへ戻る
            </Link>
          </div>
        </div>
      </SoloLayout>
    );
  }

  // ===== preview / playing 共通の上部HUD（答えバレ無し） =====
  const LegendBox = (
    <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-600 font-semibold">
            順： <span className="font-bold text-slate-900">{mode === 'OLD' ? '古い順' : '新しい順'}</span>
            {Number.isFinite(startYears) && (
              <span className="ml-2 text-slate-700 font-semibold">（{startYears}年前スタート）</span>
            )}
          </p>
          <p className="mt-1 text-[10px] text-slate-600">※次のエサは赤く光りません</p>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-600 font-semibold">スコア</p>
          <p className="text-lg font-bold text-emerald-700">{score}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] leading-snug">
        <div className="space-y-1">
          {compactLegend.left.map((q) => (
            <div key={q.id} className="flex gap-2 items-start">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full font-black"
                style={{
                  background: 'linear-gradient(180deg, rgba(250,204,21,1), rgba(245,158,11,1))',
                  color: 'rgba(2,6,23,0.95)',
                  flex: '0 0 auto',
                }}
              >
                {q.letter}
              </span>
              <span className="text-slate-900">{q.event}</span>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          {compactLegend.right.map((q) => (
            <div key={q.id} className="flex gap-2 items-start">
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full font-black"
                style={{
                  background: 'linear-gradient(180deg, rgba(250,204,21,1), rgba(245,158,11,1))',
                  color: 'rgba(2,6,23,0.95)',
                  flex: '0 0 auto',
                }}
              >
                {q.letter}
              </span>
              <span className="text-slate-900">{q.event}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ===== A〜Eの丸の近くに薄い問題文（event） =====
  const PelletAndLabel = ({ q }) => (
    <div className="absolute" style={{ left: q.x * tilePx, top: q.y * tilePx, zIndex: 10 }}>
      <div
        className="absolute flex items-center justify-center font-black"
        style={{
                    left: Math.floor(tilePx * 0.15),
          top: Math.floor(tilePx * 0.15),
          width: Math.floor(tilePx * 0.7),
          height: Math.floor(tilePx * 0.7),
          borderRadius: 999,
          background: 'linear-gradient(180deg, rgba(250,204,21,1), rgba(245,158,11,1))',
          color: 'rgba(2,6,23,0.95)',
          boxShadow: '0 4px 10px rgba(0,0,0,0.25), inset 0 0 0 2px rgba(255,255,255,0.22)',
          fontSize: Math.max(11, Math.floor(tilePx * 0.48)),
        }}
        title={`${q.letter}: ${q.event}`}
      >
        {q.letter}
      </div>

      <div
        className="absolute whitespace-nowrap pointer-events-none"
        style={{
          left: Math.floor(tilePx * 0.05),
          top: Math.floor(tilePx * 0.92),
          maxWidth: tilePx * 3.8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: pelletLabelFont,
          lineHeight: 1.05,
          color: 'rgba(255,255,255,0.65)',
          background: 'rgba(0,0,0,0.18)',
          padding: '1px 4px',
          borderRadius: 999,
          backdropFilter: 'blur(2px)',
        }}
      >
        {q.event}
      </div>
    </div>
  );

// ===== プレイヤー（ドット絵：ペンギン） =====
const PlayerSprite = ({ x, y }) => {
  const bodyColor = '#ffffff';   // 白ボール
  const eyeWhite = '#ffffff';
  const pupilColor = '#111111';

  const px = Math.max(2, Math.floor(tilePx / 8));
  const w = px * 8;
  const h = px * 8;

  // 完全な丸
  const bodyBits = [
    '00111100',
    '01111110',
    '11111111',
    '11111111',
    '11111111',
    '11111111',
    '01111110',
    '00111100',
  ];

  // 目（左右）
  const eyeBits = [
    '00000000',
    '00000000',
    '00000000',
    '01000010',
    '01000010',
    '00000000',
    '00000000',
    '00000000',
  ];

  // 黒目（ちょい中央寄り）
  const pupilBits = [
    '00000000',
    '00000000',
    '00000000',
    '01100110',
    '01100110',
    '00000000',
    '00000000',
    '00000000',
  ];

  const renderBits = (bits, color, opacity = 1, keyPrefix = 'p') =>
    bits.flatMap((row, yy) =>
      row.split('').map((c, xx) => {
        if (c !== '1') return null;
        return (
          <div
            key={`${keyPrefix}-${yy}-${xx}`}
            style={{
              position: 'absolute',
              left: xx * px,
              top: yy * px,
              width: px,
              height: px,
              background: color,
              opacity,
            }}
          />
        );
      })
    );

  return (
    <div
      className="absolute"
      style={{
        left: x * tilePx + Math.floor((tilePx - w) / 2),
        top: y * tilePx + Math.floor((tilePx - h) / 2),
        width: w,
        height: h,
        zIndex: 12,
        imageRendering: 'pixelated',
      }}
      title="player"
    >
      {/* 影 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
        }}
      >
        <div style={{ position: 'absolute', inset: 0 }}>
          {renderBits(bodyBits, bodyColor, 1, 'body')}
        </div>
      </div>

      {/* 目 */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {renderBits(eyeBits, eyeWhite, 0.95, 'eye')}
      </div>
      <div style={{ position: 'absolute', inset: 0 }}>
        {renderBits(pupilBits, pupilColor, 0.9, 'pupil')}
      </div>
    </div>
  );
};



  // ===== ゴースト（ドット絵） =====
  const GhostSprite = ({ g }) => {
    const body =
      g.id === 'g_red'
        ? '#ff4d4d'
        : g.id === 'g_yellow'
          ? '#ffd400'
          : g.id === 'g_pink'
            ? '#ff66cc'
            : '#33dd77';

    const px = Math.max(2, Math.floor(tilePx / 8));
    const w = px * 8;
    const h = px * 8;

    const ghostBits = [
      '00111100',
      '01111110',
      '11111111',
      '11011011',
      '11111111',
      '11111111',
      '11011011',
      '10100101',
    ];

    const eyeBits = [
      '00000000',
      '00000000',
      '00000000',
      '00100100',
      '00100100',
      '00000000',
      '00000000',
      '00000000',
    ];

    const pupilBits = [
      '00000000',
      '00000000',
      '00000000',
      '00010000',
      '00010000',
      '00000000',
      '00000000',
      '00000000',
    ];

    const renderBits = (bits, color, opacity = 1) =>
      bits.flatMap((row, yy) =>
        row.split('').map((c, xx) => {
          if (c !== '1') return null;
          return (
            <div
              key={`${yy}-${xx}-${color}`}
              style={{
                position: 'absolute',
                left: xx * px,
                top: yy * px,
                width: px,
                height: px,
                background: color,
                opacity,
              }}
            />
          );
        })
      );

    return (
      <div
        className="absolute"
        style={{
          left: g.x * tilePx + Math.floor((tilePx - w) / 2),
          top: g.y * tilePx + Math.floor((tilePx - h) / 2),
          width: w,
          height: h,
          zIndex: 11,
          imageRendering: 'pixelated',
        }}
        title="ghost"
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            filter: 'drop-shadow(0 6px 8px rgba(0,0,0,0.45))',
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>{renderBits(ghostBits, body)}</div>
        </div>

        <div style={{ position: 'absolute', inset: 0 }}>{renderBits(eyeBits, 'white', 0.95)}</div>
        <div style={{ position: 'absolute', inset: 0 }}>{renderBits(pupilBits, '#111', 0.9)}</div>
      </div>
    );
  };

  const Board = ({ dim }) => (
    <div
      ref={boardRef}
      className="relative rounded-2xl overflow-hidden border border-slate-500 shadow-lg bg-slate-950"
      style={{
        width: '100%',
        maxWidth: 520,
        aspectRatio: `${COLS}/${ROWS}`,
        touchAction: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          width: boardW,
          height: boardH,
          transformOrigin: 'top left',
        }}
      >
        {MAZE.map((row, y) =>
          row.split('').map((c, x) => {
            const wall = c === '1';
            return (
              <div
                key={`${x},${y}`}
                className="absolute"
                style={{
                  left: x * tilePx,
                  top: y * tilePx,
                  width: tilePx,
                  height: tilePx,
                  background: wall
                    ? 'linear-gradient(180deg, rgba(30,41,59,1), rgba(15,23,42,1))'
                    : 'rgba(2,6,23,1)',
                  boxShadow: wall
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.06)'
                    : 'inset 0 0 0 1px rgba(255,255,255,0.02)',
                }}
              />
            );
          })
        )}

        {(wave || []).map((q) => (
          <PelletAndLabel key={q.id} q={q} />
        ))}

        {/* ★プレイヤー（パックマン） */}
        <PlayerSprite x={player.x} y={player.y} />

        {(ghosts || []).map((g) => (
          <GhostSprite key={g.id} g={g} />
        ))}
      </div>

      {dim && (
        <div className="absolute inset-0" style={{ background: 'rgba(2,6,23,0.15)', zIndex: 30 }} />
      )}
    </div>
  );

  // ===== preview =====
  if (status === 'preview') {
    return (
      <SoloLayout title="パックマン（時系列）">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-slate-600 font-semibold">自己ベスト</p>
              <p className="text-sm font-bold text-slate-800">{bestScore}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-600 font-semibold">スタートまで</p>
              <p className="text-lg font-black text-slate-900">{previewLeft}s</p>
            </div>
          </div>

          <div className="mt-2">{LegendBox}</div>

          <div className="mt-3 flex flex-col items-center gap-2">
            <Board dim />

            <div className="text-[11px] text-slate-700 text-center">
              いまは準備時間（操作できません）／ 10秒後に自動で開始
            </div>

            <div className="text-center">
              <Link href="/" className="text-xs text-sky-700 hover:underline">
                ホームへ戻る
              </Link>
            </div>
          </div>
        </div>
      </SoloLayout>
    );
  }

  // ===== playing =====
  return (
    <SoloLayout title="パックマン（時系列）">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-600 font-semibold">自己ベスト</p>
            <p className="text-sm font-bold text-slate-800">{bestScore}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600 font-semibold">スワイプ操作</p>
            <p className="text-[11px] text-slate-700">盤面をスワイプ（PCは矢印キー）</p>
          </div>
        </div>

        <div className="mt-2">{LegendBox}</div>

        <div className="mt-3 flex flex-col items-center gap-2">
          <Board />

          <div className="text-center">
            <Link href="/" className="text-xs text-sky-700 hover:underline">
              ホームへ戻る
            </Link>
          </div>
        </div>
      </div>
    </SoloLayout>
  );
}


