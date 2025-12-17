'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

function saveKey(uid) {
  return `nare_story_save_${uid || 'guest'}`;
}
function loadSave(uid) {
  try {
    const raw = localStorage.getItem(saveKey(uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function saveSave(uid, data) {
  try {
    localStorage.setItem(saveKey(uid), JSON.stringify({ ...data, updatedAt: Date.now() }));
  } catch {}
}

function addDays(start, dayIndex) {
  const base = new Date(start.y, (start.m || 1) - 1, start.d || 1);
  const dt = new Date(base.getTime() + (Math.max(1, Number(dayIndex) || 1) - 1) * 24 * 60 * 60 * 1000);
  return { y: dt.getFullYear(), m: dt.getMonth() + 1, d: dt.getDate() };
}
function fmtDate(d) {
  const mm = String(d.m).padStart(2, '0');
  const dd = String(d.d).padStart(2, '0');
  return `${mm}/${dd}`;
}

export default function StoryHomePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [save, setSave] = useState(null);

  const [canFS, setCanFS] = useState(false);

  useEffect(() => {
    setCanFS(typeof document !== 'undefined' && !!document.documentElement?.requestFullscreen);
  }, []);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!me) return;
    const s = loadSave(me.id);
    if (!s) {
      // セーブが無いのに来たらタイトルへ
      router.push('/story');
      return;
    }
    const next = { ...s, lastPlace: 'home' };
    setSave(next);
    saveSave(me.id, next);
  }, [me, router]);

  const gameDate = useMemo(() => {
    if (!save?.startDate) return { y: 2025, m: 12, d: 19 };
    return addDays(save.startDate, save.day || 1);
  }, [save]);

  function requestFS() {
    try {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen?.();
    } catch {}
  }

  // ① 対策する：タグ選択は次のステップで画面作る（ここは入口だけ）
  const goPractice = () => {
    requestFS();
    alert('次：タグ選択→10問正解まで（ここから作る）');
    // router.push('/story/practice'); ←次に作る
  };

  // ② 外出する：マップは後で（入口だけ）
  const goOut = () => {
    requestFS();
    alert('次：マップ移動（ここから作る）');
    // router.push('/story/map'); ←次に作る
  };

  const openCalendar = () => {
    requestFS();
    alert('次：カレンダー（大会日程など）');
  };

  const doSave = () => {
    requestFS();
    if (!me || !save) return;
    saveSave(me.id, { ...save, lastPlace: 'home' });
    alert('セーブしました');
  };

  if (!save) {
    return (
      <main className="min-h-[100svh] bg-slate-950 text-white flex items-center justify-center">
        <div className="text-sm font-extrabold">読み込み中...</div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] text-white relative overflow-hidden">
      {/* ★ 家の背景 */}
      <div className="absolute inset-0">
        <img src="/story/bg/home.png" alt="home-bg" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-slate-950/55" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-4">
        {/* ヘッダー：左にDAY、右上に日付 */}
        <header className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-black/55 border border-white/10 text-[12px] font-extrabold">
                DAY {save.day}
              </span>
              <span className="text-[12px] font-bold text-white/80">
                プレイヤー：{me?.username ?? me?.name ?? 'ゲスト'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-[12px] font-bold">
            <span className="px-3 py-1 rounded-full bg-black/55 border border-white/10">
              {fmtDate(gameDate)}
            </span>
            {canFS && (
              <button
                onClick={requestFS}
                className="px-2 py-1 rounded-full bg-white/10 border border-white/10 hover:bg-white/15"
              >
                フルスクリーン
              </button>
            )}
            <Link href="/story" className="underline hover:text-white">タイトルへ</Link>
            <Link href="/" className="underline hover:text-white">ホーム</Link>
          </div>
        </header>

        <div className="mt-6 text-center">
          <h1 className="text-2xl sm:text-3xl font-extrabold">主人公の家</h1>
          <p className="mt-2 text-[12px] text-white/80 font-bold">
            対策する / 外出する を終えると 1日進みます（次の実装で反映）
          </p>
        </div>

        {/* ★ スマホで途切れないよう 100svh 前提 + 余白 + グリッド */}
        <section className="mt-6 grid grid-cols-1 gap-4">
          <MenuCard title="対策する" onClick={goPractice} tone="warm" />
          <MenuCard title="外出する" onClick={goOut} tone="cool" />
          <MenuCard title="カレンダー" onClick={openCalendar} tone="warm" />
          <MenuCard title="セーブ" onClick={doSave} tone="cool" />
        </section>
      </div>
    </main>
  );
}

function MenuCard({ title, onClick, tone }) {
  const base =
    'h-[120px] sm:h-[150px] rounded-3xl border shadow-xl text-slate-900 font-extrabold text-xl sm:text-2xl flex items-center justify-center';
  const warm = 'bg-amber-50/95 border-amber-100';
  const cool = 'bg-sky-50/95 border-sky-100';

  return (
    <button type="button" onClick={onClick} className={`${base} ${tone === 'warm' ? warm : cool}`}>
      {title}
    </button>
  );
}
