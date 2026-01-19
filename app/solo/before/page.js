// file: app/solo/before/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const GAME_W = 360;
const GAME_H = 520;

// ====== 迷路（0=通路, 1=壁） ======
// シンプルだけど「パックマンっぽく遊べる」固定迷路
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

const TILE = 1; // ここは論理タイル。描画はコンテナに合わせてスケール

const STEP_MS = 140; // プレイヤー 1タイル移動速度
const GHOST_STEP_MS = 170; // ゴースト速度（少し遅め）

const LETTERS = 'ABCDEFGHIJ'.split('');

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

// yearsAgo：数字が大きいほど古い
// ルール：同じyearsAgoは同じ回に出さない（= wave内でユニーク）
function buildYearMap(list) {
  const m = new Map(); // yearsAgo -> [{event, yearsAgo}, ...]
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

// 「時系列が近い10個」を、ユニークyearsAgoで作る
function pickWaveNear10(list, rng = Math.random) {
  const yearMap = buildYearMap(list);
  const years = Array.from(yearMap.keys()).sort((a, b) => a - b); // 小=新しい → 大=古い
  if (years.length === 0) return [];

  // 取りたい数（最大10）
  const want = Math.min(10, years.length);

  // 近い10個 = yearsの連続ウィンドウ
  const maxStart = Math.max(0, years.length - want);
  const start = Math.floor(rng() * (maxStart + 1));
  const windowYears = years.slice(start, start + want);

  // 同じyearsAgoはwave内で出さない（ここはyears自体がユニークなのでOK）
  // 同yearsに複数eventがある場合は、その中からランダムに1つ
  const picked = windowYears.map((y) => {
    const arr = yearMap.get(y) || [];
    const idx = Math.floor(rng() * arr.length);
    return arr[idx] || { event: String(y), yearsAgo: y };
  });

  return picked;
}

function pickEmptyCells(count, forbiddenSet) {
  const cells = [];
  const tries = 4000;
  let t = 0;

  while (cells.length < count && t < tries) {
    t++;
    const x = Math.floor(Math.random() * COLS);
    const y = Math.floor(Math.random() * ROWS);

    if (isWall(x, y)) continue;

    const key = `${x},${y}`;
    if (forbiddenSet.has(key)) continue;

    // 周辺が詰まりすぎると置きづらいので、少しだけ制約（任意）
    const n =
      (isWall(x + 1, y) ? 1 : 0) +
      (isWall(x - 1, y) ? 1 : 0) +
      (isWall(x, y + 1) ? 1 : 0) +
      (isWall(x, y - 1) ? 1 : 0);
    if (n >= 3) continue;

    forbiddenSet.add(key);
    cells.push({ x, y });
  }

  return cells;
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

function SoloLayout({ title, children }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <header className="mb-3 flex items-center justify-between">
          <h1 className="text-xl sm:text-2xl font-bold">{title}</h1>
          <Link href="/" className="text-xs text-sky-700 hover:underline">
            ホームへ戻る
          </Link>
        </header>
        {children}
      </div>
    </main>
  );
}

function TouchPad({ onDir }) {
  // スマホ用：押してる間は同じ方向を出し続けたいので pointerdown/up で制御
  const holdRef = useRef({ dir: null, timer: null });

  const startHold = (dir) => {
    onDir(dir);
    holdRef.current.dir = dir;
    if (holdRef.current.timer) clearInterval(holdRef.current.timer);
    holdRef.current.timer = setInterval(() => onDir(dir), 90);
  };

  const stopHold = () => {
    holdRef.current.dir = null;
    if (holdRef.current.timer) clearInterval(holdRef.current.timer);
    holdRef.current.timer = null;
  };

  useEffect(() => {
    return () => stopHold();
  }, []);

  const Btn = ({ label, dir }) => (
    <button
      type="button"
      className="w-16 h-12 rounded-xl border border-slate-300 bg-white text-slate-900 font-black shadow-sm active:scale-[0.98]"
      onPointerDown={(e) => {
        e.preventDefault();
        startHold(dir);
      }}
      onPointerUp={(e) => {
        e.preventDefault();
        stopHold();
      }}
      onPointerCancel={(e) => {
        e.preventDefault();
        stopHold();
      }}
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  );

  return (
    <div className="select-none" style={{ touchAction: 'none' }}>
      <div className="flex justify-center">
        <Btn label="▲" dir="UP" />
      </div>
      <div className="flex justify-center gap-3 mt-2">
        <Btn label="◀" dir="LEFT" />
        <Btn label="▼" dir="DOWN" />
        <Btn label="▶" dir="RIGHT" />
      </div>
      <p className="mt-2 text-[11px] text-slate-600 text-center">
        スマホ：ボタン押しっぱなしで移動（PCは矢印キーでもOK）
      </p>
    </div>
  );
}

export default function BeforePacmanPage() {
  const [status, setStatus] = useState('loading'); // loading | choose | playing | finished
  const [message, setMessage] = useState('');

  const [rawList, setRawList] = useState([]);

  const [wave, setWave] = useState([]); // [{event, yearsAgo, letter, x, y, id}]
  const [mode, setMode] = useState(null); // 'OLD' or 'NEW'
  const [expectedIndex, setExpectedIndex] = useState(0);

  const [score, setScore] = useState(0);
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const [bestScore, setBestScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [answerHistory, setAnswerHistory] = useState([]);

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
    return clamp(s, 12, 26);
  }, [boardRect.w, boardRect.h]);

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

  // ===== next pellet order =====
  const ordered = useMemo(() => {
    const arr = [...(wave || [])];
    if (!mode) return arr;
    if (mode === 'OLD') {
      // 古い順：yearsAgo 大きい -> 小さい
      return arr.sort((a, b) => b.yearsAgo - a.yearsAgo);
    }
    // 新しい順：yearsAgo 小さい -> 大きい
    return arr.sort((a, b) => a.yearsAgo - b.yearsAgo);
  }, [wave, mode]);

  const expected = ordered[expectedIndex] || null;

  // ===== 初期化（best読み込み + データ取得）=====
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
        // wave生成 → モード選択へ
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
    const gs = [
      { id: 'g1', x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2), dir: 'LEFT', kind: 'chase' },
      { id: 'g2', x: Math.floor(COLS / 2) - 1, y: Math.floor(ROWS / 2), dir: 'RIGHT', kind: 'random' },
      { id: 'g3', x: Math.floor(COLS / 2) + 1, y: Math.floor(ROWS / 2), dir: 'UP', kind: 'random' },
      { id: 'g4', x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) + 1, dir: 'DOWN', kind: 'random' },
    ].filter((g) => !isWall(g.x, g.y));
    setGhosts(gs);
  };

  const makeWave = () => {
    const picked = pickWaveNear10(rawList);
    // pellet配置
    const forbidden = new Set();
    forbidden.add('1,1');
    forbidden.add(`${Math.floor(COLS / 2)},${Math.floor(ROWS / 2)}`);
    forbidden.add(`${Math.floor(COLS / 2) - 1},${Math.floor(ROWS / 2)}`);
    forbidden.add(`${Math.floor(COLS / 2) + 1},${Math.floor(ROWS / 2)}`);
    forbidden.add(`${Math.floor(COLS / 2)},${Math.floor(ROWS / 2) + 1}`);

    const cells = pickEmptyCells(picked.length, forbidden);

    const wave2 = picked.map((it, idx) => {
      const c = cells[idx] || { x: 2 + idx, y: 2 };
      const letter = LETTERS[idx] || '?';
      const id = `p_${it.yearsAgo}_${idx}_${Math.random().toString(16).slice(2)}`;
      return { ...it, letter, x: c.x, y: c.y, id };
    });

    setWave(wave2);
    setExpectedIndex(0);
  };

  // ===== モード決定して開始（または次waveへ）=====
  const startWaveWithMode = (m) => {
    setMode(m);
    setMessage('');
    resetActors();
    makeWave();
    setStatus('playing');
  };

  const nextWave = () => {
    // 次の10個を「追加」扱いにしたいけど、画面が渋滞するので
    // ルールの意図を守りつつ、実装は「次waveへ切替」で同じ体験にする
    setMode(null);
    setStatus('choose');
  };

  // ===== 入力（キーボード + タッチ）=====
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // ===== ゲームオーバー =====
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

    // 間違いエサを踏んだ時は、その1問も履歴に入れる（不備報告に出る）
    if (wrongPellet && expected) {
      setAnswerHistory((prev) => [
        ...prev,
        {
          question_id: `before_${wrongPellet.id}`,
          text: `順番ミス`,
          userAnswerText: `${wrongPellet.letter}：${wrongPellet.event}（${wrongPellet.yearsAgo}年前）`,
          correctAnswerText: `${expected.letter}：${expected.event}（${expected.yearsAgo}年前）`,
        },
      ]);
    }
  };

  // ===== メインループ（プレイヤー＆ゴースト移動 + 当たり判定）=====
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

      // ===== プレイヤー移動（タイル単位）=====
      if (accRef.current.p >= STEP_MS) {
        accRef.current.p -= STEP_MS;

        setPlayer((p0) => {
          let p = p0;

          // nextDirが行けるなら向きを変える
          if (p.nextDir && canMove(p, p.nextDir)) {
            p = { ...p, dir: p.nextDir };
          }

          // 現dirで進めるなら進む
          if (p.dir && canMove(p, p.dir)) {
            const n = nextCell(p, p.dir);
            p = { ...p, x: n.x, y: n.y };
          }

          return p;
        });
      }

      // ===== ゴースト移動 =====
      if (accRef.current.g >= GHOST_STEP_MS) {
        accRef.current.g -= GHOST_STEP_MS;

        setGhosts((gs0) => {
          const p = playerRef.current;

          const gs1 = (gs0 || []).map((g0, idx) => {
            let g = { ...g0 };
            const opts = choicesFrom(g);

            if (opts.length === 0) return g;

            // 交差点っぽい（3方向以上）なら選択
            const atJunction = opts.length >= 3 || !canMove(g, g.dir);

            if (atJunction) {
              const opp = oppositeDir(g.dir);
              const filtered = opts.filter((d) => d !== opp);
              const usable = filtered.length ? filtered : opts;

              if (g.kind === 'chase' && Math.random() < 0.72) {
                // 追跡：マンハッタン距離が最小になる方向を優先
                let best = usable[0];
                let bestScore = Infinity;
                for (const d of usable) {
                  const n = nextCell(g, d);
                  const sc = manhattan(n, p);
                  if (sc < bestScore) {
                    bestScore = sc;
                    best = d;
                  }
                }
                g.dir = best;
              } else {
                // ランダム
                g.dir = usable[Math.floor(Math.random() * usable.length)];
              }
            }

            // 進む
            if (canMove(g, g.dir)) {
              const n = nextCell(g, g.dir);
              g.x = n.x;
              g.y = n.y;
            } else {
              // 行けないなら適当に
              const usable = opts;
              g.dir = usable[Math.floor(Math.random() * usable.length)];
              const n = nextCell(g, g.dir);
              if (!isWall(n.x, n.y)) {
                g.x = n.x;
                g.y = n.y;
              }
            }

            return g;
          });

          return gs1;
        });
      }

      // ===== 当たり判定 =====
      // ゴーストに触れたら即死
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
            if (pelletHere.id !== currentExpected.id) {
              gameOver({ reason: '順番ミス', wrongPellet: pelletHere });
              return;
            }

            // 正解：食べる
            setWave((prev) => prev.filter((q) => q.id !== pelletHere.id));

            setAnswerHistory((prev) => [
              ...prev,
              {
                question_id: `before_${pelletHere.id}`,
                text: `順番OK`,
                userAnswerText: `${pelletHere.letter}：${pelletHere.event}（${pelletHere.yearsAgo}年前）`,
                correctAnswerText: `${pelletHere.letter}：${pelletHere.event}（${pelletHere.yearsAgo}年前）`,
              },
            ]);

            setScore((s) => {
              const ns = s + 1;
              scoreRef.current = ns;
              return ns;
            });

            setExpectedIndex((i) => i + 1);
          }
        }
      }

      // 10個食べたら次wave（chooseに戻す）
      {
        // expectedIndex が 10 になっていたら wave消えてるはず
        // ただし state更新の順序ずれに備えて、waveが空でも判定
        const w = wave || [];
        if (mode && w.length === 0) {
          // 次の10個は「近い10個をランダム」→ 再度順序選択させる
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, mode, expectedIndex, wave]);

  // expectedIndex を進めたら expected がズレるので補正（wave削除→order再計算後にOK）
  useEffect(() => {
    if (status !== 'playing') return;
    if (!mode) return;

    // ordered は waveから作るので、削除後に expectedIndex が残ってると
    // 次の expected が一つ詰まる → expectedIndexは「食べた数」なので正しい。
    // waveが消えた時に chooseへ戻す処理はループ側でやってる。
  }, [status, mode, ordered, expectedIndex]);

  // ===== UI: 上の「A〜J: 出来事」 =====
  const letterLines = useMemo(() => {
    const arr = [...(wave || [])].sort((a, b) => (a.letter < b.letter ? -1 : 1));
    return arr;
  }, [wave]);

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
        <div className="mt-4 max-w-md mx-auto bg-white/95 rounded-2xl shadow-lg border border-slate-200 p-4 sm:p-6 space-y-3">
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

  // choose（毎waveの開始前に「古い順 / 新しい順」を選ばせる）
  if (status === 'choose') {
    return (
      <SoloLayout title="パックマン（時系列）">
        <div className="max-w-2xl mx-auto space-y-3">
          <div className="bg-white/95 rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-sm text-slate-800 font-semibold">ルール</p>
            <ul className="mt-2 text-xs text-slate-700 space-y-1">
              <li>・A〜Jのエサを、指定された「古い順 or 新しい順」で食べる</li>
              <li>・順番を間違える or ゴーストに触れるとゲームオーバー</li>
              <li>・10個食べたら次の「近い10個」が出る（エンドレス）</li>
              <li>・before.xlsx（A列=出来事 / B列=何年前）を使用</li>
            </ul>
          </div>

          <div className="bg-white/95 rounded-2xl border border-slate-200 shadow-sm p-4">
            <p className="text-sm font-bold text-slate-900">この回はどっちの順で食べる？</p>

            <div className="mt-3 flex flex-wrap gap-3">
              <button
                onClick={() => startWaveWithMode('OLD')}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
              >
                古い順（何年前が大きい → 小さい）
              </button>
              <button
                onClick={() => startWaveWithMode('NEW')}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-900 font-bold text-sm hover:bg-slate-50"
              >
                新しい順（何年前が小さい → 大きい）
              </button>
            </div>

            <div className="mt-3 text-xs text-slate-600">
              ※ 同じ「何年前」は同じ回に出ません（1つだけ）
            </div>
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

  // ===== playing =====
  return (
    <SoloLayout title="パックマン（時系列）">
      <div className="max-w-3xl mx-auto">
        <div className="bg-white/92 rounded-2xl border border-slate-200 shadow-sm px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-600 font-semibold">スコア</p>
            <p className="text-lg font-bold text-emerald-700">{score}</p>
          </div>

          <div className="text-right">
            <p className="text-xs text-slate-600 font-semibold">自己ベスト</p>
            <p className="text-sm font-bold text-slate-800">{bestScore}</p>
          </div>
        </div>

        {/* 次に食べるべき */}
        <div className="mt-2 bg-white/92 rounded-2xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs text-slate-600 font-semibold">
            この回の順： <span className="font-bold text-slate-900">{mode === 'OLD' ? '古い順' : '新しい順'}</span>
          </p>
          <p className="mt-1 text-sm text-slate-900">
            次に食べる：{' '}
            {expected ? (
              <>
                <span className="font-black text-rose-700">{expected.letter}</span>
                <span className="ml-2 text-slate-800">
                  {expected.event}（{expected.yearsAgo}年前）
                </span>
              </>
            ) : (
              <span className="text-slate-600">…</span>
            )}
          </p>
        </div>

        {/* A〜J一覧 */}
        <div className="mt-2 bg-white/92 rounded-2xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs text-slate-600 font-semibold">A〜J：出来事</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {letterLines.map((q) => {
              const isNext = expected && q.id === expected.id;
              return (
                <div
                  key={q.id}
                  className={`rounded-xl border px-3 py-2 text-xs ${
                    isNext ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <div className="font-black text-slate-900">
                    <span className={isNext ? 'text-rose-700' : 'text-slate-900'}>{q.letter}</span>
                    <span className="ml-2 font-semibold text-slate-700">（{q.yearsAgo}年前）</span>
                  </div>
                  <div className="mt-1 text-slate-800">{q.event}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 盤面 */}
        <div className="mt-3 flex flex-col items-center gap-3">
          <div
            ref={boardRef}
            className="relative rounded-2xl overflow-hidden border border-slate-500 shadow-lg bg-slate-950"
            style={{
              width: '100%',
              maxWidth: 520,
              aspectRatio: `${COLS}/${ROWS}`,
              touchAction: 'none',
            }}
          >
            {/* タイル描画 */}
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
                        background: wall ? 'linear-gradient(180deg, rgba(30,41,59,1), rgba(15,23,42,1))' : 'rgba(2,6,23,1)',
                        boxShadow: wall ? 'inset 0 0 0 1px rgba(255,255,255,0.06)' : 'inset 0 0 0 1px rgba(255,255,255,0.02)',
                      }}
                    />
                  );
                })
              )}

              {/* エサ */}
              {(wave || []).map((q) => {
                const isNext = expected && q.id === expected.id;
                return (
                  <div
                    key={q.id}
                    className="absolute flex items-center justify-center font-black"
                    style={{
                      left: q.x * tilePx + Math.floor(tilePx * 0.15),
                      top: q.y * tilePx + Math.floor(tilePx * 0.15),
                      width: Math.floor(tilePx * 0.7),
                      height: Math.floor(tilePx * 0.7),
                      borderRadius: 999,
                      background: isNext ? 'linear-gradient(180deg, rgba(251,113,133,1), rgba(225,29,72,1))' : 'linear-gradient(180deg, rgba(250,204,21,1), rgba(245,158,11,1))',
                      color: 'rgba(2,6,23,0.95)',
                      boxShadow: '0 4px 10px rgba(0,0,0,0.25), inset 0 0 0 2px rgba(255,255,255,0.22)',
                      fontSize: Math.max(10, Math.floor(tilePx * 0.42)),
                    }}
                    title={`${q.letter}: ${q.event} (${q.yearsAgo}年前)`}
                  >
                    {q.letter}
                  </div>
                );
              })}

              {/* プレイヤー */}
              <div
                className="absolute"
                style={{
                  left: player.x * tilePx,
                  top: player.y * tilePx,
                  width: tilePx,
                  height: tilePx,
                }}
              >
                <div
                  className="w-full h-full rounded-full"
                  style={{
                    background: 'radial-gradient(circle at 30% 30%, rgba(253,230,138,1), rgba(245,158,11,1))',
                    boxShadow: '0 6px 12px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.20)',
                  }}
                />
              </div>

              {/* ゴースト */}
              {(ghosts || []).map((g, idx) => {
                const color =
                  g.id === 'g1'
                    ? 'linear-gradient(180deg, rgba(248,113,113,1), rgba(220,38,38,1))'
                    : g.id === 'g2'
                      ? 'linear-gradient(180deg, rgba(167,139,250,1), rgba(124,58,237,1))'
                      : g.id === 'g3'
                        ? 'linear-gradient(180deg, rgba(96,165,250,1), rgba(37,99,235,1))'
                        : 'linear-gradient(180deg, rgba(251,146,60,1), rgba(234,88,12,1))';

                return (
                  <div
                    key={g.id}
                    className="absolute"
                    style={{
                      left: g.x * tilePx,
                      top: g.y * tilePx,
                      width: tilePx,
                      height: tilePx,
                    }}
                    title="ghost"
                  >
                    <div
                      className="w-full h-full"
                      style={{
                        borderRadius: Math.floor(tilePx * 0.35),
                        background: color,
                        boxShadow: '0 6px 12px rgba(0,0,0,0.35), inset 0 0 0 2px rgba(255,255,255,0.18)',
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <TouchPad onDir={pushDir} />

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
