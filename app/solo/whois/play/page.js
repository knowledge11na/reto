// file: app/solo/whois/play/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QuestionReviewAndReport from '@/components/QuestionReviewAndReport';

const SHOW_ANSWER_MS = 2000;

function norm(s) {
  return String(s ?? '').replace(/\s+/g, '').toLowerCase();
}

function shuffleArray(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function WhoIsPlayPage() {
  const router = useRouter();

  const [loaded, setLoaded] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [session, setSession] = useState(null);

  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState('question'); // question | show-answer | finished
  const [timeLeftMs, setTimeLeftMs] = useState(0);

  const [hintOpenCount, setHintOpenCount] = useState(1);
  const [answer, setAnswer] = useState('');

  const [correctCount, setCorrectCount] = useState(0);
  const [missCount, setMissCount] = useState(0);
  const [lastCorrect, setLastCorrect] = useState(null);

  const [answerHistory, setAnswerHistory] = useState([]);

  /* =========================
     セッション読み込み
  ========================= */
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('whois_session');
      if (!raw) {
        setErrorMessage('セッションが見つかりません。トップから開始してください。');
        setLoaded(true);
        return;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
        setErrorMessage('出題する問題がありません。');
        setLoaded(true);
        return;
      }

      setSession({
        ...parsed,
        questions: shuffleArray(parsed.questions),
      });
      setIdx(0);
      setPhase('question');
      setHintOpenCount(1);
      setAnswer('');
    } catch (e) {
      console.error(e);
      setErrorMessage('セッションの読み込みに失敗しました。');
    } finally {
      setLoaded(true);
    }
  }, []);

  const current = useMemo(() => {
    if (!session?.questions) return null;
    return session.questions[idx] ?? null;
  }, [session, idx]);

  const totalMs = useMemo(() => {
    if (session?.mode !== 'timed') return 0;
    const m = Number(session.minutes || 5);
    return Math.max(1, m) * 60 * 1000;
  }, [session]);

  /* =========================
     タイマー（制限時間）
  ========================= */
  useEffect(() => {
    if (!session || session.mode !== 'timed' || phase !== 'question') return;

    const startAt = session.startedAt || Date.now();
    const tick = () => {
      const rest = totalMs - (Date.now() - startAt);
      if (rest <= 0) {
        setTimeLeftMs(0);
        setPhase('finished');
        return;
      }
      setTimeLeftMs(rest);
    };

    tick();
    const id = setInterval(tick, 200);
    return () => clearInterval(id);
  }, [session, totalMs, phase]);

  const timeSeconds = Math.floor(timeLeftMs / 1000);

  const visibleHints = useMemo(() => {
    const hs = Array.isArray(current?.hints) ? current.hints : [];
    return hs.slice(0, Math.min(5, hintOpenCount));
  }, [current, hintOpenCount]);

  const canOpenNextHint = useMemo(() => {
    const hs = Array.isArray(current?.hints) ? current.hints : [];
    return hintOpenCount < Math.min(5, hs.length);
  }, [current, hintOpenCount]);

const judge = () => {
  const ua = norm(answer);
  const ca = norm(current?.answer || '');
  if (ua && ca && ua === ca) return true;

  const alts = Array.isArray(current?.altAnswers) ? current.altAnswers : [];
  return alts.some((a) => ua && norm(a) === ua);
};


  const goNextQuestion = () => {
    const next = idx + 1;
    if (next >= session.questions.length) {
      setSession({ ...session, questions: shuffleArray(session.questions) });
      setIdx(0);
    } else {
      setIdx(next);
    }
    setPhase('question');
    setHintOpenCount(1);
    setAnswer('');
  };

  const submitAnswer = (giveUp = false) => {
    if (!current || phase !== 'question') return;

    const isCorrect = giveUp ? false : judge();
    setLastCorrect(isCorrect);

    setAnswerHistory((prev) => [
      ...prev,
      {
        question_id: current.id ?? null,
        text:
          `【私は誰でしょう】\n` +
          (current.hints || []).map((h, i) => `ヒント${i + 1}: ${h}`).join('\n'),
        userAnswerText: giveUp ? '（ギブアップ）' : answer,
        correctAnswerText: String(current.answer ?? ''),
      },
    ]);

    isCorrect ? setCorrectCount((c) => c + 1) : setMissCount((m) => m + 1);
    setPhase('show-answer');

    setTimeout(() => {
      if (session.mode === 'endless' && !isCorrect) {
        setPhase('finished');
        return;
      }
      if (session.mode === 'timed' && timeLeftMs <= 0) {
        setPhase('finished');
        return;
      }
      goNextQuestion();
    }, SHOW_ANSWER_MS);
  };

  const backToTop = () => {
    sessionStorage.removeItem('whois_session');
    router.push('/solo/whois');
  };

  /* =========================
     表示
  ========================= */
  if (!loaded) {
    return <div className="min-h-screen flex items-center justify-center">読み込み中...</div>;
  }

  if (errorMessage) {
    return <div className="p-6 text-red-600">{errorMessage}</div>;
  }

  if (phase === 'finished') {
    return (
      <div className="p-4 space-y-4">
        <h1 className="text-xl font-bold">結果</h1>
        <p>正解：{correctCount}</p>
        <p>ミス：{missCount}</p>
        <button onClick={backToTop}>トップに戻る</button>
        <QuestionReviewAndReport questions={answerHistory} sourceMode="whois" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-xl font-bold">私は誰でしょう</h1>

      <div className="space-y-2">
        {visibleHints.map((h, i) => (
          <div key={i}>ヒント{i + 1}: {h}</div>
        ))}
      </div>

      <input
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        placeholder="答えを入力"
      />

      <div className="flex gap-2">
        <button onClick={() => submitAnswer(false)}>回答</button>
        <button onClick={() => submitAnswer(true)}>ギブアップ</button>
        {canOpenNextHint && (
          <button onClick={() => setHintOpenCount((n) => n + 1)}>次のヒント</button>
        )}
      </div>
    </div>
  );
}
