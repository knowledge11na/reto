// file: app/tenipuri/submit/page.js

'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

export default function TenipuriSubmitPage() {
  const [mode, setMode] = useState(null);

  const [wazaList, setWazaList] = useState([]);
  const [loadingWaza, setLoadingWaza] = useState(false);
  const [wazaError, setWazaError] = useState('');

  const [searchText, setSearchText] = useState('');
  const [selectedWaza, setSelectedWaza] = useState(null);

  const [hitter, setHitter] = useState('');
  const [target, setTarget] = useState('');
  const [episode, setEpisode] = useState('');
  const [technique, setTechnique] = useState('');
  const [location, setLocation] = useState('');
  const [hand, setHand] = useState('');
  const [result, setResult] = useState('');

  const [answerType, setAnswerType] = useState('hitter');


  // =========================================================
  // 打球画像
  // =========================================================

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [isImageDragging, setIsImageDragging] = useState(false);

  // =========================================================
  // 解説画像
  // =========================================================

  const [explanationImageFile, setExplanationImageFile] =
    useState(null);

  const [explanationImagePreview, setExplanationImagePreview] =
    useState('');

  const [isExplanationImageDragging, setIsExplanationImageDragging] =
    useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const fileInputRef = useRef(null);
  const explanationFileInputRef = useRef(null);

  // =========================================================
  // Excelの打球データ取得
  // =========================================================

  const loadWazaList = async () => {
    if (wazaList.length > 0) return;

    setLoadingWaza(true);
    setWazaError('');

    try {
      const res = await fetch('/api/tenipuri/waza', {
        cache: 'no-store',
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ||
            '打球データを取得できませんでした。'
        );
      }

      setWazaList(data.waza || []);
    } catch (e) {
      console.error(e);

      setWazaError(
        e.message ||
          '打球データを取得できませんでした。'
      );
    } finally {
      setLoadingWaza(false);
    }
  };

  // =========================================================
  // Excel検索
  // =========================================================

  const filteredWaza = useMemo(() => {
    const keyword =
      searchText.trim().toLowerCase();

    if (!keyword) {
      return wazaList.slice(0, 100);
    }

    return wazaList
      .filter((waza) => {
        const text = [
          waza.hitter,
          waza.target,
          waza.episode,
          waza.technique,
          waza.location,
          waza.hand,
          waza.result,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return text.includes(keyword);
      })
      .slice(0, 100);
  }, [wazaList, searchText]);

  // =========================================================
  // Excelの打球を選択
  // =========================================================

  const selectWaza = (waza) => {
    setSelectedWaza(waza);

    setHitter(waza.hitter || '');
    setTarget(waza.target || '');
    setEpisode(waza.episode || '');
    setTechnique(waza.technique || '');
    setLocation(waza.location || '');
    setHand(waza.hand || '');
    setResult(waza.result || '');

    setError('');
  };

  // =========================================================
  // 画像チェック
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
  // 打球画像ファイル処理
  // =========================================================

  const handleImageFile = (file) => {
    if (!validateImageFile(file, '打球画像')) {
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    const previewUrl =
      URL.createObjectURL(file);

    setImageFile(file);
    setImagePreview(previewUrl);
    setIsImageDragging(false);
    setError('');
  };

  // =========================================================
  // 打球画像選択
  // =========================================================

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    handleImageFile(file);

    e.target.value = '';
  };

  // =========================================================
  // 打球画像ドラッグ
  // =========================================================

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
  // 解説画像ファイル処理
  // =========================================================

  const handleExplanationImageFile = (file) => {
    if (!validateImageFile(file, '解説画像')) {
      return;
    }

    if (explanationImagePreview) {
      URL.revokeObjectURL(
        explanationImagePreview
      );
    }

    const previewUrl =
      URL.createObjectURL(file);

    setExplanationImageFile(file);
    setExplanationImagePreview(previewUrl);
    setIsExplanationImageDragging(false);
    setError('');
  };

  // =========================================================
  // 解説画像選択
  // =========================================================

  const handleExplanationImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) return;

    handleExplanationImageFile(file);

    e.target.value = '';
  };

  // =========================================================
  // 解説画像ドラッグ
  // =========================================================

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
  // 打球画像削除
  // =========================================================

  const removeImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // =========================================================
  // 解説画像削除
  // =========================================================

  const removeExplanationImage = () => {
    if (explanationImagePreview) {
      URL.revokeObjectURL(
        explanationImagePreview
      );
    }

    setExplanationImageFile(null);
    setExplanationImagePreview('');

    if (explanationFileInputRef.current) {
      explanationFileInputRef.current.value = '';
    }
  };

  // =========================================================
  // 入力リセット
  // =========================================================

  const resetForm = () => {
    setSelectedWaza(null);

    setHitter('');
    setTarget('');
    setEpisode('');
    setTechnique('');
    setLocation('');
    setHand('');
    setResult('');

    setAnswerType('hitter');

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview('');

    if (explanationImagePreview) {
      URL.revokeObjectURL(
        explanationImagePreview
      );
    }

    setExplanationImageFile(null);
    setExplanationImagePreview('');

    setIsImageDragging(false);
    setIsExplanationImageDragging(false);

    setMessage('');
    setError('');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    if (explanationFileInputRef.current) {
      explanationFileInputRef.current.value = '';
    }
  };

  // =========================================================
  // 登録
  // =========================================================

  const handleSubmit = async () => {
    setError('');
    setMessage('');

    if (
      answerType === 'hitter' &&
      !hitter.trim()
    ) {
      setError(
        '答えを「誰が打ったか」にする場合は、「誰が」を入力してください。'
      );
      return;
    }

    if (
      answerType === 'target' &&
      !target.trim()
    ) {
      setError(
        '答えを「誰に打ったか」にする場合は、「誰に」を入力してください。'
      );
      return;
    }

    if (
      answerType === 'technique' &&
      !technique.trim()
    ) {
      setError(
        '答えを「技名」にする場合は、「技名」を入力してください。'
      );
      return;
    }

    if (!imageFile) {
      setError(
        '打球画像を選択してください。'
      );
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();

      formData.append('image', imageFile);

      if (explanationImageFile) {
        formData.append(
          'explanationImage',
          explanationImageFile
        );
      }

      formData.append(
        'hitter',
        hitter.trim()
      );

      formData.append(
        'target',
        target.trim()
      );

      formData.append(
        'answerType',
        answerType
      );

      formData.append(
        'episode',
        episode.trim()
      );

      formData.append(
        'technique',
        technique.trim()
      );

      formData.append(
        'location',
        location.trim()
      );

      formData.append(
        'hand',
        hand.trim()
      );

      formData.append(
        'result',
        result.trim()
      );

      const res = await fetch(
        '/api/tenipuri/problems',
        {
          method: 'POST',
          body: formData,
        }
      );

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(
          data.error ||
            '問題の登録に失敗しました。'
        );
      }

      setMessage(
        '打球問題を登録しました！'
      );

      const currentMode = mode;

      resetForm();

      setMode(currentMode);
    } catch (e) {
      console.error(e);

      setError(
        e.message ||
          '問題の登録に失敗しました。'
      );
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // 投稿方法選択前
  // =========================================================

  if (!mode) {
    return (
      <main className="min-h-screen bg-sky-50 text-sky-900">
        <div className="max-w-xl mx-auto px-4 py-6">

          <header className="mb-6 flex items-center justify-between">

            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球問題を投稿
            </h1>

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

          <section className="rounded-2xl border-2 border-sky-200 bg-white p-5 shadow-sm">

            <h2 className="text-lg font-extrabold mb-2">
              問題の作成方法
            </h2>

            <p className="text-xs text-slate-600 mb-5">
              Excelに登録されている打球から選ぶか、自分で情報を入力できます。
            </p>

            <div className="space-y-3">

              <button
                type="button"
                onClick={() => {
                  setMode('search');
                  loadWazaList();
                }}
                className="w-full rounded-2xl border-2 border-indigo-400 bg-indigo-50 px-4 py-5 text-left hover:bg-indigo-100 transition"
              >
                <p className="font-extrabold text-indigo-900">
                  打球リストから探す
                </p>

                <p className="text-xs text-indigo-800 mt-1">
                  Excelに登録されている打球から選択します。
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setMode('manual');
                }}
                className="w-full rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-4 py-5 text-left hover:bg-emerald-100 transition"
              >
                <p className="font-extrabold text-emerald-900">
                  自分で設定する
                </p>

                <p className="text-xs text-emerald-800 mt-1">
                  Excelにない打球も自由に登録できます。
                </p>
              </button>

            </div>
          </section>

        </div>
      </main>
    );
  }

  // =========================================================
  // 投稿フォーム
  // =========================================================

  return (
    <main className="min-h-screen bg-sky-50 text-sky-900">
      <div className="max-w-2xl mx-auto px-4 py-6">

        <header className="mb-6 flex items-center justify-between">

          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold">
              打球問題を投稿
            </h1>

            <p className="text-xs text-slate-500 mt-1">
              {mode === 'search'
                ? '打球リストから選択'
                : '打球情報を自分で設定'}
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

        {/* =====================================================
            Excel検索
        ====================================================== */}

        {mode === 'search' && !selectedWaza && (
          <section className="mb-5 rounded-2xl border-2 border-indigo-200 bg-white p-4 shadow-sm">

            <h2 className="font-extrabold text-indigo-900 mb-3">
              打球を探す
            </h2>

            <input
              type="text"
              value={searchText}
              onChange={(e) =>
                setSearchText(e.target.value)
              }
              placeholder="キャラクター名・技名・話数などで検索"
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />

            <p className="text-[11px] text-slate-500 mt-2">
              {loadingWaza
                ? '打球データを読み込み中...'
                : `${filteredWaza.length}件を表示`}
            </p>

            {wazaError && (
              <p className="text-sm text-red-600 mt-3">
                {wazaError}
              </p>
            )}

            <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">

              {filteredWaza.map(
                (waza, index) => (
                  <button
                    key={`${waza.hitter}-${waza.target}-${waza.episode}-${index}`}
                    type="button"
                    onClick={() =>
                      selectWaza(waza)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-left hover:bg-indigo-50 hover:border-indigo-300 transition"
                  >

                    <div className="flex items-center gap-2">

                      <span className="font-extrabold text-indigo-900">
                        {waza.hitter || '不明'}
                      </span>

                      <span className="text-slate-400">
                        →
                      </span>

                      <span className="font-extrabold text-slate-800">
                        {waza.target || '不明'}
                      </span>

                    </div>

                    <div className="mt-1 text-[11px] text-slate-600">

                      {waza.episode &&
                        `${waza.episode}話`}

                      {waza.technique &&
                        `　${waza.technique}`}

                    </div>

                    {waza.location && (
                      <div className="text-[11px] text-slate-500 mt-1">
                        {waza.location}
                      </div>
                    )}

                  </button>
                )
              )}

              {!loadingWaza &&
                filteredWaza.length === 0 && (
                  <p className="text-sm text-slate-500 py-5 text-center">
                    該当する打球がありません。
                  </p>
                )}

            </div>

            <button
              type="button"
              onClick={() =>
                setMode(null)
              }
              className="mt-4 text-xs font-bold text-slate-500 underline"
            >
              ← 投稿方法を選び直す
            </button>

          </section>
        )}

        {(mode === 'manual' ||
          selectedWaza) && (
          <>

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
                  value={hitter}
                  onChange={setHitter}
                  placeholder="例：越前リョーマ"
                />

                <InputField
                  label="誰に打った？"
                  value={target}
                  onChange={setTarget}
                  placeholder="例：桃城武"
                />

                <div className="grid grid-cols-2 gap-3">

                  <InputField
                    label="話数"
                    value={episode}
                    onChange={setEpisode}
                    placeholder="例：3"
                  />

                  <InputField
                    label="技名"
                    value={technique}
                    onChange={setTechnique}
                    placeholder="例：ツイストサーブ"
                  />

                </div>

                <InputField
                  label="場所"
                  value={location}
                  onChange={setLocation}
                  placeholder="例：青春学園"
                />

                <div className="grid grid-cols-2 gap-3">

                  <InputField
                    label="右・左"
                    value={hand}
                    onChange={setHand}
                    placeholder="例：右"
                  />

                  <InputField
                    label="結果"
                    value={result}
                    onChange={setResult}
                    placeholder="例：エース"
                  />

                </div>

              </div>
            </section>

            {/* =================================================
                答えの設定
            ================================================== */}

            <section className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm">

              <h2 className="font-extrabold text-amber-900 mb-1">
                この問題では何を答えさせますか？
              </h2>

              <p className="text-xs text-amber-800 mb-4">
                ゲーム中にプレイヤーが入力する正解を選択してください。
              </p>

              <div className="space-y-2">

                <AnswerTypeOption
                  value="hitter"
                  checked={answerType === 'hitter'}
                  onChange={setAnswerType}
                  title="誰が打ったか"
                  answer={hitter}
                />

                <AnswerTypeOption
                  value="target"
                  checked={answerType === 'target'}
                  onChange={setAnswerType}
                  title="誰に打ったか"
                  answer={target}
                />

                <AnswerTypeOption
                  value="technique"
                  checked={answerType === 'technique'}
                  onChange={setAnswerType}
                  title="技名"
                  answer={technique}
                />

              </div>
            </section>

            {/* =================================================
                打球画像
            ================================================== */}

            <section className="mb-5 rounded-2xl border-2 border-sky-300 bg-white p-4 shadow-sm">

              <h2 className="font-extrabold mb-1">
                打球画像
              </h2>

              <p className="text-xs text-slate-500 mb-4">
                クイズ中に表示する画像を登録してください。
              </p>

              {imagePreview ? (

                <div className="mb-4">

                  <div className="rounded-xl overflow-hidden border border-slate-300 bg-slate-100">

                    <img
                      src={imagePreview}
                      alt="打球画像プレビュー"
                      className="w-full max-h-[400px] object-contain"
                    />

                  </div>

                  <button
                    type="button"
                    onClick={removeImage}
                    className="mt-2 text-xs font-bold text-red-600 underline"
                  >
                    画像を変更する
                  </button>

                </div>

              ) : null}

              <div
                onClick={() =>
                  fileInputRef.current?.click()
                }
                onDragEnter={handleImageDragOver}
                onDragOver={handleImageDragOver}
                onDragLeave={handleImageDragLeave}
                onDrop={handleImageDrop}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${
                  isImageDragging
                    ? 'border-sky-500 bg-sky-100 scale-[1.01]'
                    : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
                }`}
              >

                <p className="font-bold text-slate-700">
                  {isImageDragging
                    ? 'ここに画像をドロップ'
                    : imagePreview
                      ? '画像を変更する'
                      : '画像を選択'}
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  クリック・タップ、または画像をドラッグ＆ドロップ
                </p>

                <p className="text-[11px] text-slate-400 mt-2">
                  10MB以下の画像
                </p>

              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />

            </section>

            {/* =================================================
                解説画像
            ================================================== */}

            <section className="mb-5 rounded-2xl border-2 border-violet-300 bg-violet-50 p-4 shadow-sm">

              <h2 className="font-extrabold text-violet-900 mb-1">
                解説画像
              </h2>

              <p className="text-xs text-violet-800 mb-4">
                正解発表時などに表示する画像です。
                必要な場合のみ登録してください。
              </p>

              {explanationImagePreview ? (

                <div className="mb-4">

                  <div className="rounded-xl overflow-hidden border border-violet-200 bg-white">

                    <img
                      src={explanationImagePreview}
                      alt="解説画像プレビュー"
                      className="w-full max-h-[400px] object-contain"
                    />

                  </div>

                  <button
                    type="button"
                    onClick={removeExplanationImage}
                    className="mt-2 text-xs font-bold text-red-600 underline"
                  >
                    解説画像を変更する
                  </button>

                </div>

              ) : null}

              <div
                onClick={() =>
                  explanationFileInputRef.current?.click()
                }
                onDragEnter={handleExplanationImageDragOver}
                onDragOver={handleExplanationImageDragOver}
                onDragLeave={handleExplanationImageDragLeave}
                onDrop={handleExplanationImageDrop}
                className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-10 text-center transition ${
                  isExplanationImageDragging
                    ? 'border-violet-500 bg-violet-100 scale-[1.01]'
                    : 'border-violet-300 bg-white hover:bg-violet-100'
                }`}
              >

                <p className="font-bold text-violet-800">
                  {isExplanationImageDragging
                    ? 'ここに画像をドロップ'
                    : explanationImagePreview
                      ? '解説画像を変更する'
                      : '解説画像を選択'}
                </p>

                <p className="text-xs text-slate-500 mt-1">
                  クリック・タップ、または画像をドラッグ＆ドロップ
                </p>

                <p className="text-[11px] text-slate-400 mt-2">
                  ※登録しなくても問題ありません
                </p>

              </div>

              <input
                ref={explanationFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleExplanationImageChange}
                className="hidden"
              />

            </section>

            {/* =================================================
                確認
            ================================================== */}

            <section className="mb-5 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4">

              <h2 className="font-extrabold text-emerald-900 mb-4">
                登録内容
              </h2>

              <div className="space-y-1 text-sm">

                <p>
                  <span className="font-bold">
                    誰が：
                  </span>
                  {hitter || '未入力'}
                </p>

                <p>
                  <span className="font-bold">
                    誰に：
                  </span>
                  {target || '未入力'}
                </p>

                {episode && (
                  <p>
                    <span className="font-bold">
                      話数：
                    </span>
                    {episode}
                  </p>
                )}

                {technique && (
                  <p>
                    <span className="font-bold">
                      技名：
                    </span>
                    {technique}
                  </p>
                )}

                {location && (
                  <p>
                    <span className="font-bold">
                      場所：
                    </span>
                    {location}
                  </p>
                )}

                {hand && (
                  <p>
                    <span className="font-bold">
                      右・左：
                    </span>
                    {hand}
                  </p>
                )}

                {result && (
                  <p>
                    <span className="font-bold">
                      結果：
                    </span>
                    {result}
                  </p>
                )}

                <p>
                  <span className="font-bold">
                    打球画像：
                  </span>
                  {imageFile ? 'あり' : '未選択'}
                </p>

                <p>
                  <span className="font-bold">
                    解説画像：
                  </span>
                  {explanationImageFile ? 'あり' : 'なし'}
                </p>

                <p className="pt-2">
                  <span className="font-bold">
                    答えさせる内容：
                  </span>

                  <span className="font-extrabold text-amber-700">
                    {getAnswerTypeLabel(answerType)}
                  </span>
                </p>

                <p>
                  <span className="font-bold">
                    この問題の正解：
                  </span>

                  <span className="font-extrabold text-emerald-700">
                    {getAnswer(
                      answerType,
                      hitter,
                      target,
                      technique
                    ) || '未入力'}
                  </span>
                </p>

              </div>
            </section>

            {/* =================================================
                ボタン
            ================================================== */}

            <div className="flex flex-col gap-3">

              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="w-full rounded-2xl bg-emerald-500 px-4 py-4 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving
                  ? '登録中...'
                  : 'この問題を登録する'}
              </button>

              <button
                type="button"
                onClick={() => {
                  resetForm();

                  if (mode === 'search') {
                    setMode('search');
                  } else {
                    setMode(null);
                  }
                }}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                戻る
              </button>

            </div>

          </>
        )}

      </div>
    </main>
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
        name="answerType"
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
// 答えタイプ
// =============================================================

function getAnswerTypeLabel(answerType) {
  if (answerType === 'target') {
    return '誰に打ったか';
  }

  if (answerType === 'technique') {
    return '技名';
  }

  return '誰が打ったか';
}


// =============================================================
// 正解取得
// =============================================================

function getAnswer(
  answerType,
  hitter,
  target,
  technique
) {
  if (answerType === 'target') {
    return target;
  }

  if (answerType === 'technique') {
    return technique;
  }

  return hitter;
}


// =============================================================
// 入力欄
// =============================================================

function InputField({
  label,
  value,
  onChange,
  placeholder,
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
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300"
      />

    </label>
  );
}

