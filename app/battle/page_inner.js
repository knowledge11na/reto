// file: app/battle/page_inner.js
'use client';

import { Suspense, useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io from 'socket.io-client';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';
import { STORY_OPPONENTS, getBatchCount } from './story_opponents.js';

let socket;

// 問題タイプ別の制限時間（ミリ秒）
const TIME_SINGLE = 30000; // 単一選択
const TIME_MULTI_ORDER = 40000; // 複数選択 / 並び替え
const TIME_TEXT = 60000; // 記述（15文字以内）
const TIME_TEXT_LONG = 80000; // 記述（16文字以上）

// AI戦の最大問題数（旧AI）
const MAX_AI_QUESTIONS = 30;

// ==== roomIdから決定的な乱数を作るユーティリティ ====
function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleDeterministic(array, seedStr) {
  const seedMaker = xmur3(seedStr);
  const rng = mulberry32(seedMaker());
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 正解文字列をパース（JSON配列 or 区切り文字）
function parseCorrectValues(ans) {
  if (!ans) return [];
  try {
    const parsed = JSON.parse(ans);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
  } catch {}
  return String(ans)
    .split(/[、,／\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 文字列のゆるめ正規化（記述用）
function normalizeText(s) {
  return String(s ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

// 表示用の正解テキスト
function getDisplayAnswer(q) {
  if (!q) return '';
  const list = parseCorrectValues(q.answer);
  if (list.length === 0) return q.answer || '';
  return list.join(' / ');
}

// この問題のタイプ
function getQuestionType(q) {
  return q?.type || 'single';
}

// タグ配列を取り出す（DBの形が揺れてても吸収）
function getTagsArray(q) {
  if (!q) return [];
  if (Array.isArray(q.tags)) return q.tags.map(String);
  if (typeof q.tags === 'string') {
    const t = q.tags.trim();
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
  if (typeof q.tag === 'string' && q.tag.trim()) return [q.tag.trim()];
  if (typeof q.story_tag === 'string' && q.story_tag.trim()) return [q.story_tag.trim()];
  return [];
}

function BattlePageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const roomId = searchParams.get('room') || 'default';
  const modeParam = searchParams.get('mode');

  const isAiMode = modeParam === 'ai'; // 旧AI
  const isStoryMode = modeParam === 'story'; // ★新：ストーリーAI対戦

  // story mode: enemy 指定があればそれを優先
  const enemyKey = searchParams.get('enemy') || '';

  const [me, setMe] = useState(null);
  const meRef = useRef(null); // ★ socket effect を張り替えないために ref で持つ
  const [socketId, setSocketId] = useState(null);

  // waiting / prebattle / pick / question / waiting-opponent / finished
  const [phase, setPhase] = useState(isStoryMode ? 'prebattle' : 'waiting');

  const [questions, setQuestions] = useState([]);
  const [timeLeft, setTimeLeft] = useState(0);

  // ★ スコア（10点先取）
  const [myScore, setMyScore] = useState(0);
  const [myTime, setMyTime] = useState(0);

  const [oppName, setOppName] = useState(isAiMode ? 'AIなつ' : isStoryMode ? '対戦相手' : '相手待ち');
  const [oppScore, setOppScore] = useState(0);
  const [oppTime, setOppTime] = useState(0);

  // ★ 旧AIの種類
  const [aiVariant, setAiVariant] = useState('natsu');

  // ★ ストーリーAIの相手
  const [storyOpp, setStoryOpp] = useState(null);
  const [chosenTags, setChosenTags] = useState([]); // タグ確定（複数OK）
  const [tagOptions, setTagOptions] = useState([]); // 相手が提示

  // ★ ストーリー：1ターンに出す問題（1〜4）
  const [batch, setBatch] = useState([]); // [{...q}]
  const [activeQ, setActiveQ] = useState(null); // 選んだ問題
  const [deckCursor, setDeckCursor] = useState(0);

  const [selected, setSelected] = useState(null); // 単一選択
  const [multiSelected, setMultiSelected] = useState([]); // 複数選択
  const [orderSelected, setOrderSelected] = useState([]); // 並び替え
  const [textAnswer, setTextAnswer] = useState(''); // 記述

  const [result, setResult] = useState(null);
  const [log, setLog] = useState([]);

  // ★ 不備報告用：各問題の履歴
  const [answerHistory, setAnswerHistory] = useState([]);

  // 判定表示用: { isCorrect: boolean, correctAnswer: string }
  const [judge, setJudge] = useState(null);

  // タイマー（ストーリーは “問題を選んだ瞬間” から開始）
  const timerStartRef = useRef(0);
  const limitRef = useRef(0);

  const currentQuestion = isStoryMode ? activeQ : questions[0]; // storyはactiveQ、PVP/旧AIは先頭
  const qType = getQuestionType(currentQuestion);

  const addLog = (msg) => setLog((prev) => [...prev, msg]);

  // ★ 不備報告用：履歴追加
  const pushHistory = (userAnswerText) => {
    if (!currentQuestion) return;
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: currentQuestion.id,
        text: currentQuestion.text || '',
        userAnswerText,
        correctAnswerText: getDisplayAnswer(currentQuestion),
      },
    ]);
  };

  // 自分情報
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // ★ meRef 同期（socket effect を張り替えない）
  useEffect(() => {
    meRef.current = me;
  }, [me]);

  // ====== PVP: socket 接続＆イベント（me変更で張り替えない） ======
  useEffect(() => {
    if (isAiMode || isStoryMode) return;

    if (!socket) {
      const url =
        process.env.NEXT_PUBLIC_SOCKET_URL ||
        `${window.location.protocol}//${window.location.hostname}:4000`;

      socket = io(url, { transports: ['websocket'] });
    }

    const s = socket;

    const doJoin = () => {
      const m = meRef.current;
      s.emit('battle:join', {
        roomId,
        playerName: m?.display_name || m?.username || 'プレイヤー',
        userId: m?.id ?? null,
      });
    };

    const onConnect = () => {
      setSocketId(s.id);
      doJoin();
    };

    const onBattleStart = (payload) => {
      console.log('[battle:start]', payload);

      setOppName(payload.opponentName || '相手');
      setMyScore(0);
      setMyTime(0);
      setOppScore(0);
      setOppTime(0);
      setJudge(null);
      setResult(null);

      // ★ ここで question へ
      setPhase('question');
    };

    s.on('connect', onConnect);
    s.on('battle:start', onBattleStart);

    // すでに繋がってるなら即 join
    if (s.connected) doJoin();

    return () => {
      s.off('connect', onConnect);
      s.off('battle:start', onBattleStart);
    };
  }, [roomId, isAiMode, isStoryMode]);

  // ====== ストーリーAI: 相手決定 & タグ提示 ======
  useEffect(() => {
    if (!isStoryMode) return;

    let opp =
      STORY_OPPONENTS.find((o) => o.key === enemyKey) ||
      STORY_OPPONENTS[Math.floor(Math.random() * STORY_OPPONENTS.length)];

    setStoryOpp(opp);
    setOppName(opp?.name || '対戦相手');

    // タグ提示
    const offers = Array.isArray(opp?.tagOffer) ? opp.tagOffer : [];
    setTagOptions(offers);

    // forcedTags があるなら最初から固定
    const forced = Array.isArray(opp?.forcedTags) ? opp.forcedTags : [];
    if (forced.length) {
      setChosenTags(forced);
      setPhase('pick'); // すぐ開始可
    } else {
      setChosenTags([]);
      setPhase('prebattle'); // タグ選択へ
    }
  }, [isStoryMode, enemyKey]);

  // ====== 問題取得（PVP/旧AI/ストーリーAI 共通で一度取る） ======
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        const endpoint = isAiMode ? '/api/ai-questions' : '/api/questions';
        const res = await fetch(endpoint);
        const data = await res.json();

        const srcArray = Array.isArray(data) ? data : Array.isArray(data.questions) ? data.questions : [];

        // 重複除去
        const uniqueMap = new Map();
        for (const q of srcArray) {
          const key = `${q.question_text || q.question || ''}__${q.correct_answer ?? ''}`;
          if (!uniqueMap.has(key)) uniqueMap.set(key, q);
        }
        const uniqueQuestions = Array.from(uniqueMap.values());

        // シャッフル
        let picked;
        if (isAiMode || isStoryMode) {
          // AI系は毎回ランダム
          picked = [...uniqueQuestions].sort(() => Math.random() - 0.5);
        } else {
          // PVPは決定的シャッフル
          picked = shuffleDeterministic(uniqueQuestions, roomId);
        }

        // battle用に整形
        const normalized = picked.map((q, idx) => {
          // options
          let options = [];
          try {
            if (Array.isArray(q.options)) options = q.options;
            else if (Array.isArray(q.options_json)) options = q.options_json;
            else if (typeof q.options_json === 'string') {
              const parsed = JSON.parse(q.options_json);
              if (Array.isArray(parsed)) options = parsed;
            }
          } catch {
            options = [];
          }

          const text = q.question_text || q.question || '';
          const answer = q.correct_answer ?? '';

          // altAnswers
          let altAnswers = [];
          try {
            if (Array.isArray(q.altAnswers)) altAnswers = q.altAnswers;
            else if (Array.isArray(q.alt_answers_json)) altAnswers = q.alt_answers_json;
            else if (typeof q.alt_answers_json === 'string') {
              const parsed = JSON.parse(q.alt_answers_json);
              if (Array.isArray(parsed)) altAnswers = parsed;
            }
          } catch {
            altAnswers = [];
          }

          // type 判定
          const answerList = parseCorrectValues(answer);
          const rawType = (q.type || '').toString().toLowerCase();
          let type = 'single';

          if (!options || options.length === 0) {
            type = 'text';
          } else if (rawType) {
            if (rawType.includes('order') || rawType.includes('ordering') || rawType.includes('並') || rawType.includes('順')) {
              type = 'ordering';
            } else if (rawType.includes('multi') || rawType.includes('multiple') || rawType.includes('checkbox') || rawType.includes('複数')) {
              type = 'multi';
            } else if (rawType.includes('text') || rawType.includes('written') || rawType.includes('記述')) {
              type = 'text';
            } else if (rawType.includes('single') || rawType.includes('radio') || rawType.includes('単一') || rawType.includes('一択')) {
              type = 'single';
            } else {
              if (answerList.length > 1) {
                const t = text.replace(/\s/g, '');
                if (t.includes('順') || t.includes('並べ') || t.includes('順番')) type = 'ordering';
                else type = 'multi';
              } else {
                type = 'single';
              }
            }
          } else {
            if (answerList.length > 1) {
              const t = text.replace(/\s/g, '');
              if (t.includes('順') || t.includes('並べ') || t.includes('順番')) type = 'ordering';
              else type = 'multi';
            } else {
              type = 'single';
            }
          }

          // 選択肢シャッフル
          if (options && options.length > 0) {
            const optSeed = `${roomId}-q-${q.id ?? idx}`;
            options = shuffleDeterministic(options, optSeed);
          }

          const tags = getTagsArray(q);

          return { id: q.id ?? idx, text, type, options, answer, altAnswers, tags };
        });

        setQuestions(normalized);
      } catch (e) {
        console.error(e);
        addLog('問題取得に失敗しました');
      }
    };

    fetchQuestions();
  }, [roomId, isAiMode, isStoryMode]);

  const calcTimeLimit = (q) => {
    if (!q) return TIME_SINGLE;
    const t = getQuestionType(q);
    if (t === 'single') return TIME_SINGLE;
    if (t === 'multi' || t === 'ordering') return TIME_MULTI_ORDER;
    const len = (q.answer || '').length;
    if (len > 15) return TIME_TEXT_LONG;
    return TIME_TEXT;
  };

  // ====== ストーリーAI：タグ確定後にデッキ構築 ======
  const storyDeck = useMemo(() => {
    if (!isStoryMode) return [];
    if (!questions.length) return [];

    const opp = storyOpp;
    if (!opp) return [];

    // ALL 指定は絞らない
    const useAll = chosenTags.includes('ALL');

    let list = questions;
    if (!useAll && chosenTags.length) {
      const set = new Set(chosenTags.map(String));
      list = questions.filter((q) => (q.tags || []).some((t) => set.has(String(t))));
    }

    // 相手ごとの poolSize だけ使う
    const max = Math.max(10, Math.min(200, Number(opp.poolSize) || 60));
    return list.slice(0, max);
  }, [isStoryMode, questions, storyOpp, chosenTags]);

  // ====== ストーリーAI：バッチ生成 ======
  const buildNextBatch = () => {
    const opp = storyOpp;
    if (!opp) return;

    const count = getBatchCount(opp);
    const start = deckCursor;
    const end = Math.min(storyDeck.length, start + count);

    // 足りなかったら先頭から補充（ループ）
    let picked = storyDeck.slice(start, end);
    if (picked.length < count && storyDeck.length) {
      const need = count - picked.length;
      picked = [...picked, ...storyDeck.slice(0, Math.min(need, storyDeck.length))];
    }

    setBatch(picked);
    setActiveQ(count === 1 ? picked[0] : null); // 強敵(1問)なら自動選択
    setDeckCursor((prev) => prev + count);

    setSelected(null);
    setMultiSelected([]);
    setOrderSelected([]);
    setTextAnswer('');
    setJudge(null);

    // phase
    if (count === 1) {
      setPhase('question');
    } else {
      setPhase('pick');
    }
  };

  // ====== ストーリーAI：開始ボタン（タグ決定→初回バッチ） ======
  const startStoryBattle = () => {
    if (!storyOpp) return;

    let tags = chosenTags;
    if (!tags || tags.length === 0) {
      tags = ['ALL'];
      setChosenTags(tags);
    }

    setMyScore(0);
    setMyTime(0);
    setOppScore(0);
    setOppTime(0);
    setAnswerHistory([]);
    setResult(null);
    setJudge(null);

    setDeckCursor(0);

    addLog(`ストーリー対戦開始: ${storyOpp.name} / tags=${tags.join(', ')}`);
    buildNextBatch();
  };

  // ====== タイマー制御（question の時だけ） ======
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) {
      setTimeLeft(0);
      return;
    }

    const limit = calcTimeLimit(currentQuestion);
    limitRef.current = limit;
    timerStartRef.current = Date.now();

    setTimeLeft(limit);

    const timerId = setInterval(() => {
      const elapsed = Date.now() - timerStartRef.current;
      const remain = limit - elapsed;

      if (remain <= 0) {
        clearInterval(timerId);
        setTimeLeft(0);
        handleTimeout(limit);
      } else {
        setTimeLeft(remain);
      }
    }, 50);

    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentQuestion?.id]);

  const handleTimeout = (limit) => {
    if (phase !== 'question' || !currentQuestion) return;

    setPhase('waiting-opponent');
    addLog('時間切れ');

    setJudge({ isCorrect: false, correctAnswer: getDisplayAnswer(currentQuestion) });
    pushHistory('（時間切れ）');

    // AI進行 / PVP送信
    sendAnswer(false, limit);
  };

  // ====== AI側の振る舞い（ストーリー仕様） ======
  const storyAiCompute = (limitMs) => {
    const opp = storyOpp;
    if (!opp) return { aiCorrect: false, aiUsed: Math.min(limitMs, 15000) };

    const p = Math.max(0, Math.min(1, Number(opp.correctRate) || 0.6));
    const aiCorrect = Math.random() < p;

    const baseSec = Math.max(1, Number(opp.answerSec) || 15);
    const jitter = Math.random() * 6 - 3;
    let sec = baseSec + jitter;

    const limitSec = Math.max(1, Math.floor(limitMs / 1000));
    sec = Math.max(1, Math.min(limitSec, sec));

    const aiUsed = Math.round(sec * 1000);
    return { aiCorrect, aiUsed };
  };

  // ====== 勝敗判定（10点先取） ======
  const finishStoryBattle = (myScoreVal, myTimeVal, oppScoreVal, oppTimeVal) => {
    let outcome = 'draw';
    if (myScoreVal > oppScoreVal) outcome = 'win';
    else if (myScoreVal < oppScoreVal) outcome = 'lose';
    else {
      if (myTimeVal < oppTimeVal) outcome = 'win';
      else if (myTimeVal > oppTimeVal) outcome = 'lose';
      else outcome = 'win';
    }

    const rewardPoints = outcome === 'win' ? (Number(storyOpp?.rewardPoints) || 10) : 0;

    setPhase('finished');
    setResult({
      mode: 'story',
      outcome,
      self: { score: myScoreVal, totalTimeMs: myTimeVal },
      opponent: { score: oppScoreVal, totalTimeMs: oppTimeVal },
      storyOpponent: { key: storyOpp?.key, name: storyOpp?.name },
      rewardPoints,
      chosenTags,
    });

    if (rewardPoints > 0) {
      fetch('/api/solo/narebat-points/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: rewardPoints, reason: 'story_battle_win' }),
      }).catch(() => {});
    }
  };

  const goNextTurnStory = (myScoreVal, myTimeVal, oppScoreVal, oppTimeVal) => {
    const someoneReached10 = myScoreVal >= 10 || oppScoreVal >= 10;
    if (someoneReached10) {
      finishStoryBattle(myScoreVal, myTimeVal, oppScoreVal, oppTimeVal);
      return;
    }

    setActiveQ(null);
    setJudge(null);
    setSelected(null);
    setMultiSelected([]);
    setOrderSelected([]);
    setTextAnswer('');

    buildNextBatch();
  };

  // ====== 回答送信（PVP/旧AI/ストーリーAI） ======
  const sendAnswer = (isCorrect, usedMs) => {
    const used = typeof usedMs === 'number' ? usedMs : 0;

    if (isStoryMode) {
      const nextMyScore = myScore + (isCorrect ? 1 : 0);
      const nextMyTime = myTime + used;

      const limit = limitRef.current || calcTimeLimit(currentQuestion);
      const { aiCorrect, aiUsed } = storyAiCompute(limit);

      const nextOppScore = oppScore + (aiCorrect ? 1 : 0);
      const nextOppTime = oppTime + aiUsed;

      setMyScore(nextMyScore);
      setMyTime(nextMyTime);
      setOppScore(nextOppScore);
      setOppTime(nextOppTime);

      setTimeout(() => {
        goNextTurnStory(nextMyScore, nextMyTime, nextOppScore, nextOppTime);
      }, 2000);

      return;
    }

    // 旧AI
    if (isAiMode) {
      const limit = calcTimeLimit(currentQuestion);
      const usedSafe = used;

      let aiCorrect;
      let aiUsed;

      if (aiVariant === 'narekin') {
        aiCorrect = Math.random() < 0.98;
        aiUsed = 15000;
      } else {
        const correctProb = 0.7;
        aiCorrect = Math.random() < correctProb;
        const minMs = limit * 0.3;
        const maxMs = limit * 0.9;
        aiUsed = Math.floor(minMs + (maxMs - minMs) * Math.random());
      }

      const nextMyScore = myScore + (isCorrect ? 1 : 0);
      const nextMyTime = myTime + usedSafe;
      const nextOppScore = oppScore + (aiCorrect ? 1 : 0);
      const nextOppTime = oppTime + aiUsed;

      setMyScore(nextMyScore);
      setMyTime(nextMyTime);
      setOppScore(nextOppScore);
      setOppTime(nextOppTime);

      const someoneReached10 = nextMyScore >= 10 || nextOppScore >= 10;
      const nextIndex = 0;

      if (someoneReached10 || nextIndex >= Math.min(questions.length, MAX_AI_QUESTIONS)) {
        let outcome = 'draw';
        if (nextMyScore > nextOppScore) outcome = 'win';
        else if (nextMyScore < nextOppScore) outcome = 'lose';
        else {
          if (nextMyTime < nextOppTime) outcome = 'win';
          else if (nextMyTime > nextOppTime) outcome = 'lose';
          else outcome = 'win';
        }

        setPhase('finished');
        setResult({
          mode: 'ai',
          outcome,
          self: { score: nextMyScore, totalTimeMs: nextMyTime },
          opponent: { score: nextOppScore, totalTimeMs: nextOppTime },
          aiVariant,
        });
      } else {
        setJudge(null);
        setSelected(null);
        setMultiSelected([]);
        setOrderSelected([]);
        setTextAnswer('');
        setPhase('question');
      }

      return;
    }

    // PVP
    setMyTime((t) => t + used);
    if (isCorrect) setMyScore((s) => s + 1);

    if (socket && roomId) {
      socket.emit('battle:answer', {
        roomId,
        questionIndex: 0,
        isCorrect,
        timeMs: Math.round(used),
      });
    }
  };

  // ====== 回答UI（各タイプ） ======
  const handleSelectSingle = (opt) => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);

    let isCorrect = false;
    if (candidates.length === 0) isCorrect = opt === (currentQuestion.answer || '');
    else isCorrect = candidates.includes(opt);

    setSelected(opt);
    setPhase('waiting-opponent');

    setJudge({ isCorrect, correctAnswer: getDisplayAnswer(currentQuestion) });
    pushHistory(opt);

    sendAnswer(isCorrect, used);
  };

  const toggleMultiOption = (opt) => {
    if (phase !== 'question') return;
    setMultiSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  };

  const submitMulti = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);
    const sel = multiSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      const setA = new Set(sel);
      const setB = new Set(candidates);
      isCorrect = [...setA].every((v) => setB.has(v)) && [...setB].every((v) => setA.has(v));
    }

    setPhase('waiting-opponent');
    setJudge({ isCorrect, correctAnswer: getDisplayAnswer(currentQuestion) });
    pushHistory(sel.join(' / '));

    sendAnswer(isCorrect, used);
  };

  const toggleOrderOption = (opt) => {
    if (phase !== 'question') return;
    setOrderSelected((prev) => (prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]));
  };

  const resetOrder = () => setOrderSelected([]);

  const submitOrder = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);
    const sel = orderSelected;

    let isCorrect = false;
    if (candidates.length > 0 && sel.length === candidates.length) {
      isCorrect = candidates.every((v, i) => sel[i] === v);
    }

    setPhase('waiting-opponent');
    setJudge({ isCorrect, correctAnswer: getDisplayAnswer(currentQuestion) });
    pushHistory(sel.join(' → '));

    sendAnswer(isCorrect, used);
  };

  const submitText = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const inputRaw = textAnswer;
    const inputNorm = normalizeText(inputRaw);

    const baseCandidates = parseCorrectValues(currentQuestion.answer);
    const alt = Array.isArray(currentQuestion.altAnswers) && currentQuestion.altAnswers.length > 0 ? currentQuestion.altAnswers : [];

    const allCandidates = [...(baseCandidates.length > 0 ? baseCandidates : [currentQuestion.answer || '']), ...alt];

    let isCorrect = false;
    if (inputNorm !== '') {
      const normalizedList = allCandidates.map((s) => normalizeText(s)).filter((v) => v.length > 0);
      isCorrect = normalizedList.includes(inputNorm);
    }

    setPhase('waiting-opponent');
    setJudge({ isCorrect, correctAnswer: getDisplayAnswer(currentQuestion) });
    pushHistory(inputRaw || '');

    sendAnswer(isCorrect, used);
  };

  // ====== ストーリー：問題選択 ======
  const pickQuestion = (q) => {
    if (!isStoryMode) return;
    if (!q) return;
    if (phase !== 'pick') return;

    setActiveQ(q);
    setSelected(null);
    setMultiSelected([]);
    setOrderSelected([]);
    setTextAnswer('');
    setJudge(null);

    setPhase('question');
  };

  const timeDisplay = useMemo(() => {
    if (phase !== 'question' || !currentQuestion || timeLeft <= 0) return '---';
    return (timeLeft / 1000).toFixed(1);
  }, [phase, currentQuestion, timeLeft]);

  const myTimeDisplay = useMemo(() => (myTime / 1000).toFixed(1), [myTime]);
  const oppTimeDisplay = useMemo(() => (oppTime / 1000).toFixed(1), [oppTime]);

  const progress =
    currentQuestion && calcTimeLimit(currentQuestion) > 0
      ? Math.max(0, Math.min(1, timeLeft / (calcTimeLimit(currentQuestion) || 1)))
      : 0;

  const canStartStory = useMemo(() => {
    if (!isStoryMode) return false;
    if (!storyOpp) return false;
    if (chosenTags.includes('ALL')) return true;
    if (Array.isArray(storyOpp.forcedTags) && storyOpp.forcedTags.length) return true;
    return chosenTags.length > 0;
  }, [isStoryMode, storyOpp, chosenTags]);

  const showQuestionCard = phase === 'question' || phase === 'waiting-opponent' || isAiMode || isStoryMode;

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col">
      {/* ヘッダー */}
      <header className="px-4 py-3 flex justify-between items-center bg-white shadow">
        <div>
          <p className="text-xs text-slate-500">モード</p>
          <p className="text-sm font-mono">{isStoryMode ? 'story' : isAiMode ? 'ai' : 'pvp'}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>
            あなた: <span className="font-bold">{me?.name ?? me?.username ?? 'プレイヤー'}</span>
          </p>
          <p>
            相手: <span className="font-bold">{oppName}</span>
          </p>
        </div>
      </header>

      <section className="flex-1 flex flex-col gap-3 px-4 py-3">
        {/* スコア */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">あなた</p>
            <p>スコア: {myScore} / 10</p>
            <p>時間: {myTimeDisplay} 秒</p>
          </div>
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">{oppName}</p>
            <p>スコア: {oppScore} / 10</p>
            <p>時間: {oppTimeDisplay} 秒</p>
          </div>
        </div>

        {/* ===== PVP 待機画面（ここが重要：waiting で問題を出さない） ===== */}
        {!isAiMode && !isStoryMode && phase === 'waiting' && (
          <div className="bg-white rounded-2xl shadow p-4 text-center space-y-2">
            <p className="text-sm font-extrabold text-slate-900">マッチング中…</p>
            <p className="text-xs text-slate-600">相手が見つかると自動で問題が始まります</p>
          </div>
        )}

        {/* ===== ストーリー：事前画面（タグ選択） ===== */}
        {isStoryMode && (phase === 'prebattle' || phase === 'pick') && !result && (
          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                {storyOpp?.face ? <img src={storyOpp.face} alt="opp" className="w-full h-full object-cover" /> : null}
              </div>
              <div>
                <p className="text-sm font-extrabold">{storyOpp?.name ?? '対戦相手'}</p>
                <p className="text-[11px] text-slate-600">
                  強さ: <span className="font-bold">{storyOpp?.difficulty ?? 'normal'}</span> / 一度に出る問題数:{' '}
                  <span className="font-bold">{storyOpp ? getBatchCount(storyOpp) : '-'}</span>
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-bold text-slate-700">相手が指定してくるタグ</p>

              {Array.isArray(storyOpp?.forcedTags) && storyOpp.forcedTags.length > 0 ? (
                <p className="text-xs mt-2">
                  固定タグ：<span className="font-bold">{storyOpp.forcedTags.join(' / ')}</span>
                </p>
              ) : (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tagOptions.map((t) => {
                    const active = chosenTags.includes(t);
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          setChosenTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
                        }}
                        className={
                          'px-3 py-1.5 rounded-full text-[11px] font-bold border transition ' +
                          (active ? 'bg-sky-600 text-white border-sky-600' : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50')
                        }
                      >
                        {t}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setChosenTags(['ALL'])}
                    className={
                      'px-3 py-1.5 rounded-full text-[11px] font-bold border transition ' +
                      (chosenTags.includes('ALL') ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-900 border-slate-300 hover:bg-slate-50')
                    }
                  >
                    全部（ALL）
                  </button>
                </div>
              )}

              <p className="text-[11px] text-slate-600 mt-2">
                選択中：<span className="font-bold">{chosenTags.length ? chosenTags.join(' / ') : '（未選択）'}</span>
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => router.push('/solo')}
                className="flex-1 py-2 rounded-full bg-slate-200 text-slate-800 text-sm font-bold"
              >
                ソロへ戻る
              </button>

              <button
                type="button"
                disabled={!canStartStory || storyDeck.length === 0}
                onClick={startStoryBattle}
                className="flex-1 py-2 rounded-full bg-sky-600 text-white text-sm font-extrabold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                対戦開始
              </button>
            </div>

            {canStartStory && storyDeck.length === 0 && (
              <p className="text-xs text-rose-700 font-bold">
                このタグで使える問題が0件です。タグを変えるか、問題にタグを付けてください。
              </p>
            )}
          </div>
        )}

        {/* ===== ストーリー：問題バッチ（複数提示→選択） ===== */}
        {isStoryMode && phase === 'pick' && batch.length >= 2 && !result && (
          <div className="bg-white rounded-2xl shadow p-4 space-y-3">
            <p className="text-sm font-extrabold">どの問題を解く？（好きなのを1つ選ぶ）</p>
            <div className="grid grid-cols-1 gap-2">
              {batch.map((q) => (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => pickQuestion(q)}
                  className="text-left p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-sky-50 transition"
                >
                  <p className="text-xs text-slate-500 mb-1">{q.type}</p>
                  <p className="text-sm font-bold text-slate-900 whitespace-pre-wrap">{q.text}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ===== 問題 ===== */}
        {phase !== 'finished' && showQuestionCard && currentQuestion && (
          <div className="bg-white rounded-2xl shadow p-4 flex flex-col gap-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>残り時間: {timeDisplay} 秒</span>
              <span>タグ: {(currentQuestion.tags || []).slice(0, 3).join(' / ') || '---'}</span>
            </div>

            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progress * 100}%` }} />
            </div>

            <p className="text-sm font-semibold whitespace-pre-wrap text-slate-900">{currentQuestion.text}</p>

            {/* タイプごとのUI */}
            <div className="mt-2 space-y-2">
              {/* 単一選択 */}
              {qType === 'single' && currentQuestion.options?.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {currentQuestion.options.map((opt, i) => {
                    let style = 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900';

                    if (phase === 'question') {
                      if (selected === opt) style = 'bg-sky-600 text-white border-sky-600';
                    } else if (judge && phase !== 'question') {
                      const candidateList = parseCorrectValues(currentQuestion.answer);
                      const isCorrectOpt = candidateList.length === 0 ? opt === (currentQuestion.answer || '') : candidateList.includes(opt);
                      if (isCorrectOpt) style = 'bg-emerald-50 border-emerald-500 text-slate-900';
                      if (selected === opt && !judge.isCorrect) style = 'bg-red-50 border-red-500 text-slate-900';
                    }

                    return (
                      <button
                        key={i}
                        disabled={phase !== 'question'}
                        onClick={() => handleSelectSingle(opt)}
                        className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* 複数選択 */}
              {qType === 'multi' && currentQuestion.options?.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    {currentQuestion.options.map((opt, i) => {
                      const isOn = multiSelected.includes(opt);
                      let style = 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900';

                      if (phase !== 'question' && judge) {
                        const correctList = parseCorrectValues(currentQuestion.answer);
                        if (correctList.includes(opt)) style = 'bg-emerald-50 border-emerald-500 text-slate-900';
                        if (isOn && !judge.isCorrect) style = 'bg-red-50 border-red-500 text-slate-900';
                      } else if (isOn) {
                        style = 'bg-sky-600 text-white border-sky-600';
                      }

                      return (
                        <button
                          key={i}
                          disabled={phase !== 'question'}
                          onClick={() => toggleMultiOption(opt)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
                        >
                          <span className="mr-2">{isOn ? '☑' : '☐'}</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {phase === 'question' && (
                    <button onClick={submitMulti} className="w-full mt-1 py-2 rounded-full bg-sky-600 text-white text-sm font-bold">
                      この選択で回答する
                    </button>
                  )}
                </div>
              )}

              {/* 並び替え */}
              {qType === 'ordering' && currentQuestion.options?.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 gap-2">
                    {currentQuestion.options.map((opt, i) => {
                      const idx = orderSelected.indexOf(opt);
                      const selectedOrder = idx >= 0 ? idx + 1 : null;
                      let style = 'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900';

                      if (phase !== 'question' && judge) {
                        const correctList = parseCorrectValues(currentQuestion.answer);
                        const correctIdx = correctList.indexOf(opt);
                        if (correctIdx >= 0) style = 'bg-emerald-50 border-emerald-500 text-slate-900';
                        if (idx >= 0 && !judge.isCorrect) style = 'bg-red-50 border-red-500 text-slate-900';
                      } else if (selectedOrder) {
                        style = 'bg-sky-600 text-white border-sky-600';
                      }

                      return (
                        <button
                          key={i}
                          disabled={phase !== 'question'}
                          onClick={() => toggleOrderOption(opt)}
                          className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
                        >
                          <span className="mr-2 text-xs">{selectedOrder ? `${selectedOrder}.` : '・'}</span>
                          {opt}
                        </button>
                      );
                    })}
                  </div>

                  {phase === 'question' && (
                    <div className="flex gap-2">
                      <button onClick={resetOrder} className="flex-1 py-2 rounded-full bg-slate-200 text-slate-800 text-xs font-bold">
                        リセット
                      </button>
                      <button onClick={submitOrder} className="flex-1 py-2 rounded-full bg-sky-600 text-white text-xs font-bold">
                        この順番で回答
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 記述 */}
              {qType === 'text' && (
                <div className="space-y-2">
                  <textarea
                    disabled={phase !== 'question'}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500"
                    rows={2}
                    placeholder="ここに答えを入力"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                  />
                  {phase === 'question' && (
                    <button onClick={submitText} className="w-full py-2 rounded-full bg-sky-600 text-white text-sm font-bold">
                      この答えで回答する
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 判定＋正解表示 */}
            {judge && (
              <div className="mt-2 text-xs">
                <p className={judge.isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>
                  {judge.isCorrect ? '◯ 正解！' : '× 不正解'}
                </p>

                <p className="text-slate-700 mt-1">
                  正解:&nbsp;
                  <span className="font-semibold">{judge.correctAnswer && judge.correctAnswer.trim() !== '' ? judge.correctAnswer : '（正解データなし）'}</span>
                </p>

                {phase === 'waiting-opponent' && !isAiMode && !isStoryMode && <p className="text-amber-600 mt-1">相手の回答を待っています…</p>}
              </div>
            )}
          </div>
        )}

        {/* ===== 結果 ===== */}
        {phase === 'finished' && result && (
          <div className="space-y-4 mt-2">
            <div className="bg-white rounded-2xl shadow p-4 text-center space-y-3">
              <p className="text-xs text-slate-500 mb-1">{isStoryMode ? 'ストーリー対戦 結果' : isAiMode ? 'AI戦 結果' : '対戦結果'}</p>

              <p className="text-2xl font-extrabold text-slate-900">
                {result.outcome === 'win' ? '勝利！' : result.outcome === 'lose' ? '敗北…' : '引き分け'}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-left">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold mb-1">あなた</p>
                  <p>スコア: {result.self.score}</p>
                  <p>時間: {(result.self.totalTimeMs / 1000).toFixed(1)} 秒</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold mb-1">{oppName}</p>
                  <p>スコア: {result.opponent.score}</p>
                  <p>時間: {(result.opponent.totalTimeMs / 1000).toFixed(1)} 秒</p>
                </div>
              </div>

              {isStoryMode && result.rewardPoints > 0 && (
                <div className="text-sm font-extrabold text-emerald-700">ナレバトポイント +{result.rewardPoints}</div>
              )}

              <div className="flex gap-2">
                <button className="flex-1 px-4 py-2 rounded-full bg-slate-200 text-slate-800 text-sm font-bold" onClick={() => router.push('/solo')}>
                  ソロへ
                </button>
                <button className="flex-1 px-4 py-2 rounded-full bg-sky-600 text-white text-sm font-bold" onClick={() => router.push('/')}>
                  ホームへ
                </button>
              </div>
            </div>

            {/* 問題不備報告 */}
            <QuestionReviewAndReport questions={answerHistory} sourceMode={isStoryMode ? 'story' : isAiMode ? 'rate-ai' : 'rate'} />
          </div>
        )}
      </section>

      {/* ログ */}
      {log.length > 0 && (
        <section className="px-4 pb-3">
          <details className="text-xs text-slate-500">
            <summary>ログ</summary>
            <ul className="mt-1 space-y-0.5">{log.map((l, i) => <li key={i}>・{l}</li>)}</ul>
          </details>
        </section>
      )}
    </main>
  );
}

export default function BattlePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-sky-50 text-sky-900 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow px-6 py-4 text-center">対戦画面を読み込み中…</div>
        </main>
      }
    >
      <BattlePageInner />
    </Suspense>
  );
}
