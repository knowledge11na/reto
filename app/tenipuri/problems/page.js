// file: app/tenipuri/problems/page.js

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function TenipuriProblemsPage() {
  const [problems, setProblems] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);

  const [isImageDragging, setIsImageDragging] = useState(false);
  const [isExplanationImageDragging, setIsExplanationImageDragging] =
    useState(false);

  // =========================================================
  // 問題取得
  // =========================================================

  const loadProblems = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tenipuri/problems', {
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || '問題一覧を取得できませんでした。'
        );
      }

      setProblems(data.problems || []);
    } catch (e) {
      console.error(e);

      setError(
        e.message || '問題一覧を取得できませんでした。'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProblems();
  }, []);

  // =========================================================
  // 削除
  // =========================================================

  const handleDelete = async (problem) => {
    const ok = window.confirm(
      `この問題を削除しますか？\n\n` +
        `${problem.hitter} → ${problem.target}`
    );

    if (!ok) return;

    setError('');
    setMessage('');

    try {
      const res = await fetch(
        `/api/tenipuri/problems?id=${problem.id}`,
        {
          method: 'DELETE',
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || '問題の削除に失敗しました。'
        );
      }

      setProblems((prev) =>
        prev.filter((p) => p.id !== problem.id)
      );

      setMessage('問題を削除しました。');
    } catch (e) {
      console.error(e);

      setError(
        e.message || '問題の削除に失敗しました。'
      );
    }
  };

  // =========================================================
  // 編集開始
  // =========================================================

  const startEdit = (problem) => {
    setMessage('');
    setError('');

    let answerType = 'hitter';

    if (problem.answer_type === 'target') {
      answerType = 'target';
    } else if (problem.answer_type === 'technique') {
      answerType = 'technique';
    }

    setEditing({
      id: problem.id,

      hitter: problem.hitter || '',
      target: problem.target || '',

      answerType,

      episode: problem.episode || '',
      technique: problem.technique || '',
      location: problem.location || '',
      hand: problem.hand || '',
      result: problem.result || '',

      // 問題画像
      imageUrl: problem.image_url || '',
      imageFile: null,
      imagePreview: problem.image_url || '',

      // 解説画像
      explanationImageUrl:
        problem.explanation_image_url || '',
      explanationImageFile: null,
      explanationImagePreview:
        problem.explanation_image_url || '',
    });

    setIsImageDragging(false);
    setIsExplanationImageDragging(false);

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  // =========================================================
  // 画像ファイル共通チェック
  // =========================================================

  const validateImageFile = (file, label) => {
    if (!file) return false;

    if (!file.type.startsWith('image/')) {
      setError(
        `${label}には画像ファイルを選択してください。`
      );
      return false;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError(
        `${label}のサイズは10MB以下にしてください。`
      );
      return false;
    }

    return true;
  };

  // =========================================================
  // 問題画像変更
  // =========================================================

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    handleImageFile(file);

    e.target.value = '';
  };

  // =========================================================
  // 問題画像ファイル処理
  // =========================================================

  const handleImageFile = (file) => {
    if (!validateImageFile(file, '打球画像')) {
      return;
    }

    setEditing((prev) => {
      if (!prev) return prev;

      if (
        prev.imagePreview &&
        prev.imagePreview.startsWith('blob:')
      ) {
        URL.revokeObjectURL(prev.imagePreview);
      }

      return {
        ...prev,
        imageFile: file,
        imagePreview: URL.createObjectURL(file),
      };
    });

    setError('');
    setIsImageDragging(false);
  };

  // =========================================================
  // 問題画像ドラッグ開始
  // =========================================================

  const handleImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }

    setIsImageDragging(true);
  };

  // =========================================================
  // 問題画像ドラッグ離脱
  // =========================================================

  const handleImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    // 子要素へ移動しただけの場合は解除しない
    if (
      e.currentTarget &&
      e.relatedTarget &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }

    setIsImageDragging(false);
  };

  // =========================================================
  // 問題画像ドロップ
  // =========================================================

  const handleImageDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsImageDragging(false);

    const file = e.dataTransfer?.files?.[0];

    if (!file) return;

    handleImageFile(file);
  };

  // =========================================================
  // 解説画像変更
  // =========================================================

  const handleExplanationImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    handleExplanationImageFile(file);

    e.target.value = '';
  };

  // =========================================================
  // 解説画像ファイル処理
  // =========================================================

  const handleExplanationImageFile = (file) => {
    if (!validateImageFile(file, '解説画像')) {
      return;
    }

    setEditing((prev) => {
      if (!prev) return prev;

      if (
        prev.explanationImagePreview &&
        prev.explanationImagePreview.startsWith('blob:')
      ) {
        URL.revokeObjectURL(
          prev.explanationImagePreview
        );
      }

      return {
        ...prev,
        explanationImageFile: file,
        explanationImagePreview:
          URL.createObjectURL(file),
      };
    });

    setError('');
    setIsExplanationImageDragging(false);
  };

  // =========================================================
  // 解説画像ドラッグ開始
  // =========================================================

  const handleExplanationImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }

    setIsExplanationImageDragging(true);
  };

  // =========================================================
  // 解説画像ドラッグ離脱
  // =========================================================

  const handleExplanationImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      e.currentTarget &&
      e.relatedTarget &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }

    setIsExplanationImageDragging(false);
  };

  // =========================================================
  // 解説画像ドロップ
  // =========================================================

  const handleExplanationImageDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsExplanationImageDragging(false);

    const file = e.dataTransfer?.files?.[0];

    if (!file) return;

    handleExplanationImageFile(file);
  };

  // =========================================================
  // 編集保存
  // =========================================================

  const handleUpdate = async () => {
    if (!editing) return;

    setError('');
    setMessage('');

    if (!editing.hitter.trim()) {
      setError(
        '「誰が打ったか」を入力してください。'
      );
      return;
    }

    if (!editing.target.trim()) {
      setError(
        '「誰に打ったか」を入力してください。'
      );
      return;
    }

    if (
      editing.answerType === 'technique' &&
      !editing.technique.trim()
    ) {
      setError(
        '答えを「技名」にする場合は、「技名」を入力してください。'
      );
      return;
    }

    if (
      editing.answerType === 'hitter' &&
      !editing.hitter.trim()
    ) {
      setError(
        '答えを「誰が打ったか」にする場合は、「誰が」を入力してください。'
      );
      return;
    }

    if (
      editing.answerType === 'target' &&
      !editing.target.trim()
    ) {
      setError(
        '答えを「誰に打ったか」にする場合は、「誰に」を入力してください。'
      );
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();

      formData.append('id', String(editing.id));
      formData.append('hitter', editing.hitter.trim());
      formData.append('target', editing.target.trim());
      formData.append('answerType', editing.answerType);
      formData.append('episode', editing.episode.trim());
      formData.append('technique', editing.technique.trim());
      formData.append('location', editing.location.trim());
      formData.append('hand', editing.hand.trim());
      formData.append('result', editing.result.trim());

      if (editing.imageFile) {
        formData.append('image', editing.imageFile);
      }

      if (editing.explanationImageFile) {
        formData.append(
          'explanationImage',
          editing.explanationImageFile
        );
      }

      const res = await fetch(
        '/api/tenipuri/problems',
        {
          method: 'PUT',
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error || '問題の更新に失敗しました。'
        );
      }

      setProblems((prev) =>
        prev.map((p) =>
          p.id === editing.id
            ? data.problem
            : p
        )
      );

      if (
        editing.imagePreview &&
        editing.imagePreview.startsWith('blob:')
      ) {
        URL.revokeObjectURL(editing.imagePreview);
      }

      if (
        editing.explanationImagePreview &&
        editing.explanationImagePreview.startsWith('blob:')
      ) {
        URL.revokeObjectURL(
          editing.explanationImagePreview
        );
      }

      setEditing(null);
      setMessage('問題を更新しました。');

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (e) {
      console.error(e);

      setError(
        e.message || '問題の更新に失敗しました。'
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // 編集画面
  // =========================================================

  if (editing) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="max-w-2xl mx-auto px-4 py-6">

          <header className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold">
                打球問題を編集
              </h1>

              <p className="text-xs text-slate-500 mt-1">
                問題ID：{editing.id}
              </p>
            </div>

            <Link
              href="/tenipuri"
              className="text-xs font-bold text-sky-700 underline"
            >
              テニプリへ戻る
            </Link>
          </header>

          {error && (
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          )}

          {/* =================================================
              打球情報
          ================================================== */}

          <section className="mb-5 rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">

            <h2 className="font-extrabold mb-4">
              打球情報
            </h2>

            <div className="space-y-4">

              <InputField
                label="誰が打った？"
                value={editing.hitter}
                onChange={(value) =>
                  setEditing((prev) => ({
                    ...prev,
                    hitter: value,
                  }))
                }
              />

              <InputField
                label="誰に打った？"
                value={editing.target}
                onChange={(value) =>
                  setEditing((prev) => ({
                    ...prev,
                    target: value,
                  }))
                }
              />

              <div className="grid grid-cols-2 gap-3">

                <InputField
                  label="話数"
                  value={editing.episode}
                  onChange={(value) =>
                    setEditing((prev) => ({
                      ...prev,
                      episode: value,
                    }))
                  }
                />

                <InputField
                  label="技名"
                  value={editing.technique}
                  onChange={(value) =>
                    setEditing((prev) => ({
                      ...prev,
                      technique: value,
                    }))
                  }
                />

              </div>

              <InputField
                label="場所"
                value={editing.location}
                onChange={(value) =>
                  setEditing((prev) => ({
                    ...prev,
                    location: value,
                  }))
                }
              />

              <div className="grid grid-cols-2 gap-3">

                <InputField
                  label="右・左"
                  value={editing.hand}
                  onChange={(value) =>
                    setEditing((prev) => ({
                      ...prev,
                      hand: value,
                    }))
                  }
                />

                <InputField
                  label="結果"
                  value={editing.result}
                  onChange={(value) =>
                    setEditing((prev) => ({
                      ...prev,
                      result: value,
                    }))
                  }
                />

              </div>

            </div>
          </section>

          {/* =================================================
              答え
          ================================================== */}

          <section className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">

            <h2 className="font-extrabold text-amber-900 mb-1">
              この問題では何を答えさせますか？
            </h2>

            <p className="text-xs text-amber-800 mb-4">
              ゲーム中にプレイヤーが入力する正解を選択してください。
            </p>

            <div className="space-y-2">

              <AnswerTypeOption
                value="hitter"
                checked={
                  editing.answerType === 'hitter'
                }
                onChange={(value) =>
                  setEditing((prev) => ({
                    ...prev,
                    answerType: value,
                  }))
                }
                title="誰が打ったか"
                answer={editing.hitter}
              />

              <AnswerTypeOption
                value="target"
                checked={
                  editing.answerType === 'target'
                }
                onChange={(value) =>
                  setEditing((prev) => ({
                    ...prev,
                    answerType: value,
                  }))
                }
                title="誰に打ったか"
                answer={editing.target}
              />

              <AnswerTypeOption
                value="technique"
                checked={
                  editing.answerType === 'technique'
                }
                onChange={(value) =>
                  setEditing((prev) => ({
                    ...prev,
                    answerType: value,
                  }))
                }
                title="技名"
                answer={editing.technique}
              />

            </div>
          </section>

          {/* =================================================
              問題画像
          ================================================== */}

          <section className="mb-5 rounded-2xl border-2 border-sky-300 bg-white p-4">

            <h2 className="font-extrabold mb-3">
              打球画像
            </h2>

            {editing.imagePreview && (
              <div className="mb-4 rounded-xl overflow-hidden border border-slate-300 bg-slate-100">

                <img
                  src={editing.imagePreview}
                  alt="打球画像"
                  className="w-full max-h-[400px] object-contain"
                />

              </div>
            )}

            <div
              onClick={() => {
                document
                  .getElementById('edit-image-input')
                  ?.click();
              }}
              onDragEnter={handleImageDragOver}
              onDragOver={handleImageDragOver}
              onDragLeave={handleImageDragLeave}
              onDrop={handleImageDrop}
              className={`block cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                isImageDragging
                  ? 'border-sky-500 bg-sky-100 scale-[1.01]'
                  : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
              }`}
            >

              <p className="font-bold text-slate-700">
                {isImageDragging
                  ? 'ここに画像をドロップ'
                  : editing.imagePreview
                    ? '画像を変更する'
                    : '画像を選択する'}
              </p>

              <p className="text-xs text-slate-500 mt-1">
                クリック・タップ、または画像をドラッグ＆ドロップ
              </p>

              <p className="text-[11px] text-slate-400 mt-2">
                10MB以下の画像
              </p>

              <input
                id="edit-image-input"
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

            </div>

          </section>

          {/* =================================================
              解説画像
          ================================================== */}

          <section className="mb-5 rounded-2xl border-2 border-violet-300 bg-violet-50 p-4">

            <h2 className="font-extrabold text-violet-900 mb-3">
              解説画像
            </h2>

            <p className="text-xs text-slate-500 mb-3">
              問題の答えや根拠を説明する画像を追加できます。
            </p>

            {editing.explanationImagePreview && (
              <div className="mb-4 rounded-xl overflow-hidden border border-violet-200 bg-white">

                <img
                  src={editing.explanationImagePreview}
                  alt="解説画像"
                  className="w-full max-h-[400px] object-contain"
                />

              </div>
            )}

            <div
              onClick={() => {
                document
                  .getElementById(
                    'edit-explanation-image-input'
                  )
                  ?.click();
              }}
              onDragEnter={handleExplanationImageDragOver}
              onDragOver={handleExplanationImageDragOver}
              onDragLeave={handleExplanationImageDragLeave}
              onDrop={handleExplanationImageDrop}
              className={`block cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
                isExplanationImageDragging
                  ? 'border-violet-500 bg-violet-100 scale-[1.01]'
                  : 'border-violet-300 bg-white hover:bg-violet-100'
              }`}
            >

              <p className="font-bold text-violet-800">
                {isExplanationImageDragging
                  ? 'ここに画像をドロップ'
                  : editing.explanationImagePreview
                    ? '解説画像を変更する'
                    : '解説画像を追加する'}
              </p>

              <p className="text-xs text-slate-500 mt-1">
                クリック・タップ、または画像をドラッグ＆ドロップ
              </p>

              <p className="text-[11px] text-slate-400 mt-2">
                ※登録しなくても問題ありません
              </p>

              <input
                id="edit-explanation-image-input"
                type="file"
                accept="image/*"
                onChange={handleExplanationImageChange}
                className="hidden"
              />

            </div>

          </section>

          {/* =================================================
              保存
          ================================================== */}

          <div className="flex flex-col gap-3">

            <button
              type="button"
              onClick={handleUpdate}
              disabled={saving}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-extrabold text-white hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving ? '保存中...' : '変更を保存する'}
            </button>

            <button
              type="button"
              onClick={() => {
                if (
                  editing.imagePreview &&
                  editing.imagePreview.startsWith('blob:')
                ) {
                  URL.revokeObjectURL(
                    editing.imagePreview
                  );
                }

                if (
                  editing.explanationImagePreview &&
                  editing.explanationImagePreview.startsWith(
                    'blob:'
                  )
                ) {
                  URL.revokeObjectURL(
                    editing.explanationImagePreview
                  );
                }

                setEditing(null);
                setError('');
                setIsImageDragging(false);
                setIsExplanationImageDragging(false);
              }}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold"
            >
              キャンセル
            </button>

          </div>

        </div>
      </main>
    );
  }

  // =========================================================
  // 一覧
  // =========================================================

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-4xl mx-auto px-4 py-6">

        <header className="mb-6 flex items-center justify-between">

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球問題一覧・管理
            </h1>

            <p className="text-xs text-slate-500 mt-1">
              登録されている打球問題を確認・修正できます。
            </p>
          </div>

          <Link
            href="/tenipuri"
            className="text-xs font-bold text-sky-700 underline"
          >
            テニプリへ戻る
          </Link>

        </header>

        {message && (
          <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-800">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 whitespace-pre-wrap">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center text-sm text-slate-500">
            問題を読み込み中...
          </div>
        ) : problems.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">

            <p className="font-bold text-slate-700">
              まだ打球問題が登録されていません。
            </p>

            <Link
              href="/tenipuri/submit"
              className="inline-block mt-4 rounded-full bg-emerald-500 px-5 py-2 text-sm font-bold text-white"
            >
              問題を投稿する
            </Link>

          </div>
        ) : (
          <>

            <div className="mb-3 text-xs font-bold text-slate-600">
              {problems.length}問
            </div>

            <div className="space-y-5">

              {problems.map((problem) => (
                <ProblemCard
                  key={problem.id}
                  problem={problem}
                  onEdit={() => startEdit(problem)}
                  onDelete={() => handleDelete(problem)}
                />
              ))}

            </div>

          </>
        )}

      </div>
    </main>
  );
}


// =============================================================
// 問題カード
// =============================================================

function ProblemCard({
  problem,
  onEdit,
  onDelete,
}) {
  const answerLabel =
    getAnswerTypeLabel(problem.answer_type);

  const answer =
    getProblemAnswer(problem);

  return (
    <article className="rounded-2xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">

      <div className="p-4">

        <div className="flex items-start justify-between gap-3 mb-3">

          <div>
            <p className="text-xs text-slate-400">
              問題ID：{problem.id}
            </p>

            <p className="text-base font-extrabold mt-1">
              {problem.hitter}

              <span className="mx-2 text-slate-400">
                →
              </span>

              {problem.target}
            </p>
          </div>

          <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-extrabold text-amber-800">
            {answerLabel}
          </span>

        </div>

        {problem.image_url && (
          <div className="mb-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">

            <img
              src={problem.image_url}
              alt="打球画像"
              className="w-full max-h-[500px] object-contain"
            />

          </div>
        )}

        {problem.explanation_image_url && (
          <div className="mt-4 mb-4">

            <p className="text-xs font-extrabold text-violet-700 mb-2">
              解説画像
            </p>

            <div className="rounded-xl overflow-hidden border border-violet-200 bg-violet-50">

              <img
                src={problem.explanation_image_url}
                alt="解説画像"
                className="w-full max-h-[500px] object-contain"
              />

            </div>

          </div>
        )}

        <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2 text-xs">

            <Info
              label="誰が"
              value={problem.hitter}
            />

            <Info
              label="誰に"
              value={problem.target}
            />

            <Info
              label="話数"
              value={problem.episode}
            />

            <Info
              label="技名"
              value={problem.technique}
            />

            <Info
              label="場所"
              value={problem.location}
            />

            <Info
              label="右・左"
              value={problem.hand}
            />

            <Info
              label="結果"
              value={problem.result}
            />

            <Info
              label="正解"
              value={answer}
              highlight
            />

          </div>

        </div>

        <div className="mt-4 flex gap-2">

          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-xl bg-sky-500 px-4 py-3 text-xs font-extrabold text-white hover:bg-sky-400"
          >
            編集
          </button>

          <button
            type="button"
            onClick={onDelete}
            className="flex-1 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-xs font-extrabold text-red-700 hover:bg-red-100"
          >
            削除
          </button>

        </div>

      </div>

    </article>
  );
}


// =============================================================
// 答えタイプ表示
// =============================================================

function getAnswerTypeLabel(answerType) {
  if (answerType === 'target') {
    return '誰に打った？';
  }

  if (answerType === 'technique') {
    return '技名';
  }

  return '誰が打った？';
}


// =============================================================
// 問題の正解取得
// =============================================================

function getProblemAnswer(problem) {
  if (problem.answer_type === 'target') {
    return problem.target || '';
  }

  if (problem.answer_type === 'technique') {
    return problem.technique || '';
  }

  return problem.hitter || '';
}


// =============================================================
// 情報表示
// =============================================================

function Info({
  label,
  value,
  highlight = false,
}) {
  if (!value) return null;

  return (
    <div>

      <span className="font-bold text-slate-500">
        {label}：
      </span>

      <span
        className={
          highlight
            ? 'font-extrabold text-emerald-700'
            : 'text-slate-800'
        }
      >
        {value}
      </span>

    </div>
  );
}


// =============================================================
// 答え選択肢
// =============================================================

function AnswerTypeOption({
  value,
  checked,
  onChange,
  title,
  answer,
}) {
  return (
    <label
      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer ${
        checked
          ? 'border-amber-500 bg-white'
          : 'border-amber-200 bg-amber-50'
      }`}
    >

      <input
        type="radio"
        name="editAnswerType"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
      />

      <div>

        <p className="font-extrabold">
          {title}
        </p>

        <p className="text-xs text-slate-500">
          正解：{answer || '未入力'}
        </p>

      </div>

    </label>
  );
}

// =============================================================
// 入力欄
// =============================================================

function InputField({
  label,
  value,
  onChange,
}) {
  return (
    <label className="block">

      <span className="block text-xs font-bold text-slate-700 mb-1">
        {label}
      </span>

      <input
        type="text"
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300"
      />

    </label>
  );
}
