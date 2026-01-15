// file: app/titles/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const MAX_SLOTS = 48;

export default function TitlesPage() {
  const [titles, setTitles] = useState([]);
  const [owned, setOwned] = useState(new Set());
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        // 1. 自分の userId を取得
        const meRes = await fetch('/api/me', { cache: 'no-store' });
        const meData = await meRes.json().catch(() => ({}));
        const userId = meData.user?.id;

        // 2. 称号一覧を取得
        const r1 = await fetch('/api/titles');
        const d1 = await r1.json().catch(() => ({}));
        const list = d1.titles || [];
        setTitles(list);

        // 3. 所持称号IDを取得（user_id を渡す）
        let ownedSet = new Set();
        if (userId) {
          const r2 = await fetch(`/api/titles/owned?user_id=${userId}`);
          const d2 = await r2.json().catch(() => ({}));
          ownedSet = new Set((d2.owned || []).map((v) => String(v)));
        }
        setOwned(ownedSet);

        // 最初に選択するインデックス
        setSelectedIndex(0);
      } catch (e) {
        console.error(e);
      }
    };

    load();
  }, []);

  // スロットを 48 個に埋める
  const slots = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    if (i < titles.length) {
      slots.push({ type: 'title', data: titles[i] });
    } else {
      slots.push({
        type: 'placeholder',
        data: {
          id: `placeholder-${i}`,
          name: 'アップデート待ち',
          condition_text: '今後のアップデートで新しいエンブレムが追加されます。',
        },
      });
    }
  }

  const current = slots[selectedIndex] || null;
  const currentIsOwned =
    current?.type === 'title' && owned.has(String(current.data.id));

  return (
    <div className="min-h-screen bg-sky-50 text-sky-900 flex flex-col items-center">
      {/* ヘッダー */}
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold tracking-widest">
          称号・エンブレム一覧
        </h1>
        <Link href="/mypage" className="underline text-sm text-sky-700">
          戻る
        </Link>
      </header>

      <main className="w-full max-w-md px-4 pb-10 mt-4 space-y-4">
        {/* グリッド */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-3 shadow-sm">
          <div className="grid grid-cols-6 gap-2">
            {slots.map((slot, idx) => {
              const isPlaceholder = slot.type === 'placeholder';
              const t = slot.data;
              const isSelected = idx === selectedIndex;
              const key = String(t.id);

              const has = !isPlaceholder && owned.has(String(t.id));

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedIndex(idx)}
                  className={
                    'relative aspect-square rounded-xl border-2 flex items-center justify-center ' +
                    (isSelected
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-sky-300 bg-sky-50')
                  }
                >
                  {isPlaceholder ? (
                    <span className="text-[9px] leading-tight text-sky-400 text-center">
                      アップデート
                      <br />
                      待ち
                    </span>
                  ) : has ? (
                    <img
                      src={t.image_url}
                      alt={t.name}
                      className="w-4/5 h-4/5 object-contain drop-shadow-lg"
                    />
                  ) : (
                    // 未入手：空の箱（シルエット無し）
                    <div className="w-4/5 h-4/5 rounded-lg border border-amber-900/40 bg-amber-900/5 shadow-inner" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* 詳細パネル */}
        <section className="bg-sky-100 border-2 border-sky-500 rounded-3xl p-4 shadow-sm text-sm">
          {current?.type === 'title' ? (
            <>
              <h2 className="text-base font-extrabold mb-3">
                選択中のエンブレム
              </h2>

              <div className="flex items-center gap-4">
                {/* 透過PNGそのままのバッジビュー */}
                <div className="w-28 h-28 flex items-center justify-center">
                  {currentIsOwned && current.data.image_url ? (
                    <img
                      src={current.data.image_url}
                      alt={current.data.name}
                      className="
                        w-full h-full object-contain 
                        transition-transform duration-300
                        hover:-translate-y-1 hover:rotate-2
                        active:translate-y-0 active:rotate-0
                      "
                    />
                  ) : (
                    <div className="text-[11px] text-sky-600 font-bold">
                      未入手
                    </div>
                  )}
                </div>

                {/* テキスト情報 */}
                <div className="flex-1 space-y-1">
                  <p className="mb-1">
                    名称：
                    <span className="font-bold">{current.data.name}</span>
                  </p>
                  <p className="mb-1 text-sky-700">
                    入手条件：{current.data.condition_text}
                  </p>
                  <p className="mt-1 text-xs">
                    状態：
                    {currentIsOwned ? (
                      <span className="text-emerald-700 font-bold">
                        入手済み
                      </span>
                    ) : (
                      <span className="text-rose-700 font-bold">未入手</span>
                    )}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-base font-extrabold mb-2">
                アップデート待ち
              </h2>
              <p className="text-sky-700 text-sm">
                今後のアップデートで新しいエンブレムが追加される予定です。
              </p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
