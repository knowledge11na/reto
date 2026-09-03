// file: app/tenipuri/problems/page.js

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  // 検索・絞り込み
  // =========================================================

  const [filters, setFilters] = useState({
    hitter: '',
    target: '',
    episode: '',
    technique: '',
    location: '',
    hand: '',
    result: '',
  });

  // =========================================================
  // 問題取得
  //
  // 一覧APIは高速化のため画像Base64を返さない。
  // =========================================================

  const loadProblems = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/tenipuri/problems', {
        method: 'GET',
        cache: 'no-store',
      });

      let data = null;

      try {
        data = await res.json();
      } catch {
        throw new Error(
          'APIから正しいJSONを受け取れませんでした。'
        );
      }

      console.log('[tenipuri/problems] frontend GET', {
        status: res.status,
        success: data?.success,
        ok: data?.ok,
        count: Array.isArray(data?.problems)
          ? data.problems.length
          : 0,
      });

      if (
        !res.ok ||
        (data?.success !== true && data?.ok !== true)
      ) {
        throw new Error(
          data?.error ||
            data?.message ||
            '問題一覧を取得できませんでした。'
        );
      }

      if (!Array.isArray(data?.problems)) {
        throw new Error(
          '問題一覧のデータ形式が正しくありません。'
        );
      }

      setProblems(data.problems);
    } catch (e) {
      console.error(
        '[tenipuri/problems] load failed:',
        e
      );

      setProblems([]);

      setError(
        e?.message ||
          '問題一覧を取得できませんでした。'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProblems();
  }, []);

  // =========================================================
  // 絞り込み選択肢
  // =========================================================

  const filterOptions = useMemo(() => {
    const getUniqueValues = (key) => {
      return [
        ...new Set(
          problems
            .map((problem) => problem[key])
            .filter(
              (value) =>
                value !== null &&
                value !== undefined &&
                String(value).trim() !== ''
            )
            .map((value) => String(value))
        ),
      ];
    };

    const sortJapanese = (values) => {
      return [...values].sort((a, b) =>
        a.localeCompare(b, 'ja', {
          numeric: true,
          sensitivity: 'base',
        })
      );
    };

    return {
      hitter: sortJapanese(getUniqueValues('hitter')),
      target: sortJapanese(getUniqueValues('target')),
      episode: sortJapanese(getUniqueValues('episode')),
      technique: sortJapanese(
        getUniqueValues('technique')
      ),
      location: sortJapanese(
        getUniqueValues('location')
      ),
      hand: sortJapanese(getUniqueValues('hand')),
      result: sortJapanese(getUniqueValues('result')),
    };
  }, [problems]);

  // =========================================================
  // 絞り込み
  // =========================================================

  const filteredProblems = useMemo(() => {
    return problems.filter((problem) => {
      return Object.entries(filters).every(
        ([key, value]) => {
          if (!value) return true;

          return String(problem[key] ?? '') === value;
        }
      );
    });
  }, [problems, filters]);

  // =========================================================
  // 絞り込み変更
  // =========================================================

  const handleFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // =========================================================
  // 絞り込みリセット
  // =========================================================

  const resetFilters = () => {
    setFilters({
      hitter: '',
      target: '',
      episode: '',
      technique: '',
      location: '',
      hand: '',
      result: '',
    });
  };

  const hasActiveFilters = Object.values(filters).some(
    (value) => value !== ''
  );

  // =========================================================
  // 削除
  // =========================================================

  const handleDelete = async (problem) => {
    const ok = window.confirm(
      `この問題を削除しますか？\n\n` +
        `${problem.hitter || ''} → ${
          problem.target || ''
        }`
    );

    if (!ok) return;

    setError('');
    setMessage('');

    try {
      const res = await fetch(
        `/api/tenipuri/problems?id=${encodeURIComponent(
          problem.id
        )}`,
        {
          method: 'DELETE',
          cache: 'no-store',
        }
      );

      const data = await res.json();

      if (
        !res.ok ||
        (data?.success !== true && data?.ok !== true)
      ) {
        throw new Error(
          data?.error ||
            data?.message ||
            '問題の削除に失敗しました。'
        );
      }

      setProblems((prev) =>
        prev.filter(
          (p) => String(p.id) !== String(problem.id)
        )
      );

      setMessage('問題を削除しました。');
    } catch (e) {
      console.error(e);

      setError(
        e?.message ||
          '問題の削除に失敗しました。'
      );
    }
  };

  // =========================================================
  // 編集開始
  //
  // 一覧APIでは画像を取得していないため、
  // 編集開始時だけ対象問題の完全データを取得する。
  // =========================================================

  const startEdit = async (problem) => {
    setMessage('');
    setError('');

    try {
      let fullProblem = problem;

      const hasFullImageData =
        typeof problem.image_url === 'string' &&
        problem.image_url.length > 0;

      const hasFullExplanationData =
        typeof problem.explanation_image_url === 'string' &&
        problem.explanation_image_url.length > 0;

      if (!hasFullImageData && !hasFullExplanationData) {
        const res = await fetch(
          `/api/tenipuri/problems?id=${encodeURIComponent(
            problem.id
          )}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        const data = await res.json();

        if (
          !res.ok ||
          (data?.success !== true && data?.ok !== true)
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              '問題データの取得に失敗しました。'
          );
        }

        fullProblem = data.problem;

        if (!fullProblem) {
          throw new Error(
            '問題データが見つかりませんでした。'
          );
        }
      }

      let answerType = 'hitter';

      if (fullProblem.answer_type === 'target') {
        answerType = 'target';
      } else if (
        fullProblem.answer_type === 'technique'
      ) {
        answerType = 'technique';
      }

      setEditing({
        id: fullProblem.id,

        hitter: fullProblem.hitter || '',
        target: fullProblem.target || '',

        answerType,

        episode: fullProblem.episode || '',
        technique: fullProblem.technique || '',
        location: fullProblem.location || '',
        hand: fullProblem.hand || '',
        result: fullProblem.result || '',

        imageUrl: fullProblem.image_url || '',
        imageFile: null,
        imagePreview: fullProblem.image_url || '',

        explanationImageUrl:
          fullProblem.explanation_image_url || '',
        explanationImageFile: null,
        explanationImagePreview:
          fullProblem.explanation_image_url || '',
      });

      setIsImageDragging(false);
      setIsExplanationImageDragging(false);

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (e) {
      console.error(
        '[tenipuri/problems] startEdit failed:',
        e
      );

      setError(
        e?.message ||
          '問題データの取得に失敗しました。'
      );
    }
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
  // 問題画像
  // =========================================================

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    handleImageFile(file);

    e.target.value = '';
  };

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

  const handleImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }

    setIsImageDragging(true);
  };

  const handleImageDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (
      e.currentTarget &&
      e.relatedTarget &&
      e.currentTarget.contains(e.relatedTarget)
    ) {
      return;
    }

    setIsImageDragging(false);
  };

  const handleImageDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsImageDragging(false);

    const file = e.dataTransfer?.files?.[0];

    if (!file) return;

    handleImageFile(file);
  };

  // =========================================================
  // 解説画像
  // =========================================================

  const handleExplanationImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    handleExplanationImageFile(file);

    e.target.value = '';
  };

  const handleExplanationImageFile = (file) => {
    if (!validateImageFile(file, '解説画像')) {
      return;
    }

    setEditing((prev) => {
      if (!prev) return prev;

      if (
        prev.explanationImagePreview &&
        prev.explanationImagePreview.startsWith(
          'blob:'
        )
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

  const handleExplanationImageDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }

    setIsExplanationImageDragging(true);
  };

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

    setSaving(true);

    try {
      const formData = new FormData();

      formData.append(
        'id',
        String(editing.id)
      );

      formData.append(
        'hitter',
        editing.hitter.trim()
      );

      formData.append(
        'target',
        editing.target.trim()
      );

      formData.append(
        'answerType',
        editing.answerType
      );

      formData.append(
        'episode',
        editing.episode.trim()
      );

      formData.append(
        'technique',
        editing.technique.trim()
      );

      formData.append(
        'location',
        editing.location.trim()
      );

      formData.append(
        'hand',
        editing.hand.trim()
      );

      formData.append(
        'result',
        editing.result.trim()
      );

      if (editing.imageFile) {
        formData.append(
          'image',
          editing.imageFile
        );
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
          cache: 'no-store',
        }
      );

      const data = await res.json();

      if (
        !res.ok ||
        (data?.success !== true && data?.ok !== true)
      ) {
        throw new Error(
          data?.error ||
            data?.message ||
            '問題の更新に失敗しました。'
        );
      }

      if (data.problem) {
        setProblems((prev) =>
          prev.map((p) =>
            String(p.id) === String(editing.id)
              ? data.problem
              : p
          )
        );
      } else {
        await loadProblems();
      }

      revokeEditingBlobUrls(editing);

      setEditing(null);
      setMessage('問題を更新しました。');

      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } catch (e) {
      console.error(
        '[tenipuri/problems] update failed:',
        e
      );

      setError(
        e?.message ||
          '問題の更新に失敗しました。'
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // Blob URL解放
  // =========================================================

  const revokeEditingBlobUrls = (state) => {
    if (
      state?.imagePreview &&
      state.imagePreview.startsWith('blob:')
    ) {
      URL.revokeObjectURL(
        state.imagePreview
      );
    }

    if (
      state?.explanationImagePreview &&
      state.explanationImagePreview.startsWith(
        'blob:'
      )
    ) {
      URL.revokeObjectURL(
        state.explanationImagePreview
      );
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
            <div className="mb-4 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm font-bold text-red-700 whitespace-pre-wrap">
              {error}
            </div>
          )}

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
              onClick={() =>
                document
                  .getElementById(
                    'edit-image-input'
                  )
                  ?.click()
              }
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
                  src={
                    editing.explanationImagePreview
                  }
                  alt="解説画像"
                  className="w-full max-h-[400px] object-contain"
                />

              </div>
            )}

            <div
              onClick={() =>
                document
                  .getElementById(
                    'edit-explanation-image-input'
                  )
                  ?.click()
              }
              onDragEnter={
                handleExplanationImageDragOver
              }
              onDragOver={
                handleExplanationImageDragOver
              }
              onDragLeave={
                handleExplanationImageDragLeave
              }
              onDrop={
                handleExplanationImageDrop
              }
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
                onChange={
                  handleExplanationImageChange
                }
                className="hidden"
              />

            </div>

          </section>

          <div className="flex flex-col gap-3">

            <button
              type="button"
              onClick={handleUpdate}
              disabled={saving}
              className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-extrabold text-white hover:bg-emerald-400 disabled:opacity-50"
            >
              {saving
                ? '保存中...'
                : '変更を保存する'}
            </button>

            <button
              type="button"
              onClick={() => {
                revokeEditingBlobUrls(editing);

                setEditing(null);
                setError('');
                setIsImageDragging(false);
                setIsExplanationImageDragging(
                  false
                );
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

            {/* =================================================
                検索・絞り込み
            ================================================== */}

            <section className="mb-5 rounded-2xl border-2 border-sky-200 bg-white p-4 shadow-sm">

              <div className="flex items-center justify-between gap-3 mb-4">

                <div>
                  <h2 className="font-extrabold text-sky-900">
                    打球問題を絞り込み
                  </h2>

                  <p className="text-[11px] text-slate-500 mt-1">
                    複数の条件を同時に指定できます。
                  </p>
                </div>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="shrink-0 rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-extrabold text-slate-600 hover:bg-slate-100"
                  >
                    条件をリセット
                  </button>
                )}

              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                <FilterSelect
                  label="誰が"
                  value={filters.hitter}
                  options={filterOptions.hitter}
                  placeholder="全員"
                  onChange={(value) =>
                    handleFilterChange(
                      'hitter',
                      value
                    )
                  }
                />

                <FilterSelect
                  label="誰に"
                  value={filters.target}
                  options={filterOptions.target}
                  placeholder="全員"
                  onChange={(value) =>
                    handleFilterChange(
                      'target',
                      value
                    )
                  }
                />

                <FilterSelect
                  label="話数"
                  value={filters.episode}
                  options={filterOptions.episode}
                  placeholder="全話"
                  onChange={(value) =>
                    handleFilterChange(
                      'episode',
                      value
                    )
                  }
                />

                <FilterSelect
                  label="技名"
                  value={filters.technique}
                  options={
                    filterOptions.technique
                  }
                  placeholder="全技"
                  onChange={(value) =>
                    handleFilterChange(
                      'technique',
                      value
                    )
                  }
                />

                <FilterSelect
                  label="場所"
                  value={filters.location}
                  options={
                    filterOptions.location
                  }
                  placeholder="全場所"
                  onChange={(value) =>
                    handleFilterChange(
                      'location',
                      value
                    )
                  }
                />

                <FilterSelect
                  label="右・左"
                  value={filters.hand}
                  options={filterOptions.hand}
                  placeholder="全て"
                  onChange={(value) =>
                    handleFilterChange(
                      'hand',
                      value
                    )
                  }
                />

                <FilterSelect
                  label="結果"
                  value={filters.result}
                  options={filterOptions.result}
                  placeholder="全結果"
                  onChange={(value) =>
                    handleFilterChange(
                      'result',
                      value
                    )
                  }
                />

              </div>

            </section>

            <div className="mb-3 text-xs font-bold text-slate-600">
              {hasActiveFilters
                ? `${filteredProblems.length}問 / ${problems.length}問`
                : `${problems.length}問`}
            </div>

            {filteredProblems.length === 0 ? (
              <div className="rounded-2xl bg-white border border-slate-200 p-8 text-center">

                <p className="font-bold text-slate-700">
                  条件に一致する打球問題がありません。
                </p>

                <button
                  type="button"
                  onClick={resetFilters}
                  className="inline-block mt-4 rounded-full bg-sky-500 px-5 py-2 text-sm font-bold text-white hover:bg-sky-400"
                >
                  条件をリセット
                </button>

              </div>
            ) : (
              <div className="space-y-5">

                {filteredProblems.map(
                  (problem) => (
                    <ProblemCard
                      key={problem.id}
                      problem={problem}
                      onEdit={() =>
                        startEdit(problem)
                      }
                      onDelete={() =>
                        handleDelete(problem)
                      }
                    />
                  )
                )}

              </div>
            )}

          </>
        )}

      </div>
    </main>
  );
}

// =============================================================
// 絞り込みプルダウン
// =============================================================

function FilterSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}) {
  return (
    <label className="block">

      <span className="block text-xs font-extrabold text-slate-700 mb-1">
        {label}
      </span>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-300"
      >
        <option value="">
          {placeholder}
        </option>

        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}

      </select>

    </label>
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
    getAnswerTypeLabel(
      problem.answer_type
    );

  const answer =
    getProblemAnswer(problem);

  const hasImage =
    Boolean(
      problem.has_image ||
        problem.image_url
    );

  const hasExplanationImage =
    Boolean(
      problem.has_explanation_image ||
        problem.explanation_image_url
    );

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

        {/* ===================================================
            画像はカードが画面付近に来た時だけ取得。
            1問題につきAPIアクセスは1回。
        =================================================== */}

        {(hasImage || hasExplanationImage) && (
          <LazyProblemImages
            problemId={problem.id}
            hasImage={hasImage}
            hasExplanationImage={
              hasExplanationImage
            }
          />
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
// 画像遅延取得
//
// ★ここが今回の大きな変更点
//
// 以前:
//   打球画像 → API
//   解説画像 → API
//
//   1問題で最大2回APIアクセス
//
// 今回:
//   問題カードが画面付近に来る
//       ↓
//   1回だけAPIアクセス
//       ↓
//   image_url / explanation_image_url を両方取得
//
// さらにIntersectionObserverにより、
// 画面からかなり遠い問題は最初は一切取得しない。
// =============================================================

function LazyProblemImages({
  problemId,
  hasImage,
  hasExplanationImage,
}) {
  const containerRef = useRef(null);

  const [shouldLoad, setShouldLoad] = useState(false);

  const [imageSrc, setImageSrc] = useState('');
  const [explanationImageSrc, setExplanationImageSrc] =
    useState('');

  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // =========================================================
  // IntersectionObserver
  //
  // rootMargin で「画面に入る少し前」に読み込み開始。
  // =========================================================

  useEffect(() => {
    const element = containerRef.current;

    if (!element) return;

    if (!('IntersectionObserver' in window)) {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting) {
          setShouldLoad(true);
          observer.disconnect();
        }
      },
      {
        root: null,

        // 画面の800px手前から読み込み開始。
        // いきなり画面内に入ってから取得するより
        // スクロール時の表示がスムーズになる。
        rootMargin: '800px 0px 800px 0px',

        threshold: 0,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  // =========================================================
  // 実際の画像取得
  // =========================================================

  useEffect(() => {
    if (!shouldLoad) return;

    let cancelled = false;

    const loadImages = async () => {
      setLoading(true);
      setFailed(false);

      try {
        const res = await fetch(
          `/api/tenipuri/problems?id=${encodeURIComponent(
            problemId
          )}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        let data = null;

        try {
          data = await res.json();
        } catch {
          throw new Error(
            '画像データを正しく取得できませんでした。'
          );
        }

        if (
          !res.ok ||
          (data?.success !== true &&
            data?.ok !== true)
        ) {
          throw new Error(
            data?.error ||
              data?.message ||
              '画像の取得に失敗しました。'
          );
        }

        const problem = data?.problem;

        if (!problem) {
          throw new Error(
            '問題データが見つかりませんでした。'
          );
        }

        const image =
          typeof problem.image_url === 'string'
            ? problem.image_url
            : '';

        const explanationImage =
          typeof problem.explanation_image_url ===
          'string'
            ? problem.explanation_image_url
            : '';

        if (cancelled) return;

        setImageSrc(
          hasImage ? image : ''
        );

        setExplanationImageSrc(
          hasExplanationImage
            ? explanationImage
            : ''
        );

        setLoading(false);

        if (
          (hasImage && !image) &&
          (hasExplanationImage &&
            !explanationImage)
        ) {
          setFailed(true);
        }
      } catch (e) {
        console.error(
          '[tenipuri/problems] image load failed:',
          e
        );

        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      }
    };

    loadImages();

    return () => {
      cancelled = true;
    };
  }, [
    shouldLoad,
    problemId,
    hasImage,
    hasExplanationImage,
  ]);

  // =========================================================
  // まだ画面付近に来ていない
  // =========================================================

  if (!shouldLoad) {
    return (
      <div
        ref={containerRef}
        className="mb-4 min-h-[20px]"
        aria-hidden="true"
      />
    );
  }

  // =========================================================
  // 読み込み中
  // =========================================================

  if (loading) {
    return (
      <div className="mb-4 rounded-xl border border-slate-200 bg-slate-100 p-5 text-center">
        <span className="text-xs text-slate-400">
          画像を読み込み中...
        </span>
      </div>
    );
  }

  // =========================================================
  // 取得失敗
  // =========================================================

  if (failed) {
    return null;
  }

  // =========================================================
  // 画像表示
  // =========================================================

  return (
    <div ref={containerRef}>

      {imageSrc && (
        <div className="mb-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">

          <img
            src={imageSrc}
            alt="打球画像"
            className="w-full max-h-[500px] object-contain"
            loading="lazy"
            decoding="async"
          />

        </div>
      )}

      {explanationImageSrc && (
        <div className="mt-4 mb-4">

          <p className="text-xs font-extrabold text-violet-700 mb-2">
            解説画像
          </p>

          <div className="rounded-xl overflow-hidden border border-violet-200 bg-white">

            <img
              src={explanationImageSrc}
              alt="解説画像"
              className="w-full max-h-[500px] object-contain"
              loading="lazy"
              decoding="async"
            />

          </div>

        </div>
      )}

    </div>
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
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === ''
  ) {
    return null;
  }

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