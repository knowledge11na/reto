// file: app//solo/knowledge-tower/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

/* =========================
   ナレッジタワー設定
========================= */

// フロアごとのタグ（複数タグ対応）
const FLOOR_TAGS = {
  1: ['東の海'],
  2: ['偉大なる航路突入'],
  3: ['アラバスタ'],
  4: ['空島'],
  5: ['DBF', 'W7、エニエス・ロビー'],
  6: ['スリラーバーク'],
  7: ['シャボンディ諸島', '女ヶ島'],
  8: ['インペルダウン'],
  9: ['頂上戦争'],
  10: ['3D2Y'],
  11: ['魚人島'],
  12: ['パンクハザード'],
  13: ['ドレスローザ'],
  14: ['ゾウ'],
  15: ['WCI'],
  16: ['世界会議'],
  17: ['ワノ国'],
  18: ['エッグヘッド'],
  19: ['エルバフ'],
  20: [
    '東の海',
    '偉大なる航路突入',
    'アラバスタ',
    '空島',
    'DBF',
    'W7、エニエス・ロビー',
    'スリラーバーク',
    'シャボンディ諸島',
    '女ヶ島',
    'インペルダウン',
    '頂上戦争',
    '3D2Y',
    '魚人島',
    'パンクハザード',
    'ドレスローザ',
    'ゾウ',
    'WCI',
    '世界会議',
    'ワノ国',
    'エッグヘッド',
    'エルバフ',
  ],
};

const MAX_FLOOR = 20;
const MAX_LOOP = 5;

// フロア（ボス前）目標
const FLOOR_NEED_CORRECT = 30;
// フロア失敗：6ミスで終了
const FLOOR_MAX_MISS = 6;

// ボス戦：1周増えるごとに +10（1周目30、2周目40…）
function bossNeedCorrectByLoop(loop) {
  const l = Math.max(1, Math.min(MAX_LOOP, Number(loop) || 1));
  return 30 + (l - 1) * 10;
}

// ボス戦：ベース7分
const BOSS_BASE_TIME_MS = 7 * 60 * 1000;
// ボス戦：ミスで -20秒
const BOSS_MISS_PENALTY_MS = 20 * 1000;

// 1問ごとの制限時間
const TIME_SINGLE = 30000;
const TIME_MULTI_ORDER = 40000;
const TIME_TEXT_SHORT = 60000;
const TIME_TEXT_LONG = 80000;

const BOSS_LAYOUT_STORAGE_KEY = 'tower_boss_layout_v1';

function loadBossLayoutForFloor(floor) {
  try {
    const raw = window.localStorage.getItem(BOSS_LAYOUT_STORAGE_KEY);
    const all = raw ? JSON.parse(raw) : {};
    const v = all?.[String(floor)];
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

function defaultBossLayout(floor) {
  return { x: 0, y: 0, wPct: 78, scale: 1, rotate: 0 };
}


/* =========================
   ユーティリティ
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

function getTagsArray(q) {
  if (!q) return [];
  if (Array.isArray(q.tags)) return q.tags.map(String);
  if (typeof q.tag === 'string' && q.tag.trim()) return [q.tag.trim()];
  if (typeof q.tags === 'string') return toStringArrayFlexible(q.tags);
  if (typeof q.tags_json === 'string') return toStringArrayFlexible(q.tags_json);
  if (typeof q.tags_text === 'string') return toStringArrayFlexible(q.tags_text);
  if (typeof q.story_tag === 'string' && q.story_tag.trim()) return [q.story_tag.trim()];
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

function normalizeQuestion(raw, index) {
  const baseOpts = getBaseOptions(raw);
  const type = raw.type;

  const q = {
    ...raw,
    _towerKey: `${raw.id ?? raw.question_id ?? 'q'}_${index}_${Math.random().toString(36).slice(2)}`,
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
    q.correct = correctTexts;
    return q;
  }

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

function getCorrectTextForDisplay(q) {
  if (!q) return '';
  if (q.type === 'single') return String(getSingleCorrectAnswer(q) ?? '');
  if (q.type === 'text') return String(getTextCorrectBase(q) ?? '');
  if (q.type === 'multi') return getCorrectArrayFlexible(q).join(' / ');
  if (q.type === 'order') return getCorrectArrayFlexible(q).join(' → ');
  return '';
}

function getUserAnswerTextForDisplay(q, userAnswer) {
  if (!q) return '';
  if (q.type === 'multi' || q.type === 'order') {
    return (Array.isArray(userAnswer) ? userAnswer : []).join(q.type === 'order' ? ' → ' : ' / ');
  }
  return String(userAnswer ?? '');
}

function getQuestionId(q, fallbackIndex = 0) {
  const id = q?.id ?? q?.question_id ?? q?.qid ?? null;
  return id != null ? String(id) : `idx_${fallbackIndex}`;
}

function makeTagKey(tags) {
  return (tags || []).map(String).sort().join('|');
}

/* =========================
   マイチーム表示
========================= */

function getCardFrameClasses(baseRarity, stars) {
  const s = stars ?? 1;
  const r = baseRarity ?? 1;

  if (s >= 9 || r >= 7) {
    return {
      frame: 'border-yellow-300 bg-white/90',
      name: 'text-slate-950 drop-shadow',
      rarity: 'text-slate-800',
      accent: 'text-amber-700',
    };
  }
  if (s >= 6 || r >= 5) {
    return {
      frame: 'border-pink-300 bg-white/90',
      name: 'text-slate-950 drop-shadow',
      rarity: 'text-slate-800',
      accent: 'text-rose-700',
    };
  }
  if (s >= 3 || r >= 3) {
    return {
      frame: 'border-sky-300 bg-white/90',
      name: 'text-slate-950 drop-shadow',
      rarity: 'text-slate-800',
      accent: 'text-sky-700',
    };
  }
  return {
    frame: 'border-slate-300 bg-white/90',
    name: 'text-slate-950 drop-shadow',
    rarity: 'text-slate-800',
    accent: 'text-slate-700',
  };
}

function getTowerImageByFloor(floor) {
  const f = Number(floor) || 1;
  if (f === 1) return '/tower/tower1.png';
  if (f >= 2 && f <= 15) return '/tower/tower2.png';
  if (f >= 16 && f <= 19) return '/tower/tower3.png';
  return '/tower/tower4.png';
}

function clampInt(n, min, max) {
  const x = Number(n);
  if (!Number.isFinite(x)) return min;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

/* =========================
   メイン
========================= */

export default function KnowledgeTowerPage() {
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState('');

  const [allQuestionsRaw, setAllQuestionsRaw] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [progress, setProgress] = useState(null);

  const [selectedLoop, setSelectedLoop] = useState(1);
  const [selectedFloor, setSelectedFloor] = useState(1);

  // home | floor | boss | floor_result | boss_result
  const [phase, setPhase] = useState('home');

  const [floorCorrect, setFloorCorrect] = useState(0);
  const [floorMiss, setFloorMiss] = useState(0);

  const [bossCorrect, setBossCorrect] = useState(0);
  const [bossMiss, setBossMiss] = useState(0);

  // ボス全体タイマー：deadline方式（ミス-20秒が回復しない）
  const [bossTotalMs, setBossTotalMs] = useState(BOSS_BASE_TIME_MS);
  const [bossLeftMs, setBossLeftMs] = useState(BOSS_BASE_TIME_MS);
  const bossDeadlineRef = useRef(0);

  // 1問タイマー
  const [questionLeftMs, setQuestionLeftMs] = useState(0);

  // デッキ
  const fullPoolRef = useRef([]);
  const deckRef = useRef([]); // ★ remainingIds の配列
  const [currentQuestion, setCurrentQuestion] = useState(null);

  // 回答
  const [selectedOption, setSelectedOption] = useState(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [multiSelected, setMultiSelected] = useState([]);
  const [orderSelected, setOrderSelected] = useState([]);

  // 履歴（振り返り用）
  const [floorHistory, setFloorHistory] = useState([]);
  const [bossHistory, setBossHistory] = useState([]);

  // フロア○×表示
  const [judgeOverlay, setJudgeOverlay] = useState(null); // { ok: true/false }
  const isLockedByOverlayRef = useRef(false);

  // 演出
  const [bossDamaged, setBossDamaged] = useState(false);
  const [bossExplode, setBossExplode] = useState(false);
  const [showCongrats, setShowCongrats] = useState(false);
  const [playerDamaged, setPlayerDamaged] = useState(false); // ★ミス時、選択肢に傷

  // refs（タイマー）
  const qTimerRef = useRef(null);
  const bossTimerRef = useRef(null);

  const storageKey = `tower_progress_${me?.id ?? 'guest'}`;

  const teamTotalStars = useMemo(() => {
    return (team || []).reduce((sum, ch) => sum + Math.max(1, Number(ch?.stars ?? 1)), 0);
  }, [team]);

  const bossBonusMs = useMemo(() => teamTotalStars * 2000, [teamTotalStars]);

  const bossNeed = useMemo(() => bossNeedCorrectByLoop(selectedLoop), [selectedLoop]);

  const floorTags = useMemo(() => FLOOR_TAGS[selectedFloor] || [], [selectedFloor]);

  const bossImage = useMemo(() => `/tower/boss${selectedFloor}.png`, [selectedFloor]);
  const towerImage = useMemo(() => getTowerImageByFloor(selectedFloor), [selectedFloor]);

const [bossLayout, setBossLayout] = useState(defaultBossLayout(1));

useEffect(() => {
  if (typeof window === 'undefined') return;
  const saved = loadBossLayoutForFloor(selectedFloor);
  setBossLayout(saved || defaultBossLayout(selectedFloor));
}, [selectedFloor]);


  const questionSeconds = Math.max(0, Math.floor(questionLeftMs / 1000));
  const bossSeconds = Math.max(0, Math.floor(bossLeftMs / 1000));

  /* =========================
     デッキ（タグ内を使い切り保証 + 永続化）
  ========================= */

  function deckStorageKeyFor(tags) {
    const tagKey = makeTagKey(tags);
    const uid = me?.id ?? 'guest';
    return `tower_deck_${uid}_${tagKey}`;
  }

  function loadDeckFromStorage(tags) {
    try {
      const key = deckStorageKeyFor(tags);
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.remainingIds) || !Array.isArray(parsed.allIds)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveDeckToStorage(tags, payload) {
    try {
      const key = deckStorageKeyFor(tags);
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {}
  }

  function initDeckWithPool(pool, tagsForThisDeck) {
    const p = Array.isArray(pool) ? pool : [];
    fullPoolRef.current = p;

    const allIds = p.map((q, i) => getQuestionId(q, i));

    const saved = loadDeckFromStorage(tagsForThisDeck);
    if (saved && Array.isArray(saved.allIds) && saved.allIds.length) {
      const currentSet = new Set(allIds);
      const savedRemaining = (saved.remainingIds || []).filter((id) => currentSet.has(id));
      const missing = allIds.filter((id) => !saved.allIds.includes(id)); // 新規追加分

      const remainingIds = shuffleArray([...savedRemaining, ...missing]);

      deckRef.current = remainingIds;
      saveDeckToStorage(tagsForThisDeck, { allIds, remainingIds });
      return;
    }

    const first = shuffleArray(allIds);
    deckRef.current = first;
    saveDeckToStorage(tagsForThisDeck, { allIds, remainingIds: first });
  }

  function drawNextQuestion(tagsForThisDeck) {
    const pool = fullPoolRef.current || [];
    if (!pool.length) {
      setCurrentQuestion(null);
      return null;
    }

    const idToQuestion = new Map();
    pool.forEach((q, i) => idToQuestion.set(getQuestionId(q, i), q));

    // 使い切ったら全件再シャッフル
    if (!deckRef.current || deckRef.current.length === 0) {
      const allIds = pool.map((q, i) => getQuestionId(q, i));
      const reshuffled = shuffleArray(allIds);
      deckRef.current = reshuffled;
      saveDeckToStorage(tagsForThisDeck, { allIds, remainingIds: reshuffled });
    }

    const nextId = deckRef.current.shift();

    const allIds = pool.map((q, i) => getQuestionId(q, i));
    saveDeckToStorage(tagsForThisDeck, { allIds, remainingIds: deckRef.current });

    const next = idToQuestion.get(nextId) || null;
    setCurrentQuestion(next);
    return next;
  }

  /* =========================
     初期ロード
  ========================= */

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setInitLoading(true);
        setInitError('');

        const meRes = await fetch('/api/me', { cache: 'no-store' });
        const meJson = await meRes.json().catch(() => ({}));
        if (!meRes.ok || !meJson.user) {
          setInitError('ユーザー情報の取得に失敗しました。ログインし直してください。');
          return;
        }
        if (cancelled) return;
        setMe(meJson.user);

        const uid = Number(meJson.user.id);
        const teamRes = await fetch(`/api/user/team?user_id=${uid}`, { cache: 'no-store' });
        const teamJson = await teamRes.json().catch(() => ({}));
        if (!cancelled) setTeam(teamJson.team || []);

        let p = null;
        try {
          const raw = window.localStorage.getItem(`tower_progress_${meJson.user.id}`);
          if (raw) p = JSON.parse(raw);
        } catch {}

        if (!p || typeof p !== 'object') {
          p = { loops: {}, last: { loop: 1, floor: 1 } };
        }
        if (!p.loops) p.loops = {};
        for (let l = 1; l <= MAX_LOOP; l++) {
          if (!p.loops[String(l)]) p.loops[String(l)] = { clearedFloor: 0 };
          if (typeof p.loops[String(l)].clearedFloor !== 'number') p.loops[String(l)].clearedFloor = 0;
        }
        if (!p.last) p.last = { loop: 1, floor: 1 };

        const lastLoop = clampInt(p.last.loop, 1, MAX_LOOP);
        const lastFloor = clampInt(p.last.floor, 1, MAX_FLOOR);

        if (!cancelled) {
          setProgress(p);
          setSelectedLoop(lastLoop);
          setSelectedFloor(lastFloor);
        }

        await loadQuestions();
      } catch (e) {
        console.error(e);
        if (!cancelled) setInitError('初期情報の取得に失敗しました。時間をおいて再度お試しください。');
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadQuestions() {
    setLoadingQuestions(true);
    try {
      const res = await fetch('/api/solo/questions?mode=boss', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !Array.isArray(data.questions)) {
        console.error('failed to load questions', data);
        setAllQuestionsRaw([]);
        return;
      }
      setAllQuestionsRaw(data.questions || []);
    } catch (e) {
      console.error(e);
      setAllQuestionsRaw([]);
    } finally {
      setLoadingQuestions(false);
    }
  }

  function saveProgress(next) {
    try {
      const key = me?.id ? `tower_progress_${me.id}` : storageKey;
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {}
  }

  /* =========================
     出題プール構築（タグで絞る）
  ========================= */

  function buildPoolForFloorTags(tags) {
    const tagSet = new Set((tags || []).map(String));
    const filtered = (allQuestionsRaw || []).filter((q) => {
      const ts = getTagsArray(q);
      if (!ts.length) return false;
      return ts.some((t) => tagSet.has(String(t)));
    });

    // id で重複排除
    const map = new Map();
    filtered.forEach((q, i) => {
      const id = getQuestionId(q, i);
      if (!map.has(id)) map.set(id, q);
    });

    const uniq = Array.from(map.values());
    return uniq.map((q, i) => normalizeQuestion(q, i));
  }

  /* =========================
     タイマー制御
  ========================= */

  function stopQuestionTimer() {
    if (qTimerRef.current) {
      clearInterval(qTimerRef.current);
      qTimerRef.current = null;
    }
  }

  function stopBossTimer() {
    if (bossTimerRef.current) {
      clearInterval(bossTimerRef.current);
      bossTimerRef.current = null;
    }
  }

  function startQuestionTimerFor(q) {
    stopQuestionTimer();
    const limit = getTimeLimitMs(q);
    setQuestionLeftMs(limit);
    const start = Date.now();

    qTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const rest = limit - elapsed;
      if (rest <= 0) {
        stopQuestionTimer();
        setQuestionLeftMs(0);
        handleSubmit(true);
      } else {
        setQuestionLeftMs(rest);
      }
    }, 120);
  }

  // deadline方式
  function startBossTotalTimer(totalMs) {
    stopBossTimer();
    setBossTotalMs(totalMs);

    bossDeadlineRef.current = Date.now() + totalMs;
    setBossLeftMs(totalMs);

    bossTimerRef.current = setInterval(() => {
      const rest = bossDeadlineRef.current - Date.now();
      if (rest <= 0) {
        stopBossTimer();
        setBossLeftMs(0);
        endBoss(false, '時間切れ！ボス討伐に失敗…');
      } else {
        setBossLeftMs(rest);
      }
    }, 120);
  }

  useEffect(() => {
    if (phase !== 'floor' && phase !== 'boss') stopQuestionTimer();
    if (phase !== 'boss') stopBossTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  /* =========================
     進行
  ========================= */

  function canSelectLoop(loop) {
    if (!progress) return loop === 1;
    if (loop === 1) return true;
    const prev = progress.loops[String(loop - 1)]?.clearedFloor ?? 0;
    return prev >= 20;
  }

  function isFloorUnlocked(loop, floor) {
    if (!progress) return loop === 1 && floor === 1;
    const cleared = progress.loops[String(loop)]?.clearedFloor ?? 0;
    if (cleared >= 20) return true;
    return floor <= cleared + 1;
  }

  function startFloor() {
    const tags = floorTags;
    const pool = buildPoolForFloorTags(tags);

    if (!pool.length) {
      alert(`このフロアで使える問題がありません。\nタグ: ${tags.join(' / ')}`);
      return;
    }

    if (progress) {
      const next = { ...progress, last: { loop: selectedLoop, floor: selectedFloor } };
      setProgress(next);
      saveProgress(next);
    }

    setFloorCorrect(0);
    setFloorMiss(0);
    setBossCorrect(0);
    setBossMiss(0);

    setFloorHistory([]);
    setBossHistory([]);

    setBossExplode(false);
    setShowCongrats(false);
    setJudgeOverlay(null);
    isLockedByOverlayRef.current = false;

    setSelectedOption(null);
    setTextAnswer('');
    setMultiSelected([]);
    setOrderSelected([]);

    initDeckWithPool(pool, tags);
    const first = drawNextQuestion(tags);

    setPhase('floor');
    if (first) startQuestionTimerFor(first);
  }

  function startBoss() {
    const tags = floorTags;
    const pool = buildPoolForFloorTags(tags);

    if (!pool.length) {
      alert(`このフロアで使える問題がありません。\nタグ: ${tags.join(' / ')}`);
      setPhase('home');
      return;
    }

    const total = BOSS_BASE_TIME_MS + bossBonusMs;
    startBossTotalTimer(total);

    initDeckWithPool(pool, tags);
    const first = drawNextQuestion(tags);

    setBossCorrect(0);
    setBossMiss(0);
    setBossExplode(false);
    setShowCongrats(false);
    setPlayerDamaged(false);

    setSelectedOption(null);
    setTextAnswer('');
    setMultiSelected([]);
    setOrderSelected([]);

    setPhase('boss');
    if (first) startQuestionTimerFor(first);
  }

  /* =========================
     回答
  ========================= */

  function toggleMultiOption(opt) {
    setMultiSelected((prev) => (prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt]));
  }

  function toggleOrderOption(opt) {
    setOrderSelected((prev) => (prev.includes(opt) ? prev.filter((v) => v !== opt) : [...prev, opt]));
  }

  const canSubmit = useMemo(() => {
    if (!currentQuestion) return false;
    if (currentQuestion.type === 'single') return !!selectedOption;
    if (currentQuestion.type === 'text') return !!textAnswer;
    if (currentQuestion.type === 'multi') return multiSelected.length > 0;
    if (currentQuestion.type === 'order') return orderSelected.length === (currentQuestion.options?.length || 0);
    return false;
  }, [currentQuestion, selectedOption, textAnswer, multiSelected, orderSelected]);

  const [floorResultMessage, setFloorResultMessage] = useState(null);
  const [bossResultMessage, setBossResultMessage] = useState(null);

  function handleSubmit(isTimeUp = false) {
    if (!currentQuestion) return;
    if (phase !== 'floor' && phase !== 'boss') return;
    if (isLockedByOverlayRef.current) return;

    const q = currentQuestion;

    let userAnswer = null;
    if (q.type === 'single') userAnswer = selectedOption;
    if (q.type === 'text') userAnswer = textAnswer;
    if (q.type === 'multi') userAnswer = multiSelected;
    if (q.type === 'order') userAnswer = orderSelected;

    const isCorrect = isTimeUp ? false : judgeAnswer(q, userAnswer);

    const historyItem = {
      question: q,
      userAnswer,
      isCorrect,
      correctText: getCorrectTextForDisplay(q),
      userAnswerText: getUserAnswerTextForDisplay(q, userAnswer),
    };

    setSelectedOption(null);
    setTextAnswer('');
    setMultiSelected([]);
    setOrderSelected([]);

    // ===== floor =====
    if (phase === 'floor') {
      stopQuestionTimer();
      setJudgeOverlay({ ok: isCorrect });
      isLockedByOverlayRef.current = true;

      if (isCorrect) setFloorCorrect((v) => v + 1);
      else setFloorMiss((v) => v + 1);

      setFloorHistory((prev) => [...prev, historyItem]);

      setTimeout(() => {
        setJudgeOverlay(null);
        isLockedByOverlayRef.current = false;

        const nextCorrect = floorCorrect + (isCorrect ? 1 : 0);
        const nextMiss = floorMiss + (isCorrect ? 0 : 1);

        if (nextMiss >= FLOOR_MAX_MISS) {
          endFloor(false, 'ミスが規定回数に達しました…');
          return;
        }

        if (nextCorrect >= FLOOR_NEED_CORRECT) {
          setTimeout(() => startBoss(), 280);
          return;
        }

        const next = drawNextQuestion(floorTags);
        if (next) startQuestionTimerFor(next);
      }, 650);

      return;
    }

    // ===== boss =====
    if (isCorrect) {
      setBossCorrect((v) => v + 1);

      setBossDamaged(true);
      setTimeout(() => setBossDamaged(false), 300);
    } else {
      setBossMiss((v) => v + 1);

      // ★選択肢にひっかき傷（1回）
      setPlayerDamaged(true);
      setTimeout(() => setPlayerDamaged(false), 320);

      bossDeadlineRef.current = Math.max(Date.now(), bossDeadlineRef.current - BOSS_MISS_PENALTY_MS);
      const rest = bossDeadlineRef.current - Date.now();
      setBossLeftMs(Math.max(0, rest));
    }

    setBossHistory((prev) => [...prev, historyItem]);

    const nextCorrect = bossCorrect + (isCorrect ? 1 : 0);
    if (nextCorrect >= bossNeed) {
      stopQuestionTimer();
      stopBossTimer();
      endBoss(true, 'ボス撃破！！');
      return;
    }

    const next = drawNextQuestion(floorTags);
    if (next) startQuestionTimerFor(next);
  }

  function endFloor(success, message) {
    stopQuestionTimer();
    setCurrentQuestion(null);
    setPhase('floor_result');
    setFloorResultMessage({ success, message });
  }

  function endBoss(success, message) {
    if (success) {
      setBossExplode(true);

      setTimeout(() => setShowCongrats(true), 700);

      setTimeout(() => {
        setBossExplode(false);
      }, 2600);

      setTimeout(() => {
        setShowCongrats(false);

        if (progress) {
          const p = JSON.parse(JSON.stringify(progress));
          const key = String(selectedLoop);
          const prevCleared = p.loops[key]?.clearedFloor ?? 0;
          p.loops[key].clearedFloor = Math.max(prevCleared, selectedFloor);
          p.last = { loop: selectedLoop, floor: selectedFloor };
          setProgress(p);
          saveProgress(p);

          if (selectedFloor >= 20) {
            const nextLoop = Math.min(MAX_LOOP, selectedLoop + 1);
            if (nextLoop !== selectedLoop && canSelectLoop(nextLoop)) {
              setSelectedLoop(nextLoop);
              setSelectedFloor(1);
            } else {
              setSelectedFloor(20);
            }
          } else {
            setSelectedFloor((f) => Math.min(20, f + 1));
          }
        }

        setBossResultMessage({ success: true, message });
        setPhase('boss_result');
      }, 4100);

      return;
    }

    setBossResultMessage({ success: false, message });
    setPhase('boss_result');
  }

  /* =========================
     共通：ローディング/エラー
  ========================= */

  if (initLoading) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex items-center justify-center">
        <p className="text-sm font-bold">ナレッジタワーを読み込み中...</p>
      </main>
    );
  }

  if (initError) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow p-6 text-center space-y-3">
          <h1 className="text-lg font-extrabold">ナレッジタワー</h1>
          <p className="text-sm text-rose-700 whitespace-pre-wrap">{initError}</p>
          <div className="flex flex-col gap-2">
            <Link
              href="/solo"
              className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold hover:bg-sky-600"
            >
              ソロメニューへ
            </Link>
            <Link
              href="/"
              className="w-full py-2 rounded-full border border-sky-500 bg-white text-sky-700 text-sm font-bold hover:bg-sky-50"
            >
              ホームへ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  /* =========================
     ホーム
  ========================= */

  if (phase === 'home') {
    const loopLocked = (l) => !canSelectLoop(l);

    const clearedThisLoop = progress?.loops?.[String(selectedLoop)]?.clearedFloor ?? 0;
    const thisLoopClearedAll = clearedThisLoop >= 20;

    return (
      <main className="min-h-screen text-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-sky-200 via-sky-100 to-white" />
        <div className="absolute -top-20 -left-20 w-72 h-40 bg-white/60 blur-2xl rounded-full" />
        <div className="absolute top-24 -right-24 w-96 h-56 bg-white/60 blur-2xl rounded-full" />
        <div className="absolute bottom-12 left-10 w-80 h-44 bg-white/50 blur-2xl rounded-full" />

        <div className="relative max-w-5xl mx-auto px-4 py-4">
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-sky-900">🗼 ナレッジタワー</h1>
              <p className="text-[11px] sm:text-xs text-sky-900/80 mt-1">
                地上から天空まで続く塔を、知識で駆け上がろう。
              </p>
            </div>
            <div className="text-right text-[11px] sm:text-xs font-bold text-sky-900">
              <Link href="/solo" className="underline hover:text-sky-700">
                ソロメニュー
              </Link>
              <span className="mx-2">|</span>
              <Link href="/" className="underline hover:text-sky-700">
                ホーム
              </Link>
            </div>
          </header>

          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
            <section className="rounded-3xl border border-sky-300 bg-white/70 shadow-lg overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-extrabold text-sky-900">現在の挑戦</p>
                  <span className="px-3 py-1 rounded-full bg-sky-600 text-white text-[11px] font-extrabold">
                    {selectedLoop}周目 / {selectedFloor}階
                  </span>
                </div>

                <div className="mt-3 relative rounded-2xl overflow-hidden border border-sky-200 bg-sky-50">
                  <img src={towerImage} alt="tower" className="w-full h-[280px] sm:h-[320px] object-cover" />

                  <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-extrabold shadow">
                    現在 {selectedLoop}周目
                  </div>

                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-white/95 via-white/70 to-transparent">
                    <p className="text-[12px] font-extrabold text-slate-900">章別の問題で登る知識の塔。</p>
                    <p className="text-[10px] text-slate-700 mt-1 leading-relaxed">
                      フロアごとに異なるタグの問題が出題されます。20階を制覇を目指そう。
                    </p>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-sky-300 bg-white/70 shadow-lg p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-extrabold text-slate-900">周回を選択</h2>
              </div>

              <div className="mt-2 flex flex-wrap gap-2">
                {Array.from({ length: MAX_LOOP }).map((_, i) => {
                  const l = i + 1;
                  const locked = loopLocked(l);
                  const active = selectedLoop === l;
                  return (
                    <button
                      key={l}
                      type="button"
                      disabled={locked}
                      onClick={() => {
                        if (locked) return;
                        setSelectedLoop(l);
                        setSelectedFloor(1);
                      }}
                      className={
                        'px-3 py-1.5 rounded-full text-[11px] font-extrabold border transition ' +
                        (locked
                          ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed'
                          : active
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50')
                      }
                    >
                      {l}周目{locked ? ' 🔒' : ''}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4">
                <h2 className="text-sm font-extrabold text-slate-900">階層を選択</h2>
                <p className="text-[10px] text-slate-700 mt-1">タグ：{floorTags.join(' / ') || '---'}</p>

                <div className="mt-3 grid grid-cols-5 gap-2">
                  {Array.from({ length: MAX_FLOOR }).map((_, i) => {
                    const f = i + 1;
                    const unlocked = isFloorUnlocked(selectedLoop, f);
                    const active = selectedFloor === f;
                    const cleared = (progress?.loops?.[String(selectedLoop)]?.clearedFloor ?? 0) >= f;

                    return (
                      <button
                        key={f}
                        type="button"
                        disabled={!unlocked}
                        onClick={() => setSelectedFloor(f)}
                        className={
                          'py-1.5 rounded-full text-[11px] font-extrabold border transition ' +
                          (!unlocked
                            ? 'bg-slate-200 text-slate-500 border-slate-300 cursor-not-allowed'
                            : active
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50')
                        }
                      >
                        {f}F{cleared ? ' ✅' : unlocked ? '' : ' 🔒'}
                      </button>
                    );
                  })}
                </div>

                <p className="mt-2 text-[10px] text-slate-700">
                  ※{' '}
                  {thisLoopClearedAll
                    ? 'この周回はクリア済みなので、どの階層からでも挑戦できます。'
                    : '次に挑戦できるのは「今クリアした階 + 1」までです。'}
                </p>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={startFloor}
                    disabled={loadingQuestions || !allQuestionsRaw.length}
                    className={
                      'w-full py-3 rounded-2xl text-white font-extrabold shadow ' +
                      (loadingQuestions || !allQuestionsRaw.length
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'bg-sky-600 hover:bg-sky-700')
                    }
                  >
                    {selectedFloor}階に挑戦する
                  </button>

                  <div className="mt-2 text-[10px] text-slate-700">
                    ボス戦は <span className="font-extrabold">制限時間7分</span>＋ マイチーム合計★{teamTotalStars}
                    で <span className="font-extrabold"> +{Math.floor(bossBonusMs / 1000)}秒</span>。ミスで{' '}
                    <span className="font-extrabold text-rose-700">-20秒</span>。
                  </div>

                  <div className="mt-2 text-[10px] text-slate-700">
                    フロア問題は <span className="font-extrabold">{FLOOR_NEED_CORRECT}問正解</span>でボスへ。ミス{' '}
                    <span className="font-extrabold text-rose-700">{FLOOR_MAX_MISS}回</span>で失敗。
                  </div>
                </div>
              </div>
            </section>
          </div>

          <section className="mt-4 rounded-3xl border border-sky-300 bg-white/75 shadow-lg p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-slate-900">マイチーム & 合計レア度</h2>
              <p className="text-[12px] font-extrabold text-slate-900">
                合計★: <span className="text-emerald-700">{teamTotalStars}</span>
                <span className="text-[10px] text-slate-700 ml-2">（ボス戦 +{Math.floor(bossBonusMs / 1000)}秒）</span>
              </p>
            </div>

            <div className="mt-3 grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[0, 1, 2, 3, 4].map((slot) => {
                const ch = team[slot] || null;
                const stars = ch?.stars ?? 1;
                const baseRarity = ch?.base_rarity ?? 1;
                const frame = getCardFrameClasses(baseRarity, stars);

                return (
                  <div key={slot} className={`rounded-2xl border px-3 py-2 shadow-sm ${frame.frame}`}>
                    <div className="text-[9px] text-slate-600 font-bold">{slot === 0 ? 'リーダー' : `SLOT ${slot + 1}`}</div>
                    {ch ? (
                      <>
                        <div className={`mt-1 text-[11px] font-extrabold leading-tight ${frame.name}`}>{ch.name}</div>
                        <div className={`mt-1 text-[10px] font-bold ${frame.rarity}`}>
                          基礎:{baseRarity} / <span className={frame.accent}>★{stars}</span>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 text-[10px] text-slate-500 font-bold">（未設定）</div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    );
  }

  /* =========================
     フロア
  ========================= */

  if (phase === 'floor') {
    return (
      <main className="min-h-screen text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/tower/rasen.png')" }} />
        <div className="absolute inset-0 bg-black/55" />

        {judgeOverlay && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/35">
            <div
              className={
                'w-44 h-44 rounded-full flex items-center justify-center text-7xl font-extrabold border-4 shadow-2xl ' +
                (judgeOverlay.ok ? 'bg-emerald-500/30 border-emerald-200 text-emerald-100' : 'bg-rose-500/30 border-rose-200 text-rose-100')
              }
            >
              {judgeOverlay.ok ? '〇' : '×'}
            </div>
          </div>
        )}

        <div className="relative max-w-5xl mx-auto px-4 py-3">
          <header className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-base sm:text-xl font-extrabold">
                ナレッジタワー {selectedLoop}周目 {selectedFloor}階
              </h1>
              <p className="text-[11px] text-slate-200 mt-1">
                フロア問題：まず {FLOOR_NEED_CORRECT} 問正解を目指そう（ミス {FLOOR_MAX_MISS} で失敗）
              </p>
            </div>
            <div className="text-right text-[11px] font-bold text-sky-100">
              <button
                type="button"
                onClick={() => {
                  stopQuestionTimer();
                  setPhase('home');
                  setCurrentQuestion(null);
                }}
                className="underline hover:text-white"
              >
                中断してタワーホームへ
              </button>
              <span className="mx-2">|</span>
              <Link href="/" className="underline hover:text-white">
                ホーム
              </Link>
            </div>
          </header>

          <div className="rounded-3xl border border-white/15 bg-white/10 backdrop-blur-md shadow-lg p-4">
            <div className="flex items-center justify-between">
              <p className="text-[12px] font-extrabold">
                フロア問題 正解 {floorCorrect}/{FLOOR_NEED_CORRECT}（ミス {floorMiss}/{FLOOR_MAX_MISS}）
              </p>
              <p className="text-[12px] font-extrabold">
                1問ごとの残り時間：<span className="text-amber-200">{questionSeconds} 秒</span>
              </p>
            </div>

            <div className="mt-3 rounded-2xl border border-white/15 bg-black/30 p-3">
              {currentQuestion ? (
                <>
                  <p className="text-sm sm:text-base font-extrabold leading-relaxed">{currentQuestion.question || currentQuestion.text}</p>

                  <div className="mt-3 space-y-2">
                    {currentQuestion.type === 'single' &&
                      (currentQuestion.options || []).map((opt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedOption(opt)}
                          className={
                            'w-full text-left px-3 py-2 rounded-2xl border text-[12px] font-bold transition ' +
                            (selectedOption === opt ? 'bg-amber-400/20 border-amber-300 text-white' : 'bg-white/10 border-white/15 hover:bg-white/15')
                          }
                        >
                          {opt}
                        </button>
                      ))}

                    {currentQuestion.type === 'multi' &&
                      (currentQuestion.options || []).map((opt, idx) => {
                        const active = multiSelected.includes(opt);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleMultiOption(opt)}
                            className={
                              'w-full text-left px-3 py-2 rounded-2xl border text-[12px] font-bold transition flex items-center justify-between ' +
                              (active ? 'bg-amber-400/20 border-amber-300 text-white' : 'bg-white/10 border-white/15 hover:bg-white/15')
                            }
                          >
                            <span>{opt}</span>
                            <span className="text-sm">{active ? '✔' : ''}</span>
                          </button>
                        );
                      })}

                    {currentQuestion.type === 'order' && (
                      <div className="space-y-2">
                        {(currentQuestion.options || []).map((opt, idx) => {
                          const selected = orderSelected.includes(opt);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => toggleOrderOption(opt)}
                              className={
                                'w-full text-left px-3 py-2 rounded-2xl border text-[12px] font-bold transition ' +
                                (selected ? 'bg-white/5 border-white/20 text-white/70' : 'bg-white/10 border-white/15 hover:bg-white/15')
                              }
                            >
                              {opt}
                            </button>
                          );
                        })}
                        <div className="rounded-2xl border border-white/15 bg-black/25 p-3">
                          <p className="text-[11px] font-bold text-white/80 mb-1">現在の並び</p>
                          {orderSelected.length ? (
                            <ol className="list-decimal list-inside text-[12px] font-bold">
                              {orderSelected.map((v, i) => (
                                <li key={i}>{v}</li>
                              ))}
                            </ol>
                          ) : (
                            <p className="text-[11px] text-white/60">未選択</p>
                          )}
                        </div>
                      </div>
                    )}

                    {currentQuestion.type === 'text' && (
                      <textarea
                        className="w-full rounded-2xl border border-white/15 bg-black/30 px-3 py-2 text-[12px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-sky-400"
                        rows={3}
                        placeholder="答えを入力"
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (canSubmit) handleSubmit(false);
                          }
                        }}
                      />
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubmit(false)}
                      disabled={!canSubmit}
                      className="flex-1 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold"
                    >
                      解答する
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm font-bold">問題を読み込み中...</p>
              )}
            </div>
          </div>
        </div>
      </main>
    );
  }

  /* =========================
     ボス
  ========================= */

  if (phase === 'boss') {
    const bossBarRatio = bossTotalMs > 0 ? Math.max(0, Math.min(1, bossLeftMs / bossTotalMs)) : 0;

    return (
      <main className="min-h-screen text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-black" />

        <div className="absolute top-0 left-0 right-0 h-3 bg-black/40 border-b border-white/10">
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500 transition-[width] duration-150"
            style={{ width: `${bossBarRatio * 100}%` }}
          />
        </div>

        {showCongrats && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="text-center">
              <div className="text-4xl sm:text-6xl font-extrabold drop-shadow-[0_0_18px_rgba(255,255,255,0.35)]">
                CONGRATULATIONS 🎉
              </div>
              <p className="mt-3 text-sm font-bold text-white/90">Tower Boss {selectedFloor}F を撃破！</p>
            </div>
          </div>
        )}

        <div className="relative max-w-5xl mx-auto px-4 pt-6 pb-4">
          <header className="flex items-start justify-between mb-3">
            <div>
              <h1 className="text-base sm:text-xl font-extrabold">
                ナレッジタワー {selectedLoop}周目 {selectedFloor}階
              </h1>
              <p className="text-[11px] text-slate-200 mt-1">ボス戦：制限時間内に規定数正解すれば勝利！</p>
            </div>
            <div className="text-right text-[11px] font-bold text-sky-100">
              <button
                type="button"
                onClick={() => {
                  stopQuestionTimer();
                  stopBossTimer();
                  setPhase('home');
                  setCurrentQuestion(null);
                }}
                className="underline hover:text-white"
              >
                中断してタワーホームへ
              </button>
              <span className="mx-2">|</span>
              <Link href="/" className="underline hover:text-white">
                ホーム
              </Link>
            </div>
          </header>

          <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[12px] font-extrabold">
                ボス戦 正解 {bossCorrect}/{bossNeed}（ミス {bossMiss}）
              </p>
              <p className="text-[12px] font-extrabold">
                ボス残り時間：<span className="text-amber-200">{bossSeconds} 秒</span>
              </p>
            </div>

            <div className="mt-4">
              <div
                className={
                  'relative w-full max-w-3xl mx-auto rounded-3xl overflow-hidden border border-white/10 shadow-2xl ' +
                  (bossDamaged ? 'bossShake' : '')
                }
              >
                <img src="/tower/boss0.png" alt="boss-bg" className="w-full h-[260px] sm:h-[320px] object-cover opacity-90" />

                <div className="absolute inset-0 flex items-center justify-center">
<img
  src={bossImage}
  alt={`boss-${selectedFloor}`}
  style={{
    width: `${bossLayout?.wPct ?? 78}%`,
    transform: `translate(${bossLayout?.x ?? 0}px, ${bossLayout?.y ?? 0}px) scale(${bossLayout?.scale ?? 1}) rotate(${bossLayout?.rotate ?? 0}deg)`,
    transformOrigin: 'center center',
  }}
  className={
    'max-h-[90%] object-contain ' + (bossExplode ? 'bossExplode' : '')
  }
/>

                </div>

                <div className="absolute top-3 left-3 px-3 py-1.5 rounded-full bg-black/60 text-white text-xs font-extrabold">
                  Tower Boss {selectedFloor}F
                </div>

                {bossDamaged && (
                  <div className="absolute inset-0 pointer-events-none">
                    <div className="slash slash1" />
                    <div className="slash slash2" />
                    <div className="slash slash3" />
                    <div className="flash" />
                  </div>
                )}

                {bossExplode && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="boomRing" />
                    <div className="boomRing boomRing2" />
                    <div className="boomCore" />
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-3xl border border-white/10 bg-black/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[12px] font-extrabold">
                  1問ごとの残り：<span className="text-amber-200">{questionSeconds} 秒</span>
                </span>
              </div>

              {currentQuestion ? (
                <>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
                    <p className="text-sm sm:text-base font-extrabold leading-relaxed">{currentQuestion.question || currentQuestion.text}</p>
                  </div>

                  <div className={'mt-3 space-y-2 ' + (playerDamaged ? 'playerDamage' : '')}>
                    {currentQuestion.type === 'single' &&
                      (currentQuestion.options || []).map((opt, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedOption(opt)}
                          className={
                            'w-full text-left px-3 py-2 rounded-2xl border text-[12px] font-bold transition ' +
                            (selectedOption === opt ? 'bg-orange-500/20 border-orange-300 text-white' : 'bg-white/8 border-white/12 hover:bg-white/12')
                          }
                        >
                          {opt}
                        </button>
                      ))}

                    {currentQuestion.type === 'multi' &&
                      (currentQuestion.options || []).map((opt, idx) => {
                        const active = multiSelected.includes(opt);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleMultiOption(opt)}
                            className={
                              'w-full text-left px-3 py-2 rounded-2xl border text-[12px] font-bold transition flex items-center justify-between ' +
                              (active ? 'bg-orange-500/20 border-orange-300 text-white' : 'bg-white/8 border-white/12 hover:bg-white/12')
                            }
                          >
                            <span>{opt}</span>
                            <span className="text-sm">{active ? '✔' : ''}</span>
                          </button>
                        );
                      })}

                    {currentQuestion.type === 'order' && (
                      <div className="space-y-2">
                        {(currentQuestion.options || []).map((opt, idx) => {
                          const selected = orderSelected.includes(opt);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => toggleOrderOption(opt)}
                              className={
                                'w-full text-left px-3 py-2 rounded-2xl border text-[12px] font-bold transition ' +
                                (selected ? 'bg-white/5 border-white/20 text-white/70' : 'bg-white/8 border-white/12 hover:bg-white/12')
                              }
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {currentQuestion.type === 'text' && (
                      <textarea
                        className="w-full rounded-2xl border border-white/12 bg-black/30 px-3 py-2 text-[12px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-orange-400"
                        rows={3}
                        placeholder="答えを入力"
                        value={textAnswer}
                        onChange={(e) => setTextAnswer(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (canSubmit) handleSubmit(false);
                          }
                        }}
                      />
                    )}
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleSubmit(false)}
                      disabled={!canSubmit}
                      className="flex-1 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold"
                    >
                      ボスを攻撃する
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopQuestionTimer();
                        stopBossTimer();
                        setPhase('home');
                        setCurrentQuestion(null);
                      }}
                      className="px-4 py-3 rounded-2xl border border-white/15 bg-white/10 hover:bg-white/15 font-extrabold"
                    >
                      中断
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm font-bold">問題を読み込み中...</p>
              )}
            </div>
          </div>
        </div>

        <style jsx>{`
          .bossShake {
            animation: shake 0.28s linear;
          }
          @keyframes shake {
            0% {
              transform: translate(0, 0) rotate(0deg);
            }
            25% {
              transform: translate(-6px, 2px) rotate(-0.6deg);
            }
            50% {
              transform: translate(6px, -2px) rotate(0.6deg);
            }
            75% {
              transform: translate(-4px, -2px) rotate(-0.4deg);
            }
            100% {
              transform: translate(0, 0) rotate(0deg);
            }
          }

          .slash {
            position: absolute;
            left: -20%;
            top: 50%;
            width: 140%;
            height: 6px;
            background: rgba(255, 120, 120, 0.95);
            box-shadow: 0 0 18px rgba(255, 140, 140, 0.95), 0 0 40px rgba(255, 80, 80, 0.55);
            border-radius: 999px;
          }
          .slash1 {
            transform: rotate(22deg);
            animation: slash 0.22s ease-out;
          }
          .slash2 {
            transform: rotate(-16deg);
            opacity: 0.9;
            animation: slash 0.24s ease-out;
          }
          .slash3 {
            transform: rotate(48deg);
            opacity: 0.75;
            animation: slash 0.26s ease-out;
          }

          @keyframes slash {
            0% {
              transform: translateX(-60px) scaleX(0.4) rotate(0deg);
              opacity: 0;
            }
            35% {
              opacity: 1;
            }
            100% {
              transform: translateX(40px) scaleX(1) rotate(0deg);
              opacity: 0;
            }
          }

          .flash {
            position: absolute;
            inset: 0;
            background: rgba(255, 220, 220, 0.25);
            animation: flash 0.22s ease-out;
          }
          @keyframes flash {
            0% {
              opacity: 0;
            }
            30% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }

          .bossExplode {
            animation: explodeScale 0.55s ease-out forwards;
          }
          @keyframes explodeScale {
            0% {
              transform: scale(1);
              opacity: 1;
              filter: saturate(1);
            }
            70% {
              transform: scale(1.12);
              opacity: 1;
              filter: saturate(1.6);
            }
            100% {
              transform: scale(0.2);
              opacity: 0;
              filter: saturate(2);
            }
          }

          .boomRing {
            width: 220px;
            height: 220px;
            border-radius: 999px;
            border: 6px solid rgba(255, 220, 120, 0.9);
            box-shadow: 0 0 30px rgba(255, 200, 100, 0.7), 0 0 60px rgba(255, 120, 80, 0.35);
            animation: ring 0.65s ease-out forwards;
          }
          .boomRing2 {
            position: absolute;
            width: 280px;
            height: 280px;
            border-color: rgba(255, 140, 140, 0.75);
            animation-delay: 0.06s;
          }
          @keyframes ring {
            0% {
              transform: scale(0.2);
              opacity: 0.2;
            }
            30% {
              opacity: 1;
            }
            100% {
              transform: scale(1.6);
              opacity: 0;
            }
          }

          .boomCore {
            position: absolute;
            width: 120px;
            height: 120px;
            border-radius: 999px;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.95), rgba(255, 200, 120, 0.8), rgba(255, 80, 80, 0));
            animation: core 0.55s ease-out forwards;
          }
          @keyframes core {
            0% {
              transform: scale(0.2);
              opacity: 0.2;
            }
            40% {
              transform: scale(1.2);
              opacity: 1;
            }
            100% {
              transform: scale(1.8);
              opacity: 0;
            }
          }

          /* ★ミス時：選択肢全体にひっかき傷 */
          .playerDamage {
            position: relative;
          }
          .playerDamage::before {
            content: '';
            position: absolute;
            inset: -6px;
            border-radius: 18px;
            background: rgba(255, 60, 60, 0.08);
            box-shadow: 0 0 30px rgba(255, 80, 80, 0.25);
            pointer-events: none;
            animation: pdFlash 0.32s ease-out;
          }
          .playerDamage::after {
            content: '';
            position: absolute;
            left: 6%;
            top: 40%;
            width: 88%;
            height: 4px;
            border-radius: 999px;
            background: rgba(255, 120, 120, 0.95);
            box-shadow: 0 0 16px rgba(255, 140, 140, 0.85);
            transform: rotate(-12deg);
            pointer-events: none;
            animation: pdSlash 0.32s ease-out;
          }
          @keyframes pdFlash {
            0% {
              opacity: 0;
            }
            30% {
              opacity: 1;
            }
            100% {
              opacity: 0;
            }
          }
          @keyframes pdSlash {
            0% {
              opacity: 0;
              transform: translateX(-30px) rotate(-12deg) scaleX(0.6);
            }
            35% {
              opacity: 1;
            }
            100% {
              opacity: 0;
              transform: translateX(24px) rotate(-12deg) scaleX(1);
            }
          }
        `}</style>
      </main>
    );
  }

  /* =========================
     結果（フロア）
  ========================= */

  if (phase === 'floor_result') {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold">
                フロア結果：{selectedLoop}周目 {selectedFloor}階
              </h1>
              <p className="text-sm text-white/80 mt-1">{floorResultMessage?.message ?? ''}</p>
            </div>
            <div className="text-right text-sm font-bold">
              <button onClick={() => setPhase('home')} className="underline hover:text-amber-200">
                タワーホームへ
              </button>
            </div>
          </header>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-extrabold">
              正解 {floorCorrect}/{FLOOR_NEED_CORRECT} ／ ミス {floorMiss}/{FLOOR_MAX_MISS}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-extrabold mb-3">振り返り</h2>
            <div className="space-y-3">
              {floorHistory.map((h, idx) => (
                <div key={h.question?._towerKey ?? idx} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">{idx + 1}. {h.isCorrect ? '✅ 正解' : '❌ 不正解'}</span>
                    <span className="text-xs text-white/70">{h.question?.type ?? ''}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold">{h.question?.question ?? h.question?.text}</p>
                  <p className="mt-2 text-xs text-white/80">
                    あなた：<span className="font-extrabold text-white">{h.userAnswerText || '（未回答）'}</span>
                  </p>
                  <p className="mt-1 text-xs text-white/80">
                    正解：<span className="font-extrabold text-emerald-200">{h.correctText}</span>
                  </p>
                  <div className="mt-3">
                    <QuestionReviewAndReport question={h.question} />
                  </div>
                </div>
              ))}
              {floorHistory.length === 0 && <p className="text-sm text-white/70">履歴がありません。</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setPhase('home')} className="flex-1 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 font-extrabold">
              タワーホームへ戻る
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* =========================
     結果（ボス）
  ========================= */

  if (phase === 'boss_result') {
    return (
      <main className="min-h-screen bg-slate-950 text-white px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-4">
          <header className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-extrabold">
                ボス結果：{selectedLoop}周目 {selectedFloor}階
              </h1>
              <p className="text-sm text-white/80 mt-1">{bossResultMessage?.message ?? ''}</p>
            </div>
            <div className="text-right text-sm font-bold">
              <button onClick={() => setPhase('home')} className="underline hover:text-amber-200">
                タワーホームへ
              </button>
            </div>
          </header>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <p className="text-sm font-extrabold">
              正解 {bossCorrect}/{bossNeed} ／ ミス {bossMiss}
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-sm font-extrabold mb-3">振り返り</h2>
            <div className="space-y-3">
              {bossHistory.map((h, idx) => (
                <div key={h.question?._towerKey ?? idx} className="rounded-2xl border border-white/10 bg-black/25 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold">{idx + 1}. {h.isCorrect ? '✅ 正解' : '❌ 不正解'}</span>
                    <span className="text-xs text-white/70">{h.question?.type ?? ''}</span>
                  </div>
                  <p className="mt-2 text-sm font-bold">{h.question?.question ?? h.question?.text}</p>
                  <p className="mt-2 text-xs text-white/80">
                    あなた：<span className="font-extrabold text-white">{h.userAnswerText || '（未回答）'}</span>
                  </p>
                  <p className="mt-1 text-xs text-white/80">
                    正解：<span className="font-extrabold text-emerald-200">{h.correctText}</span>
                  </p>
                  <div className="mt-3">
                    <QuestionReviewAndReport question={h.question} />
                  </div>
                </div>
              ))}
              {bossHistory.length === 0 && <p className="text-sm text-white/70">履歴がありません。</p>}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setPhase('home')} className="flex-1 py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 font-extrabold">
              タワーホームへ戻る
            </button>
          </div>
        </div>
      </main>
    );
  }

  return null;
}
