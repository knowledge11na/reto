// file: app/titles/page.js
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TitlesPage() {
  const [loading, setLoading] = useState(true);
  const [titles, setTitles] = useState([]);
  const [equippedTitle, setEquippedTitle] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/me/titles');
        const data = await res.json();

        if (!res.ok || !data.ok) {
          setMessage(data.message || '称号情報の取得に失敗しました。');
          return;
        }

        setTitles(data.titles || []);
        setEquippedTitle(data.equippedTitle ?? null);
      } catch (e) {
        console.error(e);
        setMessage('称号情報の取得中にエラーが発生しました。');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleEquip = async (titleId) => {
    setMessage('');
    try {
      const res = await fetch('/api/me/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titleId }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || '称号の装備に失敗しました。');
        return;
      }

      setEquippedTitle(data.equippedTitle ?? null);
      setMessage(`「${data.equippedTitle}」を装備しました。`);
    } catch (e) {
      console.error(e);
      setMessage('称号の装備中にエラーが発生しました。');
    }
  };

  const handleUnequip = async () => {
    setMessage('');
    try {
      const res = await fetch('/api/me/titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unequip: true }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setMessage(data.message || '称号の解除に失敗しました。');
        return;
      }

      setEquippedTitle(null);
      setMessage('称号を解除しました。');
    } catch (e) {
      console.error(e);
      setMessage('称号の解除中にエラーが発生しました。');
    }
  };

  return (
    <div className="min-h-screen bg-sky-50 flex flex-col items-center text-sky-900">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-sky-900">称号一覧</h1>
        <Link
          href="/mypage"
          className="border-2 border-sky-600 px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white shadow-sm"
        >
          マイページへ
        </Link>
      </header>

      <main className="w-full max-w-md px-4 pb-10 mt-4">
        {loading ? (
          <p className="text-sky-700">読み込み中です...</p>
        ) : (
          <>
            <section className="bg-white rounded-2xl shadow p-4 mb-4">
              <h2 className="text-lg font-extrabold mb-2">現在の装備</h2>
              <p className="text-sm">
                自由称号：
                {equippedTitle ? (
                  <span className="inline-block ml-1 px-2 py-0.5 rounded-full bg-purple-100 border border-purple-300 text-[11px] font-bold text-purple-700">
                    {equippedTitle}
                  </span>
                ) : (
                  <span className="text-slate-600 text-sm">なし</span>
                )}
              </p>
              {equippedTitle && (
                <button
                  onClick={handleUnequip}
                  className="mt-3 px-3 py-1 rounded-full bg-slate-200 text-slate-700 text-xs font-bold"
                >
                  称号を外す
                </button>
              )}
            </section>

            <section className="bg-white rounded-2xl shadow p-4">
              <h2 className="text-lg font-extrabold mb-2">所持称号一覧</h2>

              {titles.length === 0 ? (
                <p className="text-sm text-slate-600">
                  まだ称号を所持していません。
                </p>
              ) : (
                <ul className="space-y-2">
                  {titles.map((t) => {
                    const isEquipped = t.title_name === equippedTitle;
                    return (
                      <li
                        key={t.id}
                        className="flex items-center justify-between border rounded-xl px-3 py-2 bg-sky-50"
                      >
                        <div>
                          <p className="text-sm font-bold">{t.title_name}</p>
                          <p className="text-[11px] text-slate-500">
                            取得日時:{' '}
                            {t.obtained_at
                              ? new Date(t.obtained_at).toLocaleString('ja-JP')
                              : '-'}
                          </p>
                        </div>
                        <div>
                          {isEquipped ? (
                            <span className="text-[11px] font-bold text-purple-700">
                              装備中
                            </span>
                          ) : (
                            <button
                              onClick={() => handleEquip(t.id)}
                              className="px-3 py-1 rounded-full bg-sky-500 text-white text-[11px] font-bold"
                            >
                              この称号を装備
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {message && (
              <p className="mt-3 text-[11px] text-rose-600 whitespace-pre-line">
                {message}
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}
