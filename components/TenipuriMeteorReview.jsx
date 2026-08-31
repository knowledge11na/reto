
'use client';

import { useState } from 'react';


// =========================================================
// 画像拡大モーダル
// =========================================================

function ImageModal({
  src,
  alt,
  onClose,
}) {
  if (!src) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 px-3 py-4"
      onClick={onClose}
    >
      <div
        className="relative max-w-6xl w-full max-h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >

        {/* 閉じるボタン */}

        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 z-10 w-10 h-10 rounded-full bg-black/80 border border-white/40 text-white text-xl font-bold hover:bg-black transition"
          aria-label="閉じる"
        >
          ×
        </button>


        {/* 画像 */}

        <div className="max-h-[90vh] overflow-auto rounded-xl bg-black border border-white/20 shadow-2xl">

          <img
            src={src}
            alt={alt || ''}
            className="block max-w-full h-auto mx-auto"
          />

        </div>

      </div>
    </div>
  );
}


// =========================================================
// メイン
// =========================================================

export default function TenipuriMeteorReview({
  questions = [],
}) {

  const [expandedImage, setExpandedImage] =
    useState(null);


  // =======================================================
  // データがない場合
  // =======================================================

  if (!Array.isArray(questions) || questions.length === 0) {

    return (
      <section className="rounded-2xl border border-slate-700 bg-slate-950/90 p-5 shadow-xl">

        <h2 className="text-lg font-extrabold text-white mb-2">
          今回の問題を振り返る
        </h2>

        <p className="text-sm text-slate-400">
          振り返る問題がありません。
        </p>

      </section>
    );
  }


  return (
    <section className="w-full rounded-2xl border border-slate-700 bg-slate-950/90 p-3 sm:p-5 shadow-xl">

      {/* =================================================
          タイトル
      ================================================== */}

      <div className="mb-5">

        <h2 className="text-lg sm:text-xl font-extrabold text-white">
          今回の問題を振り返る
        </h2>

        <p className="mt-1 text-xs text-slate-400">
          今回出題された打球問題を確認できます。
        </p>

      </div>


      {/* =================================================
          問題一覧
      ================================================== */}

      <div className="space-y-5">

        {questions.map((question, index) => {

          const isCorrect =
            question.isCorrect === true;

          const isTimeOut =
            question.userAnswerText === '（時間切れ）';


          return (
            <article
              key={`${question.question_id ?? 'question'}-${index}`}
              className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900"
            >

              {/* =================================================
                  問題ヘッダー
              ================================================= */}

              <div className="flex items-center justify-between gap-3 border-b border-slate-700 bg-slate-800/80 px-4 py-3">

                <div className="flex items-center gap-2">

                  <span className="rounded-full bg-slate-700 px-2.5 py-1 text-[11px] font-bold text-slate-200">
                    {index + 1}問目
                  </span>

                  {isCorrect ? (

                    <span className="rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-bold text-emerald-300">
                      正解
                    </span>

                  ) : isTimeOut ? (

                    <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                      時間切れ
                    </span>

                  ) : (

                    <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-[11px] font-bold text-rose-300">
                      不正解
                    </span>

                  )}

                </div>


                {question.question_id != null && (
                  <span className="text-[10px] text-slate-500">
                    ID: {question.question_id}
                  </span>
                )}

              </div>


              <div className="p-4">


                {/* =================================================
                    問題文
                ================================================== */}

                {question.text && (
                  <div className="mb-3">

                    <p className="text-sm font-extrabold text-yellow-300">
                      {question.text}
                    </p>

                  </div>
                )}


                {/* =================================================
                    問題画像
                ================================================== */}

                {question.image_url && (

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedImage({
                        src: question.image_url,
                        alt: '打球問題',
                      })
                    }
                    className="group block w-full overflow-hidden rounded-xl border border-slate-600 bg-black hover:border-yellow-300 transition"
                  >

                    <img
                      src={question.image_url}
                      alt="打球問題"
                      className="block w-full max-h-[500px] object-contain mx-auto"
                    />

                    <div className="border-t border-white/10 bg-black/70 px-3 py-2 text-center text-[11px] text-slate-300 group-hover:text-yellow-300">
                      タップして画像を拡大
                    </div>

                  </button>

                )}


                {/* =================================================
                    回答結果
                ================================================== */}

                <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950/70 p-3">

                  <div className="space-y-2 text-sm">

                    <div>

                      <span className="font-bold text-slate-400">
                        あなたの回答：
                      </span>

                      <span
                        className={
                          isCorrect
                            ? 'ml-2 font-extrabold text-emerald-300'
                            : 'ml-2 font-extrabold text-rose-300'
                        }
                      >
                        {question.userAnswerText || '（回答なし）'}
                      </span>

                    </div>


                    <div>

                      <span className="font-bold text-slate-400">
                        正解：
                      </span>

                      <span className="ml-2 font-extrabold text-yellow-300">
                        {question.correctAnswerText || '不明'}
                      </span>

                    </div>

                  </div>

                </div>


                {/* =================================================
                    打球情報
                ================================================== */}

                {(question.hitter ||
                  question.target ||
                  question.episode ||
                  question.technique ||
                  question.location ||
                  question.hand ||
                  question.result) && (

                  <div className="mt-3 rounded-xl border border-slate-700 bg-slate-800/50 p-3">

                    <p className="mb-2 text-xs font-extrabold text-slate-300">
                      打球情報
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-xs">

                      {question.hitter && (
                        <p>
                          <span className="text-slate-500">
                            誰が：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.hitter}
                          </span>
                        </p>
                      )}

                      {question.target && (
                        <p>
                          <span className="text-slate-500">
                            誰に：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.target}
                          </span>
                        </p>
                      )}

                      {question.episode && (
                        <p>
                          <span className="text-slate-500">
                            話数：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.episode}
                          </span>
                        </p>
                      )}

                      {question.technique && (
                        <p>
                          <span className="text-slate-500">
                            技名：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.technique}
                          </span>
                        </p>
                      )}

                      {question.location && (
                        <p>
                          <span className="text-slate-500">
                            場所：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.location}
                          </span>
                        </p>
                      )}

                      {question.hand && (
                        <p>
                          <span className="text-slate-500">
                            右・左：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.hand}
                          </span>
                        </p>
                      )}

                      {question.result && (
                        <p>
                          <span className="text-slate-500">
                            結果：
                          </span>{' '}
                          <span className="font-bold text-slate-200">
                            {question.result}
                          </span>
                        </p>
                      )}

                    </div>

                  </div>

                )}


                {/* =================================================
                    解説画像
                ================================================== */}

                <div className="mt-4">

                  <p className="mb-2 text-xs font-extrabold text-slate-300">
                    解説
                  </p>


                  {question.explanation_image_url ? (

                    <button
                      type="button"
                      onClick={() =>
                        setExpandedImage({
                          src:
                            question.explanation_image_url,
                          alt: '解説画像',
                        })
                      }
                      className="group block w-full overflow-hidden rounded-xl border border-slate-600 bg-black hover:border-sky-300 transition"
                    >

                      <img
                        src={
                          question.explanation_image_url
                        }
                        alt="解説画像"
                        className="block w-full max-h-[500px] object-contain mx-auto"
                      />

                      <div className="border-t border-white/10 bg-black/70 px-3 py-2 text-center text-[11px] text-slate-300 group-hover:text-sky-300">
                        タップして解説画像を拡大
                      </div>

                    </button>

                  ) : (

                    <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-5 text-center">

                      <p className="text-xs text-slate-500">
                        解説画像はありません。
                      </p>

                    </div>

                  )}

                </div>

              </div>

            </article>
          );
        })}

      </div>


      {/* =================================================
          画像拡大モーダル
      ================================================== */}

      {expandedImage && (

        <ImageModal
          src={expandedImage.src}
          alt={expandedImage.alt}
          onClose={() =>
            setExpandedImage(null)
          }
        />

      )}

    </section>
  );
}