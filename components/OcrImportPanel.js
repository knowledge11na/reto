// file: components/OcrImportPanel.js
'use client';

import { useState, useRef } from 'react';
import { createWorker } from 'tesseract.js';
import { parseAllQuestionsFromOcrText } from '@/lib/ocrParser';

/**
 * props:
 *   onApply(questionObject)
 *     questionObject は ocrParser の戻り値そのまま
 *     { questionType, question, correctChoices, wrongChoices, orderChoices, textAnswer }
 */
export default function OcrImportPanel({ onApply }) {
  const [tab, setTab] = useState('text'); // text | video
  const [rawText, setRawText] = useState('');
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const videoRef = useRef(null);

  const handleParseText = () => {
    setMessage('');
    const list = parseAllQuestionsFromOcrText(rawText);
    if (!list.length) {
      setMessage('問題を読み取れませんでした。OCR結果のテキストを確認してください。');
    }
    setQuestions(list);
  };

  // 動画ファイルを読み取って OCR → rawText に反映
  const handleVideoFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setMessage('動画から文字を読み取り中です…（時間がかかる場合があります）');
    setLoading(true);
    setProgress(0);
    setQuestions([]);
    setRawText('');

    try {
      const text = await ocrVideoFile(file, setProgress, videoRef);
      setRawText(text);
      const list = parseAllQuestionsFromOcrText(text);
      if (!list.length) {
        setMessage('文字は読み取れましたが、問題形式として認識できませんでした。テキストを修正してから再解析してください。');
      } else {
        setMessage(`動画から ${list.length} 問 読み取りました。`);
      }
      setQuestions(list);
    } catch (e) {
      console.error(e);
      setMessage('動画のOCR中にエラーが発生しました。');
    } finally {
      setLoading(false);
      setProgress(0);
      event.target.value = '';
    }
  };

  const handleApply = (q) => {
    if (!onApply) return;
    onApply(q);
    setMessage('この問題をフォームに反映しました。');
  };

  return (
    <div className="mt-6 border border-slate-700 rounded-xl bg-slate-900/60 p-4 text-xs text-slate-100">
      <div className="flex justify-between items-center mb-2">
        <h2 className="font-semibold text-sm">問題読み込み（動画 / テキスト）</h2>
        <div className="inline-flex rounded-full overflow-hidden border border-slate-600 text-[11px]">
          <button
            type="button"
            onClick={() => setTab('text')}
            className={`px-2 py-1 ${
              tab === 'text'
                ? 'bg-sky-600 text-black'
                : 'bg-slate-900 text-slate-200'
            }`}
          >
            テキスト
          </button>
          <button
            type="button"
            onClick={() => setTab('video')}
            className={`px-2 py-1 ${
              tab === 'video'
                ? 'bg-sky-600 text-black'
                : 'bg-slate-900 text-slate-200'
            }`}
          >
            動画から
          </button>
        </div>
      </div>

      {tab === 'text' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-300">
            画面録画やスクショをOCRしたテキストをここに貼り付けて「解析」を押すと、
            Q/A形式から自動で問題を分割します。
          </p>
          <textarea
            className="w-full h-32 rounded bg-slate-950 border border-slate-700 px-2 py-1 text-[11px]"
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            placeholder={'Q\n【並び替え】\n1.ローラ\n2.ホグバック\n...\nA 2134\n\nQ\n...'}
          />
          <button
            type="button"
            onClick={handleParseText}
            className="px-3 py-1 rounded bg-sky-500 text-black font-semibold"
          >
            解析して一覧に追加
          </button>
        </div>
      )}

      {tab === 'video' && (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-300">
            アプリの問題一覧をスクロールしながら画面録画した動画を選択すると、
            数秒ごとにフレームを切り出してOCRします。（長い動画はかなり時間がかかります）
          </p>
          <input
            type="file"
            accept="video/*"
            onChange={handleVideoFile}
            className="text-[11px]"
          />
          {loading && (
            <div className="mt-2">
              <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-1 bg-sky-400"
                  style={{ width: `${Math.round(progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-slate-300">
                OCR中… {Math.round(progress * 100)}%
              </p>
            </div>
          )}
          {/* 非表示の video（フレーム切り出し用） */}
          <video
            ref={videoRef}
            style={{ display: 'none' }}
            playsInline
            muted
          />
        </div>
      )}

      {message && (
        <div className="mt-2 text-[11px] text-slate-200 bg-slate-800/80 rounded px-2 py-1">
          {message}
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-3 max-h-60 overflow-y-auto space-y-2 border-t border-slate-700 pt-2">
          {questions.map((q, idx) => (
            <div
              key={idx}
              className="border border-slate-700 rounded-lg p-2 bg-slate-950/60"
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800">
                  {idx + 1}問目 / {q.questionType}
                </span>
                <button
                  type="button"
                  onClick={() => handleApply(q)}
                  className="px-2 py-0.5 rounded bg-emerald-400 text-black text-[11px] font-semibold"
                >
                  この問題をフォームに反映
                </button>
              </div>
              <div className="text-[11px] whitespace-pre-wrap mb-1">
                {q.question}
              </div>
              {q.questionType === 'order' && q.orderChoices?.length > 0 && (
                <div className="text-[10px] text-slate-300">
                  並び替え順:
                  {q.orderChoices.map((o, i) => (
                    <span
                      key={i}
                      className="inline-block ml-1 px-1 py-[1px] rounded bg-slate-800"
                    >
                      {i + 1}. {o}
                    </span>
                  ))}
                </div>
              )}
              {(q.questionType === 'single' || q.questionType === 'multi') &&
                q.correctChoices?.length > 0 && (
                  <div className="text-[10px] text-slate-300">
                    正解:
                    {q.correctChoices.map((o, i) => (
                      <span
                        key={i}
                        className="inline-block ml-1 px-1 py-[1px] rounded bg-emerald-700/60"
                      >
                        {o}
                      </span>
                    ))}
                  </div>
                )}
              {q.textAnswer && q.questionType === 'text' && (
                <div className="text-[10px] text-slate-300">
                  記述の答え候補: {q.textAnswer}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =======================
// 動画 → OCRテキスト
// =======================

async function ocrVideoFile(file, setProgress, videoRef) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = videoRef.current;
    if (!video) {
      URL.revokeObjectURL(url);
      reject(new Error('video element not ready'));
      return;
    }

    video.src = url;
    video.currentTime = 0;

    video.onloadedmetadata = async () => {
      try {
        const duration = video.duration || 0;
        const step = 1; // 1秒ごとにフレームを抽出
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const worker = await createWorker('jpn+eng');

        let allText = '';

        const captureAt = async (time) => {
          return new Promise((res) => {
            const onSeeked = async () => {
              video.removeEventListener('seeked', onSeeked);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const { data } = await worker.recognize(canvas);
              allText += '\n' + (data.text || '');
              const ratio = duration ? Math.min(time / duration, 1) : 1;
              setProgress?.(ratio);
              res();
            };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = Math.min(time, duration);
          });
        };

        for (let t = 0; t <= duration; t += step) {
          // 長すぎる動画の保険（例: 5分で打ち切り）
          if (t > 300) break;
          // eslint-disable-next-line no-await-in-loop
          await captureAt(t);
        }

        await worker.terminate();
        URL.revokeObjectURL(url);
        resolve(allText);
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('動画の読み込みに失敗しました'));
    };
  });
}
