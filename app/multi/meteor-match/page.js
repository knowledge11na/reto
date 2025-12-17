// file: app/multi/meteor-match/page.js
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';

let socket;

export default function MeteorMatchPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);

  const [queueSize, setQueueSize] = useState(0);
  const [matching, setMatching] = useState(false);
  const [connected, setConnected] = useState(false);
  const [log, setLog] = useState([]);

  const [matchedInfo, setMatchedInfo] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const countdownRef = useRef(null);

  const addLog = (msg) => setLog((prev) => [...prev, msg]);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setMe(d.user ?? null))
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    if (!socket) {
      const url =
        process.env.NEXT_PUBLIC_SOCKET_URL ||
        (typeof window !== 'undefined'
          ? `${window.location.protocol}//${window.location.hostname}:4000`
          : 'http://localhost:4000');

      socket = io(url, { transports: ['websocket'] });
    }

    const s = socket;

    const onConnect = () => {
      setConnected(true);
      addLog(`接続: ${s.id}`);
    };

    const onConnectError = () => {
      setConnected(false);
      addLog('socket接続エラー');
    };

    const onQueueUpdated = (payload) => {
      setQueueSize(payload.size ?? 0);
    };

    const onMatched = (payload) => {
      setMatching(false);

      if (!payload?.roomId) {
        addLog('マッチ失敗（roomIdなし）');
        return;
      }

      const myName = me?.display_name || me?.username || '自分';
      const oppName =
        payload.opponentDisplayName ||
        payload.opponentName ||
        payload.opponent ||
        '相手';

      addLog(`マッチング成立: room=${payload.roomId} vs ${oppName}`);

      setMatchedInfo({
        roomId: payload.roomId,
        myName,
        oppName,
      });

      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }

      let current = 5;
      setCountdown(current);

      countdownRef.current = setInterval(() => {
        current -= 1;
        if (current <= 0) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
          router.push(`/multi/meteor/battle?room=${payload.roomId}`);
        } else {
          setCountdown(current);
        }
      }, 1000);
    };

    s.on('connect', onConnect);
    s.on('connect_error', onConnectError);
    s.on('meteor:queue-updated', onQueueUpdated);
    s.on('meteor:matched', onMatched);

    return () => {
      s.off('connect', onConnect);
      s.off('connect_error', onConnectError);
      s.off('meteor:queue-updated', onQueueUpdated);
      s.off('meteor:matched', onMatched);
    };
  }, [router, me]);

  useEffect(() => {
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, []);

  const handleStart = () => {
    if (!socket) return;
    if (!me) {
      alert('マルチはログインが必要です');
      return;
    }

    setMatching(true);
    setMatchedInfo(null);
    setCountdown(5);

    socket.emit('meteor:join-queue', {
      name: me.display_name || me.username || 'プレイヤー',
      userId: me.id ?? null,
    });
  };

  const handleCancel = () => {
    if (!socket) return;
    setMatching(false);
    socket.emit('meteor:leave-queue');
    addLog('マッチングをキャンセルしました');
  };

  return (
    <main className="min-h-screen bg-sky-50 flex flex-col items-center">
      <header className="w-full max-w-md px-4 pt-6 flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-sky-900">
          マルチ：隕石クラッシュ
        </h1>
        <button
          onClick={() => router.push('/')}
          className="text-xs underline text-sky-700"
        >
          ホームへ戻る
        </button>
      </header>

      <section className="w-full max-w-md px-4 mt-4 space-y-4">
        <div className="bg-white rounded-2xl shadow p-4 space-y-2 text-sky-900">
          <p className="text-sm">
            プレイヤー:{' '}
            <span className="font-bold">
              {me ? me.display_name || me.username : '未ログイン'}
            </span>
          </p>

          <p className="text-xs text-slate-600">
            ソケット接続: <span className="font-bold">{connected ? '接続中' : '未接続'}</span>
          </p>

          <p className="text-xs text-slate-600">
            キュー内プレイヤー数: {queueSize}人
          </p>

          {!matching && !matchedInfo && (
            <button
              onClick={handleStart}
              className="mt-3 w-full py-3 rounded-full bg-sky-500 text-white font-bold text-sm"
            >
              マッチングを開始する
            </button>
          )}

          {matching && (
            <div className="mt-3 space-y-2">
              <p className="text-sm font-bold">マッチング中…</p>
              <p className="text-xs text-slate-600">
                相手が見つかると自動で対戦画面へ移動します。
              </p>
              <button
                onClick={handleCancel}
                className="w-full py-2 rounded-full bg-slate-200 text-slate-700 text-xs"
              >
                キャンセル
              </button>
            </div>
          )}
        </div>

        {matchedInfo && (
          <div className="bg-white rounded-2xl shadow p-4 text-center text-sky-900 space-y-3">
            <p className="font-bold">マッチングしました</p>
            <p className="text-sm">
              {matchedInfo.myName} vs {matchedInfo.oppName}
            </p>
            <p className="text-xs text-slate-600 mt-2">対戦開始まで…</p>
            <p className="text-2xl font-extrabold text-sky-700">{countdown}</p>
          </div>
        )}

        {log.length > 0 && (
          <div className="bg-white rounded-xl shadow p-3 text-sky-900">
            <details className="text-xs text-slate-600" open>
              <summary>ログ</summary>
              <ul className="mt-1 space-y-0.5">
                {log.map((l, i) => (
                  <li key={i}>・{l}</li>
                ))}
              </ul>
            </details>
          </div>
        )}

        <div className="text-[11px] text-slate-600">
          ルール：3つの隕石がどちらかに向かいます。正解で打ち返し、時間切れで被弾。
          相手の残り時間（HP）を0にしたら勝ち（レート変動なし）。
        </div>
      </section>
    </main>
  );
}
