// file: app/tenipuri/submit/page.js

'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';

export default function TenipuriSubmitPage() {
  const [mode, setMode] = useState(null); // search | manual

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

  // hitter = 誰が打ったか
  // target = 誰に打ったか
  const [answerType, setAnswerType] = useState('hitter');

  // =========================================================
  // 打球画像
  // =========================================================

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');

  // =========================================================
  // 解説画像
  // =========================================================

  const [explanationImageFile, setExplanationImageFile] =
    useState(null);

  const [explanationImagePreview, setExplanationImagePreview] =
    useState('');

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
  // 打球画像選択
  // =========================================================

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError(
        '打球画像には画像ファイルを選択してください。'
      );
      return;
    }

    // 10MBまで
    if (file.size > 10 * 1024 * 1024) {
      setError(
        '打球画像のサイズは10MB以下にしてください。'
      );
      return;
    }

    // 古いプレビューURLを破棄
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    const previewUrl =
      URL.createObjectURL(file);

    setImageFile(file);
    setImagePreview(previewUrl);
    setError('');
  };

  // =========================================================
  // 解説画像選択
  // =========================================================

  const handleExplanationImageChange = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      setError(
        '解説画像には画像ファイルを選択してください。'
      );
      return;
    }

    // 10MBまで
    if (file.size > 10 * 1024 * 1024) {
      setError(
        '解説画像のサイズは10MB以下にしてください。'
      );
      return;
    }

    // 古いプレビューURLを破棄
    if (explanationImagePreview) {
      URL.revokeObjectURL(
        explanationImagePreview
      );
    }

    const previewUrl =
      URL.createObjectURL(file);

    setExplanationImageFile(file);
    setExplanationImagePreview(previewUrl);
    setError('');
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

    // 打球画像
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }

    setImageFile(null);
    setImagePreview('');

    // 解説画像
    if (explanationImagePreview) {
      URL.revokeObjectURL(
        explanationImagePreview
      );
    }

    setExplanationImageFile(null);
    setExplanationImagePreview('');

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

    if (!hitter.trim()) {
      setError(
        '「誰が打ったか」を入力してください。'
      );
      return;
    }

    if (!target.trim()) {
      setError(
        '「誰に打ったか」を入力してください。'
      );
      return;
    }

    if (!imageFile) {
      setError(
        '打球画像を選択してください。'
      );
      return;
    }

    if (!answerType) {
      setError(
        '答えさせる内容を選択してください。'
      );
      return;
    }

    setSaving(true);

    try {
      const formData = new FormData();

      // =====================================================
      // 打球画像
      // =====================================================

      formData.append(
        'image',
        imageFile
      );

      // =====================================================
      // 解説画像
      // ※ 選択されている場合だけ送信
      // =====================================================

      if (explanationImageFile) {
        formData.append(
          'explanationImage',
          explanationImageFile
        );
      }

      // =====================================================
      // 問題情報
      // =====================================================

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

      // 投稿前のモードを維持
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

        {/* =====================================================
            エラー
        ====================================================== */}

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

        {/* =====================================================
            選択したExcelデータ
        ====================================================== */}

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

                <label
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer ${
                    answerType === 'hitter'
                      ? 'border-amber-500 bg-white'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >

                  <input
                    type="radio"
                    name="answerType"
                    value="hitter"
                    checked={
                      answerType === 'hitter'
                    }
                    onChange={() =>
                      setAnswerType('hitter')
                    }
                  />

                  <div>

                    <p className="font-extrabold">
                      誰が打ったか
                    </p>

                    <p className="text-xs text-slate-500">
                      正解：
                      {hitter || '未入力'}
                    </p>

                  </div>

                </label>

                <label
                  className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 cursor-pointer ${
                    answerType === 'target'
                      ? 'border-amber-500 bg-white'
                      : 'border-amber-200 bg-amber-50'
                  }`}
                >

                  <input
                    type="radio"
                    name="answerType"
                    value="target"
                    checked={
                      answerType === 'target'
                    }
                    onChange={() =>
                      setAnswerType('target')
                    }
                  />

                  <div>

                    <p className="font-extrabold">
                      誰に打ったか
                    </p>

                    <p className="text-xs text-slate-500">
                      正解：
                      {target || '未入力'}
                    </p>

                  </div>

                </label>

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

              ) : (

                <div
                  onClick={() =>
                    fileInputRef.current?.click()
                  }
                  className="cursor-pointer rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-center hover:bg-slate-100 transition"
                >

                  <p className="font-bold text-slate-700">
                    画像を選択
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    タップまたはクリックして画像を選択
                  </p>

                </div>

              )}

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
                    onClick={
                      removeExplanationImage
                    }
                    className="mt-2 text-xs font-bold text-red-600 underline"
                  >
                    解説画像を変更する
                  </button>

                </div>

              ) : (

                <div
                  onClick={() =>
                    explanationFileInputRef.current?.click()
                  }
                  className="cursor-pointer rounded-xl border-2 border-dashed border-violet-300 bg-white px-4 py-12 text-center hover:bg-violet-100 transition"
                >

                  <p className="font-bold text-violet-800">
                    解説画像を選択
                  </p>

                  <p className="text-xs text-slate-500 mt-1">
                    タップまたはクリックして画像を選択
                  </p>

                  <p className="text-[11px] text-slate-400 mt-2">
                    ※登録しなくても問題ありません
                  </p>

                </div>

              )}

              <input
                ref={explanationFileInputRef}
                type="file"
                accept="image/*"
                onChange={
                  handleExplanationImageChange
                }
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

                <p>
                  <span className="font-bold">
                    打球画像：
                  </span>

                  {imageFile
                    ? 'あり'
                    : '未選択'}
                </p>

                <p>
                  <span className="font-bold">
                    解説画像：
                  </span>

                  {explanationImageFile
                    ? 'あり'
                    : 'なし'}
                </p>

                <p className="pt-2">
                  <span className="font-bold">
                    この問題の正解：
                  </span>

                  <span className="font-extrabold text-emerald-700">
                    {answerType === 'hitter'
                      ? hitter || '未入力'
                      : target || '未入力'}
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