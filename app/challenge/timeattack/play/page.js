// file: app/challenge/play/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const TIME_SINGLE = 30000; // 単一選択 30秒
const TIME_MULTI_ORDER = 40000; // 複数選択・並び替え 40秒
const TIME_TEXT_SHORT = 60000; // 記述（〜15文字）60秒
const TIME_TEXT_LONG = 80000; // 記述（16文字〜）80秒;

// 制限時間
function getTimeLimitMs(question) {
  if (!question) return TIME_SINGLE;
  const type = question.type;
  if (type === 'single') return TIME_SINGLE;
  if (type === 'multi' || type === 'order') return TIME_MULTI_ORDER;
  if (type === 'text') {
    const base = typeof question.correct === 'string' ? question.correct : '';
    const len = base.length;
    return len > 15 ? TIME_TEXT_LONG : TIME_TEXT_SHORT;
  }
  return TIME_SINGLE;
}

// 配列シャッフル（Fisher-Yates）
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
  let c = question.correct;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') {
    const t = c.trim();
    if (t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // そのまま下にフォールバック
      }
    }
    return [c];
  }
  return [];
}

// 正誤判定
function judgeAnswer(question, userAnswer) {
  if (!question) return false;
  const type = question.type;

  // 単一選択
  if (type === 'single') {
    if (!userAnswer) return false;
    const correct =
      typeof question.correct === 'string'
        ? question.correct
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
    const ca = norm(question.correct ?? '');
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

// ★ 間違えた問題を user_mistakes に記録する（チャレンジ）
const logMistake = (questionId) => {
  if (!questionId) return;

  fetch('/api/mistakes/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId }),
  }).catch(() => {
    // ログ保存失敗は無視（ゲーム進行には影響させない）
  });
};

export default function ChallengePlayPage() {
  const router = useRouter();

  // ユーザー情報（finish 時の user_id 用）
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  const [session, setSession] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeftMs, setTimeLeftMs] = useState(0);
  const [phase, setPhase] = useState('question'); // 'question' | 'show-answer' | 'finished'
  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [selectedOption, setSelectedOption] = useState(null); // single
  const [textAnswer, setTextAnswer] = useState(''); // text
  const [multiSelected, setMultiSelected] = useState([]); // multi: string[]
  const [orderSelected, setOrderSelected] = useState([]); // order: string[]

  const [correctCount, setCorrectCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(null);

  // finish API の結果表示用
  const [finishInfo, setFinishInfo] = useState(null);
  const [finishLoading, setFinishLoading] = useState(false);
  const [finishError, setFinishError] = useState('');
  const [finishSent, setFinishSent] = useState(false);

  // 不備報告用の回答履歴
  const [answerHistory, setAnswerHistory] = useState([]);

  // /api/me から自分のユーザー情報を取得
  useEffect(() => {
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/me', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.user) {
          setMe(data.user);
        } else {
          setFinishError(
            'ユーザー情報の取得に失敗したため、記録保存とベリー付与が行えない可能性があります。'
          );
        }
      } catch (e) {
        console.error(e);
        setFinishError(
          'ユーザー情報の取得に失敗したため、記録保存とベリー付与が行えない可能性があります。'
        );
      } finally {
        setLoadingMe(false);
      }
    };

    fetchMe();
  }, []);

  // セッション読み込み（shuffled options を作る）
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('challenge_session');
      if (!raw) {
        setErrorMessage(
          'チャレンジ情報が見つかりません。ホームからやり直してください。'
        );
        setLoaded(true);
        return;
      }
      const parsed = JSON.parse(raw);
      if (
        !parsed ||
        !Array.isArray(parsed.questions) ||
        parsed.questions.length === 0
      ) {
        setErrorMessage('出題する問題がありません。');
        setLoaded(true);
        return;
      }

      const shuffledQuestions = parsed.questions.map((q) => ({
        ...q,
        options: Array.isArray(q.options) ? shuffleArray(q.options) : [],
      }));

      setSession({
        ...parsed,
        questions: shuffledQuestions,
      });
      setCurrentIndex(0);
      setPhase('question');
    } catch (e) {
      console.error(e);
      setErrorMessage(
        'チャレンジ情報の読み込みに失敗しました。ホームからやり直してください。'
      );
    } finally {
      setLoaded(true);
    }
  }, []);

  const currentQuestion =
    session && session.questions && session.questions[currentIndex]
      ? session.questions[currentIndex]
      : null;

  // タイマー
  useEffect(() => {
    if (!currentQuestion || phase !== 'question') return;

    const limit = getTimeLimitMs(currentQuestion);
    setTimeLeftMs(limit);

    const start = Date.now();
    const timerId = setInterval(() => {
      const elapsed = Date.now() - start;
      const rest = limit - elapsed;
      if (rest <= 0) {
        clearInterval(timerId);
        setTimeLeftMs(0);
        // 時間切れ → 強制回答（不正解扱い）
        handleSubmit(true);
      } else {
        setTimeLeftMs(rest);
      }
    }, 200);

    return () => clearInterval(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion && currentQuestion.id, phase]);

  // 回答処理 ＋ 不備報告用履歴追加
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
    }

    // question_submissions.id に対応するIDをここで一回決めておく
    const qid =
      currentQuestion.id ??
      currentQuestion.question_id ??
      currentQuestion.questionId ??
      null;

    // ★ 不備報告用履歴に追加
    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: qid,
        text: currentQuestion.question || currentQuestion.text || '',
        userAnswerText: isTimeUp ? '（時間切れ）' : userAnswerTextForReport,
        correctAnswerText:
          (Array.isArray(getCorrectArray(currentQuestion)) &&
            (currentQuestion.type === 'multi' ||
              currentQuestion.type === 'order') &&
            getCorrectArray(currentQuestion).join(
              currentQuestion.type === 'multi' ? ' / ' : ' → '
            )) ||
          String(currentQuestion.correct ?? ''),
      },
    ]);

    // ★ 間違えたら user_mistakes に記録
    if (!isCorrect && qid) {
      logMistake(qid);
    }

    setLastCorrect(isCorrect);
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
    } else {
      setMissCount((m) => m + 1);
    }

    setPhase('show-answer');

    // 2秒後に次の問題 or 終了へ
    setTimeout(() => {
      const nextMiss = missCount + (isCorrect ? 0 : 1);
      if (!session || !session.questions) {
        setPhase('finished');
        return;
      }
      const nextIndex = currentIndex + 1;
      if (nextMiss >= 3 || nextIndex >= session.questions.length) {
        setPhase('finished');
      } else {
        setCurrentIndex(nextIndex);
        setPhase('question');
        setSelectedOption(null);
        setTextAnswer('');
        setMultiSelected([]);
        setOrderSelected([]);
      }
    }, 2000);
  };

  // フィニッシュしたときに /api/challenge/finish を1回だけ叩く
  useEffect(() => {
    if (phase !== 'finished') return;
    if (finishSent) return;
    if (!me) return; // ユーザー情報がまだ無いときは送れない
    if (!session) return;

    const durationMs = session.startedAt ? Date.now() - session.startedAt : null;

    const runFinish = async () => {
      try {
        setFinishLoading(true);
        setFinishError('');
        setFinishSent(true);

        const res = await fetch('/api/challenge/finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: me.id,
            correctCount,
            missCount,
            durationMs,
          }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setFinishError(
            data.error ||
              '記録保存・ベリー付与に失敗しました。時間をおいて再度お試しください。'
          );
          return;
        }

        setFinishInfo({
          berriesEarned: data.berriesEarned ?? 0,
          seasonBest: data.seasonBest || null,
          allTimeBest: data.allTimeBest || null,
        });
      } catch (e) {
        console.error(e);
        setFinishError(
          '記録保存・ベリー付与中にエラーが発生しました。時間をおいて再度お試しください。'
        );
      } finally {
        setFinishLoading(false);
      }
    };

    runFinish();
  }, [phase, finishSent, me, session, correctCount, missCount]);

  const handleBackHome = () => {
    try {
      sessionStorage.removeItem('challenge_session');
    } catch {
      // ignore
    }
    router.push('/');
  };

  const progressText =
    session && session.questions
      ? `${Math.min(currentIndex + 1, session.questions.length)} / ${
          session.questions.length
        }`
      : '';

  const timeSeconds = Math.max(0, Math.floor(timeLeftMs / 1000));

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

  if (!loaded) {
    return (
      <div className="min-h-screen bg-sky-50 flex items-center justify-center text-slate-900">
        <p className="text-sm">チャレンジを読み込み中...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center justify-center text-slate-900 px-4">
        <div className="max-w-md w-full bg-white border border-sky-100 rounded-3xl p-6 shadow-sm text-center space-y-4">
          <h1 className="text-xl font-extrabold mb-2">チャレンジモード</h1>
          <p className="text-sm text-rose-700 whitespace-pre-line">
            {errorMessage}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <Link
              href="/challenge"
              className="w-full py-2 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold"
            >
              チャレンジトップに戻る
            </Link>
            <Link
              href="/"
              className="w-full py-2 rounded-full border border-sky-400 text-sky-700 bg-white text-sm font-bold"
            >
              ホームへ
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion || phase === 'finished') {
    const berriesEarned = finishInfo?.berriesEarned ?? correctCount * 50;
    const seasonBest = finishInfo?.seasonBest || null;
    const allTimeBest = finishInfo?.allTimeBest || null;

    return (
      <div className="min-h-screen bg-sky-50 flex flex-col items-center text-slate-900 px-4">
        <header className="w-full max-w-md px-1 pt-6 flex items-center justify-between">
          <h1 className="text-xl font-extrabold">チャレンジ結果</h1>
          <Link
            href="/"
            className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
          >
            ホームへ
          </Link>
        </header>

        <main className="w-full max-w-md mt-6 space-y-6 pb-10">
          <section className="bg-white border border-sky-100 rounded-3xl p-5 shadow-sm text-center space-y-3">
            <p className="text-lg font-extrabold text-sky-800">
              チャレンジ終了！
            </p>
            <p className="text-sm text-slate-800">
              正解数：
              <span className="font-bold">{correctCount}</span>
              <br />
              ミス数：
              <span className="font-bold">{missCount}</span>
            </p>

            <p className="text-sm text-emerald-700">
              獲得ベリー：
              <span className="font-bold">{berriesEarned}</span>
              ベリー
            </p>

            {finishLoading && (
              <p className="text-xs text-slate-600">
                記録保存・ベリー付与中です…
              </p>
            )}

            {finishError && (
              <p className="text-xs text-rose-600 whitespace-pre-line">
                {finishError}
              </p>
            )}

            {seasonBest && (
              <div className="mt-3 text-xs text-slate-700 border-t border-slate-200 pt-3">
                <p className="font-bold text-sky-700 mb-1">シーズン最高</p>
                <p>
                  正解 {seasonBest.best_correct} ／ ミス{' '}
                  {seasonBest.best_miss}
                </p>
              </div>
            )}

            {allTimeBest && (
              <div className="mt-2 text-xs text-slate-700 border-t border-slate-200 pt-3">
                <p className="font-bold text-sky-700 mb-1">歴代最高</p>
                <p>
                  正解 {allTimeBest.best_correct} ／ ミス{' '}
                  {allTimeBest.best_miss}
                </p>
              </div>
            )}
          </section>

          {/* ★ チャレンジの問題不備報告 */}
          <QuestionReviewAndReport
            questions={answerHistory}
            sourceMode="challenge"
          />

          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={handleBackHome}
              className="w-full py-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-bold shadow"
            >
              ホームに戻る
            </button>
            <Link
              href="/challenge"
              className="w-full py-3 rounded-full border border-sky-400 text-sky-700 bg-white text-sm font-bold text-center"
              onClick={() => {
                try {
                  sessionStorage.removeItem('challenge_session');
                } catch {
                  // ignore
                }
              }}
            >
              チャレンジトップへ
            </Link>
          </div>
        </main>
      </div>
    );
  }

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

  const canSubmit =
    currentQuestion.type === 'single'
      ? !!selectedOption
      : currentQuestion.type === 'text'
      ? !!textAnswer
      : currentQuestion.type === 'multi'
      ? multiSelected.length > 0
      : currentQuestion.type === 'order'
      ? orderSelected.length === (currentQuestion.options?.length || 0)
      : false;

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center text-slate-900 px-4">
      {/* ヘッダー */}
      <header className="w-full max-w-md px-1 pt-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold">チャレンジモード</h1>
          <p className="text-xs text-slate-600">
            全問題を解き切るか、3問ミスで終了
          </p>
        </div>
        <Link
          href="/"
          className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
        >
          ホームへ
        </Link>
      </header>

      <main className="w-full max-w-md mt-4 space-y-4 pb-10">
        {/* ステータスバー */}
        <section className="bg-white border border-sky-100 rounded-3xl p-3 shadow-sm flex items-center justify-between text-sm">
          <div>
            <div className="font-bold text-sky-800">問題 {progressText}</div>
            <div className="text-xs text-slate-600">
              正解 {correctCount} ／ ミス {missCount}（3で終了）
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-600">残り時間</div>
            <div className="text-lg font-extrabold">{timeSeconds} 秒</div>
          </div>
        </section>

        {/* 問題本体 */}
        <section className="bg-white border border-sky-100 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="inline-block px-2 py-1 text-xs font-bold rounded-full bg-sky-100 text-sky-700">
            {typeLabel}
          </div>
          <p className="text-sm whitespace-pre-wrap text-slate-900">
            {currentQuestion.question}
          </p>

          {/* 単一選択 */}
          {currentQuestion.type === 'single' && (
            <div className="mt-3 space-y-2">
              {currentQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setSelectedOption(opt)}
                  disabled={phase !== 'question'}
                  className={
                    'w-full text-left px-3 py-2 rounded-2xl border text-sm ' +
                    (selectedOption === opt
                      ? 'border-orange-400 bg-orange-50 text-slate-900'
                      : 'border-slate-200 bg-slate-50 text-slate-900') +
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
            <div className="mt-3 space-y-2">
              <p className="text-xs text-slate-600 mb-1">
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
                      'w-full text-left px-3 py-2 rounded-2xl border text-sm flex items-center justify-between ' +
                      (active
                        ? 'border-orange-400 bg-orange-50 text-slate-900'
                        : 'border-slate-200 bg-slate-50 text-slate-900') +
                      (phase !== 'question'
                        ? ' opacity-60 cursor-not-allowed'
                        : '')
                    }
                  >
                    <span>{opt}</span>
                    <span className="text-xs font-bold">
                      {active ? '✔' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 並び替え */}
          {currentQuestion.type === 'order' && (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-slate-600">
                正しい順番になるように、選択肢をタップして並べてください。
              </p>
              {/* 残りの選択肢 */}
              <div className="space-y-2">
                {currentQuestion.options.map((opt, idx) => {
                  const selected = orderSelected.includes(opt);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleOrderOption(opt)}
                      disabled={phase !== 'question'}
                      className={
                        'w-full text-left px-3 py-2 rounded-2xl border text-sm flex items-center justify-between ' +
                        (selected
                          ? 'border-slate-200 bg-slate-100 text-slate-500'
                          : 'border-slate-200 bg-slate-50 text-slate-900') +
                        (phase !== 'question'
                          ? ' opacity-60 cursor-not-allowed'
                          : '')
                      }
                    >
                      <span>{opt}</span>
                      {selected && (
                        <span className="text-xs font-bold">選択中</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* 選んだ順 */}
              <div className="border border-slate-200 rounded-2xl p-2 bg-slate-50">
                <p className="text-xs text-slate-600 mb-1">
                  現在の並び順
                </p>
                {orderSelected.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    まだ選択されていません。
                  </p>
                ) : (
                  <ol className="list-decimal list-inside space-y-1 text-xs text-slate-800">
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
            <div className="mt-3">
              <textarea
                className="w-full rounded-2xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-400"
                rows={3}
                placeholder="答えを入力してください"
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                disabled={phase !== 'question'}
              />
            </div>
          )}

          {/* 回答ボタン */}
          {phase === 'question' && (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                className="flex-1 py-2 rounded-full bg-orange-400 hover:bg-orange-500 text-white text-sm font-bold shadow disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canSubmit}
              >
                回答する
              </button>
            </div>
          )}

          {/* 答え表示フェーズ */}
          {phase === 'show-answer' && (
            <div className="mt-4 border-t border-slate-200 pt-3 space-y-1">
              <p
                className={
                  'text-sm font-extrabold ' +
                  (lastCorrect ? 'text-emerald-600' : 'text-rose-600')
                }
              >
                {lastCorrect ? '正解！' : '不正解…'}
              </p>
              <p className="text-xs text-slate-700">
                正解：
                {Array.isArray(getCorrectArray(currentQuestion)) &&
                (currentQuestion.type === 'multi' ||
                  currentQuestion.type === 'order')
                  ? getCorrectArray(currentQuestion).join(' ／ ')
                  : String(currentQuestion.correct ?? '')}
              </p>
              {currentQuestion.altAnswers &&
                Array.isArray(currentQuestion.altAnswers) &&
                currentQuestion.altAnswers.length > 0 && (
                  <p className="text-xs text-slate-600">
                    別解：
                    {currentQuestion.altAnswers.join(' ／ ')}
                  </p>
                )}
              <p className="text-xs text-slate-500">
                次の問題へ自動で進みます…
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
