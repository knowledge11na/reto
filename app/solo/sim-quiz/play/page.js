// file: app/solo/sim-quiz/play/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import StickUnit from '@/components/sim/StickUnit';

const STAGE1 = {
  id: 1,
  w: 9,
  h: 9,
  deployZone: { x0: 2, y0: 5, x1: 5, y1: 8 },
  enemy: {
    bossPos: { x: 4, y: 1 },
    mobRowY: 2,
    mobXs: [2, 3, 4, 5],
  },
};

function keyOf(x, y) {
  return `${x},${y}`;
}
function inBounds(x, y, W, H) {
  return x >= 0 && x < W && y >= 0 && y < H;
}
function manhattan(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}
function isInRect(x, y, r) {
  return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
}

function partsFromId(seed, team) {
  const s = Math.abs(Number(seed) || 1);
  const palP = [
    { head: '#60a5fa', body: '#34d399', leg: '#fbbf24' },
    { head: '#a78bfa', body: '#60a5fa', leg: '#34d399' },
    { head: '#fbbf24', body: '#a78bfa', leg: '#60a5fa' },
    { head: '#34d399', body: '#fbbf24', leg: '#a78bfa' },
  ];
  const palE = [
    { head: '#fb7185', body: '#f43f5e', leg: '#be123c' },
    { head: '#fecaca', body: '#fb7185', leg: '#f43f5e' },
  ];
  const pal = team === 'enemy' ? palE : palP;
  return pal[s % pal.length];
}

function computeMoveTargets(unit, pos, W, H) {
  if (!unit || !pos) return [];
  const cells = Array.isArray(unit.move_cells) ? unit.move_cells : [];
  const out = [];
  for (const c of cells) {
    const dx = Number(c?.dx);
    const dy = Number(c?.dy);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) continue;
    const nx = pos.x + dx;
    const ny = pos.y + dy;
    if (!inBounds(nx, ny, W, H)) continue;
    out.push({ x: nx, y: ny });
  }
  return out;
}

function computeAttackTargets(attacker, attackerPos, enemies, enemyPosMap) {
  const range = Math.max(1, Number(attacker?.range ?? 1));
  const targets = [];
  for (const e of enemies) {
    const eid = String(e?.eid);
    if (!eid) continue;
    if ((e?.stats?.hp ?? 0) <= 0) continue;
    const p = enemyPosMap.get(eid);
    if (!p) continue;
    if (manhattan(attackerPos, p) <= range) targets.push(e);
  }
  return targets;
}

function makeStage1Enemies() {
  const boss = {
    eid: 'boss',
    kind: 'boss',
    name: 'BOSS',
    range: 1,
    stats: { hp: 800, atk: 60, def: 20, sp: 0 },
    wazas: [],
  };
  const mobs = Array.from({ length: 4 }).map((_, i) => ({
    eid: `mob${i + 1}`,
    kind: 'mob',
    name: `雑魚${i + 1}`,
    range: 1,
    stats: { hp: 180, atk: 25, def: 8, sp: 0 },
    wazas: [],
  }));
  return { boss, mobs };
}

/* =========================
   クイズ（ナレッジタワーの判定を移植）
========================= */

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

function toStringArrayFlexible(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);

  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return [];
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch {}
    }
    return t
      .split(/[、，,／/]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
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

function normalizeQuestion(raw, index) {
  const baseOpts = getBaseOptions(raw);
  const type = String(raw?.type ?? 'single');

  const q = {
    ...raw,
    _simKey: `${raw.id ?? raw.question_id ?? 'q'}_${index}_${Math.random().toString(36).slice(2)}`,
    type,
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
    q.correct = correctTexts; // 配列（文字列）
    return q;
  }

  // text
  q.correct = getTextCorrectBase(raw);
  return q;
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
    const uaArr = Array.isArray(userAnswer) ? userAnswer : [];
    if (uaArr.length === 0) return false;
    const correctArr = getCorrectArrayFlexible(q);
    if (correctArr.length === 0) return false;

    const normSort = (arr) => Array.from(new Set(arr.map((v) => String(v)))).sort();
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

function getQuestionId(q, fallbackIndex = 0) {
  const id = q?.id ?? q?.question_id ?? q?.qid ?? null;
  return id != null ? String(id) : `idx_${fallbackIndex}`;
}

/* =========================
   メイン
========================= */

export default function SimQuizPlayPage() {
  const stage = STAGE1;
  const W = stage.w;
  const H = stage.h;

  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState('');
  const [user, setUser] = useState(null);
  const [allies, setAllies] = useState([]);

  const [allyPos, setAllyPos] = useState(() => new Map());
  const [enemyPos, setEnemyPos] = useState(() => new Map());
  const [enemies, setEnemies] = useState([]);

  const [phase, setPhase] = useState('deploy');

  const [selectedSide, setSelectedSide] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const [actState, setActState] = useState({
    actingCid: null,
    step: 'choose', // choose | moving | afterMove | targeting_attack | targeting_skill
    chosenSkillIndex: null,
    moved: false,
  });

  const [allyActed, setAllyActed] = useState(() => new Set());

  const [log, setLog] = useState([]);
  const pushLog = (s) => setLog((prev) => [String(s), ...prev].slice(0, 10));

  // ===== クイズ関連（デッキ方式） =====
  const quizDeckRef = useRef([]);
  const quizPoolRef = useRef([]);
  const quizResolverRef = useRef(null);

  const [quiz, setQuiz] = useState(null);
  // quiz = { mode, q, singlePicked, text, multiSelected, orderSelected }

  function initQuizDeck(pool) {
    const p = Array.isArray(pool) ? pool : [];
    quizPoolRef.current = p;
    const allIds = p.map((q, i) => getQuestionId(q, i));
    quizDeckRef.current = shuffleArray(allIds);
  }

  function drawQuizQuestion() {
    const pool = quizPoolRef.current || [];
    if (!pool.length) return null;

    const idToQuestion = new Map();
    pool.forEach((q, i) => idToQuestion.set(getQuestionId(q, i), q));

    if (!quizDeckRef.current || quizDeckRef.current.length === 0) {
      const allIds = pool.map((q, i) => getQuestionId(q, i));
      quizDeckRef.current = shuffleArray(allIds);
    }

    const nextId = quizDeckRef.current.shift();
    return idToQuestion.get(nextId) || null;
  }

  async function openQuizAsync(mode) {
    if (quizResolverRef.current) {
      return new Promise((r) => {
        const prev = quizResolverRef.current;
        quizResolverRef.current = (ok) => {
          prev?.(ok);
          r(ok);
        };
      });
    }

    const q = drawQuizQuestion();
    if (!q) return true; // 問題なしならゲーム止めない

    return new Promise((resolve) => {
      quizResolverRef.current = resolve;

      setQuiz({
        mode,
        q,
        singlePicked: null,
        text: '',
        multiSelected: [],
        orderSelected: [],
      });
    });
  }

  function closeQuizWithResult(isCorrect) {
    const resolve = quizResolverRef.current;
    quizResolverRef.current = null;
    setQuiz(null);
    resolve?.(!!isCorrect);
  }

  function toggleMultiOption(opt) {
    setQuiz((prev) => {
      if (!prev) return prev;
      const cur = prev.multiSelected || [];
      const next = cur.includes(opt) ? cur.filter((v) => v !== opt) : [...cur, opt];
      return { ...prev, multiSelected: next };
    });
  }

  function toggleOrderOption(opt) {
    setQuiz((prev) => {
      if (!prev) return prev;
      const cur = prev.orderSelected || [];
      const next = cur.includes(opt) ? cur.filter((v) => v !== opt) : [...cur, opt];
      return { ...prev, orderSelected: next };
    });
  }

  // ===== boot =====
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        setLoading(true);
        setBootError('');

        const res = await fetch('/api/solo/sim-quiz/bootstrap', { cache: 'no-store' });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.ok) throw new Error(json?.error || `bootstrap_failed status=${res.status}`);
        if (cancelled) return;

        setUser(json.user || null);

        const units = Array.isArray(json.units) ? json.units : [];
        setAllies(units);

        const { boss, mobs } = makeStage1Enemies();
        const ens = [boss, ...mobs];
        setEnemies(ens);

        const ePos = new Map();
        ePos.set(boss.eid, stage.enemy.bossPos);
        for (let i = 0; i < mobs.length; i++) {
          ePos.set(mobs[i].eid, { x: stage.enemy.mobXs[i], y: stage.enemy.mobRowY });
        }
        setEnemyPos(ePos);

        // クイズ問題取得
        const qres = await fetch('/api/solo/sim-quiz/questions', { cache: 'no-store' });
        const qjson = await qres.json().catch(() => ({}));
        if (!qres.ok || !qjson.ok) throw new Error(qjson?.error || `questions_failed status=${qres.status}`);

        const rows = Array.isArray(qjson?.questions) ? qjson.questions : [];

        // single/multi/order/text を使う（使えないやつは除外）
        const usable = rows
          .filter((r) => {
            const t = String(r?.type ?? '');
            const opts = getBaseOptions(r);
            if (t === 'single') return opts.length >= 2;
            if (t === 'multi') return opts.length >= 2 && getCorrectArrayFlexible(r).length >= 1;
            if (t === 'order') return opts.length >= 2 && getCorrectArrayFlexible(r).length >= 2;
            if (t === 'text') return String(getTextCorrectBase(r) ?? '').trim().length > 0;
            return false;
          })
          .slice(0, 2000)
          .map((r, i) => normalizeQuestion(r, i));

        initQuizDeck(usable);
        pushLog(`クイズ問題ロード: ${usable.length}件`);

        setAllyPos(new Map());
        setPhase('deploy');
        setSelectedSide(null);
        setSelectedId(null);
        setActState({ actingCid: null, step: 'choose', chosenSkillIndex: null, moved: false });
        setAllyActed(new Set());
        setLog([]);
        pushLog('ステージ1：配置フェーズ');

        for (const u of units) {
          const cnt = Array.isArray(u?.move_cells) ? u.move_cells.length : 0;
          pushLog(`${u?.name ?? 'unit'} move_id=${u?.move_id ?? '?'} cells=${cnt}`);
        }
      } catch (e) {
        if (!cancelled) setBootError(e?.message || '起動に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const allyAt = useMemo(() => {
    const m = new Map();
    for (const a of allies) {
      const cid = Number(a?.character_id);
      if (!Number.isFinite(cid)) continue;
      const p = allyPos.get(cid);
      if (!p) continue;
      m.set(keyOf(p.x, p.y), a);
    }
    return m;
  }, [allies, allyPos]);

  const enemyAt = useMemo(() => {
    const m = new Map();
    for (const e of enemies) {
      if (!e?.eid) continue;
      if ((e?.stats?.hp ?? 0) <= 0) continue;
      const p = enemyPos.get(String(e.eid));
      if (!p) continue;
      m.set(keyOf(p.x, p.y), e);
    }
    return m;
  }, [enemies, enemyPos]);

  const occupiedSet = useMemo(() => {
    const s = new Set();
    for (const k of allyAt.keys()) s.add(k);
    for (const k of enemyAt.keys()) s.add(k);
    return s;
  }, [allyAt, enemyAt]);

  const selectedAlly = useMemo(() => {
    if (selectedSide !== 'ally') return null;
    const cid = Number(selectedId);
    if (!Number.isFinite(cid)) return null;
    return allies.find((a) => Number(a.character_id) === cid) || null;
  }, [selectedSide, selectedId, allies]);

  const selectedEnemy = useMemo(() => {
    if (selectedSide !== 'enemy') return null;
    const eid = String(selectedId ?? '');
    if (!eid) return null;
    return enemies.find((e) => String(e.eid) === eid) || null;
  }, [selectedSide, selectedId, enemies]);

  const actingAlly = useMemo(() => {
    const cid = Number(actState.actingCid);
    if (!Number.isFinite(cid)) return null;
    return allies.find((a) => Number(a.character_id) === cid) || null;
  }, [actState.actingCid, allies]);

  const actingPos = useMemo(() => {
    if (!actingAlly) return null;
    return allyPos.get(Number(actingAlly.character_id)) || null;
  }, [actingAlly, allyPos]);

  const moveTargets = useMemo(() => {
    if (phase !== 'player') return [];
    if (!actingAlly || !actingPos) return [];
    if (actState.step !== 'moving') return [];
    const raw = computeMoveTargets(actingAlly, actingPos, W, H);
    return raw.filter((p) => !occupiedSet.has(keyOf(p.x, p.y)));
  }, [phase, actState.step, actingAlly, actingPos, W, H, occupiedSet]);

  const moveTargetSet = useMemo(() => {
    const s = new Set();
    for (const p of moveTargets) s.add(keyOf(p.x, p.y));
    return s;
  }, [moveTargets]);

  const attackTargets = useMemo(() => {
    if (phase !== 'player') return [];
    if (!actingAlly || !actingPos) return [];
    if (actState.step !== 'targeting_attack') return [];
    return computeAttackTargets(actingAlly, actingPos, enemies, enemyPos);
  }, [phase, actState.step, actingAlly, actingPos, enemies, enemyPos]);

  const attackTargetSet = useMemo(() => {
    const s = new Set();
    for (const e of attackTargets) s.add(String(e.eid));
    return s;
  }, [attackTargets]);

  const listAllies = useMemo(() => (allies || []).slice(0, 5), [allies]);

  const allAlliesPlaced = useMemo(() => {
    if (!listAllies.length) return true;
    for (const a of listAllies) {
      const cid = Number(a.character_id);
      if (!allyPos.get(cid)) return false;
    }
    return true;
  }, [listAllies, allyPos]);

  const startBattle = () => {
    setPhase('player');
    setSelectedSide(null);
    setSelectedId(null);
    setAllyActed(new Set());
    setActState({ actingCid: null, step: 'choose', chosenSkillIndex: null, moved: false });
    pushLog('味方ターン開始');
  };

  const endPlayerTurn = () => {
    setSelectedSide(null);
    setSelectedId(null);
    setActState({ actingCid: null, step: 'choose', chosenSkillIndex: null, moved: false });
    setPhase('enemy');
    pushLog('敵ターン開始');
  };

  const nextPlayerTurn = () => {
    setPhase('player');
    setAllyActed(new Set());
    setSelectedSide(null);
    setSelectedId(null);
    setActState({ actingCid: null, step: 'choose', chosenSkillIndex: null, moved: false });
    pushLog('味方ターン開始');
  };

  const dealDamage = (atk, def) => {
    const a = Math.max(0, Number(atk) || 0);
    const d = Math.max(0, Number(def) || 0);
    return Math.max(1, a - Math.floor(d / 2));
  };

  const finishAllyAction = (cid, msg) => {
    setAllyActed((prev) => {
      const n = new Set(prev);
      n.add(Number(cid));
      return n;
    });
    setActState({ actingCid: null, step: 'choose', chosenSkillIndex: null, moved: false });
    if (msg) pushLog(msg);
  };

  const allAlliesActed = useMemo(() => {
    const aliveAllies = listAllies.filter((a) => allyPos.get(Number(a.character_id)));
    if (!aliveAllies.length) return true;
    for (const a of aliveAllies) {
      const cid = Number(a.character_id);
      if (!allyActed.has(cid)) return false;
    }
    return true;
  }, [listAllies, allyPos, allyActed]);

  // ===== 敵ターン（防御クイズ：正解で半減） =====
  useEffect(() => {
    if (phase !== 'enemy') return;

    let cancelled = false;

    const run = async () => {
      await new Promise((r) => setTimeout(r, 250));
      if (cancelled) return;

      const aliveAllies = listAllies
        .map((a) => {
          const cid = Number(a.character_id);
          const p = allyPos.get(cid);
          return p ? { unit: a, cid, pos: p } : null;
        })
        .filter(Boolean);

      if (!aliveAllies.length) {
        pushLog('味方がいない…');
        nextPlayerTurn();
        return;
      }

      for (const e of enemies) {
        if (cancelled) return;
        if (!e?.eid) continue;
        if ((e?.stats?.hp ?? 0) <= 0) continue;

        const epos = enemyPos.get(String(e.eid));
        if (!epos) continue;

        const range = Math.max(1, Number(e.range ?? 1));
        let best = null;
        for (const a of aliveAllies) {
          const dist = manhattan(epos, a.pos);
          if (dist <= range) {
            best = a;
            break;
          }
        }

        if (best) {
          const ok = await openQuizAsync('defense');
          if (cancelled) return;

          let dmg = dealDamage(e.stats?.atk, best.unit?.stats?.def);
          if (ok) dmg = Math.max(1, Math.floor(dmg / 2));

          pushLog(
            ok
              ? `防御成功！${e.name}の攻撃を軽減：${best.unit.name}に${dmg}ダメージ（※HP管理は後で）`
              : `防御失敗… ${e.name}の攻撃：${best.unit.name}に${dmg}ダメージ（※HP管理は後で）`
          );

          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 120));
          continue;
        }

        // 近づく
        let nearest = null;
        for (const a of aliveAllies) {
          const dist = manhattan(epos, a.pos);
          if (nearest == null || dist < nearest.dist) nearest = { a, dist };
        }
        if (!nearest) continue;

        const dirs = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 },
        ];

        let bestStep = null;
        for (const d of dirs) {
          const nx = epos.x + d.dx;
          const ny = epos.y + d.dy;
          if (!inBounds(nx, ny, W, H)) continue;
          const k = keyOf(nx, ny);
          if (occupiedSet.has(k)) continue;
          const dist = manhattan({ x: nx, y: ny }, nearest.a.pos);
          if (bestStep == null || dist < bestStep.dist) bestStep = { x: nx, y: ny, dist };
        }

        if (bestStep) {
          setEnemyPos((prev) => {
            const n = new Map(prev);
            n.set(String(e.eid), { x: bestStep.x, y: bestStep.y });
            return n;
          });
          pushLog(`${e.name}が近づいた`);
          // eslint-disable-next-line no-await-in-loop
          await new Promise((r) => setTimeout(r, 120));
        }
      }

      nextPlayerTurn();
    };

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const canAct = phase === 'player' && actingAlly && !allyActed.has(Number(actingAlly.character_id));

  const chooseMove = () => {
    if (!canAct) return;
    const cnt = Array.isArray(actingAlly?.move_cells) ? actingAlly.move_cells.length : 0;
    if (cnt <= 0) pushLog(`move_cellsが空：move_id=${actingAlly?.move_id ?? '?'}`);
    else pushLog(`移動先を選んでね（候補${cnt}）`);
    setActState((prev) => ({ ...prev, step: 'moving' }));
  };

  const chooseAttack = () => {
    if (!canAct) return;
    if (!actingPos) return;
    setActState((prev) => ({ ...prev, step: 'targeting_attack' }));
  };

  const chooseSkill = (idx) => {
    if (!canAct) return;
    const wazas = actingAlly?.wazas || [];
    if (!wazas.length) return;
    const i = Number(idx ?? 0);
    if (!Number.isFinite(i) || i < 0 || i >= wazas.length) return;
    setActState((prev) => ({ ...prev, step: 'targeting_skill', chosenSkillIndex: i }));
  };

  const chooseWait = () => {
    if (!canAct) return;
    finishAllyAction(actingAlly.character_id, `${actingAlly.name}は待機した`);
  };

  const cancelActionStep = () => {
    if (phase !== 'player') return;
    if (!actingAlly) return;
    setActState((prev) => ({ ...prev, step: 'choose', chosenSkillIndex: null }));
  };

  const deployHint = () => {
    const z = stage.deployZone;
    return `配置エリア：x=${z.x0}..${z.x1}, y=${z.y0}..${z.y1}`;
  };

  const aliveEnemyCount = useMemo(() => enemies.filter((e) => (e?.stats?.hp ?? 0) > 0).length, [enemies]);

  const onCellClick = async (x, y) => {
    if (quiz) return; // クイズ中は盤面操作停止

    const cellKey = keyOf(x, y);

    if (phase === 'deploy') {
      if (selectedSide !== 'ally' || selectedId == null) return;
      if (!isInRect(x, y, stage.deployZone)) return;

      const aHere = allyAt.get(cellKey);
      if (aHere) {
        setSelectedSide('ally');
        setSelectedId(Number(aHere.character_id));
        return;
      }

      if (occupiedSet.has(cellKey)) return;

      const cid = Number(selectedId);
      if (!Number.isFinite(cid)) return;

      setAllyPos((prev) => {
        const n = new Map(prev);
        n.set(cid, { x, y });
        return n;
      });
      return;
    }

    if (phase === 'player') {
      const a = allyAt.get(cellKey);
      const e = enemyAt.get(cellKey);

      // 移動中：緑マス押したら移動
      if (actState.step === 'moving') {
        if (moveTargetSet.has(cellKey) && actingAlly) {
          const cid = Number(actingAlly.character_id);
          setAllyPos((prev) => {
            const n = new Map(prev);
            n.set(cid, { x, y });
            return n;
          });
          setActState((prev) => ({ ...prev, step: 'afterMove', moved: true }));
          pushLog(`${actingAlly.name}が移動した`);
        }
        return;
      }

      // 通常攻撃
      if (actState.step === 'targeting_attack') {
        if (!actingAlly || !actingPos) return;
        if (!e) return;
        if (!attackTargetSet.has(String(e.eid))) return;

        const ok = await openQuizAsync('attack');

        if (ok) {
          const dmg = dealDamage(actingAlly?.stats?.atk, e?.stats?.def);
          setEnemies((prev) =>
            prev.map((p) => {
              if (String(p.eid) !== String(e.eid)) return p;
              const hp = Math.max(0, (p.stats?.hp ?? 0) - dmg);
              return { ...p, stats: { ...(p.stats || {}), hp } };
            })
          );
          finishAllyAction(actingAlly.character_id, `正解！${actingAlly.name}の攻撃！ ${e.name}に${dmg}ダメージ`);
        } else {
          finishAllyAction(actingAlly.character_id, `不正解… ${actingAlly.name}の攻撃は失敗`);
        }
        return;
      }

      // 技
      if (actState.step === 'targeting_skill') {
        if (!actingAlly || !actingPos) return;
        if (!e) return;

        const targets = computeAttackTargets(actingAlly, actingPos, enemies, enemyPos);
        const okSet = new Set(targets.map((t) => String(t.eid)));
        if (!okSet.has(String(e.eid))) return;

        const wIdx = Number(actState.chosenSkillIndex ?? 0);
        const w = (actingAlly.wazas || [])[wIdx] || null;
        const label = w?.name || '技';

        const ok = await openQuizAsync('attack');

        if (ok) {
          const dmg = dealDamage((actingAlly?.stats?.atk ?? 0) + 15, e?.stats?.def);
          setEnemies((prev) =>
            prev.map((p) => {
              if (String(p.eid) !== String(e.eid)) return p;
              const hp = Math.max(0, (p.stats?.hp ?? 0) - dmg);
              return { ...p, stats: { ...(p.stats || {}), hp } };
            })
          );
          finishAllyAction(actingAlly.character_id, `正解！${actingAlly.name}の${label}！ ${e.name}に${dmg}ダメージ`);
        } else {
          finishAllyAction(actingAlly.character_id, `不正解… ${actingAlly.name}の${label}は失敗`);
        }
        return;
      }

      // 味方クリック
      if (a) {
        const cid = Number(a.character_id);
        if (allyActed.has(cid)) {
          setSelectedSide('ally');
          setSelectedId(cid);
          return;
        }
        setSelectedSide('ally');
        setSelectedId(cid);
        setActState({ actingCid: cid, step: 'choose', chosenSkillIndex: null, moved: false });
        return;
      }

      // 敵クリック
      if (e) {
        setSelectedSide('enemy');
        setSelectedId(String(e.eid));
        return;
      }

      setSelectedSide(null);
      setSelectedId(null);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm">起動中...</p>
      </main>
    );
  }

  if (bootError) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md bg-white border rounded-3xl p-6 shadow space-y-3">
          <div className="text-lg font-extrabold">シミュレーション起動失敗</div>
          <div className="text-sm text-rose-700 whitespace-pre-wrap">{bootError}</div>
          <div className="flex gap-2">
            <Link href="/solo" className="flex-1 text-center py-2 rounded-full bg-sky-600 text-white font-bold">
              ソロへ戻る
            </Link>
            <Link href="/" className="flex-1 text-center py-2 rounded-full border bg-white font-bold">
              ホーム
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50">
      <div className="max-w-5xl mx-auto px-3 py-3">
        <header className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-base sm:text-xl font-extrabold tracking-wide">シミュレーション（ステージ{stage.id}）</h1>
            <p className="text-[11px] text-slate-300 mt-0.5">
              {user?.name ? `プレイヤー: ${user.name}` : ''} / 敵残り: {aliveEnemyCount} / クイズ: {quizPoolRef.current?.length ?? 0}問
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/moves" className="px-3 py-1 rounded-full border border-slate-600 bg-slate-900 text-[11px] font-bold">
              Move登録
            </Link>
            <Link href="/solo" className="px-3 py-1 rounded-full border border-slate-600 bg-slate-900 text-[11px] font-bold">
              ソロへ
            </Link>
            <Link href="/" className="px-3 py-1 rounded-full border border-slate-600 bg-slate-900 text-[11px] font-bold">
              ホーム
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_340px] gap-3">
          <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-3 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-bold">
                盤面 {W}×{H}
              </div>
              <div className="text-[11px] text-slate-300">
                {phase === 'deploy' ? deployHint() : phase === 'player' ? '味方ターン' : phase === 'enemy' ? '敵ターン' : ''}
              </div>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-700">
              <div className="p-2 sm:p-3">
                <div className="grid select-none" style={{ gridTemplateColumns: `repeat(${W}, minmax(0, 1fr))` }}>
                  {Array.from({ length: W * H }).map((_, i) => {
                    const x = i % W;
                    const y = Math.floor(i / W);
                    const k = keyOf(x, y);

                    const a = allyAt.get(k) || null;
                    const e = enemyAt.get(k) || null;

                    const inDeploy = isInRect(x, y, stage.deployZone);
                    const isMove = moveTargetSet.has(k);

                    const isActingHere =
                      phase === 'player' && actingAlly && a && Number(a.character_id) === Number(actingAlly.character_id);

                    const isSelectedHere =
                      (selectedSide === 'ally' && a && Number(a.character_id) === Number(selectedId)) ||
                      (selectedSide === 'enemy' && e && String(e.eid) === String(selectedId));

                    const canPlaceHere =
                      phase === 'deploy' && inDeploy && selectedSide === 'ally' && selectedId != null && !occupiedSet.has(k);

                    const base = 'aspect-square rounded-xl relative flex items-center justify-center bg-transparent transition';

                    const hintGlow =
                      !a && !e && phase === 'deploy' && inDeploy
                        ? 'bg-emerald-500/6'
                        : !a && !e && isMove
                        ? 'bg-emerald-400/14'
                        : '';

                    const ring =
                      isSelectedHere
                        ? 'ring-2 ring-sky-300'
                        : isActingHere
                        ? 'ring-2 ring-amber-300'
                        : isMove
                        ? 'ring-2 ring-emerald-300'
                        : canPlaceHere
                        ? 'ring-2 ring-emerald-400/70'
                        : '';

                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => onCellClick(x, y)}
                        className={`${base} ${hintGlow} ${ring}`}
                        title={a ? a.name : e ? e.name : `${x},${y}`}
                      >
                        {a ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="-mb-4 w-9 h-2 rounded-full bg-black/25 blur-[0.4px]" />
                            <StickUnit size={34} parts={partsFromId(a.character_id, 'player')} />
                            <div className="text-[9px] font-extrabold text-slate-100 line-clamp-1 px-1">{a.name}</div>
                          </div>
                        ) : e ? (
                          <div className="flex flex-col items-center justify-center">
                            <div className="-mb-4 w-9 h-2 rounded-full bg-black/30 blur-[0.4px]" />
                            <StickUnit size={34} parts={partsFromId(e.eid, 'enemy')} />
                            <div className="text-[9px] font-extrabold text-rose-100 line-clamp-1 px-1">{e.name}</div>
                          </div>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between gap-2">
              {phase === 'deploy' ? (
                <>
                  <div className="text-[11px] text-slate-300">味方を右のリストから選んで、配置エリアに置いてね</div>
                  <button
                    type="button"
                    onClick={startBattle}
                    disabled={!allAlliesPlaced}
                    className={
                      'px-4 py-2 rounded-full text-xs font-extrabold ' +
                      (allAlliesPlaced ? 'bg-sky-600 hover:brightness-110' : 'bg-slate-700 opacity-60 cursor-not-allowed')
                    }
                  >
                    配置完了 → 開始
                  </button>
                </>
              ) : phase === 'player' ? (
                <>
                  <div className="text-[11px] text-slate-300">
                    {allAlliesActed ? '全員行動済み：ターン終了できる' : '行動する味方を選んで、行動を選択'}
                  </div>
                  <button
                    type="button"
                    onClick={endPlayerTurn}
                    disabled={!allAlliesActed}
                    className={
                      'px-4 py-2 rounded-full text-xs font-extrabold ' +
                      (allAlliesActed
                        ? 'bg-amber-500 hover:brightness-110 text-slate-950'
                        : 'bg-slate-700 opacity-60 cursor-not-allowed')
                    }
                  >
                    ターン終了
                  </button>
                </>
              ) : (
                <div className="text-[11px] text-slate-300">敵の行動中...</div>
              )}
            </div>
          </section>

          <aside className="bg-slate-900/70 border border-slate-700 rounded-2xl p-3 shadow-lg">
            <div className="text-sm font-bold mb-2">情報</div>

            {phase === 'player' && actingAlly && !allyActed.has(Number(actingAlly.character_id)) ? (
              <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-3 mb-3">
                <div className="text-[12px] font-extrabold">行動中：{actingAlly.name}</div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  step：{actState.step}
                  {actState.moved ? '（移動済み）' : ''}
                </div>

                {actState.step === 'choose' && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={chooseMove}
                        className="py-2 rounded-2xl border border-sky-300 bg-sky-500/15 text-[11px] font-extrabold hover:bg-sky-500/25"
                      >
                        移動
                      </button>
                      <button
                        type="button"
                        onClick={chooseAttack}
                        className="py-2 rounded-2xl border border-rose-300 bg-rose-500/15 text-[11px] font-extrabold hover:bg-rose-500/25"
                      >
                        攻撃
                      </button>
                      <button
                        type="button"
                        onClick={() => chooseSkill(0)}
                        disabled={!((actingAlly?.wazas || []).length)}
                        className={
                          'py-2 rounded-2xl border text-[11px] font-extrabold ' +
                          ((actingAlly?.wazas || []).length
                            ? 'border-violet-300 bg-violet-500/15 hover:bg-violet-500/25'
                            : 'border-slate-600 bg-slate-800 opacity-60 cursor-not-allowed')
                        }
                      >
                        技
                      </button>
                      <button
                        type="button"
                        onClick={chooseWait}
                        className="py-2 rounded-2xl border border-slate-500 bg-slate-900 text-[11px] font-extrabold hover:bg-slate-800"
                      >
                        待機
                      </button>
                      <button
                        type="button"
                        onClick={cancelActionStep}
                        className="py-2 rounded-2xl border border-slate-600 bg-slate-950/40 text-[11px] font-extrabold hover:bg-slate-900/40"
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                )}

                {actState.step === 'moving' && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-slate-300">移動先を盤面で選択（緑に光る）</div>
                    <button
                      type="button"
                      onClick={cancelActionStep}
                      className="w-full py-2 rounded-2xl border border-slate-600 bg-slate-900 text-[11px] font-extrabold hover:bg-slate-800"
                    >
                      キャンセル
                    </button>
                  </div>
                )}

                {actState.step === 'afterMove' && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-slate-300">移動後：攻撃するか、待機で終了</div>
                    <button
                      type="button"
                      onClick={chooseAttack}
                      className="w-full py-2 rounded-2xl border border-rose-300 bg-rose-500/15 text-[11px] font-extrabold hover:bg-rose-500/25"
                    >
                      攻撃する
                    </button>
                    <button
                      type="button"
                      onClick={chooseWait}
                      className="w-full py-2 rounded-2xl border border-slate-500 bg-slate-900 text-[11px] font-extrabold hover:bg-slate-800"
                    >
                      待機（終了）
                    </button>
                  </div>
                )}

                {(actState.step === 'targeting_attack' || actState.step === 'targeting_skill') && (
                  <div className="mt-2 space-y-2">
                    <div className="text-[11px] text-slate-300">対象の敵を盤面で選択</div>
                    <button
                      type="button"
                      onClick={cancelActionStep}
                      className="w-full py-2 rounded-2xl border border-slate-600 bg-slate-900 text-[11px] font-extrabold hover:bg-slate-800"
                    >
                      キャンセル
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-700 bg-slate-950/40 p-3 mb-3">
              {selectedAlly ? (
                <>
                  <div className="text-[12px] font-extrabold">味方：{selectedAlly.name}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    No.{selectedAlly.char_no} / ★{selectedAlly.stars ?? 1} / range {selectedAlly.range ?? 1}
                  </div>
                  <div className="text-[11px] text-slate-200 mt-1">
                    ATK {selectedAlly?.stats?.atk ?? '?'} / DEF {selectedAlly?.stats?.def ?? '?'} / SP {selectedAlly?.stats?.sp ?? '?'}
                  </div>
                </>
              ) : selectedEnemy ? (
                <>
                  <div className="text-[12px] font-extrabold">敵：{selectedEnemy.name}</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    HP {selectedEnemy?.stats?.hp ?? '?'} / ATK {selectedEnemy?.stats?.atk ?? '?'} / DEF {selectedEnemy?.stats?.def ?? '?'}
                  </div>
                </>
              ) : (
                <div className="text-[11px] text-slate-300">ユニットをタップすると詳細が出る</div>
              )}
            </div>

            <div className="mt-4">
              <div className="text-[11px] text-slate-300 mb-1">ログ</div>
              <div className="max-h-44 overflow-auto rounded-2xl border border-slate-700 bg-slate-950/40 p-2">
                {log.length ? (
                  log.map((s, idx) => (
                    <div key={idx} className="text-[10px] text-slate-200 border-b border-slate-800 last:border-b-0 py-1">
                      {s}
                    </div>
                  ))
                ) : (
                  <div className="text-[10px] text-slate-500">（なし）</div>
                )}
              </div>
            </div>
          </aside>
        </div>

        <div className="mt-3 text-[10px] text-slate-400">
          ※「攻撃・技」→ 敵をタップすると <span className="font-bold">クイズが出る</span>（single/multi/order/text 対応）
        </div>
      </div>

      {/* =========================
          クイズモーダル（single/multi/order/text）
         ========================= */}
      {quiz ? (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-950 text-slate-50 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-extrabold">{quiz.mode === 'attack' ? '攻撃クイズ' : '防御クイズ'}</div>
              <button
                type="button"
                onClick={() => closeQuizWithResult(false)}
                className="px-3 py-1 rounded-full border border-slate-700 bg-slate-900 text-[11px] font-extrabold hover:bg-slate-800"
              >
                閉じる
              </button>
            </div>

            <div className="mt-2 text-[12px] font-bold whitespace-pre-wrap">
              {quiz.q?.question_text || quiz.q?.question || quiz.q?.text || '（問題）'}
            </div>

            {/* ===== text ===== */}
            {String(quiz.q?.type) === 'text' ? (
              <div className="mt-3 space-y-2">
                <textarea
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900/60 px-3 py-2 text-[12px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                  rows={3}
                  placeholder="答えを入力"
                  value={quiz.text}
                  onChange={(e) => setQuiz((prev) => ({ ...prev, text: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => {
                    const ok = judgeAnswer(quiz.q, quiz.text);
                    closeQuizWithResult(ok);
                  }}
                  className="w-full py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-[12px] font-extrabold"
                >
                  解答する
                </button>
              </div>
            ) : null}

            {/* ===== single ===== */}
            {String(quiz.q?.type) === 'single' ? (
              <div className="mt-3 space-y-2">
                {(quiz.q?.options || []).slice(0, 10).map((c, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      const ok = judgeAnswer(quiz.q, c);
                      closeQuizWithResult(ok);
                    }}
                    className="w-full text-left px-3 py-2 rounded-2xl border border-slate-700 bg-slate-900/60 hover:bg-slate-800"
                  >
                    <div className="text-[12px] font-extrabold">{String(c)}</div>
                  </button>
                ))}
              </div>
            ) : null}

            {/* ===== multi ===== */}
            {String(quiz.q?.type) === 'multi' ? (
              <div className="mt-3 space-y-2">
                {(quiz.q?.options || []).slice(0, 12).map((c, idx) => {
                  const active = (quiz.multiSelected || []).includes(c);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleMultiOption(c)}
                      className={
                        'w-full text-left px-3 py-2 rounded-2xl border font-extrabold flex items-center justify-between ' +
                        (active ? 'border-amber-300 bg-amber-500/20' : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800')
                      }
                    >
                      <span className="text-[12px]">{String(c)}</span>
                      <span className="text-[12px]">{active ? '✔' : ''}</span>
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={() => {
                    const ok = judgeAnswer(quiz.q, quiz.multiSelected || []);
                    closeQuizWithResult(ok);
                  }}
                  className="w-full py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-[12px] font-extrabold"
                >
                  この選択で解答する
                </button>
              </div>
            ) : null}

            {/* ===== order ===== */}
            {String(quiz.q?.type) === 'order' ? (
              <div className="mt-3 space-y-2">
                <div className="rounded-2xl border border-slate-700 bg-slate-900/40 p-3">
                  <div className="text-[11px] font-bold text-slate-200 mb-1">現在の並び</div>
                  {(quiz.orderSelected || []).length ? (
                    <div className="text-[12px] font-extrabold">
                      {(quiz.orderSelected || []).map(String).join(' → ')}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400">未選択</div>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setQuiz((prev) => ({ ...prev, orderSelected: [] }))}
                      className="flex-1 py-2 rounded-2xl border border-slate-700 bg-slate-900 hover:bg-slate-800 text-[11px] font-extrabold"
                    >
                      リセット
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const ok = judgeAnswer(quiz.q, quiz.orderSelected || []);
                        closeQuizWithResult(ok);
                      }}
                      className="flex-1 py-2 rounded-2xl bg-sky-600 hover:bg-sky-700 text-[11px] font-extrabold"
                    >
                      この順で解答
                    </button>
                  </div>
                </div>

                {(quiz.q?.options || []).slice(0, 12).map((c, idx) => {
                  const selected = (quiz.orderSelected || []).includes(c);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleOrderOption(c)}
                      className={
                        'w-full text-left px-3 py-2 rounded-2xl border font-extrabold ' +
                        (selected ? 'border-white/20 bg-white/5 text-white/70' : 'border-slate-700 bg-slate-900/60 hover:bg-slate-800')
                      }
                    >
                      <div className="text-[12px]">{String(c)}</div>
                    </button>
                  );
                })}
              </div>
            ) : null}

            <div className="mt-3 text-[10px] text-slate-400">※ 正解：攻撃成功 / 防御成功（半減）</div>
          </div>
        </div>
      ) : null}
    </main>
  );
}