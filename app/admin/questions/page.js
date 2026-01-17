// file: app/admin/questions/page.js
'use client';

import { useEffect, useState } from 'react';

const TAGS_STORY = [
  '東の海',
  '偉大なる航路突入',
  'アラバスタ',
  '空島',
  'DBF',
  'W7、エニエス・ロビー',
  'スリラーバーク',
  'シャボンディ諸島',
  '女ヶ島',
  'インペルダウン',
  '頂上戦争',
  '3D2Y',
  '魚人島',
  'パンクハザード',
  'ドレスローザ',
  'ゾウ',
  'WCI',
  '世界会議',
  'ワノ国',
  'エッグヘッド',
  'エルバフ',
];

const TAGS_OTHER = [
  'SBS',
  'ビブルカード',
  '扉絵',
  '技',
  '巻跨ぎ',
  'セリフ',
  '表紙',
  'サブタイトル',
  'その他',
];

export default function AdminQuestionsPage() {
  const [statusFilter, setStatusFilter] = useState('pending');
  const [keyword, setKeyword] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [questions, setQuestions] = useState([]);
  const [editing, setEditing] = useState(null); // { ...question }

  // 公認作問者関連（既存：設定）
  const [officialMessage, setOfficialMessage] = useState('');
  const [makingOfficial, setMakingOfficial] = useState(false);

  // 公認作問者一覧表示用
  const [showOfficialList, setShowOfficialList] = useState(false);
  const [officialAuthors, setOfficialAuthors] = useState([]);
  const [loadingOfficialList, setLoadingOfficialList] = useState(false);
  const [officialListError, setOfficialListError] = useState('');

  // =========================================
  // 問題一覧取得
  // =========================================
  const fetchQuestions = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.set('status', statusFilter);
    if (keyword) params.set('q', keyword);
    if (selectedTag) params.set('tag', selectedTag);

    fetch(`/api/admin/questions?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setQuestions(d.questions ?? []))
      .catch(() => setQuestions([]));
  };

  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, selectedTag]); // ステータスかタグが変わったら自動再読み込み

  const openEdit = (q) => {
    setEditing({ ...q, tags: q.tags || [], alt_answers: q.alt_answers || [] });
  };

  const saveQuestion = async () => {
    if (!editing) return;
    const res = await fetch('/api/admin/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    });
    if (res.ok) {
      setEditing(null);
      fetchQuestions();
    } else {
      alert('保存に失敗しました');
    }
  };

 // ★ 承認 → ベリー付与ありの専用APIを叩く（ポップアップなし・アラートなし）
const approveQuestion = async (q) => {
  try {
    const res = await fetch('/api/admin/approve-question', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: q.id }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || data.error) {
      console.error('approve-question error:', data);
      alert(data.error || '承認に失敗しました');
      return;
    }

    // 承認成功 → 一覧を再読み込み
    fetchQuestions();

    // ここには何も表示しない（完全サイレント承認）
  } catch (e) {
    console.error('approve-question request failed:', e);
    alert('承認リクエストに失敗しました');
  }
};

  const rejectQuestion = async (q) => {
    const reason = window.prompt('却下理由（任意）');
    const res = await fetch('/api/admin/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: q.id, action: 'reject', reason }),
    });
    if (res.ok) fetchQuestions();
    else alert('却下に失敗しました');
  };

  // 却下済みから完全削除
  const deleteQuestion = async (q) => {
    if (q.status !== 'rejected') {
      alert('完全削除できるのは「却下済み」の問題だけです。');
      return;
    }
    if (
      !window.confirm(
        `問題 #${q.id} を完全に削除しますか？\n※関連する不備報告や間違えた問題の記録も消えます。`
      )
    ) {
      return;
    }

    const res = await fetch(`/api/admin/questions?id=${q.id}`, {
      method: 'DELETE',
    });

    if (res.ok) {
      fetchQuestions();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error || '削除に失敗しました');
    }
  };

  // =========================================
  // 公認作問者にする
  // =========================================
  const setAsOfficialAuthor = async (q) => {
    const userId = q.author_user_id;
    const username = q.author_username || q.created_by || '';
    const displayName = q.author_display_name || '';

    if (!userId) {
      alert('作問者のユーザーIDがありません（ログイン前に投稿された可能性があります）。');
      return;
    }

    const nameLabel = displayName || username || `ID: ${userId}`;

    if (!window.confirm(`「${nameLabel}」を公認作問者にしますか？`)) return;

    try {
      setMakingOfficial(true);
      setOfficialMessage('');

      const res = await fetch('/api/admin/users/make-official', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setOfficialMessage(
          data.message || '公認作問者への設定に失敗しました。'
        );
        return;
      }

      const finalName =
        data.display_name || data.username || nameLabel;

      setOfficialMessage(
        `ユーザー「${finalName}」を公認作問者に設定しました。`
      );
    } catch (e) {
      console.error(e);
      setOfficialMessage('公認作問者への設定中にエラーが発生しました。');
    } finally {
      setMakingOfficial(false);
    }
  };

  // =========================================
  // 公認作問者一覧
  // =========================================
  const loadOfficialAuthors = async () => {
    try {
      setLoadingOfficialList(true);
      setOfficialListError('');
      const res = await fetch('/api/admin/official-authors');
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(data.error || '公認作問者一覧の取得に失敗しました');
      }
      setOfficialAuthors(data.authors || []);
    } catch (e) {
      console.error(e);
      setOfficialListError(e.message || '公認作問者一覧の取得に失敗しました');
    } finally {
      setLoadingOfficialList(false);
    }
  };

  const unsetOfficialAuthor = async (author) => {
    const label =
      author.display_name || author.username || `ID: ${author.id}`;

    if (!window.confirm(`「${label}」を公認作問者から外しますか？`)) {
      return;
    }

    try {
      const res = await fetch('/api/admin/official-authors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: author.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        alert(data.error || '公認作問者の解除に失敗しました');
        return;
      }

      setOfficialAuthors((prev) =>
        prev.filter((a) => a.id !== author.id)
      );
      setOfficialMessage(
        `ユーザー「${label}」を公認作問者から外しました。`
      );
    } catch (e) {
      console.error(e);
      alert('公認作問者の解除リクエストに失敗しました');
    }
  };

  const toggleOfficialList = () => {
    const next = !showOfficialList;
    setShowOfficialList(next);
    if (next) {
      loadOfficialAuthors();
    }
  };

  // =========================================
  // レンダリング
  // =========================================
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold mb-2 text-slate-50">問題一覧・承認</h1>
<div className="flex gap-2 mb-2">
  <a
    href="/admin/whois"
    className="px-3 py-1 rounded-full border border-sky-400 text-sky-100 text-xs"
  >
    私は誰でしょう 承認
  </a>
</div>


      {/* フィルタ */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            className={`px-3 py-1 rounded-full border ${
              statusFilter === 'pending'
                ? 'bg-amber-500 text-black border-amber-400'
                : 'border-slate-500 text-slate-100'
            }`}
            onClick={() => setStatusFilter('pending')}
          >
            承認待ち
          </button>
          <button
            className={`px-3 py-1 rounded-full border ${
              statusFilter === 'approved'
                ? 'bg-emerald-500 text-black border-emerald-400'
                : 'border-slate-500 text-slate-100'
            }`}
            onClick={() => setStatusFilter('approved')}
          >
            承認済み
          </button>
          <button
            className={`px-3 py-1 rounded-full border ${
              statusFilter === 'rejected'
                ? 'bg-rose-500 text-black border-rose-400'
                : 'border-slate-500 text-slate-100'
            }`}
            onClick={() => setStatusFilter('rejected')}
          >
            却下済み
          </button>
          <button
            className={`px-3 py-1 rounded-full border ${
              statusFilter === ''
                ? 'bg-slate-600 border-slate-400 text-slate-50'
                : 'border-slate-500 text-slate-100'
            }`}
            onClick={() => setStatusFilter('')}
          >
            すべて
          </button>

          {/* 公認作問者一覧ボタン */}
          <button
            className={`px-3 py-1 rounded-full border ml-auto ${
              showOfficialList
                ? 'bg-purple-500 text-black border-purple-300'
                : 'border-purple-400 text-purple-200'
            }`}
            onClick={toggleOfficialList}
          >
            公認作問者一覧
          </button>
        </div>

        <div className="flex flex-col md:flex-row gap-2 text-sm">
          <input
            className="flex-1 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50"
            placeholder="問題文・答え・作問者名で検索"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchQuestions();
            }}
          />
          <button
            className="px-3 py-1 rounded bg-sky-600 text-xs text-white"
            onClick={fetchQuestions}
          >
            🔍 検索
          </button>
        </div>

        {/* タグフィルタ */}
        <div className="text-xs space-y-1 max-h-32 overflow-y-auto">
          <div className="text-slate-400">タグで絞り込み</div>
          <div className="flex flex-wrap gap-1">
            {[...TAGS_STORY, ...TAGS_OTHER].map((tag) => (
              <button
                key={tag}
                className={`px-2 py-1 rounded-full border ${
                  selectedTag === tag
                    ? 'border-sky-400 bg-slate-800 text-slate-50'
                    : 'border-slate-600 text-slate-200'
                }`}
                onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 公認作問者一覧 */}
      {showOfficialList && (
        <section className="bg-slate-900 border border-purple-500 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-bold text-purple-200">
              公認作問者一覧
            </h2>
            {loadingOfficialList && (
              <span className="text-[10px] text-slate-400">読み込み中…</span>
            )}
          </div>

          {officialListError && (
            <div className="text-xs text-rose-300">{officialListError}</div>
          )}

          {!loadingOfficialList &&
            officialAuthors.length === 0 &&
            !officialListError && (
              <div className="text-xs text-slate-400">
                公認作問者はまだ登録されていません。
              </div>
            )}

          {!loadingOfficialList && officialAuthors.length > 0 && (
            <div className="max-h-60 overflow-y-auto text-xs">
              <table className="w-full border-collapse text-slate-100">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="py-1 px-1 text-left">ID</th>
                    <th className="py-1 px-1 text-left">表示名</th>
                    <th className="py-1 px-1 text-left">ログインID</th>
                    <th className="py-1 px-1 text-right">レート</th>
                    <th className="py-1 px-1 text-right">ベリー</th>
                    <th className="py-1 px-1 text-center">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {officialAuthors.map((a) => (
                    <tr key={a.id} className="border-b border-slate-800">
                      <td className="py-1 px-1">{a.id}</td>
                      <td className="py-1 px-1">
                        {a.display_name || (
                          <span className="text-slate-400">（未設定）</span>
                        )}
                      </td>
                      <td className="py-1 px-1 text-xs">{a.username}</td>
                      <td className="py-1 px-1 text-right">
                        {typeof a.rating === 'number'
                          ? Math.round(a.rating)
                          : '-'}
                      </td>
                      <td className="py-1 px-1 text-right">
                        {a.berries ?? 0}
                      </td>
                      <td className="py-1 px-1 text-center">
                        <button
                          className="px-2 py-0.5 rounded-full border border-rose-400 text-rose-200 text-[10px]"
                          onClick={() => unsetOfficialAuthor(a)}
                        >
                          公認を解除
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* 一覧 */}
      <section className="bg-slate-900 border border-slate-700 rounded-xl p-3 space-y-3">
        <div className="text-xs text-slate-400 mb-2">
          {questions.length}件ヒット
        </div>

        {officialMessage && (
          <div className="text-xs text-purple-300 mb-2">{officialMessage}</div>
        )}

        <div className="space-y-2 max-h-[60vh] overflow-y-auto">
          {questions.map((q) => (
            <div
              key={q.id}
              className="border border-slate-700 rounded-lg p-2 text-xs space-y-1"
            >
              <div className="flex justify-between items-center">
                <div className="font-bold text-slate-50">
                  #{q.id} [{q.question_type}] {q.status}
                </div>
                <div className="flex gap-1 flex-wrap justify-end">
                  <button
                    className="px-2 py-1 rounded bg-slate-800 text-slate-100"
                    onClick={() => openEdit(q)}
                  >
                    ✏ 編集
                  </button>
                  {q.status !== 'approved' && (
                    <button
                      className="px-2 py-1 rounded bg-emerald-500 text-black"
                      onClick={() => approveQuestion(q)}
                    >
                      ✅ 承認
                    </button>
                  )}
                  {q.status !== 'rejected' && (
                    <button
                      className="px-2 py-1 rounded bg-rose-500 text-black"
                      onClick={() => rejectQuestion(q)}
                    >
                      ❌ 却下
                    </button>
                  )}
                  {q.status === 'rejected' && (
                    <button
                      className="px-2 py-1 rounded bg-slate-900 border border-rose-500 text-rose-300"
                      onClick={() => deleteQuestion(q)}
                    >
                      🗑 完全削除
                    </button>
                  )}
                </div>
              </div>

              <div className="text-slate-100 whitespace-pre-wrap">
                {q.question}
              </div>

              {q.options && q.options.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {q.options.map((o, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-50"
                    >
                      {o}
                    </span>
                  ))}
                </div>
              )}

              <div className="text-amber-200">
                正解: {q.correct_answer}
                {q.alt_answers && q.alt_answers.length > 0 && (
                  <span> / 別解: {q.alt_answers.join('、')}</span>
                )}
              </div>

              <div className="text-slate-400 flex flex-wrap gap-1">
                {q.tags &&
                  q.tags.map((t) => (
                    <span
                      key={t}
                      className="px-1.5 py-0.5 rounded-full bg-slate-800"
                    >
                      #{t}
                    </span>
                  ))}
              </div>

              {/* 作問者表示 */}
              {(q.author_display_name ||
                q.author_username ||
                q.created_by) && (
                <div className="text-slate-300">
                  作問者:{' '}
                  {q.author_display_name ||
                    q.author_username ||
                    q.created_by}
                  {q.author_user_id && <>（ID: {q.author_user_id}）</>}
                </div>
              )}

              {/* 公認作問者ボタン */}
              <div className="text-right">
                {q.author_user_id && (
                  <button
                    className="text-[10px] text-emerald-300 underline mr-2"
                    disabled={makingOfficial}
                    onClick={() => setAsOfficialAuthor(q)}
                  >
                    この作問者を公認作問者にする
                  </button>
                )}
              </div>
            </div>
          ))}

          {questions.length === 0 && (
            <div className="text-xs text-slate-400">
              該当する問題はありません。
            </div>
          )}
        </div>
      </section>

      {/* 編集モーダル */}
      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-xl text-xs space-y-2">
            <div className="flex justify-between items-center mb-1">
              <div className="font-bold text-slate-50">
                問題編集 #{editing.id}
              </div>
              <button
                className="text-slate-400 text-sm"
                onClick={() => setEditing(null)}
              >
                ✕
              </button>
            </div>

            <label className="block space-y-1">
              <span>問題文</span>
              <textarea
                className="w-full h-24 px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50"
                value={editing.question}
                onChange={(e) =>
                  setEditing({ ...editing, question: e.target.value })
                }
              />
            </label>

            <label className="block space-y-1">
              <span>問題タイプ</span>
              <select
                className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50"
                value={editing.question_type}
                onChange={(e) =>
                  setEditing({ ...editing, question_type: e.target.value })
                }
              >
                <option value="single">単一選択</option>
                <option value="multi">複数選択</option>
                <option value="text">記述</option>
                <option value="order">並び替え</option>
              </select>
            </label>

            <label className="block space-y-1">
              <span>選択肢（読点「、」区切り）</span>
              <input
                className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50"
                value={(editing.options || []).join('、')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    options: e.target.value
                      ? e.target.value.split('、').map((s) => s.trim())
                      : [],
                  })
                }
              />
            </label>

            <label className="block space-y-1">
              <span>正解</span>
              <input
                className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50"
                value={editing.correct_answer}
                onChange={(e) =>
                  setEditing({ ...editing, correct_answer: e.target.value })
                }
              />
            </label>

            <label className="block space-y-1">
              <span>別解（読点「、」区切り・完全一致のみOK）</span>
              <input
                className="w-full px-2 py-1 rounded bg-slate-800 border border-slate-600 text-slate-50"
                value={(editing.alt_answers || []).join('、')}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    alt_answers: e.target.value
                      ? e.target.value.split('、').map((s) => s.trim())
                      : [],
                  })
                }
              />
            </label>

            <div className="space-y-1">
              <span>タグ</span>
              <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                {[...TAGS_STORY, ...TAGS_OTHER].map((tag) => {
                  const selected =
                    editing.tags && editing.tags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`px-2 py-0.5 rounded-full border ${
                        selected
                          ? 'border-sky-400 bg-slate-800 text-slate-50'
                          : 'border-slate-600 text-slate-200'
                      }`}
                      onClick={() => {
                        let tags = editing.tags || [];
                        if (selected) {
                          tags = tags.filter((t) => t !== tag);
                        } else {
                          tags = [...tags, tag];
                        }
                        setEditing({ ...editing, tags });
                      }}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-2">
              <button
                className="px-3 py-1 rounded bg-slate-700 text-slate-50"
                onClick={() => setEditing(null)}
              >
                キャンセル
              </button>
              <button
                className="px-3 py-1 rounded bg-emerald-500 text-black"
                onClick={saveQuestion}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
