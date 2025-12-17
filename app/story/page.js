// file: app/story/page.js
'use client';

import { useEffect, useState } from 'react';
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

function makeNewSave(uid) {
  // DAY1 = 12/19
  return {
    uid: String(uid || 'guest'),
    day: 1,
    // yearは仮（表示用。あとで自由に変えてOK）
    startDate: { y: 2025, m: 12, d: 19 },
    chapter: 0,
    idx: 0,
    flags: {},
    lastPlace: 'story', // 'story' or 'home'
    updatedAt: Date.now(),
  };
}

function saveSave(uid, data) {
  try {
    localStorage.setItem(saveKey(uid), JSON.stringify({ ...data, updatedAt: Date.now() }));
  } catch {}
}

export default function StoryTitlePage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [canContinue, setCanContinue] = useState(false);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!me) return;
    const s = loadSave(me.id);
    setCanContinue(!!s);
  }, [me]);

  const startNew = () => {
    const uid = me?.id ?? 'guest';
    const s = makeNewSave(uid);
    saveSave(uid, s);

    // ★ はじめから = 0章へ（メインメニューへ飛ばさない）
    router.push('/story/play?chapter=0');
  };

  const cont = () => {
    const uid = me?.id ?? 'guest';
    const s = loadSave(uid);
    if (!s) return;

    // lastPlace によって復帰先を変える
    if (s.lastPlace === 'home') {
      router.push('/story/home');
    } else {
      router.push(`/story/play?chapter=${s.chapter ?? 0}`);
    }
  };

  return (
    <main className="min-h-[100svh] bg-slate-950 text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 shadow-2xl p-6">
        <h1 className="text-2xl font-extrabold text-center">ナレバトRPG</h1>
        <p className="text-xs text-white/70 text-center mt-2">
          ※スマホは横持ち推奨（必要なら後で強制表示も入れる）
        </p>

        <div className="mt-6 space-y-3">
          <button
            onClick={startNew}
            className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 font-extrabold"
          >
            はじめから
          </button>

          <button
            onClick={cont}
            disabled={!canContinue}
            className="w-full py-3 rounded-2xl bg-sky-600 hover:bg-sky-700 disabled:opacity-40 disabled:cursor-not-allowed font-extrabold"
          >
            つづきから
          </button>
        </div>

        <div className="mt-5 text-[11px] text-white/70">
          プレイヤー: <span className="font-bold text-white">{me?.username ?? me?.name ?? 'ゲスト'}</span>
        </div>
      </div>
    </main>
  );
}
