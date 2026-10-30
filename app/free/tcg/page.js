// file: app/free/tcg/page.js
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import io from 'socket.io-client';
import {
  CARD_DEFS,
  DECK_SIZE,
  MAX_COPIES,
  STANDARD_DECK,
  STANDARD_CARD_POOL,
  VILLAINS_DECK,
  VILLAINS_CARD_POOL,
  REVOLUTIONARY_DECK,
  REVOLUTIONARY_CARD_POOL,
  normalizeDeck,
} from '../../../lib/tcgCards.js';

const BOARD_SIZE = 5;
const DECKS_KEY = 'tcg_custom_decks';

function loadCustomDecks() {
  try {
    const list = JSON.parse(localStorage.getItem(DECKS_KEY) || '[]');
    return list
        .map((d) => ({
          id: String(d.id),
          name: String(d.name || 'マイデッキ'),
          cards: normalizeDeck(d.cards),
          allowedCards: Array.isArray(d.allowedCards) ? d.allowedCards.filter((id) => CARD_DEFS[id]) : null,
        }))
        .filter((d) => d.cards);
  } catch {
    return [];
  }
}

function saveCustomDecks(list) {
  localStorage.setItem(DECKS_KEY, JSON.stringify(list));
}

const sumCards = (cards) => Object.values(cards).reduce((a, b) => a + b, 0);
const MUGICHA_GENRES = [
  { key: 'age', label: '年齢' },
  { key: 'height', label: '身長' },
  { key: 'food', label: '好物' },
  { key: 'blood', label: '血液型' },
];

function getSocketUrl() {
  if (process.env.NEXT_PUBLIC_SOCKET_URL) return process.env.NEXT_PUBLIC_SOCKET_URL;
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
}

function getClientId(roomId) {
  const key = `tcg_client_${roomId}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function CostOrbs({ cost, maxCost }) {
  return (
    <div className="orbs" title={`コスト ${cost}/${maxCost}`}>
      {Array.from({ length: 10 }, (_, i) => (
        <span
          key={i}
          className={`orb ${i < cost ? 'full' : i < maxCost ? 'spent' : 'locked'}`}
        />
      ))}
    </div>
  );
}

function Hearts({ life, hp, maxHp }) {
  return (
    <div className="hearts">
      {Array.from({ length: Math.max(life, 0) }, (_, i) => (
        <span key={i} className="heart">♥</span>
      ))}
      {life <= 0 && <span className="heart dead">0</span>}
      {life > 0 && (
        <span className="hp-text" title="現在のライフの耐久力">
          耐久 {hp}/{maxHp}
        </span>
      )}
    </div>
  );
}

const CARD_IMAGES = {
  mugicha: '0001',
  zori: '0002',
  dorobou: '0003',
  hanap: '0004',
  prince: '0005',
  chappy: '0006',
  allholiday: '0007',
  riesen: '0008',
  corobokkle: '0009',
  hojiro: '0010',
  kavell: '0011',
  sloop: '0012',
  mugicha5: '00001',
  vivi: '0013',
  karoo: '0138',
  crocodile: '0174',
  enel: '0302',
  lucci: '0377',
  doflamingo: '0266',
  katakuri: '1076',
  buggy: '0046',
  arlong: '0094',
  wapol: '0154',
  moria: '0483',
  magellan: '0575',
  hody: '0725',
  caesar: '0797',
  kaido: '0944',
  foxy: '0342',
  creek: '0084',
  dragon: '0125',
  sabo: '0659',
  koala: '0747',
  hack: '0871',
  ivankov: '0589',
  inazuma: '0588',
  beloBetty: '1187',
  morley: '1186',
  lindbergh: '1188',
  karasu: '1189',
  ahiru: '1198',
  ushiarno: '1772',
  gambo: '1773',
  jiron: '1774',
  bunnyJoe: '0670',
  terryGilteo: '0456',
};

function CardArt({ defId }) {
  const file = CARD_IMAGES[defId];
  if (!file) return null;
  return (
    <img
      className="c-art"
      src={`/tcg/${file}.png`}
      alt=""
      draggable={false}
      onError={(e) => {
        e.currentTarget.style.visibility = 'hidden';
      }}
    />
  );
}

function DeckSelect({ onStart, onBack, editOnly = false }) {
  const [custom, setCustom] = useState([]);
  const [selected, setSelected] = useState('standard');
  const [editing, setEditing] = useState(null); // { id, name, cards }

  // localStorage はクライアントでのみ読めるため、マウント後に非同期で読み込む（SSRとの不一致を避ける）
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (alive) setCustom(loadCustomDecks());
    });
    return () => {
      alive = false;
    };
  }, []);

  const decks = [
    { id: 'standard', name: 'スタンダードデッキ', cards: STANDARD_DECK, allowedCards: STANDARD_CARD_POOL, fixed: true },
    { id: 'villains', name: 'ヴィランズデッキ', cards: VILLAINS_DECK, allowedCards: VILLAINS_CARD_POOL, fixed: true },
    { id: 'revolutionary', name: '革命軍デッキ', cards: REVOLUTIONARY_DECK, allowedCards: REVOLUTIONARY_CARD_POOL, fixed: true },
    ...custom,
  ];
  const current = decks.find((d) => d.id === selected) || decks[0];

  const persist = (list) => {
    setCustom(list);
    saveCustomDecks(list);
  };

  const startEdit = (deck) => {
    setEditing({
      id: deck.fixed ? null : deck.id,
      name: deck.fixed ? `${deck.name}のコピー` : deck.name,
      cards: { ...deck.cards },
      allowedCards: deck.allowedCards ? [...deck.allowedCards] : Object.keys(CARD_DEFS),
    });
  };

  const saveEdit = () => {
    const id = editing.id || `d${Date.now().toString(36)}`;
    const entry = {
      id,
      name: editing.name.trim().slice(0, 20) || 'マイデッキ',
      cards: editing.cards,
      allowedCards: editing.allowedCards,
    };
    persist(editing.id ? custom.map((d) => (d.id === id ? entry : d)) : [...custom, entry]);
    setSelected(id);
    setEditing(null);
  };

  const removeDeck = (deck) => {
    if (!window.confirm(`「${deck.name}」を削除しますか？`)) return;
    persist(custom.filter((d) => d.id !== deck.id));
    setSelected('standard');
  };

  if (editing) {
    const total = sumCards(editing.cards);
    const setCount = (id, delta) =>
      setEditing((e) => {
        const n = (e.cards[id] || 0) + delta;
        if (n < 0 || n > MAX_COPIES || total + delta > DECK_SIZE) return e;
        const cards = { ...e.cards, [id]: n };
        if (n === 0) delete cards[id];
        return { ...e, cards };
      });

    return (
      <main className="deck-page">
        <style>{css}</style>
        <div className="deck-head">
          <h1>デッキ編集</h1>
          <input
            className="deck-name"
            value={editing.name}
            maxLength={20}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          />
          <span className={`deck-total ${total === DECK_SIZE ? 'ok' : ''}`}>{total} / {DECK_SIZE}</span>
          <button className="btn end" disabled={total !== DECK_SIZE} onClick={saveEdit}>保存</button>
          <button className="btn ghost" onClick={() => setEditing(null)}>キャンセル</button>
        </div>
        <div className="deck-grid">
          {editing.allowedCards.map((id) => {
            const def = CARD_DEFS[id];
            const n = editing.cards[id] || 0;
            return (
              <div key={id} className={`deck-item ${n ? 'in' : ''}`}>
                <div className="deck-art"><CardArt defId={id} /></div>
                <div className="di-name">{def.name}</div>
                <div className="di-stats">COST {def.cost} / POWER {def.power}{def.blocker ? ' / ブロッカー' : ''}</div>
                <p className="di-text">{def.text}</p>
                <div className="di-ctrl">
                  <button className="btn small" disabled={n <= 0} onClick={() => setCount(id, -1)}>−</button>
                  <b>{n}</b>
                  <button className="btn small" disabled={n >= MAX_COPIES || total >= DECK_SIZE} onClick={() => setCount(id, 1)}>＋</button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    );
  }

  return (
    <main className="deck-page">
      <style>{css}</style>
      <div className="deck-head">
        <h1>{editOnly ? 'デッキを編集' : 'デッキを選択'}</h1>
        <button className="btn ghost" onClick={onBack}>戻る</button>
      </div>
      <div className="deck-list">
        {decks.map((d) => (
          <button
            type="button"
            key={d.id}
            className={`deck-entry ${current.id === d.id ? 'selected' : ''}`}
            onClick={() => setSelected(d.id)}
          >
            <b>{d.name}</b>
            <span>{sumCards(d.cards)}枚</span>
          </button>
        ))}
      </div>
      <div className="deck-detail">
        <div className="deck-cards">
          {Object.entries(current.cards).map(([id, n]) => (
            <div key={id} className="deck-mini">
              <CardArt defId={id} />
              <span>{CARD_DEFS[id].name} ×{n}</span>
            </div>
          ))}
        </div>
        <div className="deck-actions">
          {!editOnly && (
            <button className="btn end" onClick={() => onStart(current.cards)}>このデッキで対戦</button>
          )}
          <button className="btn" onClick={() => startEdit(current)}>
            {current.fixed ? 'コピーして編集' : '編集'}
          </button>
          <button className="btn" onClick={() => startEdit({ name: '新しいデッキ', cards: {}, fixed: true, allowedCards: Object.keys(CARD_DEFS) })}>完全新規作成</button>
          {!current.fixed && (
            <button className="btn ghost" onClick={() => removeDeck(current)}>削除</button>
          )}
        </div>
      </div>
    </main>
  );
}

function DeckPile({ count, trash, onOpenTrash }) {
  const last = trash?.[trash.length - 1];
  return (
    <div className="piles">
      <div className="deck" title="山札">
        <div className="deck-card card back" />
        <div className="deck-count">山札 {count}</div>
      </div>
      <button type="button" className="deck trash" title="トラッシュを見る" onClick={onOpenTrash}>
        <div className={`deck-card trash-card ${last ? 'has' : ''}`}>
          {last ? <CardArt defId={last.defId} /> : null}
        </div>
        <div className="deck-count">トラッシュ {trash?.length || 0}</div>
      </button>
    </div>
  );
}

function nameClass(name) {
  const n = String(name || '').length;
  return `c-name ${n >= 10 ? 'len-xl' : n >= 7 ? 'len-l' : n >= 5 ? 'len-m' : ''}`;
}

function BoardCard({ c, cls = '', onClick, onHover }) {
  return (
    <button
      type="button"
      data-cid={c.id}
      className={`card unit ${c.rested ? 'rested' : ''} ${cls}`}
      onClick={onClick}
      onMouseEnter={() => onHover?.(c)}
    >
      <span className="c-cost">{c.cost}</span>
      <CardArt defId={c.defId} />
      <span className={nameClass(c.name)}>{c.name}</span>
      {c.blocker && <span className="c-tag">ブロッカー</span>}
      {c.hasAbility && (
        <span className={`c-tag ability ${c.abilityUsed ? 'used' : ''}`}>
          {c.abilityUsed ? '使用済' : '起動'}
        </span>
      )}
      {c.rested && <span className="c-down">DOWN</span>}
      <span className="c-power">{c.power}</span>
    </button>
  );
}

export default function TcgPage() {
  const router = useRouter();
  const socketRef = useRef(null);
  const [roomId, setRoomId] = useState('');
  const [g, setG] = useState(null);
  const [conn, setConn] = useState('connecting');
  const [error, setError] = useState('');
  const [fatal, setFatal] = useState(false);
  const [deck, setDeck] = useState(null);
  const [editOnly, setEditOnly] = useState(false);

  const [selHand, setSelHand] = useState(null);
  const [selChar, setSelChar] = useState(null);
  const [detail, setDetail] = useState(null);
  const [answer, setAnswer] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const [toast, setToast] = useState(null);
  const [arrow, setArrow] = useState(null);
  const lastAttackSeq = useRef(null);
  const rectCache = useRef({});
  const lastFlash = useRef(0);
  const inputRef = useRef(null);
  const logRef = useRef(null);
  const [trashView, setTrashView] = useState(null); // 'me' | 'opp'

  useEffect(() => {
    const room = new URLSearchParams(window.location.search).get('room') || '';
    setRoomId(room);
    if (new URLSearchParams(window.location.search).get('edit') === '1') {
      setEditOnly(true);
      return;
    }
    if (!room) {
      setConn('noroom');
      return;
    }
    try {
      const saved = normalizeDeck(JSON.parse(sessionStorage.getItem(`tcg_deck_${room}`) || 'null'));
      if (saved) setDeck(saved);
    } catch {}
  }, []);

  useEffect(() => {
    if (!deck || !roomId) return undefined;
    const room = roomId;

    const name =
      localStorage.getItem('username') || localStorage.getItem('currentUser') || 'プレイヤー';
    const clientId = getClientId(room);
    const s = io(getSocketUrl(), { transports: ['websocket', 'polling'] });
    socketRef.current = s;

    const join = () => {
      setConn('connected');
      s.emit('tcg:join', { roomId: room, clientId, name, deck });
    };
    s.on('connect', join);
    s.on('disconnect', () => setConn('connecting'));
    s.on('connect_error', () => setConn('error'));
    s.on('tcg:state', (st) => setG(st));
    s.on('tcg:error', (e) => {
      setError(e.message || 'エラー');
      if (e.fatal) setFatal(true);
      setTimeout(() => setError(''), 3500);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [deck, roomId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const seq = g?.flash?.seq;
    if (!seq || seq === lastFlash.current) return undefined;
    lastFlash.current = seq;
    setToast(g.flash);
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
    // 状態更新のたびに flash オブジェクトが変わるため、seq だけを監視する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g?.flash?.seq]);

  // 攻撃の矢印：直前の描画時の位置を覚えておき、攻撃側／対象が消えていても描けるようにする
  useEffect(() => {
    const snapshot = () => {
      const map = {};
      document.querySelectorAll('[data-cid]').forEach((el) => {
        map[`c${el.getAttribute('data-cid')}`] = el.getBoundingClientRect();
      });
      document.querySelectorAll('[data-life]').forEach((el) => {
        map[`life-${el.getAttribute('data-life')}`] = el.getBoundingClientRect();
      });
      return map;
    };
    const la = g?.lastAttack;
    if (la && la.seq !== lastAttackSeq.current) {
      const first = lastAttackSeq.current === null;
      lastAttackSeq.current = la.seq;
      if (!first) {
        const rects = { ...rectCache.current, ...snapshot() };
        const from = rects[`c${la.attackerId}`];
        const to = la.target === 'player'
          ? rects[`life-${la.attackerMine ? 'opp' : 'me'}`]
          : rects[`c${la.target}`];
        if (from && to) {
          const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
          const a = center(from);
          const b = center(to);
          setArrow({ seq: la.seq, x1: a.x, y1: a.y, x2: b.x, y2: b.y, mine: la.attackerMine });
          setTimeout(() => setArrow((cur) => (cur?.seq === la.seq ? null : cur)), 1800);
        }
      }
    } else if (la && lastAttackSeq.current === null) {
      lastAttackSeq.current = la.seq;
    }
    rectCache.current = { ...rectCache.current, ...snapshot() };
  }, [g]);

  // スマホでのダブルタップ／入力時の自動ズームを、この画面だけ無効にする
  useEffect(() => {
    let meta = document.querySelector('meta[name="viewport"]');
    const created = !meta;
    const prev = meta?.getAttribute('content') ?? null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'viewport');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    return () => {
      if (created) meta.remove();
      else if (prev !== null) meta.setAttribute('content', prev);
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [g?.log?.length]);

  const pending = g?.pending || null;
  const myQuiz = pending?.kind === 'quiz' && pending.mine;

  useEffect(() => {
    if (myQuiz) {
      setAnswer('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [myQuiz, pending?.deadline]);

  const emit = (ev, data) => socketRef.current?.emit(ev, data);
  const discardCard = (cardId) => emit('tcg:discard', { cardId });

  const myTurn = g?.phase === 'playing' && g.current === g.you;
  const idle = myTurn && !pending;

  const selectedChar = useMemo(
    () => g?.me?.board.find((c) => c.id === selChar) || null,
    [g, selChar]
  );
  const selectedHandCard = useMemo(
    () => g?.me?.hand?.find((c) => c.id === selHand) || null,
    [g, selHand]
  );

  useEffect(() => {
    if (selChar && !selectedChar) setSelChar(null);
    if (selHand && !selectedHandCard) setSelHand(null);
  }, [selChar, selectedChar, selHand, selectedHandCard]);

  useEffect(() => {
    if (!idle) {
      setSelHand(null);
      setSelChar(null);
    }
  }, [idle]);

  if (editOnly) {
    return <DeckSelect editOnly onBack={() => router.push('/rate-match')} />;
  }
  if (conn === 'noroom') {
    return <Center text="部屋IDが指定されていません。フリー対戦の部屋から入ってください。" />;
  }
  if (!deck) {
    return (
      <DeckSelect
        onStart={(cards) => {
          sessionStorage.setItem(`tcg_deck_${roomId}`, JSON.stringify(cards));
          setDeck(cards);
        }}
        onBack={() => router.push('/rate-match')}
      />
    );
  }
  if (fatal) {
    return (
      <Center text={error || 'この部屋には入れません。'}>
        <button className="btn" onClick={() => router.push('/rate-match')}>戻る</button>
      </Center>
    );
  }
  if (conn === 'error' && !g) {
    return <Center text="対戦サーバーに接続できません。server.js が起動しているか確認してください。" />;
  }
  if (!g || g.phase === 'waiting') {
    return (
      <Center text={`部屋 ${roomId}：対戦相手を待っています…`}>
        <div className="sub">相手が同じ部屋に入ると自動で開始します。</div>
      </Center>
    );
  }

  const { me, opp } = g;
  const left = pending ? Math.max(0, Math.ceil((pending.deadline - now) / 1000)) : 0;
  const pct = pending ? Math.max(0, Math.min(100, ((pending.deadline - now) / 40000) * 100)) : 0;

  const chooseOptions = pending?.kind === 'choose' && pending.mine ? pending.options : [];
  const blockOptions = pending?.kind === 'block' && pending.mine ? pending.options : [];
  const discardOptions = pending?.kind === 'discard' && pending.mine ? pending.options : [];
  const attacking = idle && selectedChar?.canAttack;

  const onMyChar = (c) => {
    setDetail(c);
    if (chooseOptions.includes(c.id)) {
      emit('tcg:choose', { targetId: c.id });
      return;
    }
    if (blockOptions.includes(c.id)) {
      emit('tcg:block', { blockerId: c.id });
      return;
    }
    if (!idle) return;
    if (selectedHandCard && me.board.length >= BOARD_SIZE) {
      replaceSlot(c);
      return;
    }
    setSelHand(null);
    setSelChar(selChar === c.id ? null : c.id);
  };

  const onOppChar = (c) => {
    setDetail(c);
    if (chooseOptions.includes(c.id)) {
      emit('tcg:choose', { targetId: c.id });
      return;
    }
    if (attacking && (c.rested || selectedChar?.hitActive)) {
      emit('tcg:attack', { attackerId: selChar, target: c.id });
      setSelChar(null);
    }
  };

  const onSlot = (slot) => {
    if (!idle || !selectedHandCard) return;
    emit('tcg:play', { cardId: selectedHandCard.id, slot });
    setSelHand(null);
  };

  const replaceSlot = (c) => {
    const hc = selectedHandCard;
    if (hc.cost > me.cost) {
      setError('コストが足りません。');
      setTimeout(() => setError(''), 3500);
      return;
    }
    if (window.confirm(`手札の「${hc.name}」と場の「${c.name}」を入れ替えますか？\n（場の「${c.name}」はトラッシュへ送られます）`)) {
      emit('tcg:play', { cardId: hc.id, slot: c.slot });
      setSelHand(null);
    }
  };

  const attackPlayer = () => {
    if (!attacking) return;
    emit('tcg:attack', { attackerId: selChar, target: 'player' });
    setSelChar(null);
  };

  const submitAnswer = (e) => {
    e.preventDefault();
    emit('tcg:answer', { text: answer });
    setAnswer('');
  };

  const turnLabel = g.phase === 'finished'
    ? '対戦終了'
    : myTurn
      ? 'あなたのターン'
      : '相手のターン';

  const oppQuizView = pending?.kind === 'quiz' && !pending.mine;
  const waitingMsg = pending && !pending.mine
    ? pending.kind === 'block'
      ? '相手がブロックを選択中…'
      : pending.kind === 'choose'
        ? '相手が対象を選択中…'
        : pending.kind === 'discard'
          ? '相手が捨てるカードを選択中…'
        : null
    : null;

  return (
    <main className="tcg">
      <style>{css}</style>

      <div className="stage">
        <section className="side opp-side">
          <div className="player-strip opp-strip">
            <DeckPile count={opp.deckCount} trash={opp.trash} onOpenTrash={() => setTrashView('opp')} />
            <div className="opp-hand" title="相手の手札">
              {Array.from({ length: opp.handCount }, (_, i) => (
                <div key={i} className="card back mini" />
              ))}
              <span className="hand-count">手札 {opp.handCount}</span>
            </div>
            <div className="who">
              <div className="pname">{opp.name}{!opp.connected && <em>（切断中）</em>}</div>
              <button
                type="button"
                data-life="opp"
                className={`life-box ${attacking ? 'targetable' : ''}`}
                onClick={attackPlayer}
                disabled={!attacking}
                title={attacking ? 'プレイヤーを攻撃' : ''}
              >
                <span className="life-label">LIFE</span>
                <Hearts life={opp.life} hp={opp.lifeHp} maxHp={opp.lifeMaxHp} />
              </button>
              <CostOrbs cost={opp.cost} maxCost={opp.maxCost} />
              <div className="cost-text">COST {opp.cost}/{opp.maxCost}</div>
            </div>
          </div>

          <div className="board opp-board">
            {Array.from({ length: BOARD_SIZE }, (_, i) => {
              const c = opp.board.find((x) => x.slot === i);
              return (
                <div key={i} className="slot">
                  {c ? (
                    <BoardCard
                      c={c}
                      cls={`enemy ${attacking && (c.rested || selectedChar?.hitActive) ? 'targetable' : ''} ${chooseOptions.includes(c.id) ? 'choosable' : ''}`}
                      onClick={() => onOppChar(c)}
                      onHover={setDetail}
                    />
                  ) : (
                    <div className="empty" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <div className="mid-bar">
          <div className={`turn-badge ${myTurn ? 'mine' : ''}`}>
            {turnLabel}
            <small>TURN {g.turnNo}</small>
          </div>
          {waitingMsg && <div className="wait-msg">{waitingMsg}</div>}
          {pending?.kind === 'choose' && pending.mine && (
            <div className="wait-msg strong">
              {pending.title}（残り{left}秒）
              <button className="btn small" onClick={() => emit('tcg:choose', { targetId: null })}>
                スキップ
              </button>
            </div>
          )}
          {pending?.kind === 'block' && pending.mine && (
            <div className="wait-msg strong">
              {pending.attackerName}（{pending.attackerPower}）の攻撃！ ブロッカーを選ぶ（残り{left}秒）
              <button className="btn small" onClick={() => emit('tcg:block', { blockerId: null })}>
                ブロックしない
              </button>
            </div>
          )}
          <div className="mid-actions">
            {idle && selectedChar?.canAttack && <span className="hint">攻撃先を選択（ダウン中の相手キャラ／相手のライフ）</span>}
            {idle && selectedHandCard && <span className="hint">出す枠をクリック</span>}
            <button className="btn end" disabled={!idle} onClick={() => emit('tcg:end')}>
              ターン終了
            </button>
            <button
              className="btn ghost"
              disabled={g.phase !== 'playing'}
              onClick={() => {
                if (window.confirm('降参しますか？')) emit('tcg:surrender');
              }}
            >
              降参
            </button>
          </div>
        </div>

        <section className="side my-side">
          <div className="board my-board">
            {Array.from({ length: BOARD_SIZE }, (_, i) => {
              const c = me.board.find((x) => x.slot === i);
              return (
                <div key={i} className="slot">
                  {c ? (
                    <BoardCard
                      c={c}
                      cls={`${selChar === c.id ? 'selected' : ''} ${idle && c.canAttack ? 'ready' : ''} ${chooseOptions.includes(c.id) || blockOptions.includes(c.id) ? 'choosable' : ''} ${idle && selectedHandCard && me.board.length >= BOARD_SIZE ? 'swappable' : ''}`}
                      onClick={() => onMyChar(c)}
                      onHover={setDetail}
                    />
                  ) : (
                    <button
                      type="button"
                      className={`empty ${idle && selectedHandCard && selectedHandCard.cost <= me.cost ? 'drop' : ''}`}
                      onClick={() => onSlot(i)}
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="player-strip">
            <div className="who">
              <div className="pname">{me.name}（あなた）</div>
              <div className="life-box mine" data-life="me">
                <span className="life-label">LIFE</span>
                <Hearts life={me.life} hp={me.lifeHp} maxHp={me.lifeMaxHp} />
              </div>
              <CostOrbs cost={me.cost} maxCost={me.maxCost} />
              <div className="cost-text">COST {me.cost}/{me.maxCost}</div>
            </div>

            <div className="hand">
              {me.hand.map((c) => {
                const playable = idle && c.cost <= me.cost;
                return (
                  <button
                    type="button"
                    key={c.id}
                    className={`card hand-card ${selHand === c.id ? 'selected' : ''} ${playable ? 'playable' : ''}`}
                    onClick={() => {
                      setDetail(c);
                      if (!idle) return;
                      setSelChar(null);
                      setSelHand(selHand === c.id ? null : c.id);
                    }}
                    onMouseEnter={() => setDetail(c)}
                  >
                    <span className={`c-cost ${c.cost > me.cost ? 'over' : ''}`}>{c.cost}</span>
                    <CardArt defId={c.defId} />
                    <span className={nameClass(c.name)}>{c.name}</span>
                    {c.blocker && <span className="c-tag">ブロッカー</span>}
                    <span className="c-power">{c.power}</span>
                  </button>
                );
              })}
              {me.hand.length === 0 && <div className="no-hand">手札なし</div>}
            </div>

            <DeckPile count={me.deckCount} trash={me.trash} onOpenTrash={() => setTrashView('me')} />
          </div>
        </section>
      </div>

      <aside className="panel">
        <div className="detail">
          {detail ? (
            <>
              <div className="d-name">{detail.name}</div>
              <div className="d-stats">
                <span>COST {detail.cost}</span>
                <span>POWER {detail.power}</span>
                {detail.blocker && <span>ブロッカー</span>}
              </div>
              <p className="d-text">{detail.text}</p>
            </>
          ) : (
            <div className="d-note">カードにカーソルを合わせると効果が表示されます。</div>
          )}
          {selectedChar && idle && (
            <div className="d-actions">
              <div className="d-label">選択中：{selectedChar.name}</div>
              {selectedChar.defId === 'mugicha' && !selectedChar.abilityUsed && (
                <>
                  <div className="d-label">強化するジャンルを選んで起動</div>
                  <div className="genre-row">
                    {MUGICHA_GENRES.map((gn) => (
                      <button
                        key={gn.key}
                        className="btn small"
                        disabled={selectedChar.genresUsed.includes(gn.key)}
                        onClick={() => emit('tcg:ability', { charId: selectedChar.id, genre: gn.key })}
                      >
                        {gn.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {selectedChar.hasAbility && selectedChar.defId !== 'mugicha' && (
                <button
                  className="btn"
                  disabled={selectedChar.abilityUsed || (selectedChar.defId === 'beloBetty' && selectedChar.rested)}
                  onClick={() => emit('tcg:ability', { charId: selectedChar.id })}
                >
                  {selectedChar.abilityUsed
                    ? '効果使用済み'
                    : selectedChar.defId === 'beloBetty' && selectedChar.rested
                      ? 'ダウン中は使用不可'
                      : '効果を使う'}
                </button>
              )}
              {!selectedChar.canAttack && (
                <div className="d-note">このターンは攻撃できません（出したターン／攻撃不可）</div>
              )}
            </div>
          )}
        </div>

        <div className="log" ref={logRef}>
          {[...g.log].reverse().map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </aside>

      {oppQuizView && (
        <div className="opp-quiz">
          <b>相手が回答中：{pending.title}</b>
          <div>【{pending.genre}】{pending.lines.join(' ／ ')}</div>
          <div className="timer"><span style={{ width: `${pct}%` }} /></div>
        </div>
      )}

      {pending?.kind === 'discard' && pending.mine && (
        <div className="overlay">
          <div className="quiz trash-modal">
            <div className="q-title">{pending.title}</div>
            <div className="trash-list">
              {discardOptions.map((card) => (
                <button
                  type="button"
                  key={card.id}
                  className="deck-mini discard-option"
                  onClick={() => discardCard(card.id)}
                >
                  <CardArt defId={card.defId} />
                  <span>{card.name}</span>
                </button>
              ))}
            </div>
            <div className="q-left">残り {left} 秒</div>
          </div>
        </div>
      )}

      {myQuiz && (
        <div className="overlay">
          <form className="quiz" onSubmit={submitAnswer}>
            <div className="q-title">
              {pending.title}
              {pending.step ? <span>（{pending.step}問目）</span> : null}
            </div>
            <div className="q-genre">{pending.genre}</div>
            <div className="q-lines">
              {pending.lines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
            <div className="timer"><span style={{ width: `${pct}%` }} /></div>
            <div className="q-left">残り {left} 秒</div>
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="答えを入力"
              autoComplete="off"
            />
            <button className="btn" type="submit">回答する</button>
          </form>
        </div>
      )}

      {trashView && (
        <div className="overlay" onClick={() => setTrashView(null)}>
          <div className="quiz trash-modal" onClick={(e) => e.stopPropagation()}>
            <div className="q-title">
              {trashView === 'me' ? 'あなた' : opp.name} のトラッシュ（新しい順）
            </div>
            <div className="trash-list">
              {[...((trashView === 'me' ? me.trash : opp.trash) || [])].reverse().map((t) => (
                <div key={t.id} className="deck-mini">
                  <CardArt defId={t.defId} />
                  <span>{t.name}</span>
                </div>
              ))}
              {((trashView === 'me' ? me.trash : opp.trash) || []).length === 0 && (
                <div className="d-note">トラッシュは空です。</div>
              )}
            </div>
            <button className="btn" onClick={() => setTrashView(null)}>閉じる</button>
          </div>
        </div>
      )}

      {arrow && (
        <svg className="atk-arrow" width="100%" height="100%">
          <defs>
            <marker id="atk-head" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill={arrow.mine ? '#1d7fd6' : '#e0364d'} />
            </marker>
          </defs>
          <line
            key={arrow.seq}
            className="atk-line"
            x1={arrow.x1}
            y1={arrow.y1}
            x2={arrow.x2}
            y2={arrow.y2}
            stroke={arrow.mine ? '#1d7fd6' : '#e0364d'}
            strokeWidth="7"
            strokeLinecap="round"
            markerEnd="url(#atk-head)"
            pathLength="1"
          />
        </svg>
      )}

      {toast && (
        <div className={`toast ${toast.ok ? 'ok' : 'ng'}`}>
          <b>{toast.ok ? '正解！' : toast.timeout ? '時間切れ…' : '不正解…'}</b>
          <span>【{toast.genre}】答え：{toast.reveal}</span>
        </div>
      )}

      {error && <div className="err">{error}</div>}
      {conn === 'connecting' && <div className="err">再接続中…</div>}

      {g.phase === 'finished' && (
        <div className="overlay">
          <div className="quiz result">
            <h2>{g.winner === g.you ? '勝利！' : '敗北…'}</h2>
            <div className="q-lines">{g.log[g.log.length - 1]}</div>
            <button className="btn" onClick={() => router.push('/rate-match')}>戻る</button>
          </div>
        </div>
      )}
    </main>
  );
}

function Center({ text, children }) {
  return (
    <main className="center-page">
      <style>{css}</style>
      <div className="center-box">
        <p>{text}</p>
        {children}
      </div>
    </main>
  );
}

const css = `
* { box-sizing: border-box; }
body { margin: 0; background: #eaf3ff; }
.center-page { min-height: 100vh; display: grid; place-items: center; background: #eaf3ff; color: #1d2b3f; font-family: sans-serif; }
.center-box { text-align: center; padding: 24px; }
.sub { color: #5d7391; font-size: 13px; margin-top: 8px; }

.tcg { touch-action: manipulation; height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 280px; background: radial-gradient(ellipse at center, #ffffff 0%, #dcebfb 80%); color: #1d2b3f; font-family: sans-serif; overflow: hidden; position: relative; }
.stage { display: grid; grid-template-rows: 1fr auto 1fr; min-height: 0; padding: 8px 12px; gap: 6px; }
.side { display: flex; min-height: 0; gap: 6px; }
.opp-side { flex-direction: column; }
.my-side { flex-direction: column; justify-content: flex-end; }

.player-strip { display: grid; grid-template-columns: 190px minmax(0, 1fr) 130px; align-items: center; gap: 10px; }
.opp-strip { grid-template-columns: 130px minmax(0, 1fr) 190px; }
.opp-strip .who { align-items: flex-end; text-align: right; }
.who { display: flex; flex-direction: column; gap: 4px; }
.pname { font-weight: bold; font-size: 14px; }
.pname em { color: #f08a8a; font-size: 11px; font-style: normal; }
.life-box { display: flex; align-items: center; gap: 8px; padding: 4px 8px; border: 1px solid #e0a0ab; border-radius: 8px; background: #ffe9ed; color: inherit; font: inherit; }
.life-box.mine { border-color: #7fcfae; background: #e4f8ef; }
.life-box.targetable { cursor: pointer; border-color: #ff5a6e; box-shadow: 0 0 14px #ff5a6e; animation: pulse 1s infinite; }
.life-label { font-size: 10px; color: #b07a10; letter-spacing: 2px; }
.hearts { display: flex; gap: 3px; }
.heart { color: #ff5a78; font-size: 20px; line-height: 1; }
.heart.dead { color: #888; font-size: 16px; }
.hp-text { align-self: center; margin-left: 4px; font-size: 12px; font-weight: bold; color: #7a2433; white-space: nowrap; }
.orbs { display: flex; gap: 3px; }
.orb { width: 13px; height: 13px; border-radius: 50%; border: 1px solid #3b6f9e; }
.orb.full { background: radial-gradient(circle at 35% 30%, #bfe6ff, #2f8fe0); box-shadow: 0 0 6px #5ab4ff; }
.orb.spent { background: #c9d9ee; }
.orb.locked { opacity: 0.35; background: transparent; }
.cost-text { font-size: 11px; color: #3b6f9e; }

.opp-hand { display: flex; justify-content: center; align-items: center; height: 64px; position: relative; }
.opp-hand .mini { margin-left: -14px; }
.opp-hand .mini:first-child { margin-left: 0; }
.hand-count { position: absolute; right: 0; bottom: -2px; font-size: 11px; color: #5d7391; }

.deck { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.deck-card { width: 46px; height: 62px; box-shadow: 2px 2px 0 #7fa6d6, 4px 4px 0 #a9c5e6; }
.piles { display: flex; gap: 10px; align-items: flex-start; }
.deck.trash { border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; }
.trash-card { border: 2px dashed #9db8d8; border-radius: 6px; background: rgba(255,255,255,0.6); overflow: hidden; display: flex; box-shadow: none; }
.trash-card.has { border-style: solid; background: #fff; }
.trash-card .c-art { width: 100%; height: 100%; flex: 1; object-fit: contain; }
.trash-modal { max-height: 80vh; }
.trash-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 10px; overflow-y: auto; max-height: 50vh; }
.discard-option { cursor: pointer; border: 1px solid #b7cde6; border-radius: 8px; padding: 8px; background: #fff; color: inherit; }
.discard-option:hover { border-color: #3b82f6; background: #eef6ff; }
.unit.swappable { box-shadow: 0 0 12px #e0a800; outline: 2px dashed #e0a800; }
.deck-count { font-size: 11px; color: #5d7391; white-space: nowrap; }

.card.back { background: repeating-linear-gradient(45deg, #1f3a5c, #1f3a5c 6px, #2a4c78 6px, #2a4c78 12px); border: 1px solid #5d8fc2; border-radius: 6px; }
.card.mini { width: 34px; height: 50px; flex: none; }

.board { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; flex: none; height: clamp(140px, 23vh, 240px); min-height: 0; }
.slot { min-width: 0; min-height: 0; display: flex; }
.empty { width: 100%; border: 2px dashed #9db8d8; border-radius: 10px; background: rgba(255,255,255,0.6); }
.empty.drop { border-color: #68cfa4; background: rgba(104,207,164,0.12); cursor: pointer; animation: pulse 1s infinite; }

.card { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #2b2410; font: inherit; cursor: pointer; }
.card.back { cursor: default; }
.unit { width: 100%; border: 2px solid #d6a84d; border-radius: 10px; background: linear-gradient(160deg, #fff6dc, #f3dfa6); padding: 6px; justify-content: flex-start; gap: 3px; overflow: hidden; }
.unit.enemy { border-color: #d98585; background: linear-gradient(160deg, #ffe9e9, #f5c9cc); }
.c-art { width: 100%; flex: 1; min-height: 0; object-fit: contain; border-radius: 6px; pointer-events: none; }
.unit.rested { filter: grayscale(0.6) brightness(0.75); transform: rotate(5deg) scale(0.96); }
.unit.selected { outline: 3px solid #64d8a7; outline-offset: 2px; }
.unit.ready { box-shadow: 0 0 12px #f5c76b; }
.unit.targetable { box-shadow: 0 0 16px #ff5a6e; animation: pulse 1s infinite; }
.unit.choosable { outline: 3px solid #5ab4ff; animation: pulse 1s infinite; }
.c-name { font-weight: bold; font-size: clamp(11px, 1.5vh, 15px); text-align: center; line-height: 1.15; word-break: break-all; }
.c-name.len-m { font-size: clamp(10px, 1.3vh, 13px); }
.c-name.len-l { font-size: clamp(9px, 1.1vh, 11px); }
.c-name.len-xl { font-size: clamp(8px, 0.95vh, 10px); }
.c-cost { position: absolute; top: 4px; left: 4px; width: 22px; height: 22px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #bfe6ff, #2f8fe0); color: #07223d; font-weight: bold; font-size: 13px; display: grid; place-items: center; }
.c-cost.over { background: #555; color: #bbb; }
.c-power { position: absolute; right: 4px; bottom: 4px; min-width: 26px; padding: 1px 6px; border-radius: 12px; background: #f5c76b; color: #3a2a05; font-weight: bold; font-size: 14px; text-align: center; }
.c-tag { font-size: 10px; padding: 1px 6px; border-radius: 8px; background: #2b4d7a; color: #cfe5ff; }
.c-tag.ability { background: #6b3f8e; color: #f0dcff; }
.c-tag.ability.used { background: #444; color: #aaa; }
.c-down { position: absolute; top: 4px; right: 4px; font-size: 9px; color: #ff9b9b; letter-spacing: 1px; }

.mid-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 4px; border-top: 1px solid #b7cde6; border-bottom: 1px solid #b7cde6; background: linear-gradient(90deg, transparent, rgba(120,170,230,0.2), transparent); min-height: 46px; flex-wrap: wrap; }
.turn-badge { display: flex; flex-direction: column; align-items: center; padding: 4px 16px; border-radius: 8px; background: #ffe3e7; border: 1px solid #d98585; font-weight: bold; font-size: 14px; }
.turn-badge.mine { background: #dcf6ea; border-color: #4fbf93; }
.turn-badge small { font-size: 10px; color: #5d7391; font-weight: normal; }
.wait-msg { font-size: 13px; color: #3b6f9e; display: flex; align-items: center; gap: 8px; }
.wait-msg.strong { color: #a86b00; font-weight: bold; }
.mid-actions { display: flex; align-items: center; gap: 8px; margin-left: auto; }
.hint { font-size: 12px; color: #1f8f62; }

.btn { padding: 9px 16px; border: 1px solid #8aa3c2; border-radius: 8px; background: #4a6a96; color: #fff; cursor: pointer; font: inherit; }
.btn.small { padding: 4px 10px; font-size: 12px; }
.btn.end { background: #2f9a6c; border-color: #1f7a54; font-weight: bold; }
.btn.ghost { background: transparent; color: #5d7391; }
.btn:disabled { opacity: 0.4; cursor: default; }

.hand { display: flex; justify-content: center; align-items: flex-end; gap: 6px; min-width: 0; min-height: 110px; padding: 14px 2px 4px; overflow-x: auto; overflow-y: hidden; }
.hand-card { flex: 0 1 auto; width: clamp(64px, 8.5vw, 96px); min-width: 56px; height: clamp(92px, 15vh, 132px); border: 2px solid #8aa8d0; border-radius: 8px; background: linear-gradient(160deg, #ffffff, #dbe8f8); transition: transform 0.12s; justify-content: flex-start; gap: 2px; padding: 4px; overflow: hidden; }
.hand-card .c-name { font-size: clamp(9px, 1.2vh, 12px); }
.hand-card .c-name.len-m { font-size: clamp(8px, 1.05vh, 11px); }
.hand-card .c-name.len-l { font-size: clamp(7px, 0.9vh, 10px); }
.hand-card .c-name.len-xl { font-size: clamp(6px, 0.8vh, 9px); }
.hand-card .c-cost { width: 18px; height: 18px; font-size: 11px; }
.hand-card .c-power { font-size: 11px; min-width: 20px; padding: 0 4px; }
.hand-card .c-tag { font-size: 8px; padding: 0 4px; }
.hand-card.playable { border-color: #3fb584; box-shadow: 0 0 10px rgba(63,181,132,0.6); }
.hand-card.selected { transform: translateY(-14px); border-color: #e0a800; }
.hand-card:hover { transform: translateY(-8px); }
.no-hand { color: #7a8ea8; font-size: 13px; align-self: center; }

.panel { display: flex; flex-direction: column; gap: 8px; padding: 10px; border-left: 1px solid #b7cde6; background: rgba(255,255,255,0.75); min-height: 0; }
.detail { padding: 10px; border: 1px solid #b7cde6; border-radius: 10px; background: #ffffff; min-height: 190px; }
.d-name { font-size: 18px; font-weight: bold; }
.d-stats { display: flex; gap: 10px; font-size: 12px; color: #a86b00; margin: 6px 0; flex-wrap: wrap; }
.d-text { font-size: 12px; line-height: 1.6; color: #34475f; margin: 6px 0; }
.d-note { font-size: 12px; color: #6d819b; }
.d-label { font-size: 12px; color: #5d7391; margin: 6px 0; }
.d-actions { margin-top: 8px; }
.genre-row { display: flex; gap: 6px; flex-wrap: wrap; }
.log { flex: none; height: 240px; overflow-y: auto; font-size: 12px; line-height: 1.5; color: #34475f; padding: 8px; border: 1px solid #b7cde6; border-radius: 10px; background: #ffffff; }
.log div { padding: 2px 0; border-bottom: 1px solid rgba(0,0,0,0.06); }

.overlay { position: fixed; inset: 0; background: rgba(40,60,90,0.45); display: grid; place-items: center; z-index: 50; }
.quiz { width: min(520px, 92vw); padding: 22px; border: 2px solid #e0a800; border-radius: 14px; background: #ffffff; color: #1d2b3f; display: flex; flex-direction: column; gap: 10px; }
.quiz.result { text-align: center; align-items: center; }
.q-title { font-size: 13px; color: #a86b00; }
.q-title span { color: #5d7391; }
.q-genre { align-self: flex-start; padding: 2px 10px; border-radius: 10px; background: #dbe8f8; font-size: 12px; }
.q-lines { font-size: 18px; line-height: 1.7; font-weight: bold; }
.quiz input { padding: 12px; font-size: 18px; border-radius: 8px; border: 1px solid #8aa3c2; background: #f4f8fd; color: #1d2b3f; }
.q-left { font-size: 12px; color: #5d7391; text-align: right; }
.timer { height: 8px; border-radius: 4px; background: #d3e0f0; overflow: hidden; }
.timer span { display: block; height: 100%; background: linear-gradient(90deg, #f06a6a, #f5c76b, #5fd6a2); transition: width 0.25s linear; }
.opp-quiz { position: fixed; left: 50%; top: 10px; transform: translateX(-50%); width: min(620px, 90vw); padding: 10px 14px; border: 1px solid #d98585; border-radius: 10px; background: rgba(255,236,238,0.97); color: #3a1f28; font-size: 13px; z-index: 40; display: flex; flex-direction: column; gap: 6px; }

.atk-arrow { position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 70; filter: drop-shadow(0 0 4px rgba(0,0,0,0.4)); }
.atk-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: atk-draw 0.45s ease-out forwards; }
@keyframes atk-draw { to { stroke-dashoffset: 0; } }
.toast { position: fixed; left: 50%; bottom: 30%; transform: translateX(-50%); padding: 14px 22px; border-radius: 12px; z-index: 60; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 14px; }
.toast b { font-size: 24px; }
.toast.ok { background: rgba(214,247,230,0.98); color: #14573a; border: 2px solid #3fb584; }
.toast.ng { background: rgba(255,226,230,0.98); color: #7a2433; border: 2px solid #e0707f; }
.err { position: fixed; top: 10px; right: 300px; padding: 8px 14px; border-radius: 8px; background: #6b2a34; z-index: 70; font-size: 13px; }

@keyframes pulse { 50% { opacity: 0.75; } }

.deck-page { min-height: 100vh; padding: 20px; background: radial-gradient(ellipse at center, #ffffff 0%, #dcebfb 80%); color: #1d2b3f; font-family: sans-serif; }
.deck-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.deck-head h1 { margin: 0; font-size: 22px; margin-right: auto; }
.deck-name { padding: 8px 10px; border: 1px solid #8aa3c2; border-radius: 8px; font-size: 15px; background: #fff; color: #1d2b3f; }
.deck-total { font-weight: bold; font-size: 18px; color: #c0392b; }
.deck-total.ok { color: #1f8f62; }
.deck-list { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.deck-entry { display: flex; flex-direction: column; gap: 4px; padding: 12px 18px; border: 2px solid #b7cde6; border-radius: 10px; background: #fff; color: inherit; font: inherit; cursor: pointer; text-align: left; }
.deck-entry.selected { border-color: #3fb584; box-shadow: 0 0 10px rgba(63,181,132,0.5); }
.deck-entry span { font-size: 12px; color: #5d7391; }
.deck-detail { padding: 14px; border: 1px solid #b7cde6; border-radius: 12px; background: rgba(255,255,255,0.85); }
.deck-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
.deck-mini { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; font-weight: bold; text-align: center; }
.deck-mini .c-art { width: 90px; height: 90px; flex: none; }
.deck-actions { display: flex; gap: 10px; flex-wrap: wrap; }
.deck-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
.deck-item { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px; border: 2px solid #b7cde6; border-radius: 10px; background: #fff; }
.deck-item.in { border-color: #3fb584; }
.deck-art { width: 100px; height: 100px; display: flex; }
.deck-art .c-art { width: 100%; height: 100%; }
.di-name { font-weight: bold; font-size: 15px; }
.di-stats { font-size: 12px; color: #a86b00; }
.di-text { font-size: 11px; line-height: 1.5; color: #34475f; margin: 0; flex: 1; }
.di-ctrl { display: flex; align-items: center; gap: 14px; font-size: 18px; }
@media (max-width: 900px) {
  .tcg { grid-template-columns: 1fr; overflow-y: auto; height: auto; min-height: 100vh; }
  .panel { border-left: none; border-top: 1px solid #2c3d55; min-height: 280px; }
  .player-strip { grid-template-columns: 1fr; }
  .err { right: 10px; }
}
`;
