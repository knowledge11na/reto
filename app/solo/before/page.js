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
 * ※左右ワープ（トンネル）あり
 */
const MAZE = [
  '1111111111111111111111111111', // 0
  '1000000000110000110000000001', // 1
  '1011110110110110110110111101', // 2
  '1011110110110110110110111101', // 3
  '1000000110000110000110000001', // 4
  '1011110111110110111110111101', // 5
  '1011110111110110111110111101', // 6
  '1011000000000110000000001101', // 7
  '1011011110111111110111101101', // 8
  '1011011110111111110111101101', // 9
  '0000000000000000000000000000', // 10←左右トンネル帯（ワープさせる）
  '1011110110111111110110111101', // 11
  '1011110110100000010110111101', // 12
  '1011110110100000010110111101', // 13
  '1000000110111111110110000001', // 14
  '1011110110111111110110111101', // 15
  '1011110110000000000110111101', // 16
  '1000110110111111110110110001', // 17
  '1110110110111111110110110111', // 18
  '1110110000000110000000110111', // 19
  '0000110111110110111110110000', // 20←左右トンネル帯（ワープさせる）
  '1011110111110110111110111101', // 21
  '1011110110000000000110111101', // 22
  '1000000110110110110110000001', // 23
  '1011011110110110110111101101', // 24
  '1011011110110110110111101101', // 25
  '1011000000110000110000001101', // 26
  '1011111110111111110111111101', // 27
  '1011111110111111110111111101', // 28
  '1000000000000000000000000001', // 29
  '1111111111111111111111111111', // 30
];

const ROWS = MAZE.length; // 31
const COLS = MAZE[0].length; // 28

// ===== スピード・タイミング =====
const STEP_MS = 140;
const GHOST_STEP_MS = 160;

const PREVIEW_SEC = 10;
const WAVE_FREEZE_SEC = 10;

// A〜E（問題エサ）
const PELLET_COUNT = 5;
const LETTERS = 'ABCDE'.split('');

// ===== 新要素 =====
const POWER_SEC = 5;
const SPEED_BOOST = 1.25;
const RESPAWN_MS = 3500;
const FRUIT_INTERVAL_MS = 10000;
const FRUIT_REVEAL_MS = 1000;

// ===== 固定配置 =====
const PLAYER_START = { x: 13, y: 22 };
const PEN = { x: 13, y: 13 };
const PEN_RECT = { x0: 10, x1: 17, y0: 12, y1: 16 };
const PEN_EXIT = { x: 13, y: 11 };
const PEN_DOORS = new Set([`${PEN_EXIT.x},${PEN_EXIT.y}`]);

const MAP_IMG_SRC = '/before/before_map.png';

function inPen(x, y) {
  return x >= PEN_RECT.x0 && x <= PEN_RECT.x1 && y >= PEN_RECT.y0 && y <= PEN_RECT.y1;
}

const GHOST_STARTS = [
  { id: 'g_red', x: 15, y: 13, dir: 'UP', kind: 'chase' },
  { id: 'g_pink', x: 12, y: 13, dir: 'UP', kind: 'ambush' },
  { id: 'g_yellow', x: 14, y: 13, dir: 'UP', kind: 'patrol' },
  { id: 'g_green', x: 13, y: 13, dir: 'UP', kind: 'random' },
];

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function isWall(x, y) {
  if (y < 0 || y >= ROWS || x < 0 || x >= COLS) return true;
  if (PEN_DOORS.has(`${x},${y}`)) return false;
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
 * 左右ワープ（トンネル）対応
 */
function nextCellWithWarp(pos, dir) {
  const v = dirToVec(dir);
  let nx = pos.x + v.dx;
  let ny = pos.y + v.dy;

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
  const maxTry = 900;

  const isOkCell = (x, y, forbid) => {
    if (isWall(x, y)) return false;
    const key = `${x},${y}`;
    if (forbid.has(key)) return false;
    const n =
      (isWall(x + 1, y) ? 1 : 0) +
      (isWall(x - 1, y) ? 1 : 0) +
      (isWall(x, y + 1) ? 1 : 0) +
      (isWall(x, y - 1) ? 1 : 0);
    if (n >= 3) return false;
    return true;
  };

  const farthestPick = (pool, k) => {
    if (pool.length === 0) return [];
    const picked = [];
    picked.push(pool[Math.floor(Math.random() * pool.length)]);

    while (picked.length < k) {
      let best = null;
      let bestScore = -1;

      for (const c of pool) {
        if (picked.some((p) => p.x === c.x && p.y === c.y)) continue;

        let minD = Infinity;
        for (const p of picked) {
          const d = Math.abs(c.x - p.x) + Math.abs(c.y - p.y);
          if (d < minD) minD = d;
        }
        if (minD > bestScore) {
          bestScore = minD;
          best = c;
        }
      }

      if (!best) break;
      picked.push(best);
    }

    return picked.slice(0, k);
  };

  for (let attempt = 0; attempt < maxTry; attempt++) {
    const forbid = new Set(forbiddenSet);

    const pool = [];
    let guard = 0;
    while (pool.length < 800 && guard < 20000) {
      guard++;
      const x = Math.floor(Math.random() * COLS);
      const y = Math.floor(Math.random() * ROWS);
      if (!isOkCell(x, y, forbid)) continue;
      pool.push({ x, y });
      forbid.add(`${x},${y}`);
    }

    if (pool.length < count) continue;

    const cells = farthestPick(pool, count);
    if (cells.length < count) continue;

    const placed = orderCells.map((it, idx) => ({ ...it, x: cells[idx].x, y: cells[idx].y }));

    let ok = true;
    let curPos = { ...startPos };

    for (let i = 0; i < placed.length; i++) {
      const target = placed[i];

      const blocked = new Set();
      for (let j = i + 1; j < placed.length; j++) blocked.add(`${placed[j].x},${placed[j].y}`);

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
  const forbid = new Set(forbiddenSet);
  while (cellsFallback.length < count) {
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);
    if (!isOkCell(x, y, forbid)) continue;
    forbid.add(`${x},${y}`);
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

  // ===== パワー =====
  const [powerUntilMs, setPowerUntilMs] = useState(0);
  const powerUntilRef = useRef(0);
  useEffect(() => {
    powerUntilRef.current = powerUntilMs;
  }, [powerUntilMs]);

  // ===== フルーツ =====
  const [fruit, setFruit] = useState(null);
  const fruitRef = useRef(null);
  useEffect(() => {
    fruitRef.current = fruit;
  }, [fruit]);

  // ===== 答え表示（1秒）=====
  const [revealAnswersUntilMs, setRevealAnswersUntilMs] = useState(0);
  const revealRef = useRef(0);
  useEffect(() => {
    revealRef.current = revealAnswersUntilMs;
  }, [revealAnswersUntilMs]);

  // ===== 倒したゴースト復活 =====
  const respawnTimersRef = useRef(new Map());
  useEffect(() => {
    return () => {
      for (const tid of respawnTimersRef.current.values()) clearTimeout(tid);
      respawnTimersRef.current.clear();
    };
  }, []);

  // ===== 次WAVE生成時の停止 =====
  const [waveFreezeUntilMs, setWaveFreezeUntilMs] = useState(0);
  const waveFreezeUntilRef = useRef(0);
  useEffect(() => {
    waveFreezeUntilRef.current = waveFreezeUntilMs;
  }, [waveFreezeUntilMs]);

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

  const pelletLabelFont = Math.max(10, Math.floor(tilePx * 0.42));

  // ===== スマホ判定（coarse pointer or touch）=====
  const isCoarse = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      if (window.matchMedia?.('(pointer:coarse)').matches) return true;
      if (navigator?.maxTouchPoints && navigator.maxTouchPoints > 0) return true;
    } catch {}
    return false;
  }, []);

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

  // ===== wave順序 =====
  const ordered = useMemo(() => {
    const arr = [...(wave || [])];
    if (!mode) return arr;
    if (mode === 'OLD') return arr.sort((a, b) => b.yearsAgo - a.yearsAgo);
    return arr.sort((a, b) => a.yearsAgo - b.yearsAgo);
  }, [wave, mode]);

  const expected = ordered[0] || null;

  const startYears = useMemo(() => formatStartYears(mode, wave), [mode, wave]);

  const compactLegend = useMemo(() => {
    const arr = [...(wave || [])].sort((a, b) => (a.letter < b.letter ? -1 : 1));
    const left = arr.slice(0, Math.ceil(arr.length / 2));
    const right = arr.slice(Math.ceil(arr.length / 2));
    return { left, right };
  }, [wave]);

  const isWaveFrozen = (waveFreezeUntilRef.current || 0) > Date.now();
  const waveFreezeLeft = isWaveFrozen
    ? Math.max(0, Math.ceil((waveFreezeUntilRef.current - Date.now()) / 1000))
    : 0;

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

  // ===== ゴースト初期化 =====
  const resetActors = () => {
    setPlayer({ x: PLAYER_START.x, y: PLAYER_START.y, dir: 'LEFT', nextDir: 'LEFT' });
    setPowerUntilMs(0);
    powerUntilRef.current = 0;

    setFruit(null);
    setRevealAnswersUntilMs(0);
    revealRef.current = 0;

    setWaveFreezeUntilMs(0);
    waveFreezeUntilRef.current = 0;

    const gs = GHOST_STARTS.map((g) => ({
      ...g,
      state: 'alive',
      scared: false,

      penMode: inPen(g.x, g.y),
      leaveAt: Date.now() + 30,

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

  // ===== wave生成 =====
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
    const pNow = playerRef.current || PLAYER_START;
    forbidden.add(`${pNow.x},${pNow.y}`);

    for (let yy = PEN.y - 1; yy <= PEN.y + 1; yy++) {
      for (let xx = PEN.x - 2; xx <= PEN.x + 2; xx++) {
        forbidden.add(`${xx},${yy}`);
      }
    }

    for (const g of ghostsRef.current || []) {
      if (g?.state === 'alive') forbidden.add(`${g.x},${g.y}`);
    }

    const cells = pickEmptyCellsValidated(orderForCheck.length, forbidden, orderForCheck, pNow);

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

  // ===== パワー開始 =====
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

  // ===== ゴースト撃破→復活 =====
  const killGhost = (ghostId) => {
    const old = respawnTimersRef.current.get(ghostId);
    if (old) clearTimeout(old);

    setGhosts((gs) => (gs || []).map((g) => (g.id === ghostId ? { ...g, state: 'dead' } : g)));

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
            scared: false,
            penMode: true,
            leaveAt: Date.now() + 30,
          };
        })
      );
    }, RESPAWN_MS);

    respawnTimersRef.current.set(ghostId, tid);
  };

  // ===== フルーツ湧き =====
  useEffect(() => {
    if (status !== 'playing') return;
    if (isWaveFrozen) return;

    const spawn = () => {
      if ((waveFreezeUntilRef.current || 0) > Date.now()) return;

      for (let t = 0; t < 2500; t++) {
        const x = Math.floor(Math.random() * COLS);
        const y = Math.floor(Math.random() * ROWS);
        if (isWall(x, y)) continue;

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
          kind: ['apple', 'cherry', 'orange', 'melon'][Math.floor(Math.random() * 4)],
        });
        return;
      }
    };

    spawn();
    const id = setInterval(spawn, FRUIT_INTERVAL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, isWaveFrozen]);

  // ===== 次WAVEを追加して停止 =====
  const spawnNextWaveAndFreeze = () => {
    const m = modeRef.current;
    if (!m) return;

    makeWave(m);

    const until = Date.now() + WAVE_FREEZE_SEC * 1000;
    setWaveFreezeUntilMs(until);
    waveFreezeUntilRef.current = until;
  };

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
    const idx = 0;

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

      if ((waveFreezeUntilRef.current || 0) > Date.now()) {
        accRef.current = { p: 0, g: 0 };
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      accRef.current.p += dt;
      accRef.current.g += dt;

      {
        const pu = powerUntilRef.current || 0;
        if (pu > 0 && Date.now() > pu) {
          powerUntilRef.current = 0;
          setPowerUntilMs(0);
          setGhosts((gs) => (gs || []).map((g) => (g.state === 'alive' ? { ...g, scared: false } : g)));
        }
      }

      {
        const boosted = (powerUntilRef.current || 0) > Date.now();
        const pStep = boosted ? Math.max(60, Math.floor(STEP_MS / SPEED_BOOST)) : STEP_MS;

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
      }

      if (accRef.current.g >= GHOST_STEP_MS) {
        accRef.current.g -= GHOST_STEP_MS;

        setGhosts((gs0) => {
          const gs1 = (gs0 || []).map((g0) => {
            if (g0.state !== 'alive') return g0;

            let g = { ...g0 };
            const p = playerRef.current;

            let opts = choicesFrom(g);
            if (opts.length === 0) return g;

            if (g.penMode) {
              g.dir = chooseDirTowardTarget(g, PEN_EXIT, opts);
            } else {
              const atJunction = opts.length >= 3 || !canMove(g, g.dir);

              if (g.scared) {
                if (atJunction) g.dir = chooseDirAwayFromTarget(g, { x: p.x, y: p.y }, opts);
              } else if (g.kind === 'ambush') {
                const target = findLookaheadTarget(p, 6);
                g.dir = chooseDirTowardTarget(g, target, opts);
              } else if (atJunction) {
                if (g.kind === 'patrol') {
                  const rect = g.patrolRect;
                  const points = Array.isArray(g.patrolPoints) ? g.patrolPoints : [];
                  let idx = Number.isFinite(g.patrolIndex) ? g.patrolIndex : 0;

                  const target = points[idx] || { x: g.x, y: g.y };
                  if (g.x === target.x && g.y === target.y && points.length > 0) {
                    idx = (idx + 1) % points.length;
                  }

                  const nextTarget = points[idx] || target;

                  let filtered = opts.filter((d) => {
                    const n = nextCellWithWarp(g, d);
                    return (
                      n.x >= rect.x0 &&
                      n.x <= rect.x1 &&
                      n.y >= rect.y0 &&
                      n.y <= rect.y1 &&
                      !isWall(n.x, n.y)
                    );
                  });
                  if (filtered.length === 0) filtered = opts;

                  g.dir = chooseDirTowardTarget(g, nextTarget, filtered);
                  g.patrolIndex = idx;
                } else if (g.kind === 'chase') {
                  g.dir = chooseDirTowardTarget(g, { x: p.x, y: p.y }, opts);
                } else {
                  const opp = oppositeDir(g.dir);
                  const filtered = opts.filter((d) => d !== opp);
                  const usable = filtered.length ? filtered : opts;
                  g.dir = usable[Math.floor(Math.random() * usable.length)];
                }
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

            if (g.penMode) {
              if (!inPen(g.x, g.y) || (g.x === PEN_EXIT.x && g.y === PEN_EXIT.y)) {
                g.penMode = false;
              }
            }

            return g;
          });

          return gs1;
        });
      }

      {
        const p = playerRef.current;
        const f = fruitRef.current;
        if (f && p.x === f.x && p.y === f.y) {
          setFruit(null);
          fruitRef.current = null;
          const until = Date.now() + FRUIT_REVEAL_MS;
          setRevealAnswersUntilMs(until);
          revealRef.current = until;
        }
      }

      {
        const p = playerRef.current;
        const gs = ghostsRef.current || [];
        const hit = gs.find((g) => g.state === 'alive' && g.x === p.x && g.y === p.y);

        if (hit) {
          if (hit.scared) {
            killGhost(hit.id);
          } else {
            gameOver({ reason: 'ゴーストに触れた' });
            return;
          }
        }
      }

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

            if (pelletHere.id !== currentExpected.id) {
              eatenIdsRef.current.add(pelletHere.id);
              gameOver({ reason: '順番ミス', wrongPellet: pelletHere });
              return;
            }

            eatenIdsRef.current.add(pelletHere.id);
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
          }
        }
      }

      {
        const w = waveRef.current || [];
        if (modeRef.current && w.length === 0) {
          spawnNextWaveAndFreeze();
          rafRef.current = requestAnimationFrame(loop);
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
  }, [status, mode, expectedIndex, expected]);

  // ==========================
  // ===== UIコンポーネント =====
  // ==========================
  const showReveal = (revealRef.current || 0) > Date.now();

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

          <p className="mt-1 text-[10px] text-slate-600">
            A〜E取得：5秒スピードUP / ゴースト青化（この瞬間に生存してた個体だけ）
          </p>
          <p className="text-[10px] text-slate-600">フルーツ：1秒だけ答え表示</p>
          {isWaveFrozen && (
            <p className="mt-1 text-[10px] font-bold text-indigo-700">
              次のWAVE準備中：{waveFreezeLeft}s（停止中）
            </p>
          )}
        </div>

        <div className="text-right">
          <p className="text-xs text-slate-600 font-semibold">スコア</p>
          <p className="text-lg font-bold text-emerald-700">{score}</p>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] leading-snug">
        {[compactLegend.left, compactLegend.right].map((side, idx) => (
          <div key={idx} className="space-y-1">
            {side.map((q) => (
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

                <div className="min-w-0">
                  <div className="text-slate-900 truncate" title={q.event}>
                    {q.event}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  // ===== 盤面スワイプ（Board直刺し）=====
  const gestureRef = useRef({ active: false, sx: 0, sy: 0, decided: false });

  const decideDir = (dx, dy) => {
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return null;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'RIGHT' : 'LEFT';
    return dy > 0 ? 'DOWN' : 'UP';
  };

  const onBoardPointerDown = (e) => {
    if (status !== 'playing') return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    gestureRef.current.active = true;
    gestureRef.current.sx = e.clientX;
    gestureRef.current.sy = e.clientY;
    gestureRef.current.decided = false;

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    e.preventDefault?.();
  };

  const onBoardPointerMove = (e) => {
    if (status !== 'playing') return;
    const g = gestureRef.current;
    if (!g.active) return;

    const dx = e.clientX - g.sx;
    const dy = e.clientY - g.sy;

    const d = decideDir(dx, dy);
    if (d && !g.decided) {
      g.decided = true;
      pushDir(d);
    }

    if (g.decided && (Math.abs(dx) > 55 || Math.abs(dy) > 55)) {
      g.sx = e.clientX;
      g.sy = e.clientY;
      g.decided = false;
    }

    e.preventDefault?.();
  };

  const onBoardPointerUp = (e) => {
    gestureRef.current.active = false;
    gestureRef.current.decided = false;
    e.preventDefault?.();
  };

  // ===== Board =====
  const Board = ({ dim }) => {
    const bw = tilePx * COLS;
    const bh = tilePx * ROWS;

    const t3d = (x, y) => `translate3d(${x}px, ${y}px, 0)`;
    const isMobileLite = isCoarse;

// ==== 背景画像の微調整（px単位）====
// +x で右へ、+y で下へ
const MAP_ADJUST = {
  x: -5,   // 例: 2
  y: -5,   // 例: -3
  scale: 1.0, // 例: 1.01
};


    // ===== A〜E（丸＋ラベル）=====
    const PelletAndLabel = ({ q }) => {
      const LABEL_W = Math.floor(tilePx * 6.6);
      const LABEL_H = Math.floor(tilePx * 1.9);
      const PAD = Math.floor(tilePx * 0.2);

      const boardW = bw;
      const boardH = bh;

      let labelLeft = Math.floor(tilePx * -0.2);
      let labelTop = Math.floor(tilePx * 0.95);

      const labelAbsX = q.x * tilePx + labelLeft;
      if (labelAbsX + LABEL_W > boardW - PAD) {
        labelLeft = boardW - PAD - LABEL_W - q.x * tilePx;
      }
      if (q.x * tilePx + labelLeft < PAD) {
        labelLeft = PAD - q.x * tilePx;
      }

      const labelAbsY = q.y * tilePx + labelTop;
      if (labelAbsY + LABEL_H > boardH - PAD) {
        labelTop = Math.floor(tilePx * -1.25);
      }

      return (
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            transform: t3d(q.x * tilePx, q.y * tilePx),
            zIndex: 10,
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        >
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

          {showReveal && (
            <div
              className="absolute font-black"
              style={{
                left: Math.floor(tilePx * 0.05),
                top: Math.floor(tilePx * -0.28),
                padding: '2px 6px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.92)',
                color: 'rgba(2,6,23,0.95)',
                fontSize: Math.max(10, Math.floor(tilePx * 0.36)),
                boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
              }}
            >
              {q.yearsAgo}
            </div>
          )}

          <div
            className="absolute pointer-events-none"
            style={{
              left: labelLeft,
              top: labelTop,
              width: LABEL_W,
              padding: '2px 6px',
              borderRadius: 10,
              fontSize: Math.max(10, pelletLabelFont),
              lineHeight: 1.15,
              color: 'rgba(255,255,255,0.92)',
              background: 'rgba(0,0,0,0.40)',
              backdropFilter: isMobileLite ? 'none' : 'blur(2px)',
              whiteSpace: 'normal',
              wordBreak: 'break-word',
              boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
            }}
          >
            {q.event}
          </div>
        </div>
      );
    };

    // ===== プレイヤー/ゴースト/フルーツ =====
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

      const tx = x * tilePx + Math.floor((tilePx - w) / 2);
      const ty = y * tilePx + Math.floor((tilePx - h) / 2);

      return (
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            transform: t3d(tx, ty),
            width: w,
            height: h,
            zIndex: 12,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
          title="player"
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              filter: isMobileLite ? 'none' : 'drop-shadow(0 6px 10px rgba(0,0,0,0.45))',
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>{renderBits(bodyBits, bodyColor, 1, 'body')}</div>
          </div>

          <div style={{ position: 'absolute', inset: 0 }}>{renderBits(eyeBits, '#ffffff', 0.95, 'eye')}</div>
          <div style={{ position: 'absolute', inset: 0 }}>{renderBits(pupilBits, pupilColor, 0.9, 'pupil')}</div>
        </div>
      );
    };

    const GhostSprite = ({ g }) => {
      if (g.state !== 'alive') return null;

      const normal =
        g.id === 'g_red'
          ? '#ff4d4d'
          : g.id === 'g_yellow'
            ? '#ffd400'
            : g.id === 'g_pink'
              ? '#ff66cc'
              : '#33dd77';

      const body = g.scared ? '#3b82f6' : normal;

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

      const tx = g.x * tilePx + Math.floor((tilePx - w) / 2);
      const ty = g.y * tilePx + Math.floor((tilePx - h) / 2);

      return (
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            transform: t3d(tx, ty),
            width: w,
            height: h,
            zIndex: 11,
            imageRendering: 'pixelated',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
          title="ghost"
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              filter: isMobileLite ? 'none' : 'drop-shadow(0 6px 8px rgba(0,0,0,0.45))',
            }}
          >
            <div style={{ position: 'absolute', inset: 0 }}>{renderBits(ghostBits, body)}</div>
          </div>

          <div style={{ position: 'absolute', inset: 0 }}>{renderBits(eyeBits, 'white', 0.95)}</div>
          <div style={{ position: 'absolute', inset: 0 }}>{renderBits(pupilBits, '#111', 0.9)}</div>
        </div>
      );
    };

    const FruitSprite = ({ f }) => {
      if (!f) return null;

      const emoji =
        f.kind === 'apple' ? '🍎' : f.kind === 'cherry' ? '🍒' : f.kind === 'orange' ? '🍊' : '🍈';

      return (
        <div
          className="absolute"
          style={{
            left: 0,
            top: 0,
            transform: t3d(f.x * tilePx, f.y * tilePx),
            zIndex: 10,
            pointerEvents: 'none',
            width: tilePx,
            height: tilePx,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.max(14, Math.floor(tilePx * 0.9)),
            filter: isMobileLite ? 'none' : 'drop-shadow(0 6px 8px rgba(0,0,0,0.45))',
            willChange: 'transform',
          }}
          title={f.kind}
        >
          {emoji}
        </div>
      );
    };

    return (
      <div
        ref={boardRef}
        onPointerDown={onBoardPointerDown}
        onPointerMove={onBoardPointerMove}
        onPointerUp={onBoardPointerUp}
        onPointerCancel={onBoardPointerUp}
        className="relative rounded-2xl overflow-hidden border border-slate-700/60 shadow-lg"
        style={{
          width: '100%',
          maxWidth: 520,
          aspectRatio: `${COLS}/${ROWS}`,
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          pointerEvents: 'auto',

          // ★スマホで効くやつ
          transform: 'translateZ(0)',
          contain: 'layout paint size',
          background: 'rgba(0,0,0,1)',
        }}
      >
        {/* ★壁/背景は画像に一本化（PC/スマホ共通） */}
       <img
  src={MAP_IMG_SRC}
  alt=""
  draggable={false}
  className="absolute inset-0 w-full h-full"
  style={{
    pointerEvents: 'none',
    transformOrigin: 'center center',
    transform: `translate3d(${MAP_ADJUST.x}px, ${MAP_ADJUST.y}px, 0) scale(${MAP_ADJUST.scale})`,
    imageRendering: 'auto',
    // まずは "fill" 維持（歪みが気になるなら下の 3) を使う）
    objectFit: 'fill',
  }}
/>


        {/* 盤面上のスプライト類 */}
        <div
          className="absolute inset-0"
          style={{
            width: bw,
            height: bh,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        >
          {(wave || []).map((q) => (
            <PelletAndLabel key={q.id} q={q} />
          ))}
          <FruitSprite f={fruit} />
          <PlayerSprite x={player.x} y={player.y} />
          {(ghosts || []).map((g) => (
            <GhostSprite key={g.id} g={g} />
          ))}
        </div>

        {dim && <div className="absolute inset-0" style={{ background: 'rgba(2,6,23,0.15)', zIndex: 30 }} />}
        {isWaveFrozen && <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.12)', zIndex: 40 }} />}
      </div>
    );
  };

  // ===== UI分岐 =====
  if (status === 'loading') {
    return (
      <SoloLayout title="（時系列）">
        <p className="text-sm text-slate-800 bg-white/90 rounded-xl px-4 py-3 inline-block">読み込み中...</p>
      </SoloLayout>
    );
  }

  if (status === 'finished') {
    return (
      <SoloLayout title="（時系列）">
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
            <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
              {message}
            </p>
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
      <SoloLayout title="時系列">
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
            <p className="mt-3 text-xs text-slate-600">次：10秒だけ問題を表示してからスタート</p>
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

  if (status === 'preview') {
    return (
      <SoloLayout title="時系列">
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
  const boosted = (powerUntilRef.current || 0) > Date.now();
  const powerLeft = boosted ? Math.max(0, Math.ceil((powerUntilRef.current - Date.now()) / 1000)) : 0;

  return (
    <SoloLayout title="時系列">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-600 font-semibold">自己ベスト</p>
            <p className="text-sm font-bold text-slate-800">{bestScore}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600 font-semibold">操作</p>
            <p className="text-[11px] text-slate-700">盤面スワイプ（PCは矢印）</p>
            {boosted && <p className="text-[11px] font-bold text-sky-700">パワー残り {powerLeft}s</p>}
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
