// file: app/solo/before/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const GAME_W = 360;
const GAME_H = 520;

/**
 * ====== クラシック風 28x31 迷路 ======
 * 0=通路, 1=壁
 * ※「見た目をそれっぽく」寄せた固定迷路（中央にペン/箱）
 * ※左右ワープ（トンネル）あり
 */
const MAZE = [
  '1111111111111111111111111111', // 0
  '1000000010000010000010000001', // 1
  '1011101010101010101010111101', // 2
  '1000001000101000101000000101', // 3
  '1011101110101111101011110101', // 4
  '1000100000101000101000010001', // 5
  '1110101111101011101111010111', // 6
  '1000001000001000000001010001', // 7
  '1011001011111111111101011101', // 8
  '1000000010000110000100000001', // 9
  '1111111010110110110101111111', // 10
  '1000000010100000000101000001', // 11
  '1011111110101111110101111101', // 12
  '1010000000001000010000000101', // 13
  '1010111111111000011111110101', // 14  ←左右トンネル帯（ワープさせる）
  '1010100000000000000000010101', // 15
  '1010101111110111101111010101', // 16
  '1000101000000100001000010001', // 17
  '1111101011111111111010111111', // 18
  '1000000010000110000100000001', // 19
  '1011111111100110011111111101', // 20
  '1010000000100000001000000101', // 21
  '1010111110101111101011110101', // 22
  '1000100000101000101000010001', // 23
  '1110101111101011101111010111', // 24
  '1000101000001000000001010001', // 25
  '1011101011111111111101011101', // 26
  '1000000010000110000100000001', // 27
  '1011111110111111110111111101', // 28
  '1000000000000000000000000001', // 29
  '1111111111111111111111111111', // 30
];

const ROWS = MAZE.length; // 31
const COLS = MAZE[0].length; // 28

// ===== スピード・タイミング =====
const STEP_MS = 140; // プレイヤー基本移動（タイル）
const GHOST_STEP_MS = 175; // ゴースト基本移動（タイル）

const PREVIEW_SEC = 10; // 問題を最初に見せる秒数（WAVE開始前）

// A〜E（問題エサ）
const PELLET_COUNT = 5;
const LETTERS = 'ABCDE'.split('');

// ===== 新要素（全部盛り）=====
const POWER_SEC = 5; // A〜Eを取ったら5秒
const SPEED_BOOST = 1.25; // 速度UP倍率（ちょい）
const RESPAWN_MS = 3500; // 倒したゴーストの復活まで
const FRUIT_INTERVAL_MS = 10000; // 10秒
const FRUIT_REVEAL_MS = 1000; // 1秒だけ答え表示

// ===== 固定配置（クラシック寄せ）=====
const PLAYER_START = { x: 13, y: 23 }; // 下側中央付近
const PEN = { x: 13, y: 15 }; // 中央箱の中心
const GHOST_STARTS = [
  { id: 'g_red', x: 13, y: 14, dir: 'LEFT', kind: 'chase' },
  { id: 'g_pink', x: 12, y: 15, dir: 'UP', kind: 'ambush' },
  { id: 'g_yellow', x: 14, y: 15, dir: 'RIGHT', kind: 'patrol' },
  { id: 'g_green', x: 13, y: 16, dir: 'DOWN', kind: 'random' },
];

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

/**
 * 左右ワープ（トンネル）対応：
 * - xが範囲外に出る移動を許可する場合、反対側へ回す
 * - ただし回した先が壁なら移動不可
 */
function nextCellWithWarp(pos, dir) {
  const v = dirToVec(dir);
  let nx = pos.x + v.dx;
  let ny = pos.y + v.dy;

  // 左右ワープ
  if (nx < 0) nx = COLS - 1;
  if (nx >= COLS) nx = 0;

  return { x: nx, y: ny };
}

function canMove(pos, dir) {
  const n = nextCellWithWarp(pos, dir);
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
    let nx = tx + v.dx;
    let ny = ty + v.dy;

    if (nx < 0) nx = COLS - 1;
    if (nx >= COLS) nx = 0;

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
    const n = nextCellWithWarp(g, d);
    const sc = manhattan(n, target);
    if (sc < bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return best;
}

// scared中：遠ざかる
function chooseDirAwayFromTarget(g, target, opts) {
  if (!target || !opts || opts.length === 0) return g.dir || opts[0];

  const opp = oppositeDir(g.dir);
  const filtered = opts.filter((d) => d !== opp);
  const usable = filtered.length ? filtered : opts;

  let best = usable[0];
  let bestScore = -Infinity;

  for (const d of usable) {
    const n = nextCellWithWarp(g, d);
    const sc = manhattan(n, target);
    if (sc > bestScore) {
      bestScore = sc;
      best = d;
    }
  }
  return best;
}

// ===== 年データ抽選 =====
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

// ===== BFS（通れるか）=====
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
      // ワープは経路計算では無視（単純化）
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
    while (cells.length < count && guard < 16000) {
      guard++;

      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);

      if (isWall(x, y)) continue;
      const key = `${x},${y}`;
      if (localForbid.has(key)) continue;

      // 行き止まりは避ける
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

  // fallback
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

  // wave = A〜E（yearsAgoは答え、eventは問題文）
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

  // ===== 新要素：パワー（青）=====
  const [powerUntilMs, setPowerUntilMs] = useState(0);
  const powerUntilRef = useRef(0);
  useEffect(() => {
    powerUntilRef.current = powerUntilMs;
  }, [powerUntilMs]);

  // ===== 新要素：フルーツ =====
  const [fruit, setFruit] = useState(null); // {x,y,id,kind}
  const fruitRef = useRef(null);
  useEffect(() => {
    fruitRef.current = fruit;
  }, [fruit]);

  // ===== 新要素：答え表示（1秒）=====
  const [revealAnswersUntilMs, setRevealAnswersUntilMs] = useState(0);
  const revealRef = useRef(0);
  useEffect(() => {
    revealRef.current = revealAnswersUntilMs;
  }, [revealAnswersUntilMs]);

  // ===== 倒したゴーストの復活タイマー =====
  const respawnTimersRef = useRef(new Map());
  useEffect(() => {
    return () => {
      for (const tid of respawnTimersRef.current.values()) clearTimeout(tid);
      respawnTimersRef.current.clear();
    };
  }, []);

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
    return clamp(s, 12, 22);
  }, [boardRect.w, boardRect.h]);

  const pelletLabelFont = useMemo(() => clamp(Math.floor(tilePx * 0.33), 8, 11), [tilePx]);

  const boardW = tilePx * COLS;
  const boardH = tilePx * ROWS;

  // ===== プレイヤー / ゴースト =====
  const [player, setPlayer] = useState({
    x: PLAYER_START.x,
    y: PLAYER_START.y,
    dir: 'LEFT',
    nextDir: 'LEFT',
  });
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  const [ghosts, setGhosts] = useState([]);
  const ghostsRef = useRef([]);
  useEffect(() => {
    ghostsRef.current = ghosts;
  }, [ghosts]);

  // ===== wave順序（答えバレ防止：UIにはyearsAgoを出さない）=====
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

  // ===== ゴースト初期化（固定スポーン）=====
  const resetActors = () => {
    setPlayer({ x: PLAYER_START.x, y: PLAYER_START.y, dir: 'LEFT', nextDir: 'LEFT' });
    setPowerUntilMs(0);
    powerUntilRef.current = 0;

    setFruit(null);
    setRevealAnswersUntilMs(0);
    revealRef.current = 0;

    const gs = GHOST_STARTS.map((g) => ({
      ...g,
      state: 'alive', // alive | dead
      scared: false, // このpowerで青化したか（復活個体はfalseのまま）
      // patrol用の枠（簡易）
      patrolRect: { x0: 10, x1: 17, y0: 12, y1: 18 },
      patrolPoints: [
        { x: 10, y: 12 },
        { x: 17, y: 12 },
        { x: 17, y: 18 },
        { x: 10, y: 18 },
      ].filter((pt) => !isWall(pt.x, pt.y)),
      patrolIndex: 0,
    }));

    setGhosts(gs);
  };

  // ===== wave生成（A〜E配置）=====
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
    forbidden.add(`${PLAYER_START.x},${PLAYER_START.y}`);

    // ペン周りは避ける（中央箱に入らないように）
    for (let yy = PEN.y - 1; yy <= PEN.y + 1; yy++) {
      for (let xx = PEN.x - 2; xx <= PEN.x + 2; xx++) {
        forbidden.add(`${xx},${yy}`);
      }
    }

    // ゴーストスポーンも避ける
    for (const g of GHOST_STARTS) forbidden.add(`${g.x},${g.y}`);

    const cells = pickEmptyCellsValidated(orderForCheck.length, forbidden, orderForCheck, PLAYER_START);

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

  // ===== previewカウントダウン =====
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

  // ===== 操作 =====
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

  // ===== 新要素：パワー開始（この瞬間に存在するゴーストだけ青化）=====
  const startPower = () => {
    const until = Date.now() + POWER_SEC * 1000;
    setPowerUntilMs(until);
    powerUntilRef.current = until;

    setGhosts((gs) =>
      (gs || []).map((g) => {
        if (g.state !== 'alive') return g;
        return { ...g, scared: true };
      })
    );
  };

  // ===== 新要素：ゴースト撃破→ペンから復活（復活個体は青じゃない）=====
  const killGhost = (ghostId) => {
    const old = respawnTimersRef.current.get(ghostId);
    if (old) clearTimeout(old);

    setGhosts((gs) =>
      (gs || []).map((g) => (g.id === ghostId ? { ...g, state: 'dead' } : g))
    );

    const tid = setTimeout(() => {
      respawnTimersRef.current.delete(ghostId);
      setGhosts((gs) =>
        (gs || []).map((g) => {
          if (g.id !== ghostId) return g;
          return {
            ...g,
            x: PEN.x,
            y: PEN.y,
            dir: 'LEFT',
            state: 'alive',
            scared: false, // ★復活は通常
          };
        })
      );
    }, RESPAWN_MS);

    respawnTimersRef.current.set(ghostId, tid);
  };

  // ===== 新要素：フルーツ湧き（playing中だけ / 10秒ごと）=====
  useEffect(() => {
    if (status !== 'playing') return;

    const spawn = () => {
      for (let t = 0; t < 2500; t++) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (isWall(x, y)) continue;

        // ペン内は避ける
        if (Math.abs(x - PEN.x) <= 2 && Math.abs(y - PEN.y) <= 1) continue;

        const p = playerRef.current;
        if (p && p.x === x && p.y === y) continue;

        const gs = ghostsRef.current || [];
        if (gs.some((g) => g.state === 'alive' && g.x === x && g.y === y)) continue;

        const w = waveRef.current || [];
        if (w.some((q) => q.x === x && q.y === y)) continue;

        setFruit({
          x,
          y,
          id: `fruit_${Date.now()}_${Math.random().toString(16).slice(2)}`,
          kind: Math.random() < 0.5 ? 'cherry' : 'apple',
        });
        return;
      }
    };

    // 即湧き
    spawn();
    const id = setInterval(spawn, FRUIT_INTERVAL_MS);
    return () => clearInterval(id);
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

    // ★不備報告/レビューでは yearsAgo を見せる（要求通り）
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

      // ===== パワー残り時間チェック =====
      const isPowered = Date.now() < powerUntilRef.current;

      // ===== プレイヤー / ゴースト 加速 =====
      const pStep = isPowered ? Math.max(40, Math.floor(STEP_MS / SPEED_BOOST)) : STEP_MS;
      const gStep = isPowered ? Math.max(60, Math.floor(GHOST_STEP_MS / SPEED_BOOST)) : GHOST_STEP_MS;

      accRef.current.p += dt;
      accRef.current.g += dt;

      // ===== プレイヤー移動（タイル）=====
      if (accRef.current.p >= pStep) {
        accRef.current.p -= pStep;

        setPlayer((p0) => {
          let p = p0;

          if (p.nextDir && canMove(p, p.nextDir)) {
            p = { ...p, dir: p.nextDir };
          }

          if (p.dir && canMove(p, p.dir)) {
            const n = nextCellWithWarp(p, p.dir);
            p = { ...p, x: n.x, y: n.y };
          }

          return p;
        });
      }

      // ===== ゴースト移動（タイル）=====
      if (accRef.current.g >= gStep) {
        accRef.current.g -= gStep;

        setGhosts((gs0) => {
          const p = playerRef.current;

          return (gs0 || []).map((g0) => {
            let g = { ...g0 };
            if (g.state !== 'alive') return g; // 死亡中は表示しない＆動かない

            let opts = choicesFrom(g);
            if (!opts.length) return g;

            const atJunction = opts.length >= 3 || !canMove(g, g.dir);

            // ★ power中は scared=true の個体は「逃げるAI」
            const flee = !!g.scared && isPowered;

            if (atJunction) {
              if (flee) {
                g.dir = chooseDirAwayFromTarget(g, { x: p.x, y: p.y }, opts);
              } else if (g.kind === 'patrol') {
                const rect = g.patrolRect;
                const points = Array.isArray(g.patrolPoints) ? g.patrolPoints : [];
                let idx = Number.isFinite(g.patrolIndex) ? g.patrolIndex : 0;

                const target = points[idx] || { x: g.x, y: g.y };
                if (g.x === target.x && g.y === target.y && points.length > 0) {
                  idx = (idx + 1) % points.length;
                }

                const nextTarget = points[idx] || target;

                // rect内に収める（壁に当たる時はfallback）
                const inside = (x, y) =>
                  x >= rect.x0 && x <= rect.x1 && y >= rect.y0 && y <= rect.y1;

                let insideOpts = opts.filter((d) => {
                  const n = nextCellWithWarp(g, d);
                  return inside(n.x, n.y);
                });
                if (!insideOpts.length) insideOpts = opts;

                g.dir = chooseDirTowardTarget(g, nextTarget, insideOpts);
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
              const n = nextCellWithWarp(g, g.dir);
              g.x = n.x;
              g.y = n.y;
            } else {
              const usable = choicesFrom(g);
              if (usable.length) {
                g.dir = usable[Math.floor(Math.random() * usable.length)];
                const n = nextCellWithWarp(g, g.dir);
                if (!isWall(n.x, n.y)) {
                  g.x = n.x;
                  g.y = n.y;
                }
              }
            }

            return g;
          });
        });
      }

      // ===== フルーツ取得判定 =====
      {
        const p = playerRef.current;
        const fr = fruitRef.current;
        if (fr && fr.x === p.x && fr.y === p.y) {
          setFruit(null);
          const until = Date.now() + FRUIT_REVEAL_MS;
          setRevealAnswersUntilMs(until);
          revealRef.current = until;
        }
      }

      // ===== A〜E取得判定（順番チェック + パワー付与）=====
      {
        const p = playerRef.current;
        const currentExpected = expected;

        if (currentExpected) {
          const pelletHere = (waveRef.current || []).find((q) => q.x === p.x && q.y === p.y);

          if (pelletHere) {
            if (eatenIdsRef.current.has(pelletHere.id)) {
              rafRef.current = requestAnimationFrame(loop);
              return;
            }

            // 順番ミス
            if (pelletHere.id !== currentExpected.id) {
              eatenIdsRef.current.add(pelletHere.id);
              gameOver({ reason: '順番ミス', wrongPellet: pelletHere });
              return;
            }

            // OK
            eatenIdsRef.current.add(pelletHere.id);

            // 取った瞬間：5秒パワー（速度UP + ゴースト青化＆逃走UI + 触れれば倒せる）
            startPower();

            setWave((prev) => (prev || []).filter((q) => q.id !== pelletHere.id));
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

      // ===== ゴースト接触判定 =====
      {
        const p = playerRef.current;
        const gs = ghostsRef.current || [];

        const hit = gs.find((g) => g.state === 'alive' && g.x === p.x && g.y === p.y);
        if (hit) {
          // ★ power中で「青化対象（scared=true）」なら倒せる
          if (isPowered && hit.scared) {
            killGhost(hit.id);
          } else {
            // ★復活直後（scared=false）などは power中でも即死（仕様）
            gameOver({ reason: 'モンスターに触れた' });
            return;
          }
        }
      }

      // ===== 5個食べたら次WAVE =====
      {
        const w = waveRef.current || [];
        if (modeRef.current && w.length === 0) {
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
  }, [status, mode, expectedIndex]);

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

  // ===== HUD（preview/playing共通）=====
  const isPoweredUI = Date.now() < powerUntilMs;
  const powerLeftMs = Math.max(0, powerUntilMs - Date.now());
  const powerLeftSec = Math.ceil(powerLeftMs / 1000);

  const revealOn = Date.now() < revealAnswersUntilMs;

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
          <p className="mt-1 text-[10px] text-slate-600">A〜E取得で5秒：移動UP + 敵が青＆逃走（ただし復活個体は青じゃない）</p>
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-600 font-semibold">スコア</p>
          <p className="text-lg font-bold text-emerald-700">{score}</p>
        </div>
      </div>

      {/* パワー表示 */}
      <div className="mt-2 flex items-center justify-between text-[11px]">
        <div className="text-slate-700">
          パワー：
          <span className="ml-2 font-bold" style={{ color: isPoweredUI ? '#2563eb' : '#64748b' }}>
            {isPoweredUI ? `ON（${powerLeftSec}s）` : 'OFF'}
          </span>
        </div>
        <div className="text-slate-700">
          フルーツ：
          <span className="ml-2 font-semibold">{fruit ? (fruit.kind === 'cherry' ? '🍒' : '🍎') : '—'}</span>
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
              <span className="text-slate-900 truncate">
                {q.event}
                {revealOn && <span className="ml-2 text-emerald-700 font-black">{q.yearsAgo}</span>}
              </span>
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
              <span className="text-slate-900 truncate">
                {q.event}
                {revealOn && <span className="ml-2 text-emerald-700 font-black">{q.yearsAgo}</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {revealOn && (
        <div className="mt-2 text-[11px] text-emerald-700 font-semibold">
          フルーツを食べた！1秒だけ答え（年前）が表示中
        </div>
      )}
    </div>
  );

  // ===== A〜E（盤面）表示：reveal中だけ yearsAgo を上に出す =====
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

      {/* 答え表示（1秒） */}
      {revealOn && (
        <div
          className="absolute whitespace-nowrap pointer-events-none font-black"
          style={{
            left: Math.floor(tilePx * 0.05),
            top: -Math.floor(tilePx * 0.42),
            fontSize: Math.max(10, Math.floor(tilePx * 0.42)),
            color: 'rgba(16,185,129,0.95)',
            background: 'rgba(2,6,23,0.55)',
            padding: '1px 6px',
            borderRadius: 999,
            boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
          }}
        >
          {q.yearsAgo}
        </div>
      )}

      <div
        className="absolute whitespace-nowrap pointer-events-none"
        style={{
          left: Math.floor(tilePx * 0.05),
          top: Math.floor(tilePx * 0.92),
          maxWidth: tilePx * 4.2,
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

  // ===== プレイヤー（白ボール＋目）=====
  const PlayerSprite = ({ x, y }) => {
    const bodyColor = '#ffffff';
    const pupilColor = '#111111';

    const px = Math.max(2, Math.floor(tilePx / 8));
    const w = px * 8;
    const h = px * 8;

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

    // 目（2点）
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
        <div
          style={{
            position: 'absolute',
            inset: 0,
            filter: 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
          }}
        >
          <div style={{ position: 'absolute', inset: 0 }}>{renderBits(bodyBits, bodyColor, 1, 'body')}</div>
        </div>

        <div style={{ position: 'absolute', inset: 0 }}>{renderBits(pupilBits, pupilColor, 0.9, 'pupil')}</div>
      </div>
    );
  };

  // ===== ゴースト（青化UI / dead非表示）=====
  const GhostSprite = ({ g }) => {
    if (!g || g.state !== 'alive') return null;

    const isPoweredNow = Date.now() < powerUntilMs;
    const isBlue = !!g.scared && isPoweredNow;

    const body =
      isBlue
        ? '#2b6cff'
        : g.id === 'g_red'
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
          transform: isBlue ? 'scale(1.03)' : 'scale(1)',
          transition: 'transform 80ms linear',
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

        {isBlue && (
          <div
            className="absolute"
            style={{
              left: -Math.floor(tilePx * 0.05),
              top: -Math.floor(tilePx * 0.55),
              zIndex: 50,
              fontSize: Math.max(10, Math.floor(tilePx * 0.45)),
              color: 'rgba(37,99,235,0.95)',
              background: 'rgba(255,255,255,0.12)',
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(2px)',
              pointerEvents: 'none',
            }}
          >
            RUN
          </div>
        )}
      </div>
    );
  };

  // ===== フルーツ表示 =====
  const FruitSprite = ({ fr }) => {
    if (!fr) return null;
    const size = Math.floor(tilePx * 0.72);
    return (
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: fr.x * tilePx + Math.floor((tilePx - size) / 2),
          top: fr.y * tilePx + Math.floor((tilePx - size) / 2),
          width: size,
          height: size,
          zIndex: 10,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.12)',
          boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
          backdropFilter: 'blur(2px)',
          fontSize: Math.max(14, Math.floor(tilePx * 0.62)),
        }}
        title="fruit"
      >
        {fr.kind === 'cherry' ? '🍒' : '🍎'}
      </div>
    );
  };

  // ===== ペン（箱）表示 =====
  const PenBox = () => {
    const w = tilePx * 5;
    const h = tilePx * 3;
    const left = (PEN.x - 2) * tilePx;
    const top = (PEN.y - 1) * tilePx;

    return (
      <div
        className="absolute"
        style={{
          left,
          top,
          width: w,
          height: h,
          zIndex: 6,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
        }}
        title="respawn"
      />
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
        {/* tiles */}
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

        {/* 中央箱 */}
        <PenBox />

        {/* A〜E */}
        {(wave || []).map((q) => (
          <PelletAndLabel key={q.id} q={q} />
        ))}

        {/* フルーツ */}
        <FruitSprite fr={fruit} />

        {/* プレイヤー */}
        <PlayerSprite x={player.x} y={player.y} />

        {/* ゴースト */}
        {(ghosts || []).map((g) => (
          <GhostSprite key={g.id} g={g} />
        ))}
      </div>

      {dim && <div className="absolute inset-0" style={{ background: 'rgba(2,6,23,0.15)', zIndex: 30 }} />}
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

            <div className="text-[11px] text-slate-700 text-center">いまは準備時間（操作できません）／ 10秒後に自動で開始</div>

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

