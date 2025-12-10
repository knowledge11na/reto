// file: app/solo/boss/page.js
'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

// 難易度設定
const DIFFICULTIES = {
  easy: {
    key: 'easy',
    label: 'イージー',
    bossHp: 2000,
    bossBaseAtk: 50, // ボスの初期攻撃力
    bossAtkStep: 30, // ミスごとのボス攻撃力アップ量
    playerBaseAtk: 50, // プレイヤーの初期攻撃力
    playerAtkStep: 50, // 連続正解ごとの攻撃力アップ量
    image: '/solo_monster/boss_easy.png',
    description: '初級者向け。まずはここから。',
  },
  normal: {
    key: 'normal',
    label: 'ノーマル',
    bossHp: 4000,
    bossBaseAtk: 100,
    bossAtkStep: 50,
    playerBaseAtk: 50,
    playerAtkStep: 50,
    image: '/solo_monster/boss_normal.png',
    description: '標準難易度。慣れてきた人向け。',
  },
  hard: {
    key: 'hard',
    label: 'ハード',
    bossHp: 7000,
    bossBaseAtk: 100,
    bossAtkStep: 70,
    playerBaseAtk: 50,
    playerAtkStep: 50,
    image: '/solo_monster/boss_hard.png',
    description: '少し難しいモード。',
  },
  veryhard: {
    key: 'veryhard',
    label: 'ベリーハード',
    bossHp: 10000,
    bossBaseAtk: 100,
    bossAtkStep: 100,
    playerBaseAtk: 50,
    playerAtkStep: 50,
    image: '/solo_monster/boss_veryhard.png',
    description: '上級者向け。',
  },
  extra: {
    key: 'extra',
    label: 'エクストラ',
    bossHp: 30000,
    bossBaseAtk: 500,
    bossAtkStep: 100,
    playerBaseAtk: 50,
    playerAtkStep: 50,
    image: '/solo_monster/boss_extra.png',
    description: '最高難易度。',
  },
};

// ==== 判定ロジック ====

// タイムリミット（問題形式によって変える）
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

// 乱数シャッフル
function shuffleArray(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// altAnswers をいろいろなキーから拾う
function getAltAnswersArray(q) {
  if (!q) return [];
  if (Array.isArray(q.altAnswers)) return q.altAnswers;
  if (Array.isArray(q.alt_answers)) return q.alt_answers;

  if (typeof q.alt_answers_json === 'string') {
    try {
      const parsed = JSON.parse(q.alt_answers_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 無視
    }
  }
  return [];
}

// options をいろいろなキーから拾う
function getBaseOptions(q) {
  if (!q) return [];
  if (Array.isArray(q.options)) return [...q.options];
  if (Array.isArray(q.choices)) return [...q.choices];

  if (typeof q.options_json === 'string') {
    try {
      const parsed = JSON.parse(q.options_json);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // 無視
    }
  }
  return [];
}

// 記述のメイン正解文字列
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

// 単一選択の正解選択肢テキスト
function getSingleCorrectAnswer(q) {
  if (!q) return '';
  const opts = getBaseOptions(q);

  if (typeof q.correctIndex === 'number') {
    return opts[q.correctIndex] ?? '';
  }
  if (typeof q.correct_index === 'number') {
    return opts[q.correct_index] ?? '';
  }

  if (typeof q.correct === 'string') {
    // options に含まれていればそれを正解とみなす
    if (opts.some((o) => o === q.correct)) return q.correct;
  }

  // options と紐づいていない場合はテキスト系から
  return getTextCorrectBase(q);
}

// multi / order 用の正解配列（文字列の配列）を柔軟に取得
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
        if (Array.isArray(parsed)) {
          arr = parsed;
        }
      } catch {
        // フォールバック
      }
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
    } catch {
      // 無視
    }
  }

  if (!Array.isArray(arr)) arr = [];

  // 数字配列なら index → options に変換
  if (opts.length && arr.length && typeof arr[0] === 'number') {
    return arr
      .map((idx) => opts[idx])
      .filter((v) => v != null);
  }

  // 文字列配列ならそのまま
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

// ボス用に問題1問を正規化 & 選択肢シャッフル
function normalizeQuestionForBoss(raw, index) {
  const baseOpts = getBaseOptions(raw);
  const type = raw.type;

  const q = {
    ...raw,
    // 何かあった時用に一意な key
    _bossId: `${raw.id ?? raw.question_id ?? 'q'}_${index}`,
  };

  if (type === 'single') {
    const correctText = getSingleCorrectAnswer(raw);
    const shuffled = shuffleArray(baseOpts);
    q.options = shuffled;
    q.correct = correctText;
    return q;
  }

  if (type === 'multi' || type === 'order') {
    const correctTexts = getCorrectArrayFlexible(raw); // 元の並びの正解テキスト
    const shuffled = shuffleArray(baseOpts);
    q.options = shuffled;
    // 正解テキスト配列をそのまま持っておく（シャッフル後でもテキストで判定）
    q.correct = correctTexts;
    return q;
  }

  // text などその他はそのまま
  return q;
}

// 中央の判定関数
function judgeAnswer(q, userAnswer) {
  if (!q) return false;
  const type = q.type;

  // 単一選択
  if (type === 'single') {
    if (!userAnswer) return false;
    const ua = String(userAnswer);
    const correct = String(getSingleCorrectAnswer(q));
    const alts = getAltAnswersArray(q).map((a) => String(a));
    return ua === correct || alts.includes(ua);
  }

  // 記述
  if (type === 'text') {
    if (!userAnswer) return false;
    const ua = normalizeText(userAnswer);
    const correct = normalizeText(getTextCorrectBase(q));
    if (ua === correct) return true;
    const alts = getAltAnswersArray(q);
    return alts.some((a) => ua === normalizeText(a));
  }

  // 複数選択
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

  // 並び替え
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

// 間違えた問題を user_mistakes に記録
const logMistake = (questionId) => {
  if (!questionId) return;
  fetch('/api/mistakes/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId }),
  }).catch(() => {});
};

// マイチームのカード見た目用ヘルパ
function getCardFrameClasses(baseRarity, stars) {
  const s = stars ?? 1;
  const r = baseRarity ?? 1;

  // ざっくりレア度で色分け（ガチャ演出の簡易版）
  if (s >= 9 || r >= 7) {
    return {
      frame:
        'border-yellow-300 bg-gradient-to-br from-yellow-500/40 via-amber-500/20 to-slate-900/80',
      name: 'text-yellow-50',
      rarity: 'text-amber-100',
    };
  }
  if (s >= 6 || r >= 5) {
    return {
      frame:
        'border-pink-300 bg-gradient-to-br from-pink-500/40 via-rose-500/20 to-slate-900/80',
      name: 'text-pink-50',
      rarity: 'text-rose-100',
    };
  }
  if (s >= 3 || r >= 3) {
    return {
      frame:
        'border-sky-300 bg-gradient-to-br from-sky-500/40 via-cyan-500/20 to-slate-900/80',
      name: 'text-sky-50',
      rarity: 'text-cyan-100',
    };
  }
  return {
    frame:
      'border-slate-300 bg-gradient-to-br from-slate-500/30 via-slate-600/20 to-slate-900/80',
    name: 'text-slate-50',
    rarity: 'text-slate-200',
  };
}

export default function SoloBossPage() {
  const router = useRouter();

  // 共通情報
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]); // /api/user/team の結果
  const [initLoading, setInitLoading] = useState(true);
  const [initError, setInitError] = useState('');

  // 難易度 & ゲーム状態
  const [difficultyKey, setDifficultyKey] = useState(null); // 'easy' など
  const [phase, setPhase] = useState('select'); // select | loading | playing | finished

  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  // HP & コンボ
  const [playerMaxHp, setPlayerMaxHp] = useState(1000);
  const [playerHp, setPlayerHp] = useState(1000);
  const [bossMaxHp, setBossMaxHp] = useState(2000);
  const [bossHp, setBossHp] = useState(2000);

  const [correctStreak, setCorrectStreak] = useState(0);
  const [missStreak, setMissStreak] = useState(0); // 連続ミス数表示用
  const [missTotal, setMissTotal] = useState(0); // 累計ミス数（ボス攻撃力用）

  // 攻撃力の現在値（表示用）
  const [playerAtkNow, setPlayerAtkNow] = useState(50);
  const [bossAtkNow, setBossAtkNow] = useState(50);

  // ダメージエフェクト
  const [bossDamaged, setBossDamaged] = useState(false);
  const [playerDamaged, setPlayerDamaged] = useState(false);

  // 回答入力
  const [selectedOption, setSelectedOption] = useState(null); // single
  const [textAnswer, setTextAnswer] = useState(''); // text
  const [multiSelected, setMultiSelected] = useState([]); // multi
  const [orderSelected, setOrderSelected] = useState([]); // order

  const [lastJudge, setLastJudge] = useState(null); // true / false / null
  const [battleResult, setBattleResult] = useState(null); // 'win' | 'lose' | null
  const [message, setMessage] = useState('');

  // ベストタイム（localStorage）
  // { easy: { timeMs, correctCount, missCount, teamSnapshot, updatedAt }, ... }
  const [bestRecords, setBestRecords] = useState({});

  // 回答履歴（不備報告用）
  const [answerHistory, setAnswerHistory] = useState([]);

  // そのバトル開始時点のマイチームスナップショット
  const [battleTeamSnapshot, setBattleTeamSnapshot] = useState([]);

  // 経過時間計測用
  const battleStartRef = useRef(null);
  const questionTimerRef = useRef(null);

  // ★ 同じ問題に対する二重実行防止（タイマーカウント0 + 手動同時押し対策）
  const lastProcessedRef = useRef({ key: null, ts: 0 });

  const currentQuestion =
    questions && questions[currentQuestionIndex]
      ? questions[currentQuestionIndex]
      : null;

  const timeSeconds = Math.max(0, Math.floor(timeLeftMs / 1000));

  // ==== 初期ロード: /api/me と /api/user/team ====
  useEffect(() => {
    let cancelled = false;

    async function loadInit() {
      try {
        setInitLoading(true);
        setInitError('');

        // /api/me
        const meRes = await fetch('/api/me', { cache: 'no-store' });
        const meJson = await meRes.json().catch(() => ({}));

        if (!meRes.ok || !meJson.user) {
          setInitError(
            'ユーザー情報の取得に失敗しました。ログインし直してください。'
          );
          return;
        }

        if (cancelled) return;
        setMe(meJson.user);

        // /api/user/team
        const uid = Number(meJson.user.id);
        const teamRes = await fetch(`/api/user/team?user_id=${uid}`, {
          cache: 'no-store',
        });
        const teamJson = await teamRes.json().catch(() => ({}));

        if (!teamRes.ok) {
          console.error('/api/user/team error', teamJson.error);
        }

        if (!cancelled) {
          setTeam(teamJson.team || []);
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) {
          setInitError(
            '初期情報の取得に失敗しました。時間をおいて再度お試しください。'
          );
        }
      } finally {
        if (!cancelled) setInitLoading(false);
      }
    }

    loadInit();

    return () => {
      cancelled = true;
    };
  }, []);

  // ==== プレイヤー最大HP計算（マイチームの stars を使う） ====
  useEffect(() => {
    // ベース 1000 + マイチームの「星レア度 ×100」の合計
    const baseHp = 1000;
    const teamHp = (team || []).reduce((sum, ch) => {
      const stars = Number(ch.stars ?? 1);
      return sum + Math.max(1, stars) * 100;
    }, 0);
    const maxHp = baseHp + teamHp;
    setPlayerMaxHp(maxHp);
    setPlayerHp(maxHp); // 初期HPを最大HPに揃える
  }, [team]);

  // ==== ローカルの自己ベスト読み込み ====
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const uid = me?.id ? String(me.id) : 'guest';

    const next = {};
    Object.keys(DIFFICULTIES).forEach((key) => {
      const raw = window.localStorage.getItem(`boss_best_${key}_${uid}`);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.timeMs === 'number') {
          next[key] = parsed;
        }
      } catch {
        // 無視
      }
    });
    setBestRecords(next);
  }, [me]);

  // ==== 難易度選択 → ゲーム開始準備 ====
  const handleSelectDifficulty = async (key) => {
    const diff = DIFFICULTIES[key];
    if (!diff) return;

    // すでにプレイ中なら無視
    if (phase === 'playing' || phase === 'loading') return;

    setDifficultyKey(key);
    setPhase('loading');
    setBattleResult(null);
    setAnswerHistory([]);
    setMessage('');
    setLastJudge(null);
    setCorrectStreak(0);
    setMissStreak(0);
    setMissTotal(0);

    // ボスHP設定
    setBossMaxHp(diff.bossHp);
    setBossHp(diff.bossHp);

    // プレイヤー攻撃力・ボス攻撃力初期値（★難易度ごと）
    setPlayerAtkNow(diff.playerBaseAtk);
    setBossAtkNow(diff.bossBaseAtk);

    // 現在HPを最大HPに合わせる
    setPlayerHp(playerMaxHp);

    // このバトル開始時点のマイチームを保存
    const teamSnapshot = (team || []).map((ch) => ({
      name: ch.name,
      stars: ch.stars ?? 1,
      base_rarity: ch.base_rarity ?? 1,
      char_no: ch.char_no,
    }));
    setBattleTeamSnapshot(teamSnapshot);

    // 同じ問題二重実行ガードのキーもリセット気味に
    lastProcessedRef.current = { key: null, ts: 0 };

    // 問題取得
    try {
      const res = await fetch('/api/solo/questions?mode=boss', {
        cache: 'no-store',
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok || !Array.isArray(data.questions)) {
        setInitError('ボス討伐に使用する問題の取得に失敗しました。');
        setPhase('select');
        return;
      }

      const rawQs = data.questions;
      if (!rawQs.length) {
        setInitError('使用できる問題がありません。');
        setPhase('select');
        return;
      }

      const qs = rawQs.map((q, idx) => normalizeQuestionForBoss(q, idx));

      setQuestions(qs);
      setCurrentQuestionIndex(0);

      // 最初の問題のタイマー開始
      const firstLimit = getTimeLimitMs(qs[0]);
      setTimeLeftMs(firstLimit);
      battleStartRef.current = Date.now();
      setPhase('playing');
    } catch (e) {
      console.error(e);
      setInitError('ボス討伐に使用する問題の取得に失敗しました。');
      setPhase('select');
    }
  };

  // ==== 質問タイマー ====
  useEffect(() => {
    if (phase !== 'playing') {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
      return;
    }

    if (!currentQuestion) return;

    const limit = getTimeLimitMs(currentQuestion);
    setTimeLeftMs(limit);

    const start = Date.now();
    if (questionTimerRef.current) {
      clearInterval(questionTimerRef.current);
    }

    questionTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const rest = limit - elapsed;
      if (rest <= 0) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
        setTimeLeftMs(0);
        // 時間切れ = 不正解扱いとして処理
        handleSubmit(true);
      } else {
        setTimeLeftMs(rest);
      }
    }, 200);

    return () => {
      if (questionTimerRef.current) {
        clearInterval(questionTimerRef.current);
        questionTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion && currentQuestion.id, phase]);

  // ==== ベストタイム更新 ====
  const updateBestRecord = (
    difficultyKey,
    clearTimeMs,
    correctCount,
    missCount,
    teamSnapshot
  ) => {
    if (typeof window === 'undefined') return;
    const uid = me?.id ? String(me.id) : 'guest';
    setBestRecords((prev) => {
      const prevRec = prev[difficultyKey];
      if (prevRec && prevRec.timeMs <= clearTimeMs) {
        return prev; // すでにこれより早い記録がある
      }
      const snapshot = {
        timeMs: clearTimeMs,
        correctCount,
        missCount,
        teamSnapshot,
        updatedAt: new Date().toISOString(),
      };
      const next = { ...prev, [difficultyKey]: snapshot };
      try {
        window.localStorage.setItem(
          `boss_best_${difficultyKey}_${uid}`,
          JSON.stringify(snapshot)
        );
      } catch {
        // 無視
      }
      return next;
    });
  };

// ==== バトル終了時処理 ====
const finishBattle = (result) => {
  // タイマー停止
  if (questionTimerRef.current) {
    clearInterval(questionTimerRef.current);
    questionTimerRef.current = null;
  }

  setPhase('finished');
  setBattleResult(result);

  const correctCount = answerHistory.filter((h) => h.isCorrect).length;
  const missCount = answerHistory.length - correctCount;

  let clearMs = null;

  if (result === 'win' && battleStartRef.current) {
    clearMs = Date.now() - battleStartRef.current;

    if (difficultyKey) {
      updateBestRecord(
        difficultyKey,
        clearMs,
        correctCount,
        missCount,
        battleTeamSnapshot
      );
    }

    // ★ ボス称号チェック API 呼び出し
    const noTeam =
      !battleTeamSnapshot || battleTeamSnapshot.length === 0;

    fetch('/api/solo/titles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'boss',
        userId: me?.id ?? null,   // ← 半角スペースで素直に
        value: clearMs,           // クリアタイム(ms)
        difficulty: difficultyKey, // 'easy' / 'normal' / 'hard' / ...
        result: 'win',
        noTeam,
      }),
    }).catch(() => {});
  }

  // ログ API（正解数だけ送る簡易仕様）
  if (me && correctCount > 0) {
    fetch('/api/boss-battle/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: me.id,
        correctCount,
      }),
    }).catch(() => {});
  }
};

  // ==== 回答処理（isTimeUp: true なら時間切れ不正解）====
  const handleSubmit = (isTimeUp = false) => {
    if (phase !== 'playing' || !currentQuestion) return;

    const q = currentQuestion;

    // ★ 同じ問題に対して 1 秒以内に二重で呼ばれたら無視（時間切れ & 手動同時押しなど）
    const questionKey =
      q._bossId ?? q.id ?? q.question_id ?? q.questionId ?? null;
    const nowTs = Date.now();
    if (
      questionKey &&
      lastProcessedRef.current.key === questionKey &&
      nowTs - lastProcessedRef.current.ts < 1000
    ) {
      return;
    }
    lastProcessedRef.current = { key: questionKey, ts: nowTs };

    const type = q.type;

    let userAnswer = null;
    let userAnswerTextForReport = '';

    if (type === 'single') {
      userAnswer = selectedOption;
      userAnswerTextForReport = selectedOption || '';
    } else if (type === 'text') {
      userAnswer = textAnswer;
      userAnswerTextForReport = textAnswer || '';
    } else if (type === 'multi') {
      userAnswer = multiSelected;
      userAnswerTextForReport = multiSelected.join(' / ');
    } else if (type === 'order') {
      userAnswer = orderSelected;
      userAnswerTextForReport = orderSelected.join(' → ');
    }

    let isCorrect = false;
    if (!isTimeUp) {
      isCorrect = judgeAnswer(q, userAnswer);
    } else {
      isCorrect = false;
    }

    const qId = q.id ?? q.question_id ?? q.questionId ?? null;

    // 正解テキスト（不備報告用）
    let correctAnswerText = '';
    if (q.type === 'multi' || q.type === 'order') {
      const arr = getCorrectArrayFlexible(q);
      correctAnswerText = arr.join(q.type === 'multi' ? ' / ' : ' → ');
    } else if (q.type === 'single') {
      correctAnswerText = String(getSingleCorrectAnswer(q));
    } else if (q.type === 'text') {
      correctAnswerText = String(getTextCorrectBase(q));
    } else {
      correctAnswerText = String(getTextCorrectBase(q));
    }

    // 回答履歴に追加（不備報告用）
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: qId,
        text: q.question || q.text || '',
        userAnswerText: isTimeUp ? '（時間切れ）' : userAnswerTextForReport,
        correctAnswerText,
        isCorrect,
      },
    ]);

    if (isCorrect) {
      // 正解 → ボスにダメージ（コンボ増加後の攻撃力でダメージ＆表示更新）
      setCorrectStreak((prevStreak) => {
        const diffConf = DIFFICULTIES[difficultyKey || 'easy'];
        const base = diffConf?.playerBaseAtk ?? 50;
        const step = diffConf?.playerAtkStep ?? 50;

        const nextStreak = prevStreak + 1;
        // 1連続目: base, 2連続目: base + step, 3連続目: base + step*2 ...
        const atk = base + (nextStreak - 1) * step;

        setPlayerAtkNow(atk);

        setBossHp((prevHp) => {
          const nextHp = Math.max(0, prevHp - atk);
          // ダメージエフェクト（ボス）
          setBossDamaged(true);
          setTimeout(() => setBossDamaged(false), 200);
          if (nextHp <= 0) {
            setMessage('ボスにとどめを刺した！');
            finishBattle('win');
          } else {
            setMessage(`命中！ボスに ${atk} ダメージ！`);
          }
          return nextHp;
        });

        return nextStreak;
      });

      // 正解したら連続ミスはリセット、累計ミスは維持
      setMissStreak(0);

      setLastJudge(true);
    } else {
      // 不正解 → プレイヤーがダメージ
      if (qId) {
        logMistake(qId);
      }

      // 連続ミス数（表示用）は増やしつつ、正解時には別でリセット
      setMissStreak((prev) => prev + 1);
      setCorrectStreak(0);

      // ★ コンボが切れたら攻撃力は難易度ごとの初期値に戻す
      setPlayerAtkNow(() => {
        const diffConf = DIFFICULTIES[difficultyKey || 'easy'];
        return diffConf?.playerBaseAtk ?? 50;
      });

      // ★ 累計ミス数に応じてボス攻撃力アップ（ミス数が増えた直後の値で計算）
      setMissTotal((prevTotal) => {
        const nextTotal = prevTotal + 1;
        const diffConf = DIFFICULTIES[difficultyKey || 'easy'];
        const baseAtk = diffConf?.bossBaseAtk ?? 50;
        const step = diffConf?.bossAtkStep ?? 50;
        // 1回目のミス: baseAtk, 2回目: baseAtk+step, 3回目: baseAtk+step*2...
        const atk = baseAtk + (nextTotal - 1) * step;

        setBossAtkNow(atk);

        setPlayerHp((prevHp) => {
          const nextHp = Math.max(0, prevHp - atk);
          // ダメージエフェクト（プレイヤー）
          setPlayerDamaged(true);
          setTimeout(() => setPlayerDamaged(false), 200);

          if (nextHp <= 0) {
            setMessage('致命傷を受けてしまった…');
            finishBattle('lose');
          } else {
            setMessage(`反撃を受けた！${atk} ダメージ…`);
          }
          return nextHp;
        });

        return nextTotal;
      });

      setLastJudge(false);
    }

    // 次の問題へ
    setSelectedOption(null);
    setTextAnswer('');
    setMultiSelected([]);
    setOrderSelected([]);

    if (phase === 'playing') {
      setCurrentQuestionIndex((prev) => {
        if (!questions.length) return prev;
        const nextIndex = Math.floor(Math.random() * questions.length);
        return nextIndex;
      });
    }
  };

  // multi 用の選択切り替え
  const toggleMultiOption = (opt) => {
    setMultiSelected((prev) => {
      if (prev.includes(opt)) {
        return prev.filter((v) => v !== opt);
      }
      return [...prev, opt];
    });
  };

  // order 用の選択切り替え
  const toggleOrderOption = (opt) => {
    setOrderSelected((prev) => {
      if (prev.includes(opt)) {
        return prev.filter((v) => v !== opt);
      }
      return [...prev, opt];
    });
  };

  const typeLabel = useMemo(() => {
    if (!currentQuestion) return '';
    if (currentQuestion.type === 'single') return '単一選択';
    if (currentQuestion.type === 'multi') return '複数選択';
    if (currentQuestion.type === 'order') return '並び替え';
    if (currentQuestion.type === 'text') return '記述';
    return currentQuestion.type || '';
  }, [currentQuestion]);

  const canSubmit =
    currentQuestion && currentQuestion.type === 'single'
      ? !!selectedOption
      : currentQuestion && currentQuestion.type === 'text'
      ? !!textAnswer
      : currentQuestion && currentQuestion.type === 'multi'
      ? multiSelected.length > 0
      : currentQuestion && currentQuestion.type === 'order'
      ? orderSelected.length === (currentQuestion.options?.length || 0)
      : false;

  const playerHpRatio =
    playerMaxHp > 0 ? Math.max(0, Math.min(1, playerHp / playerMaxHp)) : 0;
  const bossHpRatio =
    bossMaxHp > 0 ? Math.max(0, Math.min(1, bossHp / bossMaxHp)) : 0;

  // ==== 同じ難易度に再挑戦 ====
  const handleRetrySameDifficulty = () => {
    if (!difficultyKey) {
      setPhase('select');
      return;
    }
    setQuestions([]);
    setAnswerHistory([]);
    setMessage('');
    setLastJudge(null);
    setCorrectStreak(0);
    setMissStreak(0);
    setMissTotal(0);
    setBattleResult(null);
    battleStartRef.current = null;
    lastProcessedRef.current = { key: null, ts: 0 };

    handleSelectDifficulty(difficultyKey);
  };

  if (initLoading) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <p className="text-sm">ボス討伐モードを読み込み中...</p>
      </main>
    );
  }

  if (initError) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow p-6 space-y-4 text-center">
          <h1 className="text-xl font-extrabold mb-1">ボス討伐モード</h1>
          <p className="text-sm text-rose-700 whitespace-pre-wrap">
            {initError}
          </p>
          <div className="flex flex-col gap-2 mt-3">
            <Link
              href="/solo"
              className="w-full py-2 rounded-full bg-sky-500 text-white text-sm font-bold hover:bg-sky-600"
            >
              ソロメニューへ戻る
            </Link>
            <Link
              href="/"
              className="w-full py-2 rounded-full border border-sky-500 text-sky-700 bg-white text-sm font-bold hover:bg-sky-50"
            >
              ホームへ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ==== 難易度選択画面 ====
  if (phase === 'select') {
    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <header className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-lg sm:text-2xl font-extrabold tracking-wide">
                ボス討伐モード（ソロ）
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-1">
                マイチームの総レア度でHPが決まる。ボスのHPを削り切れば勝利！
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {me && (
                <p className="text-[11px] text-slate-200">
                  プレイヤー:{' '}
                  <span className="font-semibold">
                    {me.display_name || me.username}
                  </span>
                </p>
              )}
              <Link
                href="/"
                className="text-[11px] sm:text-xs font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
              >
                ホームへ戻る
              </Link>
            </div>
          </header>

          {/* マイチーム HP 概要 */}
          <section className="mb-4 bg-slate-900/70 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-lg">
            <h2 className="text-sm sm:text-base font-bold mb-2 flex items-center gap-2">
              <span className="text-amber-300 text-lg">⚔</span> あなたのパラメータ
            </h2>
            <p className="text-xs sm:text-sm text-slate-100 mb-1">
              最大HP:{' '}
              <span className="font-semibold text-emerald-300">
                {playerMaxHp}
              </span>
            </p>
            <p className="text-[11px] sm:text-xs text-slate-300">
              （ベース 1000 ＋ マイチームの星レア度 × 100 の合計）
            </p>

            {/* マイチームカード 5枚（セレクト画面は横スクロールのまま） */}
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 sm:overflow-visible sm:pb-0">
              {[0, 1, 2, 3, 4].map((slot) => {
                const ch = team[slot] || null;
                const stars = ch?.stars ?? 1;
                const baseRarity = ch?.base_rarity ?? 1;
                const frame = getCardFrameClasses(baseRarity, stars);

                return (
                  <div
                    key={slot}
                    className={`relative rounded-xl border px-2 py-2 min-h-[68px] flex flex-col bg-clip-padding min-w-[88px] sm:min-w-0 ${frame.frame}`}
                  >
                    <div className="text-[9px] text-slate-200 mb-0.5">
                      SLOT {slot + 1}
                    </div>
                    {ch ? (
                      <>
                        <div className="text-[9px] sm:text-[10px] font-bold mb-0.5 leading-tight line-clamp-2 break-words">
                          <span className={frame.name}>{ch.name}</span>
                        </div>
                        <div className="text-[8px] flex flex-col gap-0.5">
                          <span className={frame.rarity}>
                            基礎レア度: {baseRarity}
                          </span>
                          <span className="text-amber-200">
                            ★{stars}（HP +{stars * 100}）
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="mt-auto text-[9px] text-slate-400">
                        （未設定）
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-2 text-[11px] text-slate-300">
              ※ マイチームは設定していなくても挑戦可能です。
            </div>
          </section>

          {/* 難易度一覧 + ベストタイム */}
          <section className="bg-slate-900/70 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm sm:text-base font-bold">
                難易度を選んで挑戦
              </h2>
            </div>

            <div className="space-y-2">
              {Object.values(DIFFICULTIES).map((d) => {
                const rec = bestRecords[d.key];
                const bestText =
                  rec && typeof rec.timeMs === 'number'
                    ? `ベスト: ${(rec.timeMs / 1000).toFixed(1)} 秒`
                    : 'まだクリア記録がありません';

                return (
                  <button
                    key={d.key}
                    type="button"
                    onClick={() => handleSelectDifficulty(d.key)}
                    className="w-full text-left rounded-2xl border border-slate-600 bg-slate-900/80 px-3 py-2.5 hover:bg-slate-800 flex items-center gap-3"
                  >
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden bg-slate-800 flex items-center justify-center border border-slate-600">
                      <img
                        src={d.image}
                        alt={d.label}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm sm:text-base font-bold text-slate-50">
                          {d.label}
                        </p>
                        <p className="text-[11px] text-amber-200 whitespace-nowrap">
                          HP {d.bossHp}
                        </p>
                      </div>
                      <p className="text-[11px] text-slate-200 mt-0.5 line-clamp-2">
                        {d.description}
                      </p>
                      <p className="text-[10px] text-emerald-200 mt-0.5">
                        {bestText}
                      </p>
                      {rec && (
                        <>
                          <p className="text-[9px] text-slate-300 mt-0.5 line-clamp-2">
                            最速チーム:{' '}
                            {(rec.teamSnapshot || [])
                              .map(
                                (ch) =>
                                  `${ch.name ?? '???'}★${ch.stars ?? 1}`
                              )
                              .join(' / ')}
                          </p>
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            正解 {rec.correctCount ?? 0} 問 ／ ミス{' '}
                            {rec.missCount ?? 0} 問
                          </p>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between">
              <Link
                href="/solo/boss/rules"
                className="inline-block px-3 py-1.5 rounded-full border border-slate-500 bg-slate-800 text-[11px] sm:text-xs font-semibold text-slate-100 hover:bg-slate-700"
              >
                ルールを見る
              </Link>
              <Link
                href="/solo"
                className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-slate-900 text-xs font-bold text-sky-200 hover:bg-slate-800 whitespace-nowrap"
              >
                ソロメニューへ戻る
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // ==== 結果画面 ====
  if (phase === 'finished') {
    const diff = difficultyKey ? DIFFICULTIES[difficultyKey] : null;
    const correctCount = answerHistory.filter((h) => h.isCorrect).length;
    const missCount = answerHistory.length - correctCount;

    let clearTimeText = '';
    if (battleResult === 'win' && battleStartRef.current) {
      const elapsed = Date.now() - battleStartRef.current;
      clearTimeText = `${(elapsed / 1000).toFixed(1)} 秒`;
    }

    return (
      <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <header className="flex items-center justify-between mb-3">
            <h1 className="text-lg sm:text-2xl font-extrabold">
              ボス討伐 結果
            </h1>
            <Link
              href="/"
              className="text-[11px] sm:text-xs font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
            >
              ホームへ戻る
            </Link>
          </header>

          <section className="bg-slate-900/80 border border-slate-700 rounded-2xl p-4 sm:p-5 shadow-lg mb-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm sm:text-base font-bold mb-1">
                  {diff ? diff.label : 'ボス討伐'}
                </p>
                <p
                  className={
                    'text-base sm:text-xl font-extrabold ' +
                    (battleResult === 'win'
                      ? 'text-emerald-300'
                      : 'text-rose-300')
                  }
                >
                  {battleResult === 'win' ? '勝利！' : '敗北…'}
                </p>
                <p className="text-xs text-slate-200 mt-1">
                  正解 {correctCount} 問 ／ ミス {missCount} 問
                </p>
                {battleResult === 'win' && clearTimeText && (
                  <p className="text-xs text-amber-200 mt-1">
                    クリアタイム: {clearTimeText}
                  </p>
                )}
              </div>

              {diff && (
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-xl overflow-hidden bg-slate-800 border border-slate-600">
                    <img
                      src={diff.image}
                      alt={diff.label}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="text-xs text-slate-200">
                    <p>
                      ボスHP:{' '}
                      <span className="font-semibold text-rose-200">
                        {diff.bossHp}
                      </span>
                    </p>
                    <p>
                      プレイヤー最大HP:{' '}
                      <span className="font-semibold text-emerald-200">
                        {playerMaxHp}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* クリア時のマイチーム */}
            {battleTeamSnapshot && battleTeamSnapshot.length > 0 && (
              <div className="mt-3">
                <p className="text-[11px] text-slate-200 mb-1">
                  クリア時のマイチーム
                </p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {battleTeamSnapshot.map((ch, idx) => {
                    const stars = ch.stars ?? 1;
                    const baseRarity = ch.base_rarity ?? 1;
                    const frame = getCardFrameClasses(baseRarity, stars);
                    return (
                      <div
                        key={`${ch.char_no ?? idx}_${idx}`}
                        className={`relative rounded-xl border px-2 py-2 min-h-[68px] flex flex-col bg-clip-padding ${frame.frame}`}
                      >
                        <div className="text-[9px] text-slate-200 mb-0.5">
                          SLOT {idx + 1}
                        </div>
                        <div className="text-[9px] sm:text-[10px] font-bold mb-0.5 leading-tight line-clamp-2 break-words">
                          <span className={frame.name}>
                            {ch.name ?? '???'}
                          </span>
                        </div>
                        <div className="text-[8px] text-slate-100">
                          <span className={frame.rarity}>
                            基礎:{baseRarity}
                          </span>
                          <span className="ml-1 text-amber-200">
                            ★{stars}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {message && (
              <p className="mt-2 text-[11px] text-slate-200">{message}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRetrySameDifficulty}
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-xs sm:text-sm font-semibold hover:bg-sky-400 whitespace-nowrap"
              >
                同じ難易度に再挑戦
              </button>
              <button
                type="button"
                onClick={() => {
                  setPhase('select');
                  setDifficultyKey(null);
                  setBattleResult(null);
                  setMessage('');
                  setAnswerHistory([]);
                  battleStartRef.current = null;
                  lastProcessedRef.current = { key: null, ts: 0 };
                }}
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-900 text-xs sm:text-sm font-semibold hover:bg-slate-800 whitespace-nowrap"
              >
                難易度選択に戻る
              </button>
              <Link
                href="/solo"
                className="px-4 py-2 rounded-full border border-sky-500 bg-slate-900 text-xs sm:text-sm font-semibold text-sky-200 hover:bg-slate-800 whitespace-nowrap"
              >
                ソロメニューへ戻る
              </Link>
              <Link
                href="/solo/boss/rules"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-900 text-xs sm:text-sm font-semibold text-slate-100 hover:bg-slate-800 whitespace-nowrap"
              >
                ルールを見る
              </Link>
            </div>
          </section>

          {/* 問題振り返り + 不備報告 */}
          <QuestionReviewAndReport
            questions={answerHistory}
            sourceMode="solo_boss"
          />
        </div>
      </main>
    );
  }

  // ==== プレイ画面 ====
  const diff = difficultyKey ? DIFFICULTIES[difficultyKey] : null;

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50">
      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-3">
        <header className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-base sm:text-xl font-extrabold tracking-wide">
              ボス討伐モード
            </h1>
            {diff && (
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                難易度:{' '}
                <span className="font-semibold text-amber-200">
                  {diff.label}
                </span>
              </p>
            )}
          </div>
          <Link
            href="/"
            className="text-[11px] sm:text-xs font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
          >
            ホームへ戻る
          </Link>
        </header>

        {/* 上部: 左右2カラム（自分 / ボス） ※スマホでも横並び固定 */}
        <div className="flex flex-row gap-3 mb-3 items-stretch">
          {/* 左: プレイヤー */}
          <section className="relative flex-1 bg-slate-900/80 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-lg flex flex-col h-full">
            {/* プレイヤー HP */}
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs sm:text-sm font-semibold text-sky-200">
                  {me?.display_name || me?.username || 'プレイヤー'}
                </span>
                <span className="text-[10px] text-slate-300">
                  HP:{' '}
                  <span className="font-semibold text-emerald-200">
                    {playerHp} / {playerMaxHp}
                  </span>
                </span>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-200">
                攻撃力:{' '}
                <span className="font-semibold text-emerald-200">
                  {playerAtkNow}
                </span>
              </span>
            </div>
            <div className="w-full h-2.5 sm:h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-600 shadow-inner mb-2">
              <div
                className={
                  'h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-amber-300 transition-[width] duration-200 ' +
                  (playerDamaged ? 'animate-pulse' : '')
                }
                style={{ width: `${playerHpRatio * 100}%` }}
              />
            </div>

            {/* プレイヤーがダメージを受けたときの斜め切り傷 */}
            {playerDamaged && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="w-32 h-[2px] bg-emerald-300/90 shadow-[0_0_16px_rgba(16,185,129,0.9)] -rotate-45" />
              </div>
            )}

            {/* マイチームカード（上3体 + 下2体） */}
            <div className="mt-2 space-y-2">
              {/* 上段 3体 */}
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((slot) => {
                  const ch = team[slot] || null;
                  const stars = ch?.stars ?? 1;
                  const baseRarity = ch?.base_rarity ?? 1;
                  const frame = getCardFrameClasses(baseRarity, stars);

                  return (
                    <div
                      key={slot}
                      className={`relative rounded-xl border px-2 py-2 min-h-[68px] flex flex-col bg-clip-padding ${frame.frame}`}
                    >
                      <div className="text-[9px] text-slate-200 mb-0.5">
                        {slot === 0 ? 'リーダー' : `SLOT ${slot + 1}`}
                      </div>
                      {ch ? (
                        <>
                          <div className="text-[9px] sm:text-[10px] font-bold mb-0.5 leading-tight line-clamp-2 break-words">
                            <span className={frame.name}>{ch.name}</span>
                          </div>
                          <div className="text-[8px] text-slate-100">
                            <span className={frame.rarity}>
                              基礎:{baseRarity}
                            </span>
                            <span className="ml-1 text-amber-200">
                              ★{stars}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-auto text-[9px] text-slate-400">
                          （未設定）
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 下段 2体 */}
              <div className="grid grid-cols-2 gap-2">
                {[3, 4].map((slot) => {
                  const ch = team[slot] || null;
                  const stars = ch?.stars ?? 1;
                  const baseRarity = ch?.base_rarity ?? 1;
                  const frame = getCardFrameClasses(baseRarity, stars);

                  return (
                    <div
                      key={slot}
                      className={`relative rounded-xl border px-2 py-2 min-h-[68px] flex flex-col bg-clip-padding ${frame.frame}`}
                    >
                      <div className="text-[9px] text-slate-200 mb-0.5">
                        SLOT {slot + 1}
                      </div>
                      {ch ? (
                        <>
                          <div className="text-[9px] sm:text-[10px] font-bold mb-0.5 leading-tight line-clamp-2 break-words">
                            <span className={frame.name}>{ch.name}</span>
                          </div>
                          <div className="text-[8px] text-slate-100">
                            <span className={frame.rarity}>
                              基礎:{baseRarity}
                            </span>
                            <span className="ml-1 text-amber-200">
                              ★{stars}
                            </span>
                          </div>
                        </>
                      ) : (
                        <div className="mt-auto text-[9px] text-slate-400">
                          （未設定）
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 右: ボス */}
          <section className="relative flex-1 bg-slate-900/80 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-lg flex flex-col h-full">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs sm:text-sm font-semibold text-rose-200">
                BOSS HP
              </span>
              <span className="text-[11px] sm:text-xs text-rose-100">
                {bossHp} / {bossMaxHp}
              </span>
            </div>
            <div className="w-full h-3 sm:h-4 rounded-full bg-slate-800 overflow-hidden border border-slate-600 shadow-inner mb-2">
              <div
                className={
                  'h-full bg-gradient-to-r from-rose-500 via-orange-400 to-amber-300 transition-[width] duration-200 ' +
                  (bossDamaged ? 'animate-pulse' : '')
                }
                style={{ width: `${bossHpRatio * 100}%` }}
              />
            </div>

            {/* ボス画像 + 攻撃力表示 */}
            <div className="mt-2 flex-1 flex flex-col items-center justify-center gap-3">
              <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-slate-800 border border-slate-600 flex items-center justify-center">
                {diff && (
                  <img
                    src={diff.image}
                    alt={diff.label}
                    className={
                      'w-full h-full object-contain transition-transform ' +
                      (bossDamaged ? 'scale-110' : '')
                    }
                  />
                )}
                {/* ボスへのダメージ時の斜め切り傷 */}
                {bossDamaged && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-[2px] bg-rose-300/90 shadow-[0_0_16px_rgba(248,113,113,0.9)] rotate-45" />
                  </div>
                )}
              </div>

              <div className="text-[11px] sm:text-xs text-slate-100">
                <p>
                  攻撃力:{' '}
                  <span className="font-semibold text-rose-200">
                    {bossAtkNow}
                  </span>
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* 下部: 問題 & 回答エリア */}
        <section className="bg-slate-900/80 border border-slate-700 rounded-2xl p-3 sm:p-4 shadow-lg mb-3">
          {currentQuestion ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-sky-900 text-[10px] sm:text-xs font-semibold text-sky-100 border border-sky-400/60">
                    {typeLabel}
                  </span>
                  <span className="text-[10px] sm:text-xs text-slate-200">
                    残り時間:{' '}
                    <span className="font-semibold text-amber-200">
                      {timeSeconds} 秒
                    </span>
                  </span>
                </div>
                <div className="text-[10px] sm:text-xs text-slate-200 text-right">
                  <p>
                    連続正解:{' '}
                    <span className="text-emerald-200 font-semibold">
                      {correctStreak}
                    </span>
                  </p>
                  <p>
                    連続不正解:{' '}
                    <span className="text-rose-200 font-semibold">
                      {missStreak}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mb-2 max-h-32 sm:max-h-40 overflow-y-auto bg-slate-950/70 rounded-xl border border-slate-700 px-3 py-2">
                <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
                  {currentQuestion.question || currentQuestion.text}
                </p>
              </div>

              {/* 選択肢/回答欄 */}
              <div className="space-y-2">
                {/* 単一 */}
                {currentQuestion.type === 'single' && (
                  <div className="space-y-2">
                    {currentQuestion.options?.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedOption(opt)}
                        className={
                          'w-full text-left text-[11px] sm:text-xs px-3 py-1.5 rounded-2xl border flex items-center justify-between ' +
                          (selectedOption === opt
                            ? 'border-orange-400 bg-orange-500/20 text-slate-50'
                            : 'border-slate-600 bg-slate-800 text-slate-100')
                        }
                      >
                        <span>{opt}</span>
                        {selectedOption === opt && (
                          <span className="text-[10px] font-bold text-orange-300">
                            選択中
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {/* 複数 */}
                {currentQuestion.type === 'multi' && (
                  <div className="space-y-2">
                    <p className="text-[10px] text-slate-300">
                      当てはまるものをすべて選択してください。
                    </p>
                    {currentQuestion.options?.map((opt, idx) => {
                      const active = multiSelected.includes(opt);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => toggleMultiOption(opt)}
                          className={
                            'w-full text-left text-[11px] sm:text-xs px-3 py-1.5 rounded-2xl border flex items-center justify-between ' +
                            (active
                              ? 'border-orange-400 bg-orange-500/20 text-slate-50'
                              : 'border-slate-600 bg-slate-800 text-slate-100')
                          }
                        >
                          <span>{opt}</span>
                          <span className="text-[10px] font-bold">
                            {active ? '✔' : ''}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 並び替え */}
                {currentQuestion.type === 'order' && (
                  <div className="space-y-3">
                    <p className="text-[10px] text-slate-300">
                      正しい順番になるように、選択肢をタップして並べてください。
                    </p>
                    <div className="space-y-2">
                      {currentQuestion.options?.map((opt, idx) => {
                        const selected = orderSelected.includes(opt);
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleOrderOption(opt)}
                            className={
                              'w-full text-left text-[11px] sm:text-xs px-3 py-1.5 rounded-2xl border flex items-center justify-between ' +
                              (selected
                                ? 'border-slate-500 bg-slate-700 text-slate-300'
                                : 'border-slate-600 bg-slate-800 text-slate-100')
                            }
                          >
                            <span>{opt}</span>
                            {selected && (
                              <span className="text-[10px] font-bold text-sky-200">
                                選択中
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <div className="border border-slate-700 rounded-xl px-2 py-2 bg-slate-950/70">
                      <p className="text-[10px] text-slate-300 mb-1">
                        現在の並び順
                      </p>
                      {orderSelected.length === 0 ? (
                        <p className="text-[10px] text-slate-500">
                          まだ選択されていません。
                        </p>
                      ) : (
                        <ol className="list-decimal list-inside space-y-0.5 text-[10px] text-slate-100">
                          {orderSelected.map((opt, idx) => (
                            <li key={idx}>{opt}</li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </div>
                )}

                {/* 記述 */}
                {currentQuestion.type === 'text' && (
                  <textarea
                    className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-3 py-2 text-[11px] sm:text-xs text-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                    rows={3}
                    placeholder="答えを入力してください"
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

              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={!canSubmit}
                  className="flex-1 py-2 rounded-full bg-orange-500 text-white text-xs sm:text-sm font-semibold shadow disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-400"
                >
                  攻撃する
                </button>
                <Link
                  href="/solo/boss/rules"
                  className="px-3 py-1.5 rounded-full border border-slate-600 bg-slate-900 text-[10px] sm:text-xs font-semibold text-slate-100 hover:bg-slate-800 whitespace-nowrap"
                >
                  ルール
                </Link>
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-100">問題を読み込み中...</p>
          )}

          {lastJudge != null && (
            <p
              className={
                'mt-2 text-[11px] sm:text-xs ' +
                (lastJudge ? 'text-emerald-200' : 'text-rose-200')
              }
            >
              {lastJudge
                ? '正解！ボスにダメージを与えた！'
                : '不正解…ボスの反撃を受けた！'}
            </p>
          )}
          {message && (
            <p className="mt-1 text-[11px] sm:text-xs text-slate-200">
              {message}
            </p>
          )}
        </section>

        <div className="text-[10px] sm:text-xs text-slate-400">
          HPが 0 になると敗北です。連続正解で自分の攻撃力アップ、累計不正解でボスの攻撃力アップ。
        </div>
      </div>
    </main>
  );
}
