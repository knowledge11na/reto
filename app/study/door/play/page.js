// file: app/study/door/play/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function pad2(n) {
  return String(n).padStart(2, '0');
}
function msToClock(ms) {
  const t = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${pad2(s)}`;
}

// 扉絵：判定用正規化
// - 記号/！/ー/～ 無視
// - （）内 無視（全角/半角）
// - スペース無視
// - 大小無視
function stripParensAll(s) {
  let x = String(s ?? '');
  x = x.replace(/（[^）]*）/g, '');
  x = x.replace(/\([^)]*\)/g, '');
  return x;
}
function toHalfWidthAscii(s) {
  return String(s ?? '')
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ');
}
function stripSymbolsForDoor(s) {
  let x = String(s ?? '');
  x = x.replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/g, '');
  x = x.replace(/[、。「」『』【】〔〕［］｛｝〈〉《》“”‘’＂＇…‥]/g, '');
  return x;
}
function dropWaveLongBang(s) {
  return String(s ?? '').replace(/[ー〜～!！]/g, '');
}
function normalizeDoor(raw) {
  let s = String(raw ?? '').trim();
  s = toHalfWidthAscii(s);
  s = stripParensAll(s);
  s = s.replace(/\s+/g, '');
  s = s.toLowerCase();
  s = stripSymbolsForDoor(s);
  s = dropWaveLongBang(s);
  s = s.replace(/\s+/g, '');
  return s;
}

function buildSaveKey({ sheet }) {
  const s = String(sheet || 'ALL');
  return `study_door_save_${s}`;
}

export default function StudyDoorPlayPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const sheet = sp.get('sheet') || 'ALL';
  const ignoreWrongAndGo = sp.get('ignoreWrongAndGo') === '1';
  const resume = sp.get('resume') === '1';

  const saveKey = useMemo(() => buildSaveKey({ sheet }), [sheet]);

  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const [startedAt, setStartedAt] = useState(null);
  const [nowMs, setNowMs] = useState(0);

  const [targets, setTargets] = useState([]); // 出題対象（行そのもの）
  const [idx, setIdx] = useState(0);
  const [input, setInput] = useState('');

  const [phase, setPhase] = useState('playing'); // playing / reveal
  const [lastJudge, setLastJudge] = useState(null);

  const [correctCount, setCorrectCount] = useState(0);
  const [mistakes, setMistakes] = useState([]);

  const inputRef = useRef(null);

  // データ取得
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setMsg('');
      try {
        const res = await fetch('/api/study/door', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          setRows([]);
          setMsg(data?.error || `取得失敗（status=${res.status}）`);
          return;
        }
        setRows(data?.rows || []);
      } catch {
        setRows([]);
        setMsg('取得に失敗しました');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // 対象作成（sheetで絞る）
  const filteredTargets = useMemo(() => {
    if (!rows?.length) return [];
    return rows.filter((r) => (sheet === 'ALL' ? r.sheet === 'ALL' : r.sheet === sheet));
  }, [rows, sheet]);

  const total = targets.length;
  const current = total ? targets[idx] : null;

  // タイマー
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNowMs(Date.now() - startedAt), 100);
    return () => clearInterval(t);
  }, [startedAt]);

  // 自動セーブ
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!startedAt) return;
    if (!targets.length) return;

    try {
      window.localStorage.setItem(
        saveKey,
        JSON.stringify({
          v: 1,
          sheet,
          idx,
          total: targets.length,
          correctCount,
          mistakes,
          elapsedMs: nowMs,
        })
      );
    } catch {}
  }, [saveKey, startedAt, targets, idx, correctCount, mistakes, nowMs, sheet]);

  // 初期化（resume=1なら復元、resume=0なら新規開始）
  useEffect(() => {
    if (loading) return;

    const t = filteredTargets;
    setTargets(t);

    if (!t.length) return;

    // resume=1 の時だけ復元
    if (resume && typeof window !== 'undefined') {
      try {
        const raw = window.localStorage.getItem(saveKey);
        if (raw) {
          const obj = JSON.parse(raw);
          if (obj && typeof obj.idx === 'number' && Array.isArray(obj.mistakes)) {
            setIdx(Math.min(obj.idx, t.length - 1));
            setCorrectCount(Number(obj.correctCount || 0));
            setMistakes(obj.mistakes || []);
            const elapsed = Number(obj.elapsedMs || 0);
            setStartedAt(Date.now() - Math.max(0, elapsed));
            setNowMs(Math.max(0, elapsed));
            setInput('');
            setPhase('playing');
            setLastJudge(null);
            setTimeout(() => inputRef.current?.focus?.(), 50);
            return;
          }
        }
      } catch {}
    }

    // 新規開始（resume=0 / セーブ無し / 復元失敗）
    setIdx(0);
    setCorrectCount(0);
    setMistakes([]);
    setInput('');
    setPhase('playing');
    setLastJudge(null);
    setStartedAt(Date.now());
    setNowMs(0);
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }, [loading, filteredTargets, saveKey, resume]);

  function finishGame(finalCorrect, finalTimeMs, finalMistakes) {
    // 終了したらセーブは消す（次回は新規）
    try {
      if (typeof window !== 'undefined') window.localStorage.removeItem(saveKey);
    } catch {}

    try {
      sessionStorage.setItem(
        'study_door_last_result',
        JSON.stringify({
          sheet,
          correct: finalCorrect,
          timeMs: finalTimeMs,
          mistakes: finalMistakes,
          ignoreWrongAndGo: ignoreWrongAndGo ? 1 : 0,
        })
      );
    } catch {}

    router.push('/study/door/result');
  }

  function goNext() {
    const nextIdx = idx + 1;
    if (nextIdx >= total) {
      finishGame(correctCount, nowMs, mistakes);
      return;
    }
    setIdx(nextIdx);
    setInput('');
    setPhase('playing');
    setLastJudge(null);
    setTimeout(() => inputRef.current?.focus?.(), 50);
  }

  function revealThenMaybeNext(judge) {
    setPhase('reveal');
    setLastJudge(judge);

    setTimeout(() => {
      if (ignoreWrongAndGo || judge?.ok) {
        goNext();
      } else {
        setPhase('playing');
        setLastJudge(null);
        setTimeout(() => inputRef.current?.focus?.(), 50);
      }
    }, 1200);
  }

  function judgeAndHandle(userText, isSkip = false) {
    if (!current) return;

    const userNorm = normalizeDoor(userText);
    const correctNorm = normalizeDoor(current.a);

    const ok = !isSkip && userNorm && userNorm === correctNorm;

    const judge = {
      ok,
      isSkip,
      user: userText,
      correct: current.a,
      q: current.q,
    };

    if (ok) {
      setCorrectCount((c) => c + 1);
      setPhase('reveal');
      setLastJudge(judge);
      setTimeout(() => goNext(), 700);
      return;
    }

    setMistakes((arr) => [
      ...arr,
      {
        q: current.q,
        correct: current.a,
        userAnswer: isSkip ? '(スキップ)' : String(userText ?? ''),
      },
    ]);

    revealThenMaybeNext(judge);
  }

  function onSubmit(e) {
    e?.preventDefault?.();
    if (phase !== 'playing') return;
    judgeAndHandle(input, false);
  }
  function onSkip() {
    if (phase !== 'playing') return;
    judgeAndHandle(input, true);
  }
  function onQuit() {
    if (!confirm('中断してメニューに戻りますか？（続きから再開できます）')) return;
    router.push('/study/door');
  }

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-md mx-auto px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-extrabold">📘 扉絵（解答RTA）</h1>
            <p className="text-[11px] text-slate-700">
              シート：<b className="text-slate-900">{sheet}</b>
              {ignoreWrongAndGo ? (
                <span className="ml-2 text-[10px] text-slate-600">（間違いでも次へ）</span>
              ) : (
                <span className="ml-2 text-[10px] text-slate-600">（正解まで進まない）</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onQuit}
              className="px-3 py-1 rounded-full text-[12px] font-bold bg-white border border-slate-300 text-slate-700 shadow-sm hover:bg-slate-50"
            >
              中断
            </button>
            <Link href="/study/door" className="text-xs font-bold text-sky-700 underline hover:text-sky-500">
              戻る
            </Link>
          </div>
        </header>

        {msg && (
          <div className="rounded-2xl border border-rose-300 bg-rose-50 p-3 text-rose-900 text-xs mb-3">
            {msg}
          </div>
        )}

        {!targets.length ? (
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <p className="text-sm font-bold text-slate-900">出題データがありません</p>
            <p className="text-[12px] text-slate-600 mt-1">このシートに行が無いか、読み込みに失敗してるかも。</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[12px] text-slate-600">
                進捗：<b className="text-slate-900">{idx + 1}</b> / {total}
              </p>
              <p className="text-[12px] text-slate-600">
                タイム：<b className="text-slate-900">{startedAt ? msToClock(nowMs) : '--:--'}</b>
              </p>
            </div>

            {/* 問題 */}
            <div className="mt-3 rounded-2xl border border-cyan-300 bg-cyan-50 p-4">
              <p className="text-[12px] text-cyan-900 font-bold mb-1">問題</p>
              <p className="text-sm text-cyan-950 leading-relaxed">
                <b className="text-cyan-950">{current?.q || '—'}</b>
                <span className="ml-2 text-[11px] text-cyan-900">のサブタイトルは？</span>
              </p>
            </div>

            {/* 入力 */}
            <form onSubmit={onSubmit} className="mt-3">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={loading || !current || phase !== 'playing'}
                placeholder="ここにサブタイトル"
                className="w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-sky-300"
              />

              <div className="mt-3 flex gap-2">
                <button
                  type="submit"
                  disabled={loading || !current || phase !== 'playing'}
                  className="flex-1 py-3 rounded-full bg-emerald-600 text-white font-extrabold shadow active:bg-emerald-700 disabled:bg-gray-400"
                >
                  決定
                </button>

                <button
                  type="button"
                  onClick={onSkip}
                  disabled={loading || !current || phase !== 'playing'}
                  className="px-4 py-3 rounded-full bg-slate-700 text-white font-extrabold shadow active:bg-slate-800 disabled:bg-gray-400"
                >
                  スキップ
                </button>
              </div>
            </form>

            {/* 判定表示 */}
            {lastJudge && (
              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className={`text-sm font-extrabold ${lastJudge.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {lastJudge.ok ? '正解！' : lastJudge.isSkip ? 'スキップ' : '不正解'}
                </p>

                {(ignoreWrongAndGo || lastJudge.ok || lastJudge.isSkip) && (
     <p className="text-[12px] text-slate-700 mt-1">
       正解：<b className="text-slate-900">{lastJudge.correct || ''}</b>
     </p>
   )}

                {!lastJudge.ok && !ignoreWrongAndGo && (
                  <p className="text-[11px] text-slate-600 mt-2">
                    この設定では、正解するまで次に進めません（<b>スキップ</b>のみ次へ）。
                  </p>
                )}
              </div>
            )}

            <div className="mt-3 flex items-center justify-between text-[12px] text-slate-700">
              <span>
                正解数：<b className="text-slate-900">{correctCount}</b>
              </span>
              <span>
                ミス：<b className="text-slate-900">{mistakes.length}</b>
              </span>
            </div>

            <div className="mt-3 text-[11px] text-slate-500">
              ※プレイ中は自動セーブされます（解答RTAはシートごとに保存）
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="inline-block px-4 py-2 rounded-full border border-sky-500 bg-white text-xs font-bold text-sky-700 hover:bg-sky-50"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
