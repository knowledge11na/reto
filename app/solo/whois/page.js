// file: app/solo/whois/page.js
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function WhoIsTopPage() {
  const router = useRouter();
  const [minutes, setMinutes] = useState(5);
  const [starting, setStarting] = useState(false);
  const [msg, setMsg] = useState('');

  // ここを増やす：出題プールを多めに取る（上限は api 側で 5000）
  const POOL_LIMIT = 2000;

  const startTimed = async () => {
    if (starting) return;
    setStarting(true);
    setMsg('');

    try {
      const res = await fetch(`/api/whois/list?limit=${POOL_LIMIT}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
        setMsg(data.error || '出題できる問題がありません（承認済みが0件）');
        return;
      }

      const session = {
        mode: 'timed',
        minutes,
        startedAt: Date.now(),
        questions: data.questions,
      };

      sessionStorage.setItem('whois_session', JSON.stringify(session));
      router.push('/solo/whois/play');
    } catch (e) {
      console.error(e);
      setMsg('開始に失敗しました。');
    } finally {
      setStarting(false);
    }
  };

  const startEndless = async () => {
    if (starting) return;
    setStarting(true);
    setMsg('');

    try {
      const res = await fetch(`/api/whois/list?limit=${POOL_LIMIT}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(data.questions) || data.questions.length === 0) {
        setMsg(data.error || '出題できる問題がありません（承認済みが0件）');
        return;
      }

      const session = {
        mode: 'endless',
        startedAt: Date.now(),
        questions: data.questions,
      };

      sessionStorage.setItem('whois_session', JSON.stringify(session));
      router.push('/solo/whois/play');
    } catch (e) {
      console.error(e);
      setMsg('開始に失敗しました。');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="min-h-screen bg-sky-50 text-slate-900 px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-extrabold">私は誰でしょう</h1>
          <Link
            href="/solo"
            className="text-xs font-bold text-sky-700 underline hover:text-sky-500"
          >
            ソロへ戻る
          </Link>
        </header>

        <section className="bg-white border border-sky-100 rounded-3xl p-4 shadow-sm space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed">
            ヒントを見て答えを当てるクイズ。<br />
            途中で「次のヒント」を押すとヒントが増える（最大5つ）。
          </p>

          <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50 space-y-2">
            <div className="text-sm font-bold text-slate-800">制限時間モード</div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMinutes(5)}
                className={
                  'flex-1 py-2 rounded-full text-sm font-bold border ' +
                  (minutes === 5
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-white text-slate-800 border-slate-300')
                }
              >
                5分
              </button>
              <button
                type="button"
                onClick={() => setMinutes(10)}
                className={
                  'flex-1 py-2 rounded-full text-sm font-bold border ' +
                  (minutes === 10
                    ? 'bg-violet-600 text-white border-violet-500'
                    : 'bg-white text-slate-800 border-slate-300')
                }
              >
                10分
              </button>
            </div>

            <button
              type="button"
              onClick={startTimed}
              disabled={starting}
              className="w-full py-3 rounded-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-extrabold shadow disabled:opacity-60"
            >
              {starting ? '読み込み中…' : '制限時間モードを開始'}
            </button>

            <div className="text-[11px] text-slate-500">
              出題プール: 最大 {POOL_LIMIT} 問（多いほど被りにくい）
            </div>
          </div>

          <div className="border border-slate-200 rounded-2xl p-3 bg-slate-50 space-y-2">
            <div className="text-sm font-bold text-slate-800">エンドレスモード</div>
            <p className="text-xs text-slate-600">
              間違えるか、ギブアップするまで続く（自己ベストは正解数）。
            </p>
            <button
              type="button"
              onClick={startEndless}
              disabled={starting}
              className="w-full py-3 rounded-full bg-sky-500 hover:bg-sky-600 text-white text-sm font-extrabold shadow disabled:opacity-60"
            >
              {starting ? '読み込み中…' : 'エンドレスを開始'}
            </button>
          </div>

          <div className="flex gap-2">
            <Link
              href="/solo/whois/submit"
              className="flex-1 py-3 rounded-full border border-emerald-400 bg-emerald-50 text-emerald-900 text-sm font-extrabold text-center"
            >
              問題を投稿する
            </Link>
            <Link
              href="/"
              className="flex-1 py-3 rounded-full border border-sky-400 bg-white text-sky-800 text-sm font-extrabold text-center"
            >
              ホームへ
            </Link>
          </div>

          {msg && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-2">
              {msg}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
