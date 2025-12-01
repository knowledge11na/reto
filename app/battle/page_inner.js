// file: app/battle/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import io from 'socket.io-client';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

let socket;

// 問題タイプ別の制限時間（ミリ秒）
const TIME_SINGLE = 30000; // 単一選択
const TIME_MULTI_ORDER = 40000; // 複数選択 / 並び替え
const TIME_TEXT = 60000; // 記述（15文字以内）
const TIME_TEXT_LONG = 80000; // 記述（16文字以上）

// AI戦の最大問題数
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

// seed(数値)から0〜1の乱数
function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 配列を決定的にシャッフル
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
    if (Array.isArray(parsed)) {
      return parsed.map((v) => String(v).trim()).filter(Boolean);
    }
  } catch {
    // 無視
  }
  return ans
    .split(/[、,／\/]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// 文字列のゆるめ正規化（記述用）
function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '') // 全スペース削除
    .toLowerCase();
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

export default function BattlePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const roomId = searchParams.get('room') || 'default';
  const modeParam = searchParams.get('mode');
  const isAiMode = modeParam === 'ai'; // ★ AIモード判定

  const [me, setMe] = useState(null);
  const [socketId, setSocketId] = useState(null);

  const [phase, setPhase] = useState('waiting'); // waiting / question / waiting-opponent / finished
  const [questions, setQuestions] = useState([]);
  const [qIndex, setQIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  const [myScore, setMyScore] = useState(0);
  const [myTime, setMyTime] = useState(0);
  const [oppName, setOppName] = useState(isAiMode ? 'AIなつ' : '相手待ち');
  const [oppScore, setOppScore] = useState(0);
  const [oppTime, setOppTime] = useState(0);

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

  const currentQuestion = questions[qIndex];
  const qType = getQuestionType(currentQuestion);

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

  const addLog = (msg) => setLog((prev) => [...prev, msg]);

  // ★ ミス記録用: レート戦で不正解だった問題を /api/mistakes/add に送る
  const logMistake = (question) => {
    if (!question || !question.id) return;
    if (isAiMode) return; // AI戦はレート扱いにしない（必要ならここを外せばOK）

    fetch('/api/mistakes/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questionId: question.id }),
    }).catch(() => {
      // ログ保存失敗はゲーム進行に影響させない
    });
  };

  // 自分情報
  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  // 問題取得（PVP/AI共通）
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        // ★ PVP と AI で使うエンドポイントを分ける
        const endpoint = isAiMode ? '/api/ai-questions' : '/api/questions';

        const res = await fetch(endpoint);
        const data = await res.json();

        const srcArray = Array.isArray(data)
          ? data
          : Array.isArray(data.questions)
          ? data.questions
          : [];

        // ① 重複除去
        const uniqueMap = new Map();
        for (const q of srcArray) {
          const key = `${q.question_text || q.question || ''}__${
            q.correct_answer ?? ''
          }`;
          if (!uniqueMap.has(key)) uniqueMap.set(key, q);
        }
        const uniqueQuestions = Array.from(uniqueMap.values());

        // ② シャッフル方法をモードで分岐
        let picked;
        if (isAiMode) {
          // ★ AIモード：毎回ランダムで最大30問
          picked = [...uniqueQuestions]
            .sort(() => Math.random() - 0.5)
            .slice(0, MAX_AI_QUESTIONS);
        } else {
          // ★ PVP：roomId を使った決定的シャッフル
          picked = shuffleDeterministic(uniqueQuestions, roomId).slice(
            0,
            30
          );
        }

        // ③ battle用に整形
        const normalized = picked.map((q, idx) => {
          let options = [];
          try {
            if (Array.isArray(q.options)) {
              options = q.options;
            } else if (q.options_json) {
              options = JSON.parse(q.options_json);
            }
          } catch {
            options = [];
          }

          const text = q.question_text || q.question || '';
          const answer = q.correct_answer ?? '';

          let altAnswers = [];
          try {
            if (Array.isArray(q.altAnswers)) {
              altAnswers = q.altAnswers;
            } else if (q.alt_answers_json) {
              const parsed = JSON.parse(q.alt_answers_json);
              if (Array.isArray(parsed)) {
                altAnswers = parsed;
              }
            }
          } catch {
            altAnswers = [];
          }

          let type = 'single';
          const answerList = parseCorrectValues(answer);

          if (!options || options.length === 0) {
            type = 'text';
          } else if (answerList.length > 1) {
            const t = text.replace(/\s/g, '');
            if (t.includes('順') || t.includes('並べ') || t.includes('順番')) {
              type = 'ordering';
            } else {
              type = 'multi';
            }
          } else {
            type = 'single';
          }

          if (options && options.length > 0) {
            const optSeed = `${roomId}-q-${q.id ?? idx}`;
            options = shuffleDeterministic(options, optSeed);
          }

          // ★ ここで id は question_submissions.id をそのまま持ってくる想定
          return { id: q.id ?? idx, text, type, options, answer, altAnswers };
        });

        setQuestions(normalized);
      } catch (e) {
        console.error(e);
        addLog('問題取得に失敗しました');
      }
    };

    fetchQuestions();
  }, [roomId, isAiMode]);

  // ★ AIモードの初期開始（questions取得後）
  useEffect(() => {
    if (!isAiMode) return;
    if (questions.length === 0) return;
    if (phase !== 'waiting') return;

    setOppName('AIなつ');
    setPhase('question');
    setQIndex(0);
    setMyScore(0);
    setMyTime(0);
    setOppScore(0);
    setOppTime(0);
    setJudge(null);
    setSelected(null);
    setMultiSelected([]);
    setOrderSelected([]);
    setTextAnswer('');
    setAnswerHistory([]);
    addLog('AIなつとの対戦を開始します（30問 or スコア10まで）');
  }, [isAiMode, questions, phase]);

  // socket.io 初期化（PVPのみ）
  useEffect(() => {
    if (isAiMode) return; // ★ AIモードではソケットを使わない
    if (!roomId) return;
    if (!me) return;

if (!socket) {
  // .env.local で設定した URL
  const SOCKET_URL =
    process.env.NEXT_PUBLIC_SOCKET_URL ||
    (typeof window !== 'undefined' ? window.location.origin : '');

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
  });
}


    const s = socket;

    const userId = me?.id ?? me?.user_id ?? me?.userId ?? null;

    const joinPayload = {
      roomId,
      playerName: me?.name || me?.username || 'プレイヤー',
      userId,
    };

    const doJoin = () => {
      setSocketId(s.id);
      addLog(
        `battle:join emit: socket=${s.id}, room=${roomId}, userId=${joinPayload.userId}`
      );
      s.emit('battle:join', joinPayload);
    };

    if (s.connected) {
      doJoin();
    } else {
      s.on('connect', doJoin);
    }

    const onStart = (payload) => {
      addLog(`対戦開始 相手: ${payload.opponentName}`);
      setOppName(payload.opponentName || '相手');
      setPhase('question');
      setQIndex(payload.currentQuestionIndex ?? 0);
      setMyScore(0);
      setMyTime(0);
      setOppScore(0);
      setOppTime(0);
      setJudge(null);
      setSelected(null);
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setAnswerHistory([]);
    };

    const onNext = (payload) => {
      addLog(`次の問題へ index=${payload.nextQuestionIndex}`);

      if (socketId && Array.isArray(payload.scores)) {
        const self = payload.scores.find((p) => p.socketId === socketId);
        const opp = payload.scores.find((p) => p.socketId !== socketId);
        if (self) {
          setMyScore(self.score);
          setMyTime(self.totalTimeMs);
        }
        if (opp) {
          setOppScore(opp.score);
          setOppTime(opp.totalTimeMs);
        }
      }

      setSelected(null);
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setJudge(null);
      setPhase('question');
      setQIndex(payload.nextQuestionIndex);
    };

    const onFinished = (payload) => {
      addLog('対戦終了');
      setPhase('finished');
      setResult(payload);
      setJudge(null);

      if (payload.self) {
        setMyScore(payload.self.score);
        setMyTime(payload.self.totalTimeMs);
      }
      if (payload.opponent) {
        setOppScore(payload.opponent.score);
        setOppTime(payload.opponent.totalTimeMs);
      }
    };

    const onError = (err) => {
      console.error(err);
      addLog('エラーが発生しました');
    };

    s.on('battle:start', onStart);
    s.on('battle:next', onNext);
    s.on('battle:finished', onFinished);
    s.on('battle:error', onError);

    return () => {
      s.off('connect', doJoin);
      s.off('battle:start', onStart);
      s.off('battle:next', onNext);
      s.off('battle:finished', onFinished);
      s.off('battle:error', onError);
    };
  }, [roomId, me, isAiMode, socketId]);

  const calcTimeLimit = (q) => {
    if (!q) return TIME_SINGLE;
    const t = getQuestionType(q);

    if (t === 'single') return TIME_SINGLE;
    if (t === 'multi' || t === 'ordering') return TIME_MULTI_ORDER;

    const len = (q.answer || '').length;
    if (len > 15) return TIME_TEXT_LONG;
    return TIME_TEXT;
  };

  // タイマー制御
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion) {
      setTimeLeft(0);
      return;
    }

    const limit = calcTimeLimit(currentQuestion);
    setTimeLeft(limit);

    const start = Date.now();
    const timerId = setInterval(() => {
      const elapsed = Date.now() - start;
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
  }, [phase, qIndex, currentQuestion]);

  const handleTimeout = (limit) => {
    if (phase !== 'question' || !currentQuestion) return;
    setPhase('waiting-opponent');
    addLog('時間切れ');

    const correctText = getDisplayAnswer(currentQuestion);
    setJudge({
      isCorrect: false,
      correctAnswer: correctText,
    });

    pushHistory('（時間切れ）');

    // ★ 時間切れもミス扱い
    logMistake(currentQuestion);

    sendAnswer(false, limit);
  };

  // ====== 回答処理（各タイプ） ======

  const handleSelectSingle = (opt) => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const candidates = parseCorrectValues(currentQuestion.answer);

    let isCorrect = false;
    if (candidates.length === 0) {
      isCorrect = opt === (currentQuestion.answer || '');
    } else {
      isCorrect = candidates.includes(opt);
    }

    setSelected(opt);
    setPhase('waiting-opponent');
    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    pushHistory(opt);

    if (!isCorrect) {
      logMistake(currentQuestion);
    }

    sendAnswer(isCorrect, used);
  };

  const toggleMultiOption = (opt) => {
    if (phase !== 'question') return;
    setMultiSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
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
      isCorrect =
        [...setA].every((v) => setB.has(v)) &&
        [...setB].every((v) => setA.has(v));
    }

    setPhase('waiting-opponent');
    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    pushHistory(sel.join(' / '));

    if (!isCorrect) {
      logMistake(currentQuestion);
    }

    sendAnswer(isCorrect, used);
  };

  const toggleOrderOption = (opt) => {
    if (phase !== 'question') return;
    setOrderSelected((prev) =>
      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
    );
  };

  const resetOrder = () => {
    setOrderSelected([]);
  };

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
    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    pushHistory(sel.join(' → '));

    if (!isCorrect) {
      logMistake(currentQuestion);
    }

    sendAnswer(isCorrect, used);
  };

  const submitText = () => {
    if (phase !== 'question' || !currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = Math.max(0, limit - timeLeft);

    const inputRaw = textAnswer;
    const inputNorm = normalizeText(inputRaw);

    const baseCandidates = parseCorrectValues(currentQuestion.answer);
    const alt =
      Array.isArray(currentQuestion.altAnswers) &&
      currentQuestion.altAnswers.length > 0
        ? currentQuestion.altAnswers
        : [];

    const allCandidates = [
      ...(baseCandidates.length > 0
        ? baseCandidates
        : [currentQuestion.answer || '']),
      ...alt,
    ];

    let isCorrect = false;
    if (inputNorm !== '') {
      const normalizedList = allCandidates
        .map((s) => normalizeText(s))
        .filter((v) => v.length > 0);
      isCorrect = normalizedList.includes(inputNorm);
    }

    setPhase('waiting-opponent');
    setJudge({
      isCorrect,
      correctAnswer: getDisplayAnswer(currentQuestion),
    });

    pushHistory(inputRaw || '');

    if (!isCorrect) {
      logMistake(currentQuestion);
    }

    sendAnswer(isCorrect, used);
  };

  // ====== AIモード専用の進行 ======

  const finishAiBattle = (myScoreVal, myTimeVal, oppScoreVal, oppTimeVal) => {
    const myScoreNum = Number(myScoreVal) || 0;
    const oppScoreNum = Number(oppScoreVal) || 0;
    const myTimeNum = Number(myTimeVal) || 0;
    const oppTimeNum = Number(oppTimeVal) || 0;

    // ★ AI戦は「スコア → 時間」で必ず勝敗をつける
    let outcome;

    if (myScoreNum > oppScoreNum) {
      outcome = 'win';
    } else if (myScoreNum < oppScoreNum) {
      outcome = 'lose';
    } else {
      // スコア同点 → 時間勝負
      if (myTimeNum < oppTimeNum) {
        outcome = 'win';
      } else if (myTimeNum > oppTimeNum) {
        outcome = 'lose';
      } else {
        // スコアも時間も完全一致の超レアケースはユーザー勝ち扱い
        outcome = 'win';
      }
    }

    setPhase('finished');
    setResult({
      mode: 'ai',
      outcome,
      self: { score: myScoreNum, totalTimeMs: myTimeNum },
      opponent: { score: oppScoreNum, totalTimeMs: oppTimeNum },
    });

    if (outcome === 'win') {
      fetch('/api/ai-battle/reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ berry: 200 }),
      }).catch(() => {});
    }
  };

  const goNextQuestionAi = (
    myScoreVal,
    myTimeVal,
    oppScoreVal,
    oppTimeVal
  ) => {
    const totalQuestions = Math.min(questions.length, MAX_AI_QUESTIONS);
    const nextIndex = qIndex + 1;
    const someoneReached10 =
      myScoreVal >= 10 || oppScoreVal >= 10;

    // ★ 絶対に「30問 or スコア10」に到達するまで続ける
    if (nextIndex >= totalQuestions || someoneReached10) {
      finishAiBattle(myScoreVal, myTimeVal, oppScoreVal, oppTimeVal);
    } else {
      setPhase('question');
      setQIndex(nextIndex);
      setSelected(null);
      setMultiSelected([]);
      setOrderSelected([]);
      setTextAnswer('');
      setJudge(null);
    }
  };

  const handleAiAnswer = (isCorrect, usedMs) => {
    if (!currentQuestion) return;

    const limit = calcTimeLimit(currentQuestion);
    const used = typeof usedMs === 'number' ? usedMs : 0;

    // AIの正解率・時間は適当に調整
    const correctProb = 0.7;
    const aiCorrect = Math.random() < correctProb;
    const minMs = limit * 0.3;
    const maxMs = limit * 0.9;
    const aiUsed = Math.floor(minMs + (maxMs - minMs) * Math.random());

    const nextMyScore = myScore + (isCorrect ? 1 : 0);
    const nextMyTime = myTime + used;
    const nextOppScore = oppScore + (aiCorrect ? 1 : 0);
    const nextOppTime = oppTime + aiUsed;

    setMyScore(nextMyScore);
    setMyTime(nextMyTime);
    setOppScore(nextOppScore);
    setOppTime(nextOppTime);

    setTimeout(() => {
      goNextQuestionAi(nextMyScore, nextMyTime, nextOppScore, nextOppTime);
    }, 2000);
  };

  const sendAnswer = (isCorrect, usedMs) => {
    const used = typeof usedMs === 'number' ? usedMs : 0;

    if (isAiMode) {
      handleAiAnswer(isCorrect, used);
      return;
    }

    setMyTime((t) => t + used);
    if (isCorrect) setMyScore((s) => s + 1);

    if (socket && roomId) {
      socket.emit('battle:answer', {
        roomId,
        questionIndex: qIndex,
        isCorrect,
        timeMs: Math.round(used),
      });
    }
  };

  const timeDisplay = useMemo(() => {
    if (phase !== 'question' || !currentQuestion || timeLeft <= 0) {
      return '---';
    }
    return (timeLeft / 1000).toFixed(1);
  }, [phase, currentQuestion, timeLeft]);

  const myTimeDisplay = useMemo(
    () => (myTime / 1000).toFixed(1),
    [myTime]
  );
  const oppTimeDisplay = useMemo(
    () => (oppTime / 1000).toFixed(1),
    [oppTime]
  );

  if (!roomId) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-sky-50 text-sky-900">
        <div className="bg-white rounded-2xl shadow px-6 py-4 text-center">
          <p className="mb-2">ルームIDが指定されていません。</p>
          <button
            className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
            onClick={() => router.push('/')}
          >
            ホームへ戻る
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900 flex flex-col">
      {/* ヘッダー */}
      <header className="px-4 py-3 flex justify-between items-center bg-white shadow">
        <div>
          <p className="text-xs text-slate-500">ルームID</p>
          <p className="text-sm font-mono">{roomId}</p>
        </div>
        <div className="text-right text-xs text-slate-600">
          <p>
            あなた:{' '}
            <span className="font-bold">
              {me?.name ?? me?.username ?? 'プレイヤー'}
            </span>
          </p>
          <p>
            相手: <span className="font-bold">{oppName}</span>
          </p>
        </div>
      </header>

      {/* メイン */}
      <section className="flex-1 flex flex-col gap-3 px-4 py-3">
        {/* スコア */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">あなた</p>
            <p>スコア: {myScore}</p>
            <p>時間: {myTimeDisplay} 秒</p>
          </div>
          <div className="bg-white rounded-xl shadow p-2">
            <p className="font-bold mb-1">{oppName}</p>
            <p>スコア: {oppScore}</p>
            <p>時間: {oppTimeDisplay} 秒</p>
          </div>
        </div>

        {/* 問題 or 結果 */}
        {phase !== 'finished' && currentQuestion && (
          <div className="bg-white rounded-2xl shadow p-4 flex flex-col gap-3">
            <div className="flex justify-between text-xs text-slate-500 mb-1">
              <span>
                {qIndex + 1}問目 / {isAiMode ? MAX_AI_QUESTIONS : questions.length}問
              </span>
              <span>残り時間: {timeDisplay} 秒</span>
            </div>

            <div className="h-2 bg-slate-200 rounded-full overflow-hidden mb-1">
              <div
                className="h-full bg-emerald-400 transition-all"
                style={{
                  width: `${
                    Math.max(
                      0,
                      Math.min(
                        1,
                        timeLeft / (calcTimeLimit(currentQuestion) || 1)
                      )
                    ) * 100
                  }%`,
                }}
              />
            </div>

            <p className="text-sm font-semibold whitespace-pre-wrap text-slate-900">
              {currentQuestion.text}
            </p>

            {/* 問題タイプごとのUI */}
            <div className="mt-2 space-y-2">
              {/* 単一選択 */}
              {qType === 'single' && currentQuestion.options?.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {currentQuestion.options.map((opt, i) => {
                    let style =
                      'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900';

                    if (phase === 'question') {
                      if (selected === opt) {
                        style = 'bg-sky-500 text-white border-sky-500';
                      }
                    } else if (judge && phase !== 'question') {
                      const candidateList = parseCorrectValues(
                        currentQuestion.answer
                      );
                      const isCorrectOpt =
                        candidateList.length === 0
                          ? opt === (currentQuestion.answer || '')
                          : candidateList.includes(opt);

                      if (isCorrectOpt) {
                        style =
                          'bg-emerald-50 border-emerald-500 text-slate-900';
                      }
                      if (selected === opt && !judge.isCorrect) {
                        style = 'bg-red-50 border-red-500 text-slate-900';
                      }
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
                      let style =
                        'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900';

                      if (phase !== 'question' && judge) {
                        const correctList = parseCorrectValues(
                          currentQuestion.answer
                        );
                        if (correctList.includes(opt)) {
                          style =
                            'bg-emerald-50 border-emerald-500 text-slate-900';
                        }
                        if (isOn && !judge.isCorrect) {
                          style = 'bg-red-50 border-red-500 text-slate-900';
                        }
                      } else if (isOn) {
                        style = 'bg-sky-500 text-white border-sky-500';
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
                    <button
                      onClick={submitMulti}
                      className="w-full mt-1 py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
                    >
                      この選択で回答する
                    </button>
                  )}
                </div>
              )}

              {/* 並び替え */}
              {qType === 'ordering' &&
                currentQuestion.options?.length > 0 && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      {currentQuestion.options.map((opt, i) => {
                        const idx = orderSelected.indexOf(opt);
                        const selectedOrder = idx >= 0 ? idx + 1 : null;
                        let style =
                          'bg-slate-50 hover:bg-sky-50 border-slate-200 text-slate-900';

                        if (phase !== 'question' && judge) {
                          const correctList = parseCorrectValues(
                            currentQuestion.answer
                          );
                          const correctIdx = correctList.indexOf(opt);
                          if (correctIdx >= 0) {
                            style =
                              'bg-emerald-50 border-emerald-500 text-slate-900';
                          }
                          if (idx >= 0 && !judge.isCorrect) {
                            style = 'bg-red-50 border-red-500 text-slate-900';
                          }
                        } else if (selectedOrder) {
                          style = 'bg-sky-500 text-white border-sky-500';
                        }

                        return (
                          <button
                            key={i}
                            disabled={phase !== 'question'}
                            onClick={() => toggleOrderOption(opt)}
                            className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition ${style}`}
                          >
                            <span className="mr-2 text-xs">
                              {selectedOrder ? `${selectedOrder}.` : '・'}
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-2">
                      {phase === 'question' && (
                        <>
                          <button
                            onClick={resetOrder}
                            className="flex-1 py-2 rounded-full bg-slate-200 text-slate-700 text-xs font-bold"
                          >
                            リセット
                          </button>
                          <button
                            onClick={submitOrder}
                            className="flex-1 py-2 rounded-full bg-sky-500 text-white text-xs font-bold"
                          >
                            この順番で回答
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

              {/* 記述 */}
              {qType === 'text' && (
                <div className="space-y-2">
                  <textarea
                    disabled={phase !== 'question'}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    rows={2}
                    placeholder="ここに答えを入力"
                    value={textAnswer}
                    onChange={(e) => setTextAnswer(e.target.value)}
                  />
                  {phase === 'question' && (
                    <button
                      onClick={submitText}
                      className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
                    >
                      この答えで回答する
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 判定＋正解表示 */}
            {judge && (
              <div className="mt-2 text-xs">
                <p
                  className={
                    judge.isCorrect
                      ? 'text-emerald-600 font-bold'
                      : 'text-red-600 font-bold'
                  }
                >
                  {judge.isCorrect ? '◯ 正解！' : '× 不正解'}
                </p>

                <p className="text-slate-700 mt-1">
                  正解:&nbsp;
                  <span className="font-semibold">
                    {judge.correctAnswer && judge.correctAnswer.trim() !== ''
                      ? judge.correctAnswer
                      : '（正解データなし）'}
                  </span>
                </p>

                {phase === 'waiting-opponent' && !isAiMode && (
                  <p className="text-amber-600 mt-1">
                    相手の回答を待っています…
                  </p>
                )}
              </div>
            )}

            {!judge && phase === 'waiting-opponent' && !isAiMode && (
              <p className="text-xs text-amber-600 mt-1">
                相手の回答を待っています…
              </p>
            )}
          </div>
        )}

        {phase === 'finished' && result && (
          <div className="space-y-4 mt-4">
            <div className="bg-white rounded-2xl shadow p-4 text-center space-y-3">
              <p className="text-xs text-slate-500 mb-1">
                {isAiMode ? 'AIなつ戦 結果' : '対戦結果'}
              </p>
              <p className="text-2xl font-extrabold">
                {result.outcome === 'win'
                  ? '勝利！'
                  : result.outcome === 'lose'
                  ? '敗北…'
                  : '引き分け'}
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs text-left">
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold mb-1">あなた</p>
                  <p>スコア: {result.self.score}</p>
                  <p>
                    時間: {(result.self.totalTimeMs / 1000).toFixed(1)} 秒
                  </p>
                </div>
                <div className="bg-slate-50 rounded-lg p-2">
                  <p className="font-bold mb-1">
                    {isAiMode ? 'AIなつ' : oppName}
                  </p>
                  <p>スコア: {result.opponent.score}</p>
                  <p>
                    時間: {(result.opponent.totalTimeMs / 1000).toFixed(1)} 秒
                  </p>
                </div>
              </div>

              <button
                className="mt-2 px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-bold"
                onClick={() => router.push('/')}
              >
                ホームへ戻る
              </button>
            </div>

            {/* 問題不備報告 */}
            <QuestionReviewAndReport
              questions={answerHistory}
              sourceMode={isAiMode ? 'rate-ai' : 'rate'}
            />
          </div>
        )}
      </section>

      {/* ログ */}
      {log.length > 0 && (
        <section className="px-4 pb-3">
          <details className="text-xs text-slate-500">
            <summary>ログ</summary>
            <ul className="mt-1 space-y-0.5">
              {log.map((l, i) => (
                <li key={i}>・{l}</li>
              ))}
            </ul>
          </details>
        </section>
      )}
    </main>
  );
}
