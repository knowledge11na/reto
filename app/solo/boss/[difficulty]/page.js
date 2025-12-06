// file: app/solo/boss/[difficulty]/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

// 難易度ごとの設定
const BOSS_CONFIG = {
  easy: {
    label: 'イージー',
    hp: 2000,
    baseAtk: 50,
    image: '/solo_monster/boss_easy.png',
    storageKey: 'boss_best_easy',
  },
  normal: {
    label: 'ノーマル',
    hp: 4000,
    baseAtk: 100,
    image: '/solo_monster/boss_normal.png',
    storageKey: 'boss_best_normal',
  },
  hard: {
    label: 'ハード',
    hp: 7000,
    baseAtk: 150,
    image: '/solo_monster/boss_hard.png',
    storageKey: 'boss_best_hard',
  },
  veryhard: {
    label: 'ベリーハード',
    hp: 10000,
    baseAtk: 200,
    image: '/solo_monster/boss_veryhard.png',
    storageKey: 'boss_best_veryhard',
  },
  extra: {
    label: 'エクストラ',
    hp: 30000,
    baseAtk: 500,
    image: '/solo_monster/boss_extra.png',
    storageKey: 'boss_best_extra',
  },
};

// 問題タイプごとの制限時間（チャレンジと同じ）
const TIME_SINGLE = 30000;
const TIME_MULTI_ORDER = 40000;
const TIME_TEXT_SHORT = 60000;
const TIME_TEXT_LONG = 80000;

function getTimeLimitMs(question) {
  if (!question) return TIME_SINGLE;
  const type = question.type;
  if (type === 'single') return TIME_SINGLE;
  if (type === 'multi' || type === 'order') return TIME_MULTI_ORDER;
  if (type === 'text') {
    const base =
      typeof question.answerText === 'string'
        ? question.answerText
        : typeof question.correct === 'string'
        ? question.correct
        : '';
    const len = base.length;
    return len > 15 ? TIME_TEXT_LONG : TIME_TEXT_SHORT;
  }
  return TIME_SINGLE;
}

// 配列シャッフル
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// multi / order 用に correct を配列として取り出す
function getCorrectArray(question) {
  if (!question) return [];
  let c = question.correct;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') {
    const t = c.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // ignore
      }
    }
    return [c];
  }
  return [];
}

// 正誤判定（チャレンジほぼそのまま）
function judgeAnswer(question, userAnswer) {
  if (!question) return false;
  const type = question.type;

  // 単一選択
  if (type === 'single') {
    if (!userAnswer) return false;
    const correct =
      typeof question.correct === 'string'
        ? question.correct
        : typeof question.answerText === 'string'
        ? question.answerText
        : String(question.correct ?? '');
    const alt = Array.isArray(question.altAnswers) ? question.altAnswers : [];
    return userAnswer === correct || alt.includes(userAnswer);
  }

  // 記述
  if (type === 'text') {
    if (!userAnswer) return false;
    const norm = (s) =>
      String(s ?? '')
        .replace(/\s+/g, '')
        .toLowerCase();
    const ua = norm(userAnswer);
    const ca = norm(
      question.answerText ??
        (typeof question.correct === 'string' ? question.correct : '')
    );
    if (ua === ca) return true;
    const alt = Array.isArray(question.altAnswers) ? question.altAnswers : [];
    return alt.some((a) => ua === norm(a));
  }

  // 複数選択
  if (type === 'multi') {
    const uaArr = Array.isArray(userAnswer) ? userAnswer : [];
    if (uaArr.length === 0) return false;
    const correctArr = getCorrectArray(question);
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
    const correctArr = getCorrectArray(question);
    if (uaArr.length !== correctArr.length || uaArr.length === 0) return false;

    for (let i = 0; i < correctArr.length; i++) {
      if (String(uaArr[i]) !== String(correctArr[i])) return false;
    }
    return true;
  }

  return false;
}

// 不備報告・弱点克服用のミス記録
const logMistake = (questionId) => {
  if (!questionId) return;

  fetch('/api/mistakes/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId }),
  }).catch(() => {
    // 無視
  });
};

function formatTime(ms) {
  if (!ms || ms <= 0) return '0:00';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function SoloBossPlayPage() {
  const params = useParams();
  const router = useRouter();

  const diffKey = params?.difficulty;
  const config = BOSS_CONFIG[diffKey];

  // 難易度不正
  if (!config) {
    return (
      <main className="min-h-screen bg-sky-50 flex items-center justify-center text-slate-900 px-4">
        <div className="max-w-md w-full bg-white border border-sky-100 rounded-3xl p-5 shadow-sm text-center space-y-4">
          <h1 className="text-xl font-extrabold mb-2">ボスバトル</h1>
          <p className="text-sm text-rose-700">
            不正な難易度が指定されました。
          </p>
          <div className="flex flex-col gap-2 mt-2">
            <Link
              href="/solo/boss"
              className="w-full py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold"
            >
              ボスバトルメニューへ戻る
            </Link>
            <Link
              href="/solo"
              className="w-full py-2 rounded-full border border-sky-400 text-sky-700 bg-white text-sm font-bold"
            >
              ソロメニューへ
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ユーザー・チーム・問題などの state
  const [me, setMe] = useState(null);
  const [team, setTeam] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // HP・攻撃力まわり
  const [bossHp, setBossHp] = useState(config.hp);
  const [playerHp, setPlayerHp] = useState(0);
  const [streakCorrect, setStreakCorrect] = useState(0);
  const [streakMiss, setStreakMiss] = useState(0);

  // 問題まわり
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [phase, setPhase] = useState('loading'); // loading | question | show-answer | finished

  const [selectedOption, setSelectedOption] = useState(null);
  const [multiSelected, setMultiSelected] = useState([]);
  const [orderSelected, setOrderSelected] = useState([]);
  const [textAnswer, setTextAnswer] = useState('');

  // 結果
  const [result, setResult] = useState(null); // 'win' | 'lose'
  const [message, setMessage] = useState('');

  // 経過時間計測
  const startTimeRef = useRef(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  // 不備報告用
  const [answerHistory, setAnswerHistory] = useState([]);

  // 自己ベスト
  const [bestTimeMs, setBestTimeMs] = useState(null);
  const [isBestUpdated, setIsBestUpdated] = useState(false);

  // マイチームHP計算
  const teamHp = useMemo(() => {
    if (!team || team.length === 0) return 1000;
    const sumRarity = team.reduce(
      (sum, t) => sum + (Number(t.base_rarity ?? 1) || 1),
      0
    );
    return 1000 + sumRarity * 100;
  }, [team]);

  // プレイヤー攻撃力（連続正解）
  const playerAtk = useMemo(
    () => 50 + Math.floor(streakCorrect / 2) * 50,
    [streakCorrect]
  );

  // ボス攻撃力（連続不正解）
  const bossAtk = useMemo(
    () => config.baseAtk + streakMiss * 50,
    [config.baseAtk, streakMiss]
  );

  const currentQuestion =
    questions && questions.length
      ? questions[currentIndex % questions.length]
      : null;

  const timeSeconds = Math.max(0, Math.floor(timeLeftMs / 1000));

  // ===== 初期ロード（ユーザー・マイチーム・問題） =====
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setLoadError('');

        // /api/me
        const meRes = await fetch('/api/me', { cache: 'no-store' });
        const meJson = await meRes.json().catch(() => ({}));
        if (!meRes.ok || !meJson.user) {
          setLoadError(
            'ユーザー情報の取得に失敗しました。ログインし直してから再度アクセスしてください。'
          );
          setLoading(false);
          return;
        }
        setMe(meJson.user);

        // マイチーム
        let teamData = [];
        try {
          const teamRes = await fetch(
            `/api/user/team?user_id=${meJson.user.id}`
          );
          const teamJson = await teamRes.json().catch(() => ({}));
          if (teamRes.ok && Array.isArray(teamJson.team)) {
            teamData = teamJson.team;
          }
        } catch {
          // マイチーム取れなくてもプレイはできる
        }
        setTeam(teamData);

        // 問題（bossモード）
        const qRes = await fetch('/api/solo/questions?mode=boss', {
          cache: 'no-store',
        });
        const qJson = await qRes.json().catch(() => ({}));
        if (!qRes.ok || !qJson.ok || !Array.isArray(qJson.questions)) {
          setLoadError('問題の取得に失敗しました。');
          setLoading(false);
          return;
        }

        // シャッフル & 選択肢もシャッフル
        const qs = qJson.questions.map((q) => ({
          ...q,
          options: Array.isArray(q.options) ? shuffleArray(q.options) : [],
        }));
        const shuffled = shuffleArray(qs);

        setQuestions(shuffled);
        setBossHp(config.hp);
        setPlayerHp(teamHp); // このタイミングでは teamHp がまだ 0 なので後でセットし直す

        setCurrentIndex(0);
        setPhase('question');
        setSelectedOption(null);
        setMultiSelected([]);
        setOrderSelected([]);
        setTextAnswer('');
        setStreakCorrect(0);
        setStreakMiss(0);
        setResult(null);
        setMessage('');
        setAnswerHistory([]);

        // 開始時間
        startTimeRef.current = Date.now();
        setElapsedMs(0);
      } catch (e) {
        console.error(e);
        setLoadError('読み込み中にエラーが発生しました。');
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diffKey]);

  // teamHp 計算が落ち着いたらプレイヤーHPをセット
  useEffect(() => {
    if (phase === 'loading') return;
    setPlayerHp(teamHp);
  }, [teamHp, phase]);

  // ===== 自己ベスト読み込み =====
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(config.storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.timeMs === 'number') {
        setBestTimeMs(parsed.timeMs);
      }
    } catch {
      // ignore
    }
  }, [config.storageKey]);

  // ===== 経過時間の更新 =====
  useEffect(() => {
    if (phase !== 'question' && phase !== 'show-answer') return;
    if (!startTimeRef.current) return;

    const id = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 500);

    return () => clearInterval(id);
  }, [phase]);

  // ===== タイマー（問題ごと） =====
  useEffect(() => {
    if (!currentQuestion || phase !== 'question') return;

    const limit = getTimeLimitMs(currentQuestion);
    setTimeLeftMs(limit);

    const start = Date.now();
    const id = setInterval(() => {
      const elapsed = Date.now() - start;
      const rest = limit - elapsed;
      if (rest <= 0) {
        clearInterval(id);
        setTimeLeftMs(0);
        handleSubmit(true); // 時間切れ
      } else {
        setTimeLeftMs(rest);
      }
    }, 200);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion && currentQuestion.id, phase]);

  // ===== 攻撃処理 & 解答処理 =====
  const handleSubmit = (isTimeUp = false) => {
    if (!currentQuestion || phase !== 'question') return;

    const type = currentQuestion.type;
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
      isCorrect = judgeAnswer(currentQuestion, userAnswer);
    } else {
      isCorrect = false;
      userAnswerTextForReport = '（時間切れ）';
    }

    const qid =
      currentQuestion.id ??
      currentQuestion.question_id ??
      currentQuestion.questionId ??
      null;

    // 不備報告用履歴に追加
    const correctText =
      currentQuestion.type === 'multi' || currentQuestion.type === 'order'
        ? getCorrectArray(currentQuestion).join(
            currentQuestion.type === 'multi' ? ' / ' : ' → '
          )
        : String(
            currentQuestion.answerText ??
              (typeof currentQuestion.correct === 'string'
                ? currentQuestion.correct
                : '')
          );

    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: qid,
        text: currentQuestion.question || currentQuestion.text || '',
        userAnswerText: userAnswerTextForReport,
        correctAnswerText: correctText,
      },
    ]);

    // 間違えたらミスログ
    if (!isCorrect && qid) {
      logMistake(qid);
    }

    // 攻撃計算
    if (isCorrect) {
      // 連続正解 +1、連続ミスリセット
      setStreakCorrect((prev) => prev + 1);
      setStreakMiss(0);

      const damage = playerAtk; // 現在の攻撃力でダメージ
      setBossHp((prev) => {
        const next = Math.max(0, prev - damage);
        return next;
      });
      setMessage(`命中！ボスに ${damage} ダメージ！`);
    } else {
      // 連続ミス +1、連続正解リセット
      setStreakMiss((prev) => prev + 1);
      setStreakCorrect(0);

      const damage = bossAtk;
      setPlayerHp((prev) => {
        const next = Math.max(0, prev - damage);
        return next;
      });
      setMessage(
        `被弾！ボスから ${damage} ダメージを受けた…（${isTimeUp ? '時間切れ' : '不正解'}）`
      );
    }

    setPhase('show-answer');

    // 次のステップ判定は少し待ってから（2秒）
    setTimeout(() => {
      setPhase((prevPhase) => {
        // すでにfinishedなら何もしない
        if (prevPhase === 'finished') return prevPhase;

        // 直近のHPをチェックして勝敗判定
        setBossHp((currentBossHp) => {
          setPlayerHp((currentPlayerHp) => {
            let nextPhase = 'question';
            let nextResult = null;

            if (currentBossHp <= 0 && currentPlayerHp > 0) {
              nextPhase = 'finished';
              nextResult = 'win';
            } else if (currentPlayerHp <= 0) {
              nextPhase = 'finished';
              nextResult = 'lose';
            }

            if (nextPhase === 'finished') {
              setResult(nextResult);
              // 経過時間確定
              if (startTimeRef.current) {
                setElapsedMs(Date.now() - startTimeRef.current);
              }
            } else {
              // 続行 → 次の問題へ
              setCurrentIndex((idx) => idx + 1);
              setSelectedOption(null);
              setMultiSelected([]);
              setOrderSelected([]);
              setTextAnswer('');
            }

            return currentPlayerHp; // そのまま
          });

          return currentBossHp;
        });

        return 'finished'; // ここでは一旦finishedにしておくが、上で必要なら question に戻る
      });
    }, 2000);
  };

  // ===== 勝利時に自己ベスト更新 =====
  useEffect(() => {
    if (phase !== 'finished') return;
    if (result !== 'win') return;
    if (typeof window === 'undefined') return;

    try {
      const currentTime = elapsedMs;
      if (!currentTime || currentTime <= 0) return;

      let prevBest = null;
      const raw = window.localStorage.getItem(config.storageKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.timeMs === 'number') {
            prevBest = parsed.timeMs;
          }
        } catch {
          // ignore
        }
      }

      if (prevBest && prevBest <= currentTime) {
        setBestTimeMs(prevBest);
        setIsBestUpdated(false);
        return;
      }

      const teamSnapshot = {
        totalHp: teamHp,
        members: team.map((t) => ({
          name: t.name,
          base_rarity: t.base_rarity,
          stars: t.stars,
          char_no: t.char_no,
        })),
      };

      const toSave = {
        timeMs: currentTime,
        achievedAt: Date.now(),
        teamSnapshot,
      };

      window.localStorage.setItem(config.storageKey, JSON.stringify(toSave));
      setBestTimeMs(currentTime);
      setIsBestUpdated(true);
    } catch (e) {
      console.error('save boss best error', e);
    }
  }, [phase, result, elapsedMs, config.storageKey, team, teamHp]);

  // ===== multi / order のトグル =====
  const toggleMultiOption = (opt) => {
    setMultiSelected((prev) => {
      if (prev.includes(opt)) {
        return prev.filter((v) => v !== opt);
      }
      return [...prev, opt];
    });
  };

  const toggleOrderOption = (opt) => {
    setOrderSelected((prev) => {
      if (prev.includes(opt)) {
        return prev.filter((v) => v !== opt);
      }
      return [...prev, opt];
    });
  };

  const canSubmit =
    currentQuestion?.type === 'single'
      ? !!selectedOption
      : currentQuestion?.type === 'text'
      ? !!textAnswer
      : currentQuestion?.type === 'multi'
      ? multiSelected.length > 0
      : currentQuestion?.type === 'order'
      ? orderSelected.length === (currentQuestion.options?.length || 0)
      : false;

  // ===== ローディング・エラー =====
  if (loading || phase === 'loading') {
    return (
      <GameLayout diffLabel={config.label}>
        <p className="text-slate-100 text-sm">ボスバトルを準備中...</p>
      </GameLayout>
    );
  }

  if (loadError || !currentQuestion) {
    return (
      <GameLayout diffLabel={config.label}>
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-600 rounded-2xl p-4 text-slate-50 text-center space-y-3">
          <p className="text-sm whitespace-pre-wrap">{loadError}</p>
          <div className="flex flex-col gap-2 mt-2">
            <Link
              href="/solo/boss"
              className="w-full py-2 rounded-full bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold"
            >
              ボスバトルメニューへ戻る
            </Link>
            <Link
              href="/solo"
              className="w-full py-2 rounded-full border border-sky-400 text-sky-100 bg-slate-900 text-xs font-bold"
            >
              ソロメニューへ
            </Link>
          </div>
        </div>
      </GameLayout>
    );
  }

  // ===== 終了画面 =====
  if (phase === 'finished') {
    const isWin = result === 'win';

    return (
      <GameLayout diffLabel={config.label}>
        <div className="w-full max-w-5xl mx-auto px-3 pb-8 space-y-4">
          <div className="max-w-md mx-auto bg-slate-900/85 border border-slate-600 rounded-2xl shadow-xl p-4 sm:p-6 text-slate-50">
            <h2 className="text-lg sm:text-xl font-bold mb-2">
              ボスバトル結果（{config.label}）
            </h2>

            <p
              className={
                'text-base sm:text-lg font-extrabold mb-2 ' +
                (isWin ? 'text-emerald-300' : 'text-rose-300')
              }
            >
              {isWin ? '討伐成功！！' : '敗北…'}
            </p>

            <div className="space-y-1 text-sm mb-3">
              <p>
                ボス残りHP:{' '}
                <span className="font-semibold text-amber-300">
                  {bossHp}
                </span>
              </p>
              <p>
                自分の残りHP:{' '}
                <span className="font-semibold text-sky-300">
                  {playerHp}
                </span>
              </p>
              <p>
                経過時間:{' '}
                <span className="font-semibold text-slate-50">
                  {formatTime(elapsedMs)}
                </span>
              </p>
              {typeof bestTimeMs === 'number' && bestTimeMs > 0 && (
                <p className="text-xs text-slate-300">
                  この難易度の自己ベスト:{' '}
                  <span className="font-semibold text-emerald-300">
                    {formatTime(bestTimeMs)}
                  </span>
                  {isBestUpdated && isWin && (
                    <span className="ml-1 text-amber-300 font-bold">
                      （自己ベスト更新！）
                    </span>
                  )}
                </p>
              )}
            </div>

            <div className="border border-slate-600 rounded-xl p-2 mb-3">
              <p className="text-[11px] text-slate-200 mb-1">
                この挑戦のマイチーム（HP:{' '}
                <span className="font-semibold text-emerald-300">
                  {teamHp}
                </span>
                ）
              </p>
              <div className="flex gap-1.5">
                {team && team.length > 0 ? (
                  team.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex-1 min-w-[52px] max-w-[64px] rounded-lg border border-slate-400 bg-slate-950/80 px-1.5 py-1 text-center"
                    >
                      <div className="text-[10px] font-semibold truncate text-slate-50">
                        {m.name}
                      </div>
                      <div className="text-[9px] text-slate-300">
                        R{m.base_rarity} / ★{m.stars}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-slate-300">
                    マイチームなしで挑戦
                  </p>
                )}
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => router.push(`/solo/boss/${diffKey}`)}
                className="px-4 py-2 rounded-full bg-sky-500 text-white text-xs sm:text-sm font-semibold hover:bg-sky-400"
              >
                同じ難易度に再挑戦
              </button>
              <Link
                href="/solo/boss"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-xs sm:text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                難易度選択に戻る
              </Link>
              <Link
                href="/solo"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-xs sm:text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                ソロメニューへ
              </Link>
              <Link
                href="/"
                className="px-4 py-2 rounded-full border border-slate-500 bg-slate-800 text-xs sm:text-sm font-semibold text-slate-100 hover:bg-slate-700"
              >
                ホームへ
              </Link>
            </div>
          </div>

          {/* 問題振り返り + 不備報告 */}
          <div className="max-w-3xl mx-auto">
            <QuestionReviewAndReport
              questions={answerHistory}
              sourceMode="solo-boss"
            />
          </div>
        </div>
      </GameLayout>
    );
  }

  // ===== プレイ中画面 =====
  const typeLabel =
    currentQuestion.type === 'single'
      ? '単一選択'
      : currentQuestion.type === 'multi'
      ? '複数選択'
      : currentQuestion.type === 'order'
      ? '並び替え'
      : currentQuestion.type === 'text'
      ? '記述'
      : currentQuestion.type;

  const hpBossRatio = Math.max(0, Math.min(1, bossHp / config.hp));
  const hpPlayerRatio = Math.max(0, Math.min(1, playerHp / teamHp || 1));

  return (
    <GameLayout diffLabel={config.label}>
      <div className="w-full max-w-5xl mx-auto px-3 pb-6 space-y-3">
        {/* 上段：ボスHPバー */}
        <section className="bg-slate-900/80 border border-slate-600 rounded-2xl p-3 text-slate-50 shadow">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs sm:text-sm font-semibold">
              ボスHP（{config.label}）
            </div>
            <div className="text-xs sm:text-sm">
              {bossHp} / {config.hp}
            </div>
          </div>
          <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-rose-500 via-orange-400 to-yellow-400 transition-[width] duration-200"
              style={{ width: `${hpBossRatio * 100}%` }}
            />
          </div>
        </section>

        {/* ボス画像 & プレイヤー情報 */}
        <section className="bg-slate-900/80 border border-slate-600 rounded-2xl p-3 sm:p-4 text-slate-50 shadow flex flex-col sm:flex-row gap-4">
          {/* ボス画像 */}
          <div className="flex-1 flex flex-col items-center">
            <div className="w-40 h-40 sm:w-48 sm:h-48 bg-slate-950 rounded-2xl border border-slate-700 overflow-hidden flex items-center justify-center shadow-inner">
              {/* public 配下なのでそのままパス指定 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={config.image}
                alt={`ボス（${config.label}）`}
                className="w-full h-full object-contain"
              />
            </div>
            <div className="mt-2 text-[11px] sm:text-xs text-slate-200">
              攻撃力: 基本 {config.baseAtk} ＋ 連続不正解×50
            </div>
          </div>

          {/* プレイヤー情報 */}
          <div className="sm:w-[52%] flex flex-col gap-2">
            <div className="border border-slate-600 rounded-xl p-2 bg-slate-950/70">
              <div className="flex items-center justify-between mb-1">
                <div className="text-xs font-semibold">
                  {me?.display_name || me?.username || 'プレイヤー'}
                </div>
                <div className="text-[11px] text-slate-300">
                  経過時間:{' '}
                  <span className="font-semibold text-sky-200">
                    {formatTime(elapsedMs)}
                  </span>
                </div>
              </div>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span>自分のHP</span>
                <span>
                  {playerHp} / {teamHp}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden border border-slate-700 shadow-inner mb-1">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-sky-400 to-indigo-400 transition-[width] duration-200"
                  style={{ width: `${hpPlayerRatio * 100}%` }}
                />
              </div>
              <div className="flex flex-wrap gap-2 text-[10px] text-slate-200 mt-1">
                <span>
                  自分の攻撃力:{' '}
                  <span className="font-semibold text-emerald-300">
                    {playerAtk}
                  </span>
                </span>
                <span>
                  ボスの攻撃力:{' '}
                  <span className="font-semibold text-rose-300">
                    {bossAtk}
                  </span>
                </span>
                <span>
                  連続正解:{' '}
                  <span className="font-semibold text-emerald-300">
                    {streakCorrect}
                  </span>
                </span>
                <span>
                  連続不正解:{' '}
                  <span className="font-semibold text-rose-300">
                    {streakMiss}
                  </span>
                </span>
              </div>
            </div>

            {/* マイチーム表示（簡易カード） */}
            <div className="border border-slate-600 rounded-xl p-2 bg-slate-950/60">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-200">
                  マイチーム（最大5枚）
                </span>
                <Link
                  href="/my-team"
                  className="text-[10px] text-sky-300 underline hover:text-sky-200"
                >
                  マイチームを編集
                </Link>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[0, 1, 2, 3, 4].map((slot) => {
                  const member = team[slot];
                  if (!member) {
                    return (
                      <div
                        key={slot}
                        className="h-16 rounded-lg border border-dashed border-slate-700 bg-slate-900/70 flex items-center justify-center"
                      >
                        <span className="text-[9px] text-slate-500">
                          空
                        </span>
                      </div>
                    );
                  }

                  const rarity = member.base_rarity ?? 1;
                  let frame =
                    'from-slate-500/80 via-slate-800/90 to-black';
                  if (rarity >= 7) {
                    frame = 'from-yellow-400 via-orange-500 to-rose-500';
                  } else if (rarity >= 5) {
                    frame = 'from-pink-400 via-rose-500 to-purple-600';
                  } else if (rarity >= 3) {
                    frame = 'from-sky-400 via-blue-500 to-indigo-600';
                  }

                  return (
                    <div
                      key={slot}
                      className="h-16 rounded-lg border border-slate-600 bg-slate-900/80 overflow-hidden flex flex-col text-center"
                    >
                      <div
                        className={`h-1.5 w-full bg-gradient-to-r ${frame}`}
                      />
                      <div className="flex-1 flex flex-col items-center justify-center px-1">
                        <div className="text-[9px] font-semibold text-slate-50 truncate w-full">
                          {member.name}
                        </div>
                        <div className="text-[8px] text-slate-300">
                          R{member.base_rarity} / ★{member.stars}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* メッセージ */}
        {message && (
          <p className="text-[11px] sm:text-xs text-slate-100 drop-shadow">
            {message}
          </p>
        )}

        {/* 問題 & 回答UI */}
        <section className="bg-slate-900/85 border border-slate-600 rounded-2xl p-3 sm:p-4 text-slate-50 shadow space-y-3">
          <div className="flex items-center justify-between text-[11px] sm:text-xs">
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 rounded-full bg-sky-700/80 text-[10px] font-bold">
                {typeLabel}
              </span>
              <span className="text-slate-300">
                問題 {currentIndex + 1}
              </span>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-300">
                この問題の残り時間
              </div>
              <div className="text-sm font-extrabold">
                {timeSeconds} 秒
              </div>
            </div>
          </div>

          <div className="bg-slate-950/60 rounded-xl border border-slate-700 px-3 py-2">
            <p className="text-xs sm:text-sm whitespace-pre-wrap leading-relaxed">
              {currentQuestion.question || currentQuestion.text}
            </p>
          </div>

          {/* 各形式のUI */}

          {/* 単一選択 */}
          {currentQuestion.type === 'single' && (
            <div className="mt-2 space-y-2">
              {currentQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedOption(opt)}
                  disabled={phase !== 'question'}
                  className={
                    'w-full text-left px-3 py-2 rounded-2xl border text-xs sm:text-sm ' +
                    (selectedOption === opt
                      ? 'border-orange-400 bg-orange-50 text-slate-900'
                      : 'border-slate-600 bg-slate-900 text-slate-50') +
                    (phase !== 'question'
                      ? ' opacity-60 cursor-not-allowed'
                      : '')
                  }
                >
                  {opt}
                </button>
              ))}
            </div>
          )}

          {/* 複数選択 */}
          {currentQuestion.type === 'multi' && (
            <div className="mt-2 space-y-2">
              <p className="text-[10px] text-slate-300">
                当てはまるものをすべて選択してください。
              </p>
              {currentQuestion.options.map((opt, idx) => {
                const active = multiSelected.includes(opt);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleMultiOption(opt)}
                    disabled={phase !== 'question'}
                    className={
                      'w-full text-left px-3 py-2 rounded-2xl border text-xs sm:text-sm flex items-center justify-between ' +
                      (active
                        ? 'border-orange-400 bg-orange-50 text-slate-900'
                        : 'border-slate-600 bg-slate-900 text-slate-50') +
                      (phase !== 'question'
                        ? ' opacity-60 cursor-not-allowed'
                        : '')
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
            <div className="mt-2 space-y-3">
              <p className="text-[10px] text-slate-300">
                正しい順番になるように、選択肢をタップして並べてください。
              </p>
              <div className="space-y-1.5">
                {currentQuestion.options.map((opt, idx) => {
                  const selected = orderSelected.includes(opt);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleOrderOption(opt)}
                      disabled={phase !== 'question'}
                      className={
                        'w-full text-left px-3 py-2 rounded-2xl border text-xs sm:text-sm flex items-center justify-between ' +
                        (selected
                          ? 'border-slate-400 bg-slate-700 text-slate-200'
                          : 'border-slate-600 bg-slate-900 text-slate-50') +
                        (phase !== 'question'
                          ? ' opacity-60 cursor-not-allowed'
                          : '')
                      }
                    >
                      <span>{opt}</span>
                      {selected && (
                        <span className="text-[10px] font-bold">
                          選択中
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="border border-slate-600 rounded-xl p-2 bg-slate-950/60">
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
            <div className="mt-2">
              <textarea
                className="w-full rounded-2xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-xs sm:text-sm text-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-400"
                rows={3}
                placeholder="答えを入力してください"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={phase !== 'question'}
              />
            </div>
          )}

          {/* 回答ボタン or 答え表示フェーズ */}
          {phase === 'question' && (
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={!canSubmit}
                className="flex-1 py-2 rounded-full bg-orange-400 hover:bg-orange-500 text-white text-xs sm:text-sm font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
              >
                攻撃する（回答する）
              </button>
            </div>
          )}

          {phase === 'show-answer' && (
            <div className="mt-3 border-t border-slate-700 pt-2 space-y-1">
              <p className="text-xs sm:text-sm text-slate-100">
                正解：{correctTextForDisplay(currentQuestion)}
              </p>
              {currentQuestion.altAnswers &&
                Array.isArray(currentQuestion.altAnswers) &&
                currentQuestion.altAnswers.length > 0 && (
                  <p className="text-[10px] text-slate-300">
                    別解：
                    {currentQuestion.altAnswers.join(' ／ ')}
                  </p>
                )}
              <p className="text-[10px] text-slate-400">
                ダメージ処理の後、次の問題へ移行します…
              </p>
            </div>
          )}
        </section>
      </div>
    </GameLayout>
  );
}

// 正解表示用ヘルパ
function correctTextForDisplay(q) {
  if (!q) return '';
  if (q.type === 'multi' || q.type === 'order') {
    const arr = getCorrectArray(q);
    return arr.join(q.type === 'multi' ? ' ／ ' : ' → ');
  }
  return String(
    q.answerText ??
      (typeof q.correct === 'string' ? q.correct : '')
  );
}

function GameLayout({ children, diffLabel }) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-slate-50 relative overflow-hidden">
      {/* 背景（星屑） */}
      <div className="pointer-events-none absolute inset-0 opacity-60 mix-blend-screen">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(56,189,248,0.3),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(244,114,182,0.35),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(248,250,252,0.2),transparent_55%)]" />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-start pt-3 px-3">
        <header className="w-full max-w-5xl flex items-center justify-between mb-2">
          <div>
            <h1 className="text-base sm:text-lg font-extrabold tracking-wide">
              ボスバトル（{diffLabel}）
            </h1>
            <p className="text-[11px] sm:text-xs text-slate-300">
              問題に正解してボスのHPを削ろう。間違えると反撃を受ける。
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Link
              href="/solo/boss"
              className="text-[10px] sm:text-xs font-bold text-sky-200 underline underline-offset-2 hover:text-sky-100"
            >
              難易度選択に戻る
            </Link>
            <Link
              href="/solo/boss/rules"
              className="text-[10px] sm:text-xs font-bold text-slate-200 underline underline-offset-2 hover:text-slate-50"
            >
              ルール
            </Link>
          </div>
        </header>

        {children}
      </div>
    </main>
  );
}
