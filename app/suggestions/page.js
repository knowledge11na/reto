// file: app/suggestions/page.js
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const cardStyle = { maxWidth: 560 };

function clip(s, max) {
  const t = String(s ?? '');
  return t.length > max ? t.slice(0, max) : t;
}

function buildCpuBody({ cpuName, teams, reason }) {
  const name = (cpuName || '').trim();
  const rsn = (reason || '').trim();

  const lines = [];
  lines.push(`【CPU案】`);
  lines.push(`CPU名：${name || '（未入力）'}`);
  lines.push('');

  for (let i = 0; i < 5; i++) {
    const t = teams?.[i] || {};
    const teamName = (t?.team || '').trim();
    const bib = (t?.bib || '').trim();
    lines.push(`チーム${i + 1}：${teamName || '（未入力）'}${bib ? `（ビブカ№${bib}）` : ''}`);
  }

  lines.push('');
  lines.push(`投稿理由：${rsn || '（未入力）'}`);

  return lines.join('\n');
}

export default function SuggestionsPage() {
  const [me, setMe] = useState(null);
  const [loadingMe, setLoadingMe] = useState(true);

  // category: general / bug / cpu / balance / other
  const [category, setCategory] = useState('general');

  // general text
  const [body, setBody] = useState('');

  // cpu form
  const [cpuName, setCpuName] = useState('');
  const [teams, setTeams] = useState([
    { team: '', bib: '' },
    { team: '', bib: '' },
    { team: '', bib: '' },
    { team: '', bib: '' },
    { team: '', bib: '' },
  ]);
  const [reason, setReason] = useState('');

  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => setMe(d?.user ?? null))
      .catch(() => setMe(null))
      .finally(() => setLoadingMe(false));
  }, []);

  const placeholderByCategory = useMemo(() => {
    if (category === 'general') {
      return '例）ホーム画面のボタン配置をこうしてほしい、文字が見づらいので色を濃くしてほしい、こんなゲームを思いついたので採用して欲しい、誕生日を覚えられるゲームが欲しいなど';
    }
    if (category === 'bug') {
      return '例）〇〇ページでボタンを押すとエラーになる／画面が真っ白になる／戻れない、など\n再現手順：1) 2) 3)';
    }
    if (category === 'balance') {
      return '例）ソロゲーム仕分けでキャラが早く動いたり制限時間が短くなったり3秒間1箇所仕切りが閉まるなどのハードモードが欲しい、隕石クラッシュの隕石がゆっくり落ちて来るイージーモードが欲しい、などのバランス調整案';
    }
    if (category === 'other') {
      return '例）その他なんでも';
    }
    return '';
  }, [category]);

  const cpuExamples = useMemo(() => {
    return {
      cpuName: '曲芸戦士',
      teams: [
        { team: 'ブラハム', bib: '296' },
        { team: 'ゲンボウ', bib: '295' },
        { team: 'オーム', bib: '299' },
        { team: 'ヤマ', bib: '301' },
        { team: 'ホトリ', bib: '307' },
      ],
      reason:
        '曲芸戦士：ゾロ→オームの呼び方　チーム：サバイバル脱落順（など）自分自身をキャラとして採用したい場合は好きなCPU名と好きなキャラ5体とレート希望のレート帯（1700～1750）などを記載',
    };
  }, []);


  const composedBody = useMemo(() => {
    if (category === 'cpu') {
      return buildCpuBody({ cpuName, teams, reason });
    }
    return body;
  }, [category, body, cpuName, teams, reason]);

  const bodyLen = useMemo(() => (composedBody || '').length, [composedBody]);

  const canSend = useMemo(() => {
    if (!me || sending) return false;

    if (category === 'cpu') {
      // CPU案は CPU名 か 投稿理由 どっちか最低入ってればOK（厳しければ変えられる）
      const hasSomething =
        (cpuName || '').trim().length > 0 ||
        (reason || '').trim().length > 0 ||
        teams.some((t) => (t.team || '').trim().length > 0 || (t.bib || '').trim().length > 0);

      return hasSomething && bodyLen <= 3000;
    }

    const len = (body || '').trim().length;
    return len >= 5 && len <= 1000;
  }, [me, sending, category, body, cpuName, reason, teams, bodyLen]);

  const onSubmit = async () => {
    if (!canSend) return;
    setSending(true);
    setMsg('');

    try {
      const payloadBody =
        category === 'cpu'
          ? clip(composedBody, 3000)
          : clip((body || '').trim(), 1000);

      const res = await fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
  category,
  body: payloadBody,
  userName: me?.display_name ?? me?.username ?? null,
  userId: me?.id ?? null,
}),

      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setMsg(
          data?.message ||
            data?.error ||
            `送信に失敗しました（status=${res.status}）`
        );
        return;
      }

      setMsg('送信しました！運営が確認します。');

      // reset
      setBody('');
      setCpuName('');
      setTeams([
        { team: '', bib: '' },
        { team: '', bib: '' },
        { team: '', bib: '' },
        { team: '', bib: '' },
        { team: '', bib: '' },
      ]);
      setReason('');
      setCategory('general');
    } catch (e) {
      console.error(e);
      setMsg('送信中にエラーが発生しました。');
    } finally {
      setSending(false);
    }
  };

  const setTeamField = (idx, key, value) => {
    setTeams((prev) => {
      const next = [...prev];
      next[idx] = { ...(next[idx] || {}), [key]: value };
      return next;
    });
  };

  const fillCpuExample = () => {
    setCpuName(cpuExamples.cpuName);
    setTeams(cpuExamples.teams.map((t) => ({ team: t.team, bib: t.bib })));
    setReason(cpuExamples.reason);
  };

  return (
    <div className="min-h-screen bg-sky-50 text-sky-900 px-4 py-8 flex justify-center">
      <div className="w-full" style={cardStyle}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-extrabold">📮 目安箱</h1>
          <Link
            href="/"
            className="px-3 py-1 rounded-full text-sm font-bold text-sky-700 bg-white border border-sky-300 shadow-sm hover:bg-sky-50"
          >
            ホームへ
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-sky-200 shadow-sm p-4">
          {loadingMe ? (
            <p className="text-sm text-slate-600">読み込み中…</p>
          ) : !me ? (
            <div className="space-y-2">
              <p className="text-sm text-rose-700 font-bold">
                目安箱の送信にはログインが必要です。
              </p>
              <Link
                href="/login"
                className="inline-block px-4 py-2 rounded-lg bg-sky-500 text-white font-bold"
              >
                ログインへ
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* カテゴリ */}
              <div className="space-y-1">
                <div className="text-sm font-bold">ジャンル</div>
                <select
  className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-sky-50"
  value={category}
  onChange={(e) => {
    const v = e.target.value;
    setCategory(v);
    setMsg('');
  }}
>
  <option value="general">意見・改善案</option>
  <option value="bug">問題以外の不具合報告</option>
  <option value="cpu">CPU案</option>
  <option value="balance">バランス調整</option>
  <option value="other">その他</option>
</select>

              </div>

              {/* CPUフォーム */}
              {category === 'cpu' ? (
                <div className="space-y-4">
                                  <div className="text-sm font-extrabold text-sky-900">
                    CPU案フォーム
                  </div>

                  {/* CPU名 */}
                  <div className="space-y-1">
                    <div className="text-sm font-bold">CPU名</div>
                    <input
                      className="w-full px-3 py-2 rounded-lg border border-sky-200 bg-white"
                      value={cpuName}
                      onChange={(e) => setCpuName(e.target.value)}
                      placeholder="例）曲芸戦士"
                    />
                  </div>

                  {/* チーム1〜5 */}
                  <div className="space-y-2">
                    <div className="text-sm font-bold">チーム編成（最大5）</div>

                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-12 sm:col-span-2 text-xs font-bold text-slate-700">
                          チーム{i + 1}
                        </div>

                        <input
                          className="col-span-12 sm:col-span-7 px-3 py-2 rounded-lg border border-sky-200 bg-white text-sm"
                          value={teams[i]?.team ?? ''}
                          onChange={(e) => setTeamField(i, 'team', e.target.value)}
placeholder={i === 0 ? '例）ブラハム' : i === 1 ? '例）ゲンボウ' : i === 2 ? '例）オーム' : i === 3 ? '例）ヤマ' : '例）ホトリ'}                          
                        />

                        <div className="col-span-12 sm:col-span-3 flex items-center gap-2">
                          <span className="text-[11px] font-bold text-slate-600 whitespace-nowrap">
                            ビブカ№
                          </span>
                          <input
                            className="w-full px-2 py-2 rounded-lg border border-sky-200 bg-sky-50 text-sm"
                            value={teams[i]?.bib ?? ''}
                            onChange={(e) => setTeamField(i, 'bib', e.target.value)}
                            placeholder={i === 0 ? '例）296' : i === 1 ? '例）295' : i === 2 ? '例）299' : i === 3 ? '例）301' : '例）307'}

                            inputMode="numeric"
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* 投稿理由 */}
                  <div className="space-y-1">
                    <div className="text-sm font-bold">投稿理由</div>
                    <textarea
                      className="w-full min-h-[120px] px-3 py-2 rounded-lg border border-sky-200 bg-white"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={'例）曲芸戦士：ゾロ→オームの呼び方\nチーム：サバイバル脱落順\n（自分自身をCPUとして採用したい場合：CPU名＋キャラ5体＋希望レート帯（例 1700〜1750）など）'}

                    />
                  </div>

                  {/* 送信される内容プレビュー（任意） */}
                  <details className="bg-sky-50 border border-sky-200 rounded-xl p-3">
                    <summary className="cursor-pointer text-xs font-bold text-sky-800">
                      送信内容プレビュー（管理者にこう見えます）
                    </summary>
                    <pre className="mt-2 text-xs whitespace-pre-wrap text-slate-800">
                      {composedBody}
                    </pre>
                  </details>

                  <div className="text-xs text-slate-500">
                    {bodyLen}/3000
                  </div>
                </div>
              ) : (
                // 通常フォーム
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-bold">内容</div>
                    <div
                      className={`text-xs ${
                        bodyLen > 1000
                          ? 'text-rose-600 font-bold'
                          : 'text-slate-500'
                      }`}
                    >
                      {bodyLen}/1000
                    </div>
                  </div>
                  <textarea
                    className="w-full min-h-[160px] px-3 py-2 rounded-lg border border-sky-200 bg-white"
                    placeholder={placeholderByCategory}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend}
                className="w-full px-4 py-3 rounded-full bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white font-extrabold shadow"
              >
                {sending ? '送信中…' : '運営に送信する'}
              </button>

              {!canSend && category === 'cpu' && (
                <div className="text-[11px] text-slate-600">
                  ※ CPU名 / チーム / 投稿理由のどれかを入力すると送信できます。
                </div>
              )}

              {msg && (
                <div className="text-sm font-bold text-sky-900 bg-sky-100 border border-sky-200 rounded-xl p-3 whitespace-pre-line">
                  {msg}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
