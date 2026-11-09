'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import io from 'socket.io-client';

const box = 'rounded-xl border border-slate-300 bg-white p-4 shadow-sm';
const button = 'rounded-lg bg-blue-700 px-4 py-2 font-bold text-white disabled:opacity-40';
const input = 'rounded border border-slate-400 bg-white px-2 py-1 text-slate-900';
const colors = { green: 'bg-green-500 text-white', yellow: 'bg-yellow-300', gray: 'bg-gray-300', up: 'bg-blue-500 text-white', down: 'bg-red-500 text-white' };

function Settings({ game, send }) {
  const [mode, setMode] = useState('battle-normal');
  const [stella, setStella] = useState('random');
  const [minutes, setMinutes] = useState(2);
  const [stealthCount, setStealthCount] = useState(1);
  const [discussion, setDiscussion] = useState(120);
  const [symbolsOpen, setSymbolsOpen] = useState(true);
  const punk = game.kind === 'punk';
  return (
    <section className={`${box} space-y-4`}>
      <h2 className="text-xl font-bold">{punk ? 'ルール設定' : 'モードを選択'}</h2>
      {!game.host && <p>部屋主が設定しています。</p>}
      <fieldset disabled={!game.host} className="grid gap-3 disabled:opacity-60">
        {punk ? <>
          <label>回答者（ステラ） <select className={input} value={stella} onChange={(e) => setStella(e.target.value)}>
            <option value="random">ランダム</option>
            {game.players.map((p, i) => <option key={i} value={i}>{p.name}</option>)}
          </select></label>
          <p>欲（ヨーク）は1人固定です。</p>
          <label>入力時間 <select className={input} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {Array.from({ length: 30 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}分</option>)}
          </select></label>
          <label>ヨークの特殊入力回数 <select className={input} value={stealthCount} onChange={(e) => setStealthCount(Number(e.target.value))}>
            {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}回</option>)}
          </select></label>
          <label>議論時間 <select className={input} value={discussion} onChange={(e) => setDiscussion(Number(e.target.value))}>
            {[30, 60, 90, 120, 180, 300].map((n) => <option key={n} value={n}>{n}秒</option>)}
          </select></label>
          <label><input type="checkbox" checked={symbolsOpen} onChange={(e) => setSymbolsOpen(e.target.checked)} /> 記号をフルオープン</label>
        </> : <select className={input} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="battle-normal">対戦ノーマル</option>
          <option value="battle-hard">対戦ハード</option>
          <option value="party-normal">パーティーノーマル</option>
          <option value="party-hard">パーティーハード</option>
        </select>}
        <button className={button} disabled={game.players.some((p) => !p.connected)} onClick={() => send('start', { settings: punk ? { stella, minutes, stealthCount, discussion, symbolsOpen } : { mode } })}>
          開始
        </button>
      </fieldset>
      {game.players.some((p) => !p.connected) && <p>全員が接続するまでお待ちください。</p>}
    </section>
  );
}

function Punk({ game, send }) {
  const [answer, setAnswer] = useState('');
  const [stealthIndex, setStealthIndex] = useState('');
  const [stealthValue, setStealthValue] = useState('');
  const [hidden, setHidden] = useState([]);
  const [vote, setVote] = useState('');
  const author = game.you !== game.stella;
  const symbols = game.template?.map((value, index) => value !== null ? index : null).filter((index) => index !== null) || [];
  return <>
    <div className={box}>
      <p>回答者：{game.players[game.stella].name} ／ あなた：{(Array.isArray(game.role) ? game.role[game.you] : game.role) === 'stella' ? 'ステラ' : (Array.isArray(game.role) ? game.role[game.you] : game.role) === 'york' ? '欲（ヨーク）' : 'サテライト'}</p>
      {game.character && <p className="font-bold">お題：{game.character}</p>}
      {game.message && <p>{game.message}</p>}
    </div>
    {game.phase === 'input' && (author ? <>
      <section className={box}>
        <p>全文を入力できます。黄色の担当マスだけが採用されます。他の人の入力は見えません。</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {game.template.map((char, index) => char !== null
            ? <span key={index} className="grid h-10 w-10 place-items-center rounded bg-slate-200">{char}</span>
            : <input key={index} aria-label={`${index + 1}文字目`} className={`h-10 w-10 rounded border text-center ${game.owners[index] === game.you ? 'border-yellow-600 bg-yellow-100' : 'border-slate-300'}`}
              defaultValue={game.draft[index]} onChange={(e) => send('draft', { index, value: e.target.value })} />)}
        </div>
      </section>
      {game.role === 'york' && <section className={`${box} space-y-2`}>
        <h2 className="font-bold">ヨークのステルス（残り{game.stealthLeft}回）</h2>
        <button className={button} disabled={!game.stealth.length} onClick={() => send('undo-stealth')}>直前のステルスを取り消す</button>
        <div className="flex flex-wrap gap-2">
          <select className={input} value={stealthIndex} onChange={(e) => setStealthIndex(e.target.value)}>
            <option value="">変更する位置</option>
            {game.owners.map((owner, index) => owner !== null && owner !== game.you && <option key={index} value={index}>{index + 1}文字目（{game.players[owner].name}）</option>)}
          </select>
          <input className={input} value={stealthValue} onChange={(e) => setStealthValue(e.target.value)} placeholder="変更する文字" />
          <button className={button} disabled={!game.stealthLeft || stealthIndex === '' || !stealthValue} onClick={() => { send('stealth', { index: Number(stealthIndex), value: stealthValue }); setStealthValue(''); }}>文字を変更</button>
        </div>
        {symbols.length > 0 && <div>
          <p>隠す記号（1回につき最大3個）</p>
          <div className="flex flex-wrap gap-1">{symbols.map((index) => <button key={index} type="button" className={`rounded border px-2 ${hidden.includes(index) ? 'bg-yellow-300' : 'bg-white'}`} onClick={() => setHidden((old) => old.includes(index) ? old.filter((i) => i !== index) : old.length < 3 ? [...old, index] : old)}>{index + 1}: {game.template[index]}</button>)}</div>
          <button className={button} disabled={!hidden.length || !game.stealthLeft} onClick={() => { send('hide-symbols', { indexes: hidden }); setHidden([]); }}>記号を隠す</button>
        </div>}
      </section>}
    </> : <div className={box}>他のプレイヤーが同時に説明文を入力しています。制限時間終了後に表示されます。</div>)}
    {game.composed && <section className={box}>
      <h2 className="font-bold">完成した説明文</h2>
      <div className="mt-2 flex flex-wrap gap-1">{game.composed.map((char, index) => char && <span key={index} className="grid min-h-10 min-w-10 place-items-center rounded border bg-slate-50 text-lg">{char}</span>)}</div>
    </section>}
    {game.phase === 'answer' && (game.you === game.stella
      ? <form className={`${box} flex gap-2`} onSubmit={(e) => { e.preventDefault(); send('answer', { answer }); }}><input className={input} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="キャラクター名" /><button className={button}>回答</button></form>
      : <div className={box}>回答者が考えています。</div>)}
    {game.phase === 'discussion' && <section className={`${box} space-y-2`}>
      <h2 className="font-bold">ヨークを探そう</h2>
      {game.you === game.stella ? <div className="flex gap-2"><select className={input} value={vote} onChange={(e) => setVote(e.target.value)}><option value="">ヨークを選択</option>{game.players.map((p, i) => i !== game.stella && <option key={i} value={i}>{p.name}</option>)}</select><button className={button} disabled={vote === ''} onClick={() => send('vote', { target: Number(vote) })}>確定</button></div> : <p>ステラがヨークを選択します。</p>}
    </section>}
    {game.phase === 'result' && <section className={`${box} space-y-2`}>
      <h2 className="text-xl font-bold">{game.winner === 'stella' ? 'ベガパンク側の勝利' : 'ヨーク側の勝利'}</h2>
      <p>正しい説明文：{game.correctDescription}</p>
      {game.players.map((player, index) => <div key={index}><b>{player.name}（{game.role[index] === 'york' ? 'ヨーク' : game.role[index] === 'stella' ? 'ステラ' : 'サテライト'}）</b>{index !== game.stella && <p>{game.drafts[index].map((char, i) => <span key={i} className={game.owners[i] === index ? 'bg-yellow-200' : ''}>{game.settings.symbolsOpen && game.owners[i] === null ? Array.from(game.correctDescription)[i] : char || '＿'}</span>)}</p>}</div>)}
      <Link className="underline" href="/rate-match">戻る</Link>
    </section>}
  </>;
}

function Vivre({ game, send, profiles }) {
  const [guess, setGuess] = useState('');
  const hard = game.settings.mode.endsWith('hard');
  const party = game.settings.mode.startsWith('party');
  const canAnswer = game.phase === 'playing' && (party || game.turn === game.you);
  const fields = hard ? ['name', 'age', 'height', 'blood'] : ['number', 'name', 'chapter', 'age', 'height', 'blood', 'born', 'gender', 'family'];
  const labels = { number: '番号', name: '名前', chapter: '初登場話', age: '年齢', height: '身長', blood: '血液型', born: '出身', gender: '性別', family: '家族' };
  return <>
    <section className={box}>
      <h2 className="font-bold">{party ? 'パーティー' : '対戦'}{hard ? 'ハード' : 'ノーマル'}</h2>
      <p>{game.phase === 'result' ? `${game.players[game.winner].name} が正解！ 答え：${game.answer}` : party ? '全員が何度でも回答できます。最初の正解者が勝利です。' : `${game.players[game.turn].name} の番（1人60秒）`}</p>
      {canAnswer && <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); send('guess', { name: guess }); setGuess(''); }}>
        <input className={input} list="vivre-names" value={guess} onChange={(e) => setGuess(e.target.value)} placeholder="キャラクター名" />
        <datalist id="vivre-names">{profiles.filter((p) => !game.history.some((h) => h.profile.name === p.name)).map((p, i) => <option key={i} value={p.name} />)}</datalist>
        <button className={button}>回答</button>
      </form>}
    </section>
    <section className={`${box} overflow-x-auto`}>
      <p>緑：一致 ／ 黄：部分一致 ／ 赤：正解より小さい ／ 青：正解より大きい</p>
      <table className="mt-2 border-collapse text-center text-sm"><thead><tr>{fields.map((field) => <th className="border p-2" key={field}>{labels[field]}</th>)}<th className="border p-2">回答者</th></tr></thead>
        <tbody>{game.history.map((row, i) => <tr key={i}>{fields.map((field) => {
          const value = field === 'born' ? `${row.profile.bornSea} / ${row.profile.bornPlace}` : field === 'family' ? row.profile.family.join('、') || 'なし' : row.profile[field];
          return <td key={field} className={`border p-2 ${colors[row.result[field]] || (field === 'name' && row.correct ? colors.green : 'bg-gray-100')}`}>{value}{row.result[field] === 'up' ? ' ↑' : row.result[field] === 'down' ? ' ↓' : ''}</td>;
        })}<td className="border p-2">{row.player === null ? '最初のヒント' : game.players[row.player].name}</td></tr>)}</tbody>
      </table>
    </section>
    {game.phase === 'result' && <Link className="underline" href="/rate-match">戻る</Link>}
  </>;
}

export default function FreeKnowledgeGame({ kind }) {
  const [game, setGame] = useState(null);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [connected, setConnected] = useState(false);
  const [profiles, setProfiles] = useState([]);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const roomId = new URLSearchParams(window.location.search).get('room');
    const token = sessionStorage.getItem(`knowledge_token_${roomId}`);
    if (!roomId || !token) {
      const timer = setTimeout(() => setError('フリーマッチから入室してください。'), 0);
      return () => clearTimeout(timer);
    }
    const url = process.env.NEXT_PUBLIC_SOCKET_URL || `${window.location.protocol}//${window.location.hostname}:4000`;
    const s = io(url, { transports: ['websocket', 'polling'] });
    s.on('connect', () => { setConnected(true); s.emit('knowledge:join', { roomId, token }); });
    s.on('disconnect', () => { setConnected(false); setGame(null); });
    s.on('connect_error', () => setError('サーバーに接続できません。'));
    s.on('knowledge:state', (state) => { setGame(state); setError(''); });
    s.on('knowledge:error', (event) => setError(event.message));
    const initialize = setTimeout(() => setSocket(s), 0);
    return () => { clearTimeout(initialize); s.disconnect(); };
  }, []);
  useEffect(() => {
    if (kind !== 'vivre') return undefined;
    const controller = new AbortController();
    fetch('/api/profile', { signal: controller.signal }).then((response) => {
      if (!response.ok) throw new Error('キャラクター一覧を読み込めません。');
      return response.json();
    }).then((data) => {
      if (!data.ok) throw new Error(data.error || 'キャラクター一覧を読み込めません。');
      setProfiles(data.items);
    }).catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => controller.abort();
  }, [kind]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const send = (type, payload = {}) => {
    if (!connected) { setError('接続されていません。再接続を待ってください。'); return; }
    socket?.emit('knowledge:action', { type, ...payload });
  };
  return <main className="min-h-screen bg-slate-100 p-4 text-slate-900">
    <div className="mx-auto max-w-5xl space-y-4">
      <h1 className="text-2xl font-bold">{kind === 'punk' ? 'パンクレコーズ' : 'ビブルサーチ'}（フリーマッチ）</h1>
      {error && <p role="alert" className="rounded bg-red-100 p-3 text-red-800">{error}</p>}
      {!connected && <p>サーバーに接続中…</p>}
      {!game ? <p>参加者を確認しています。</p> : <>
        <div>{game.players.map((player, index) => <span key={index} className="mr-3">{player.name}{!player.connected && '（切断中）'}</span>)}</div>
        {game.deadline && <div className="font-bold">残り {Math.max(0, Math.ceil((game.deadline - now) / 1000))} 秒</div>}
        {game.phase === 'setup' ? <Settings game={game} send={send} /> : kind === 'punk' ? <Punk game={game} send={send} /> : <Vivre game={game} send={send} profiles={profiles} />}
      </>}
    </div>
  </main>;
}
