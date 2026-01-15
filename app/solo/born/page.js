// file: app/solo/born/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const GAME_W = 360;
const GAME_H = 520;

const LIFE_MS = 9000; // 1体9秒（通路にいる間だけ）
const BLINK_MS = 2000; // 2秒前から点滅

// 仕切りに10体たまったら演出で消す
const BIN_CAP = 10;
const BIN_CLEAR_MS = 650;

const DOOR_THRESHOLDS = [
  { score: 0, doors: ['TOP'] },
  { score: 5, doors: ['TOP', 'LEFT'] },
  { score: 12, doors: ['TOP', 'LEFT', 'RIGHT'] },
  { score: 20, doors: ['TOP', 'LEFT', 'RIGHT', 'BOTTOM'] },
];

function maxOnScreenByDoors(n) {
  if (n <= 1) return 5;
  if (n === 2) return 7;
  if (n === 3) return 9;
  return 11;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function getLayoutRects(container) {
  const { w, h } = container;

  const corridorW = Math.floor(w * 0.42);
  const corridorH = Math.floor(h * 0.36);
  const cx = Math.floor(w / 2);
  const cy = Math.floor(h / 2);

  const vertical = {
    x: Math.floor(cx - corridorW / 2),
    y: 0,
    w: corridorW,
    h: h,
  };

  const horizontal = {
    x: 0,
    y: Math.floor(cy - corridorH / 2),
    w: w,
    h: corridorH,
  };

  const grand = {
    x: Math.floor(cx - 58),
    y: Math.floor(cy - 42),
    w: 116,
    h: 84,
  };

  const pad = 10;

  // ★あなたの希望で north/south を入れ替え済み（northが右下、southが左上）
  const north = {
    x: Math.floor(cx + corridorW / 2) + pad,
    y: Math.floor(cy + corridorH / 2) + pad,
    w: Math.floor((w - corridorW) / 2) - 2 * pad,
    h: Math.floor((h - corridorH) / 2) - 2 * pad,
  };

  const east = {
    x: Math.floor(cx + corridorW / 2) + pad,
    y: pad,
    w: Math.floor((w - corridorW) / 2) - 2 * pad,
    h: Math.floor((h - corridorH) / 2) - pad,
  };

  const west = {
    x: pad,
    y: Math.floor(cy + corridorH / 2) + pad,
    w: Math.floor((w - corridorW) / 2) - pad,
    h: Math.floor((h - corridorH) / 2) - 2 * pad,
  };

  const south = {
    x: pad,
    y: pad,
    w: Math.floor((w - corridorW) / 2) - pad,
    h: Math.floor((h - corridorH) / 2) - pad,
  };

  const doorSize = 24;
  const doors = {
    TOP: { x: Math.floor(cx - doorSize / 2), y: 0, w: doorSize, h: 10 },
    BOTTOM: {
      x: Math.floor(cx - doorSize / 2),
      y: h - 10,
      w: doorSize,
      h: 10,
    },
    LEFT: { x: 0, y: Math.floor(cy - doorSize / 2), w: 10, h: doorSize },
    RIGHT: {
      x: w - 10,
      y: Math.floor(cy - doorSize / 2),
      w: 10,
      h: doorSize,
    },
  };

  return { vertical, horizontal, grand, north, east, west, south, doors };
}

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

function inCorridor(px, py, rects) {
  return pointInRect(px, py, rects.vertical) || pointInRect(px, py, rects.horizontal);
}

function zoneLabel(zone) {
  if (zone === 'EAST') return '東';
  if (zone === 'WEST') return '西';
  if (zone === 'NORTH') return '北';
  if (zone === 'SOUTH') return '南';
  if (zone === 'GRAND') return '偉';
  return '';
}

function bornLabel(born) {
  return String(born ?? '');
}

function pickDoorsByScore(score) {
  let best = DOOR_THRESHOLDS[0].doors;
  for (const t of DOOR_THRESHOLDS) {
    if (score >= t.score) best = t.doors;
  }
  return best;
}

function randRange(a, b) {
  return a + Math.random() * (b - a);
}

// 通路の速度( px/秒 )
function makeVelocityPxPerSec() {
  const ang = randRange(0, Math.PI * 2);
  const sp = randRange(30, 60);
  return { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
}

// 仕切り内のごちゃごちゃ( px/秒 )：ゆっくり
function makeBinVelocity() {
  const ang = randRange(0, Math.PI * 2);
  const sp = randRange(8, 14);
  return { vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp };
}

function spawnPosFromDoor(doorKey, rects) {
  const d = rects.doors[doorKey];
  if (doorKey === 'TOP') return { x: d.x + d.w / 2, y: d.y + d.h + 18 };
  if (doorKey === 'BOTTOM') return { x: d.x + d.w / 2, y: d.y - 18 };
  if (doorKey === 'LEFT') return { x: d.x + d.w + 18, y: d.y + d.h / 2 };
  if (doorKey === 'RIGHT') return { x: d.x - 18, y: d.y + d.h / 2 };
  return { x: rects.vertical.x + rects.vertical.w / 2, y: 40 };
}

// ★扉ごとの独立スポーン間隔（扉が増えたら総量が自然に増える）
function doorCooldownMs(doorKey, doorsCount) {
  const base = doorsCount <= 1 ? 4200 : doorsCount === 2 ? 4700 : doorsCount === 3 ? 5200 : 5700;
  const jitter = doorKey === 'TOP' ? 0 : doorKey === 'LEFT' ? 400 : doorKey === 'RIGHT' ? 650 : 900; // BOTTOMはここ
  return base + jitter;
}

export default function BornSoloPage() {
  const [status, setStatus] = useState('loading'); // loading | playing | finished
  const [message, setMessage] = useState('');

  const [bornList, setBornList] = useState([]);
  const [score, setScore] = useState(0);

  const [bestScore, setBestScore] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // ★score を常に最新で参照できるようにする（best保存ズレ対策）
  const scoreRef = useRef(0);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const [chars, setChars] = useState([]);
  const charsRef = useRef([]);
  useEffect(() => {
    charsRef.current = chars;
  }, [chars]);

  const [answerHistory, setAnswerHistory] = useState([]);

  const boardRef = useRef(null);
  const [boardRect, setBoardRect] = useState({ x: 0, y: 0, w: GAME_W, h: GAME_H });

  const layout = useMemo(() => {
    return getLayoutRects({ x: 0, y: 0, w: boardRect.w, h: boardRect.h });
  }, [boardRect.w, boardRect.h]);

  // ===== ドラッグ（必ず追従する版）=====
  const dragRef = useRef({
    activeId: null,
    offsetX: 0,
    offsetY: 0,
    dragging: false,
  });

  const pointerRef = useRef({ x: 0, y: 0, has: false });
  const rafDragRef = useRef(null);

  const stopDragRaf = () => {
    if (rafDragRef.current) cancelAnimationFrame(rafDragRef.current);
    rafDragRef.current = null;
  };

  const startDragRaf = () => {
    if (rafDragRef.current) return;
    const tick = () => {
      if (!dragRef.current.dragging) {
        rafDragRef.current = null;
        return;
      }
      const id = dragRef.current.activeId;
      if (!id) {
        rafDragRef.current = null;
        return;
      }

      if (pointerRef.current.has) {
        const px = pointerRef.current.x;
        const py = pointerRef.current.y;

        setChars((prev) =>
          prev.map((c) => {
            if (c.id !== id) return c;
            const rr = c.size / 2;
            const nx = clamp(px - dragRef.current.offsetX, rr, boardRect.w - rr);
            const ny = clamp(py - dragRef.current.offsetY, rr, boardRect.h - rr);
            return { ...c, x: nx, y: ny };
          })
        );
      }

      rafDragRef.current = requestAnimationFrame(tick);
    };

    rafDragRef.current = requestAnimationFrame(tick);
  };

  // 盤サイズ
  useEffect(() => {
    const update = () => {
      const el = boardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setBoardRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [status]);

  // 初期化
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('born_best_score');
        const n = raw ? Number(raw) : 0;
        if (!Number.isNaN(n) && n > 0) setBestScore(n);
      } catch {}
    }

    const load = async () => {
      try {
        const res = await fetch('/api/solo/born', { cache: 'no-store' });
        const data = await res.json();
        if (!data.ok) throw new Error(data.message || 'failed');
        setBornList(data.list || []);
        setStatus('playing');
      } catch (e) {
        console.error(e);
        setStatus('finished');
        setMessage('born データの取得に失敗しました（born.xlsx）');
      }
    };

    load();
  }, []);

  // ===== ゲームオーバー =====
  const spawnTimerRef = useRef(null);

  const gameOver = ({ reason, char, userZone }) => {
    const finalScore = scoreRef.current;

    setStatus('finished');

    if (char) {
      setAnswerHistory((prev) => [
        ...prev,
        {
          question_id: `born_${char.id}`,
          text: `${char.name}`,
          userAnswerText: `${userZone}`,
          correctAnswerText: `${zoneLabel(char.zone)}（${bornLabel(char.born)}）`,
        },
      ]);
    }

    setMessage(reason ? `ゲームオーバー：${reason}` : 'ゲームオーバー');

    if (typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem('born_best_score');
        const oldBest = raw ? Number(raw) : 0;

        if (Number.isNaN(oldBest) || finalScore > oldBest) {
          window.localStorage.setItem('born_best_score', String(finalScore));
          setBestScore(finalScore);
          setIsNewRecord(finalScore > 0);
        } else {
          setBestScore(Number.isNaN(oldBest) ? 0 : oldBest);
          setIsNewRecord(false);
        }
      } catch {}
    }

    if (spawnTimerRef.current) {
      clearInterval(spawnTimerRef.current);
      spawnTimerRef.current = null;
    }

    dragRef.current.activeId = null;
    dragRef.current.dragging = false;
    pointerRef.current.has = false;
    stopDragRaf();
  };

  // ===== 仕切り10体演出（同時発火防止）=====
  const binClearRef = useRef({ NORTH: 0, EAST: 0, WEST: 0, SOUTH: 0, GRAND: 0 });

  const triggerBinClear = (binKey) => {
    const t = nowMs();
    const last = binClearRef.current[binKey] || 0;
    if (t - last < BIN_CLEAR_MS + 150) return;
    binClearRef.current[binKey] = t;

    // その仕切り内の先頭10体を exiting にする
    setChars((prev) => {
      const inBin = prev.filter((c) => c.state === 'sorted' && c.binKey === binKey && !c.exitingAt);
      if (inBin.length < BIN_CAP) return prev;

      const pick = new Set(inBin.slice(0, BIN_CAP).map((c) => c.id));
      return prev.map((c) => (pick.has(c.id) ? { ...c, state: 'exiting', exitingAt: t } : c));
    });

    // 消す
    setTimeout(() => {
      setChars((prev) => prev.filter((c) => !(c.state === 'exiting' && c.binKey === binKey)));
    }, BIN_CLEAR_MS);
  };

  // ===== スポーン（扉ごと独立）=====
  const lastDoorSpawnRef = useRef({ TOP: 0, LEFT: 0, RIGHT: 0, BOTTOM: 0 });
  const prevDoorsKeyRef = useRef('');

  useEffect(() => {
    if (status !== 'playing') return;
    if (!bornList || bornList.length === 0) return;

    const id = setInterval(() => {
      const doors = pickDoorsByScore(score);
      const doorsCount = doors.length;

      const doorsKey = doors.join(',');
      if (doorsKey !== prevDoorsKeyRef.current) {
        prevDoorsKeyRef.current = doorsKey;
        for (const dk of doors) {
          if (!lastDoorSpawnRef.current[dk]) lastDoorSpawnRef.current[dk] = 0;
        }
      }

      const maxOn = maxOnScreenByDoors(doorsCount);
      const all = charsRef.current || [];

      // ★重要：場の数は「通路にいるやつだけ」＝ sorted(箱の中) はカウントしない
      const onField = all.filter((c) => c.state === 'corridor' || c.isDragging);
      const onFieldCount = onField.length;

      // ★序盤テンポ：画面(=通路)が0体なら即湧き
      const isEmpty = onFieldCount === 0;

      // 画面上限（通路だけで判定）
      if (!isEmpty && onFieldCount >= maxOn) return;

      const t = nowMs();
      const add = [];

      // 0体なら「まず1体は必ず」出す（door cooldown 無視）
      if (isEmpty) {
        const doorKey = doors[Math.floor(Math.random() * doors.length)];
        const pos = spawnPosFromDoor(doorKey, layout);
        const base = bornList[Math.floor(Math.random() * bornList.length)];
        const vel = makeVelocityPxPerSec();
        const id2 = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const size = 52;

        add.push({
          id: id2,
          name: base.name,
          born: base.born,
          zone: base.zone,
          x: clamp(pos.x, size / 2 + 2, boardRect.w - size / 2 - 2),
          y: clamp(pos.y, size / 2 + 2, boardRect.h - size / 2 - 2),
          vx: vel.vx,
          vy: vel.vy,
          size,
          spawnedAt: t,
          isDragging: false,
          state: 'corridor', // corridor | sorted | exiting
          binKey: null,
          svx: 0,
          svy: 0,
          lastWanderAt: 0,
          exitingAt: 0,
        });

        // ついでに「もう1体」ポン（序盤気持ちよさ）
        if (Math.random() < 0.55) {
          const base2 = bornList[Math.floor(Math.random() * bornList.length)];
          const vel2 = makeVelocityPxPerSec();
          const id3 = `${Date.now()}_${Math.random().toString(16).slice(2)}_a`;
          add.push({
            id: id3,
            name: base2.name,
            born: base2.born,
            zone: base2.zone,
            x: clamp(pos.x + randRange(-10, 10), size / 2 + 2, boardRect.w - size / 2 - 2),
            y: clamp(pos.y + randRange(-10, 10), size / 2 + 2, boardRect.h - size / 2 - 2),
            vx: vel2.vx,
            vy: vel2.vy,
            size,
            spawnedAt: t,
            isDragging: false,
            state: 'corridor',
            binKey: null,
            svx: 0,
            svy: 0,
            lastWanderAt: 0,
            exitingAt: 0,
          });
        }

        setChars((prev) => [...prev, ...add]);
        return;
      }

      // 通常スポーン（通路キャパだけで残りを計算）
      let remainingCap = maxOn - onFieldCount;

      for (const doorKey of doors) {
        if (remainingCap <= 0) break;

        const cd = doorCooldownMs(doorKey, doorsCount);
        const last = lastDoorSpawnRef.current[doorKey] || 0;
        if (t - last < cd) continue;

        lastDoorSpawnRef.current[doorKey] = t;

        const pos = spawnPosFromDoor(doorKey, layout);
        const base = bornList[Math.floor(Math.random() * bornList.length)];
        const vel = makeVelocityPxPerSec();
        const id2 = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const size = 52;

        add.push({
          id: id2,
          name: base.name,
          born: base.born,
          zone: base.zone,
          x: clamp(pos.x, size / 2 + 2, boardRect.w - size / 2 - 2),
          y: clamp(pos.y, size / 2 + 2, boardRect.h - size / 2 - 2),
          vx: vel.vx,
          vy: vel.vy,
          size,
          spawnedAt: t,
          isDragging: false,
          state: 'corridor',
          binKey: null,
          svx: 0,
          svy: 0,
          lastWanderAt: 0,
          exitingAt: 0,
        });

        remainingCap -= 1;

        // ★同扉2体目：同じキャラ(base)を使わず、別キャラにする（「同じ扉から同じタイミングで同じキャラ」対策）
        if (doorsCount >= 3 && remainingCap > 0 && Math.random() < 0.12) {
          const base2 = bornList[Math.floor(Math.random() * bornList.length)];
          const id3 = `${Date.now()}_${Math.random().toString(16).slice(2)}_b`;
          const vel2 = makeVelocityPxPerSec();
          add.push({
            id: id3,
            name: base2.name,
            born: base2.born,
            zone: base2.zone,
            x: clamp(pos.x + randRange(-10, 10), size / 2 + 2, boardRect.w - size / 2 - 2),
            // ★ここ、以前 boardRect.w を使ってたので修正（縦方向は h）
            y: clamp(pos.y + randRange(-10, 10), size / 2 + 2, boardRect.h - size / 2 - 2),
            vx: vel2.vx,
            vy: vel2.vy,
            size,
            spawnedAt: t,
            isDragging: false,
            state: 'corridor',
            binKey: null,
            svx: 0,
            svy: 0,
            lastWanderAt: 0,
            exitingAt: 0,
          });
          remainingCap -= 1;
        }
      }

      if (add.length) setChars((prev) => [...prev, ...add]);
    }, 120);

    spawnTimerRef.current = id;
    return () => clearInterval(id);
  }, [status, bornList, score, layout, boardRect.w, boardRect.h]);

  // ===== 自動移動 & 爆破（通路のみ） + 仕切り内ごちゃごちゃ =====
  const rafMoveRef = useRef(null);
  const lastRef = useRef(nowMs());

  useEffect(() => {
    if (status !== 'playing') return;

    const loop = () => {
      const t = nowMs();
      const dtMs = t - lastRef.current;
      lastRef.current = t;

      const dt = Math.min(50, dtMs) / 1000;

      const current = charsRef.current || [];
      if (current.length === 0) {
        rafMoveRef.current = requestAnimationFrame(loop);
        return;
      }

      let exploded = null;

      const next = current.map((c0) => {
        let c = c0;

        if (c.isDragging) return c;
        if (c.state === 'exiting') return c;

        // ===== 仕切り内：ゆっくりごちゃごちゃ（爆破なし）=====
        if (c.state === 'sorted' && c.binKey) {
          const rect =
            c.binKey === 'NORTH'
              ? layout.north
              : c.binKey === 'EAST'
                ? layout.east
                : c.binKey === 'WEST'
                  ? layout.west
                  : c.binKey === 'SOUTH'
                    ? layout.south
                    : layout.grand;

          // たまに進行方向を変える
          let svx = c.svx || 0;
          let svy = c.svy || 0;
          const lastWanderAt = c.lastWanderAt || 0;

          if (!svx && !svy) {
            const vv = makeBinVelocity();
            svx = vv.vx;
            svy = vv.vy;
          } else if (t - lastWanderAt > 700 + Math.random() * 700) {
            const vv = makeBinVelocity();
            svx = svx * 0.5 + vv.vx * 0.5;
            svy = svy * 0.5 + vv.vy * 0.5;
            c = { ...c, lastWanderAt: t };
          }

          // 仕切りの内側に収める（キャラ半径を考慮）
          const r = c.size / 2;
          const minX = rect.x + r + 6;
          const maxX = rect.x + rect.w - r - 6;
          const minY = rect.y + r + 6;
          const maxY = rect.y + rect.h - r - 6;

          let nx = c.x + svx * dt;
          let ny = c.y + svy * dt;

          if (nx < minX) {
            nx = minX;
            svx = Math.abs(svx);
          } else if (nx > maxX) {
            nx = maxX;
            svx = -Math.abs(svx);
          }
          if (ny < minY) {
            ny = minY;
            svy = Math.abs(svy);
          } else if (ny > maxY) {
            ny = maxY;
            svy = -Math.abs(svy);
          }

          return { ...c, x: nx, y: ny, svx, svy };
        }

        // ===== 通路：爆破判定あり =====
        const elapsed = t - c.spawnedAt;
        if (elapsed >= LIFE_MS) {
          exploded = c;
          return c;
        }

        let nx = c.x + c.vx * dt;
        let ny = c.y + c.vy * dt;

        const r = c.size / 2;

        if (nx < r) {
          nx = r;
          c = { ...c, vx: -c.vx };
        } else if (nx > boardRect.w - r) {
          nx = boardRect.w - r;
          c = { ...c, vx: -c.vx };
        }
        if (ny < r) {
          ny = r;
          c = { ...c, vy: -c.vy };
        } else if (ny > boardRect.h - r) {
          ny = boardRect.h - r;
          c = { ...c, vy: -c.vy };
        }

        // 偉に入れない
        if (pointInRect(nx, ny, layout.grand)) {
          c = { ...c, vx: -c.vx, vy: -c.vy };
          nx = c.x + c.vx * dt;
          ny = c.y + c.vy * dt;
          if (pointInRect(nx, ny, layout.grand)) {
            nx = c.x;
            ny = c.y;
          }
        }

        // 通路外に出さない
        if (!inCorridor(nx, ny, layout)) {
          c = { ...c, vx: -c.vx, vy: -c.vy };
          nx = c.x + c.vx * dt;
          ny = c.y + c.vy * dt;
          if (!inCorridor(nx, ny, layout) || pointInRect(nx, ny, layout.grand)) {
            nx = c.x;
            ny = c.y;
          }
        }

        return { ...c, x: nx, y: ny };
      });

      if (exploded) {
        gameOver({ reason: '爆破', char: exploded, userZone: '（爆破）' });
        return;
      }

      setChars(next);

      // 仕切りに10体たまったら演出
      const bins = ['NORTH', 'EAST', 'WEST', 'SOUTH', 'GRAND'];
      for (const bk of bins) {
        const cnt = next.filter((c) => c.state === 'sorted' && c.binKey === bk).length;
        if (cnt >= BIN_CAP) triggerBinClear(bk);
      }

      rafMoveRef.current = requestAnimationFrame(loop);
    };

    rafMoveRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafMoveRef.current) cancelAnimationFrame(rafMoveRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, layout, boardRect.w, boardRect.h]);

  // ===== 仕分け判定 =====
  const finalizeDrop = (id) => {
    const ch = charsRef.current.find((c) => c.id === id);
    if (!ch) return;

    const px = ch.x;
    const py = ch.y;

    const zones = [
      { key: 'NORTH', rect: layout.north },
      { key: 'EAST', rect: layout.east },
      { key: 'WEST', rect: layout.west },
      { key: 'SOUTH', rect: layout.south },
      { key: 'GRAND', rect: layout.grand },
    ];

    const hit = zones.find((z) => pointInRect(px, py, z.rect));

    setChars((prev) => prev.map((c) => (c.id === id ? { ...c, isDragging: false } : c)));

    if (!hit) return;

    const userZone = zoneLabel(hit.key);

    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: `born_${ch.id}`,
        text: `${ch.name}`,
        userAnswerText: `${userZone}`,
        correctAnswerText: `${zoneLabel(ch.zone)}（${bornLabel(ch.born)}）`,
      },
    ]);

    if (hit.key !== ch.zone) {
      gameOver({ reason: '間違えた仕切りに入れた', char: ch, userZone });
      return;
    }

    // ★正解：消さずに「仕切り内に滞在」させる（爆破しない）
    setScore((s) => {
      const ns = s + 1;
      scoreRef.current = ns;
      return ns;
    });

    const t = nowMs();
    const rect = hit.rect;

    setChars((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;

        const r = c.size / 2;
        const nx = clamp(c.x, rect.x + r + 6, rect.x + rect.w - r - 6);
        const ny = clamp(c.y, rect.y + r + 6, rect.y + rect.h - r - 6);
        const vv = makeBinVelocity();

        return {
          ...c,
          x: nx,
          y: ny,
          state: 'sorted',
          binKey: hit.key,
          // 仕切り内速度
          svx: vv.vx,
          svy: vv.vy,
          lastWanderAt: t,
          // 通路タイマー扱いから外れるけど、念のため触る
          spawnedAt: t,
        };
      })
    );
  };

  // ===== ドラッグ開始 =====
  const onPointerDownChar = (e, id) => {
    if (status !== 'playing') return;

    const el = boardRef.current;
    if (!el) return;

    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;

    const target = charsRef.current.find((c) => c.id === id);
    if (!target) return;

    // exiting は触らせない
    if (target.state === 'exiting') return;

    dragRef.current.activeId = id;
    dragRef.current.dragging = true;
    dragRef.current.offsetX = px - target.x;
    dragRef.current.offsetY = py - target.y;

    pointerRef.current = { x: px, y: py, has: true };

    setChars((prev) => prev.map((c) => (c.id === id ? { ...c, isDragging: true } : c)));

    startDragRaf();

    e.preventDefault?.();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  // ===== window で move/up を拾う =====
  useEffect(() => {
    if (status !== 'playing') return;

    const onMove = (e) => {
      if (!dragRef.current.dragging) return;
      const el = boardRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      pointerRef.current.x = e.clientX - r.left;
      pointerRef.current.y = e.clientY - r.top;
      pointerRef.current.has = true;
    };

    const onUp = () => {
      if (!dragRef.current.dragging) return;
      const id = dragRef.current.activeId;
      dragRef.current.activeId = null;
      dragRef.current.dragging = false;
      pointerRef.current.has = false;

      stopDragRaf();
      if (id) finalizeDrop(id);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('pointercancel', onUp, { passive: true });

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [status, layout, boardRect.w, boardRect.h]); // eslint-disable-line react-hooks/exhaustive-deps

  const doors = pickDoorsByScore(score);
  const maxOn = maxOnScreenByDoors(doors.length);

  // 表示用：通路だけ数える
  const onFieldCount = (chars || []).filter((c) => c.state === 'corridor' || c.isDragging).length;

  if (status === 'loading') {
    return (
      <SoloLayout title="仕分けゲーム（出身）">
        <p className="text-sm text-slate-800 bg-white/90 rounded-xl px-4 py-3 inline-block">読み込み中...</p>
      </SoloLayout>
    );
  }

  if (status === 'finished') {
    return (
      <SoloLayout title="仕分けゲーム（出身）">
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
                window.location.href = `/solo/born?ts=${Date.now()}`;
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
          <QuestionReviewAndReport questions={answerHistory} sourceMode="solo-born" />
        </div>
      </SoloLayout>
    );
  }

  return (
    <SoloLayout title="仕分けゲーム（出身）">
      {/* 足：2つの楕円。位置は「少し上＆少し横へ」 */}
      <style jsx global>{`
        @keyframes bornBob {
          0% { transform: translateY(0px); }
          50% { transform: translateY(1px); }
          100% { transform: translateY(0px); }
        }

        /* 楕円足：左右が交互に上下（歩行っぽい） */
        @keyframes bornFootL {
          0% { transform: translateY(0px); }
          50% { transform: translateY(-3px); }
          100% { transform: translateY(0px); }
        }
        @keyframes bornFootR {
          0% { transform: translateY(-3px); }
          50% { transform: translateY(0px); }
          100% { transform: translateY(-3px); }
        }

        /* ===== 10体消し：足元が開いて落ちる ===== */
        @keyframes binHoleOpen {
          0% { transform: translate(-50%, 0) scaleX(0.25) scaleY(0.35); opacity: 0; }
          25% { transform: translate(-50%, 0) scaleX(1.1) scaleY(0.9); opacity: 0.55; }
          65% { transform: translate(-50%, 0) scaleX(1.2) scaleY(1.0); opacity: 0.6; }
          100% { transform: translate(-50%, 0) scaleX(0.9) scaleY(0.75); opacity: 0; }
        }

        @keyframes binDropDown {
          0% { transform: translateY(0px) scale(1); opacity: 1; }
          20% { transform: translateY(2px) scale(0.99); opacity: 1; }
          45% { transform: translateY(14px) scale(0.98); opacity: 0.95; }
          100% { transform: translateY(90px) scale(0.93); opacity: 0; }
        }

        /* 足が左右に開きつつ落ちる感じ */
        @keyframes footFallL {
          0% { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
          35% { transform: translate(-6px, 0px) rotate(-8deg); opacity: 1; }
          100% { transform: translate(-10px, 18px) rotate(-18deg); opacity: 0; }
        }
        @keyframes footFallR {
          0% { transform: translate(0px, 0px) rotate(0deg); opacity: 1; }
          35% { transform: translate(6px, 0px) rotate(8deg); opacity: 1; }
          100% { transform: translate(10px, 18px) rotate(18deg); opacity: 0; }
        }
      `}</style>

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

        <div className="mt-3 text-xs text-slate-800">
          <span className="font-semibold">扉：</span>
          {doors.map((d) => (
            <span
              key={d}
              className="inline-block ml-2 px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200"
            >
              {d}
            </span>
          ))}
          <span className="ml-3 text-slate-600">（通路 {onFieldCount}/{maxOn}）</span>
        </div>

        <div
          ref={boardRef}
          className="relative mt-3 w-full max-w-[520px] mx-auto aspect-[360/520] rounded-2xl overflow-hidden border border-slate-500 shadow-lg"
          style={{ touchAction: 'none' }}
        >
          {/* ===== 工場っぽい床 ===== */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(180deg, rgba(220,224,230,1) 0%, rgba(206,210,216,1) 100%)',
            }}
          />
          <div
            className="absolute inset-0 opacity-50"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 1px, transparent 1px, transparent 44px), repeating-linear-gradient(90deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06) 1px, transparent 1px, transparent 44px)',
            }}
          />
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(circle at 12px 12px, rgba(0,0,0,0.10) 0 1.2px, transparent 1.4px)',
              backgroundSize: '48px 48px',
            }}
          />

          <ZoneBlock rect={layout.north} label="北" />
          <ZoneBlock rect={layout.east} label="東" />
          <ZoneBlock rect={layout.west} label="西" />
          <ZoneBlock rect={layout.south} label="南" />

          {/* 通路 */}
          <div
            className="absolute"
            style={{
              left: layout.vertical.x,
              top: layout.vertical.y,
              width: layout.vertical.w,
              height: layout.vertical.h,
              background: 'linear-gradient(180deg, rgba(180,186,194,0.55), rgba(160,166,174,0.55))',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
            }}
          />
          <div
            className="absolute"
            style={{
              left: layout.horizontal.x,
              top: layout.horizontal.y,
              width: layout.horizontal.w,
              height: layout.horizontal.h,
              background: 'linear-gradient(180deg, rgba(180,186,194,0.55), rgba(160,166,174,0.55))',
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
            }}
          />

          {/* 中央 */}
          <div
            className="absolute flex items-center justify-center rounded-xl border-4 border-slate-900 bg-slate-100 shadow-md"
            style={{
              left: layout.grand.x,
              top: layout.grand.y,
              width: layout.grand.w,
              height: layout.grand.h,
              zIndex: 6,
              boxShadow: 'inset 0 0 0 2px rgba(0,0,0,0.15), 0 10px 20px rgba(0,0,0,0.15)',
            }}
          >
            <span className="text-2xl font-black text-slate-900">偉</span>
          </div>

          {doors.includes('TOP') && <Door rect={layout.doors.TOP} />}
          {doors.includes('LEFT') && <Door rect={layout.doors.LEFT} />}
          {doors.includes('RIGHT') && <Door rect={layout.doors.RIGHT} />}
          {doors.includes('BOTTOM') && <Door rect={layout.doors.BOTTOM} />}

          {chars.map((c) => {
            const isCorridor = c.state === 'corridor';
            const elapsed = nowMs() - c.spawnedAt;
            const remain = LIFE_MS - elapsed;
            const isBlink = isCorridor && remain <= BLINK_MS;

            const fontClass =
              c.name.length <= 4
                ? 'text-[11px]'
                : c.name.length <= 6
                  ? 'text-[10px]'
                  : c.name.length <= 8
                    ? 'text-[9px]'
                    : c.name.length <= 10
                      ? 'text-[8px]'
                      : c.name.length <= 12
                        ? 'text-[7px]'
                        : 'text-[6px]';

            const isWalking = !c.isDragging && c.state !== 'exiting';
            const isExiting = c.state === 'exiting';

            return (
              <div
                key={c.id}
                className="absolute select-none"
                style={{
                  left: c.x - c.size / 2,
                  top: c.y - c.size / 2,
                  width: c.size,
                  height: c.size,
                  zIndex: c.isDragging ? 50 : c.state === 'exiting' ? 60 : 20,
                  touchAction: 'none',
                  pointerEvents: c.state === 'exiting' ? 'none' : 'auto',
                }}
              >
                {/* ★足元が開く「穴」 */}
                {isExiting && (
                  <span
                    aria-hidden
                    className="absolute"
                    style={{
                      left: '50%',
                      bottom: -8,
                      width: 40,
                      height: 14,
                      borderRadius: 999,
                      background: 'rgba(2,6,23,0.45)',
                      filter: 'blur(0.2px)',
                      transform: 'translate(-50%, 0)',
                      zIndex: 1,
                      animation: `binHoleOpen ${BIN_CLEAR_MS}ms ease-out forwards`,
                    }}
                  />
                )}

                <button
                  type="button"
                  onPointerDown={(e) => onPointerDownChar(e, c.id)}
                  className={`relative w-full h-full rounded-full border-2 flex items-center justify-center px-1 font-black ${
                    isBlink ? 'border-rose-900 bg-rose-500 text-white animate-pulse' : 'border-slate-900 text-slate-900'
                  }`}
                  style={{
                    touchAction: 'none',
                    background: isBlink
                      ? 'linear-gradient(180deg, rgba(244,63,94,1), rgba(190,18,60,1))'
                      : `
                        linear-gradient(180deg, rgba(253,230,138,1), rgba(245,158,11,1)),
                        repeating-linear-gradient(0deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 4px),
                        repeating-linear-gradient(90deg, rgba(0,0,0,0.10) 0 1px, transparent 1px 4px)
                      `,
                    backgroundBlendMode: isBlink ? 'normal' : 'normal, overlay, overlay',
                    imageRendering: 'pixelated',
                    boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.28), 0 8px 14px rgba(0,0,0,0.18)',
                    animation: isExiting
                      ? `binDropDown ${BIN_CLEAR_MS}ms ease-out forwards`
                      : isWalking
                        ? 'bornBob 0.32s steps(2, end) infinite'
                        : 'none',
                  }}
                  title={`${c.name} / ${c.born}`}
                >
                  {/* ★足：今より「少し上＆少し外側」 */}
                  {(isWalking || isExiting) && (
                    <>
                      <span
                        aria-hidden
                        className="absolute"
                        style={{
                          // 外側へ＋ちょい上へ（下すぎない）
                          left: '10%',
                          bottom: -7,
                          width: 22,
                          height: 10,
                          borderRadius: 999,
                          background: 'rgba(2,6,23,0.96)',
                          animation: isExiting
                            ? `footFallL ${BIN_CLEAR_MS}ms ease-out forwards`
                            : 'bornFootL 0.32s steps(2, end) infinite',
                          zIndex: 2,
                        }}
                      />
                      <span
                        aria-hidden
                        className="absolute"
                        style={{
                          left: '58%',
                          bottom: -7,
                          width: 22,
                          height: 10,
                          borderRadius: 999,
                          background: 'rgba(2,6,23,0.96)',
                          animation: isExiting
                            ? `footFallR ${BIN_CLEAR_MS}ms ease-out forwards`
                            : 'bornFootR 0.32s steps(2, end) infinite',
                          zIndex: 2,
                        }}
                      />
                    </>
                  )}

                  {/* 名前 */}
                  <span
                    className={`text-center ${fontClass}`}
                    style={{
                      lineHeight: 1.05,
                      display: '-webkit-box',
                      WebkitBoxOrient: 'vertical',
                      WebkitLineClamp: 3,
                      overflow: 'hidden',
                      wordBreak: 'break-word',
                      paddingTop: 2,
                      opacity: isExiting ? 0.95 : 1,
                    }}
                  >
                    {c.name}
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-3 text-center">
          <Link href="/" className="text-xs text-sky-700 hover:underline">
            ホームへ戻る
          </Link>
        </div>
      </div>
    </SoloLayout>
  );
}

function Door({ rect }) {
  return (
    <div
      className="absolute rounded-sm"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: 8,
        background: 'linear-gradient(180deg, #ff4d4d, #b91c1c)',
        border: '1px solid rgba(0,0,0,0.35)',
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.25), 0 2px 8px rgba(0,0,0,0.18)',
      }}
    />
  );
}

function ZoneBlock({ rect, label }) {
  return (
    <div
      className="absolute rounded-2xl"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        zIndex: 2,
        padding: 2,
        background: 'repeating-linear-gradient(45deg, #111827 0 10px, #facc15 10px 20px)',
        boxShadow: '0 10px 18px rgba(0,0,0,0.12)',
      }}
    >
      <div
        className="w-full h-full rounded-[14px] flex items-start justify-start p-2"
        style={{
          background: 'linear-gradient(180deg, rgba(245,246,248,0.95), rgba(228,231,236,0.95))',
          border: '2px solid rgba(15,23,42,0.85)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.10)',
        }}
      >
        <span className="text-2xl font-black text-slate-900">{label}</span>
      </div>
    </div>
  );
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
