// file: lib/tcgCards.js
// ONE PIECE TCG（仮）のカード定義・ルール定数

export const COST_FIRST = [1, 3, 5, 7, 9, 10];
export const COST_SECOND = [2, 4, 6, 8, 10];
export const INITIAL_LIFE = 3;
export const LIFE_HP = 10;
export const INITIAL_HAND = 3;
export const BOARD_SIZE = 5;
export const QUIZ_MS = 40000;

export const CARD_DEFS = {
  mugicha: {
    name: 'モンキー・D・ルフィ',
    power: 5,
    cost: 7,
    count: 3,
    blocker: false,
    text: '【起動】ターンに1回、年齢・身長・好物・血液型から選んで出題。正解でパワー+1（永続）。一度使ったジャンルでは、失敗しても強化できない。',
  },
  zori: {
    name: 'ロロノア・ゾロ',
    power: 4,
    cost: 6,
    count: 3,
    blocker: false,
    text: '【攻撃時／攻撃された時】サブタイ間クイズ。正解でパワー+2（バトル後に戻る）。',
  },
  dorobou: {
    name: 'ナミ',
    power: 2,
    cost: 3,
    count: 3,
    blocker: false,
    text: '【起動】ターンに1回、技漢字クイズ。正解で相手のライフに2ダメージ。',
  },
  hanap: {
    name: 'ウソップ',
    power: 1,
    cost: 1,
    count: 3,
    blocker: false,
    text: '【攻撃時】季節・趣味・嫌いな食べ物からランダム1問。正解でパワー+2＆ブロックされない。',
  },
  prince: {
    name: 'サンジ',
    power: 4,
    cost: 6,
    count: 3,
    blocker: false,
    text: '【登場時】サブタイ漢字クイズ。正解でこのターン攻撃でき、パワー+2（このターンのみ）。',
  },
  chappy: {
    name: 'トニートニー・チョッパー',
    power: 2,
    cost: 2,
    count: 2,
    blocker: true,
    text: '【ブロッカー】ブロック時に何年前クイズ。正解でパワー+3（相手よりパワーが高くなっても相手を破壊できない）。',
  },
  allholiday: {
    name: 'ニコ・ロビン',
    power: 2,
    cost: 3,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、何年前クイズ。正解で山札を1枚引く。',
  },
  riesen: {
    name: 'フランキー',
    power: 3,
    cost: 4,
    count: 2,
    blocker: true,
    text: '【ブロッカー】ブロック時に船クイズ。正解でパワー+3。',
  },
  corobokkle: {
    name: 'ブルック',
    power: 2,
    cost: 4,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、技ヒントと性格を1問ずつ出題。両方正解で相手のキャラ1体をダウンさせる。',
  },
  hojiro: {
    name: 'ジンベエ',
    power: 3,
    cost: 5,
    count: 2,
    blocker: false,
    text: '【攻撃時】魚人・人魚の種族クイズを2問出題。両方正解でパワー+4。',
  },
  kavell: {
    name: 'メリー号',
    power: 1,
    cost: 4,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、全ジャンルからランダム1問。正解で味方のダウン中キャラ1体を回復する。',
  },
  sloop: {
    name: 'サニー号',
    power: 2,
    cost: 5,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、全ジャンルからランダム1問。正解でサニー号以外の味方キャラ全員のパワー+1（永続・重ね掛け可）。',
  },
  mugicha5: {
    name: 'ルフィ（ギア5）',
    power: 7,
    cost: 10,
    count: 1,
    blocker: false,
    text: '【攻撃時】技ヒント・間の技・技漢字を1問ずつ出題。正解1問につきパワー+1で攻撃（攻撃後に戻る）。2問以上間違えると攻撃失敗。',
  },
  // 追加カード：初期デッキには入らず（count: 0）、デッキ編集で入れられる
  vivi: {
    name: 'ネフェルタリ・ビビ',
    power: 2,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【攻撃時】間の技クイズ。正解で相手のパワー3以下のキャラ1体を破壊する。',
  },
  karoo: {
    name: 'カルー',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、このカードをダウンさせる。その後イメージクイズを1問出題。正解で味方キャラ1体を選び、このターン出たターンでも攻撃でき、ダウンしていない相手キャラにも攻撃できるようになる。',
  },
  crocodile: {
    name: 'クロコダイル',
    power: 4,
    cost: 5,
    count: 0,
    blocker: false,
    text: '【攻撃時】技漢字クイズ。正解で相手キャラ1体のパワー-2（このターン中）。',
  },
  enel: {
    name: 'エネル',
    power: 4,
    cost: 5,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、間の技クイズ。正解で相手キャラ2体のパワー-2（このターン中）。',
  },
  lucci: {
    name: 'ルッチ',
    power: 3,
    cost: 4,
    count: 0,
    blocker: false,
    text: '【登場時】サブタイ漢字クイズ。正解で出たターンに攻撃でき、相手キャラ1体のパワー-2（このターン中）。',
  },
  doflamingo: {
    name: 'ドフラミンゴ',
    power: 3,
    cost: 4,
    count: 0,
    blocker: true,
    text: '【ブロッカー】ブロック時、間の技と技ヒントを1問ずつ出題。両方正解で相手キャラ1体をダウンさせる。',
  },
  katakuri: {
    name: 'カタクリ',
    power: 5,
    cost: 7,
    count: 0,
    blocker: true,
    text: '【攻撃時／ブロック時】サブタイ漢字と何年前を1問ずつ出題。正解1問につき相手キャラ1体のパワー-1（永続）。',
  },
  buggy: {
    name: 'バギー',
    power: 2,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【攻撃時】イメージクイズ。正解で相手のパワー1以下のキャラ1体を破壊する。',
  },
  arlong: {
    name: 'アーロン',
    power: 2,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、魚人・人魚の種族クイズ。正解で相手のダウン中キャラ1体のパワー-2（このターン中）。',
  },
  wapol: {
    name: 'ワポル',
    power: 1,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、好物クイズ。正解で自分の他のキャラの効果によりパワーが下がっている相手キャラの、パワー減少量合計分、このターン中パワー+。',
  },
  moria: {
    name: 'モリア',
    power: 4,
    cost: 6,
    count: 0,
    blocker: false,
    text: '【攻撃時】サブタイ間を2問出題。両方正解で、自分の他のキャラの効果で下がっている相手キャラのパワー減少量合計分、相手のライフ耐久力にダメージ。',
  },
  magellan: {
    name: 'マゼラン',
    power: 5,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【攻撃時】性格クイズを1問出題。不正解なら自分のライフ耐久力に3ダメージを受け、攻撃失敗。',
  },
  hody: {
    name: 'ホーディ',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【攻撃時】技漢字を3問出題。正解1問につきパワー+1、不正解1問につき自分のライフ耐久力に1ダメージ。',
  },
  caesar: {
    name: 'シーザー',
    power: 1,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【登場時】船クイズを2問出題。両方正解で相手キャラ全員のパワー-1（このターン中）。',
  },
  kaido: {
    name: 'カイドウ',
    power: 10,
    cost: 10,
    count: 0,
    blocker: false,
    text: '【登場時】何年前・サブタイ漢字・技漢字を1問ずつ出題。全問正解で相手のパワー3以下のキャラを全て破壊。不正解が1問でもあればこのカードを破壊する。',
  },
  foxy: {
    name: 'フォクシー',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【攻撃時】サブタイ間クイズ。正解で相手キャラ1体のパワー-1（次の相手ターン終了時まで）。',
  },
  creek: {
    name: 'クリーク',
    power: 2,
    cost: 3,
    count: 0,
    blocker: true,
    text: '【ブロッカー】ブロック時、趣味・嫌いな食べ物・季節から1問。正解で相手のパワー2以下のキャラ1体を破壊する。',
  },
  dragon: {
    name: 'ドラゴン',
    power: 7,
    cost: 9,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、技漢字とサブタイ漢字から各2問、計4問を出題。全問正解でダウン中の味方キャラ全員を回復する。',
  },
  sabo: {
    name: 'サボ',
    power: 5,
    cost: 7,
    count: 0,
    blocker: false,
    text: '【登場時】サブタイ漢字クイズ。正解でパワー+1（永続）。【攻撃時】技漢字クイズ。正解で相手のライフ耐久力に2ダメージ。',
  },
  koala: {
    name: 'コアラ',
    power: 1,
    cost: 1,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、年齢・身長・好物・血液型から1問。正解で味方キャラ1体のパワー+1（このターン中）。',
  },
  hack: {
    name: 'ハック',
    power: 3,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【攻撃時／攻撃された時】魚人・人魚の種族クイズ。正解でパワー+1、不正解でパワー-1（このターン中）。',
  },
  ivankov: {
    name: 'イワンコフ',
    power: 4,
    cost: 5,
    count: 0,
    blocker: false,
    text: '【登場時】イメージクイズを2問出題。両方正解で山札から2枚引く。',
  },
  inazuma: {
    name: 'イナズマ',
    power: 2,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、イメージクイズを2問出題。両方正解で手札を1枚捨て、山札から2枚引く。',
  },
  beloBetty: {
    name: 'ベロ・ベティ',
    power: 2,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【起動】何度でも使用可能（ダウン中は不可）。自身をダウンさせ、趣味・嫌いな食べ物・季節から1問。正解で次の相手ターン終了まで、自身以外の味方キャラのパワー+1。',
  },
  morley: {
    name: 'モーリー',
    power: 3,
    cost: 4,
    count: 0,
    blocker: true,
    text: '【ブロッカー】ブロック時、技ヒントを2問出題。両方正解でこのターン中破壊されない。',
  },
  lindbergh: {
    name: 'リンドバーグ',
    power: 2,
    cost: 3,
    count: 0,
    blocker: false,
    text: '【攻撃時】何年前を2問出題。1問正解で相手のコスト2以下、2問正解でコスト4以下のキャラ1体を破壊する。',
  },
  karasu: {
    name: 'カラス',
    power: 3,
    cost: 4,
    count: 0,
    blocker: false,
    text: '【攻撃時】間の技クイズ。正解で自身のパワー以下の相手キャラ1体を破壊する。',
  },
  ahiru: {
    name: 'あひる',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【起動】ターンに1回、趣味・嫌いな食べ物・季節から1問。正解で味方のダウン中のベロ・ベティ1体を回復する。',
  },
  ushiarno: {
    name: 'ウシアーノ',
    power: 1,
    cost: 2,
    count: 0,
    blocker: true,
    text: '【起動】ターンに1回、技ヒントクイズ。正解で味方のダウン中のモーリー1体を回復する。',
  },
  gambo: {
    name: 'ギャンボ',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【攻撃時】何年前クイズ。正解で味方のダウン中のリンドバーグ1体を回復する。',
  },
  jiron: {
    name: 'ジロン',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【攻撃時】間の技クイズ。正解で味方のダウン中のカラス1体を回復する。',
  },
  bunnyJoe: {
    name: 'バニー・ジョー',
    power: 1,
    cost: 1,
    count: 0,
    blocker: false,
    text: '【登場時】サブタイ漢字クイズ。正解で山札から1枚引く。',
  },
  terryGilteo: {
    name: 'テリー・ギルテオ',
    power: 1,
    cost: 2,
    count: 0,
    blocker: false,
    text: '【登場時】技漢字クイズ。正解で相手キャラ1体をダウンさせる。',
  },
};

export const DECK_SIZE = 30;
export const MAX_COPIES = 3;

// スタンダードデッキ（{ defId: 枚数 }）。追加カード（count: 0）は含めない
export const STANDARD_DECK = Object.fromEntries(
  Object.entries(CARD_DEFS)
    .filter(([, def]) => def.count > 0)
    .map(([id, def]) => [id, def.count])
);

export const VILLAINS_DECK = {
  crocodile: 2,
  enel: 2,
  lucci: 2,
  doflamingo: 2,
  katakuri: 2,
  buggy: 3,
  arlong: 3,
  wapol: 3,
  moria: 2,
  magellan: 2,
  hody: 3,
  caesar: 3,
  kaido: 1,
};

export const REVOLUTIONARY_DECK = {
  dragon: 1,
  sabo: 2,
  koala: 3,
  hack: 2,
  ivankov: 2,
  inazuma: 2,
  beloBetty: 3,
  morley: 3,
  lindbergh: 3,
  karasu: 3,
  ahiru: 1,
  ushiarno: 1,
  gambo: 2,
  jiron: 2,
};

export const STANDARD_CARD_POOL = [
  'mugicha', 'zori', 'dorobou', 'hanap', 'prince', 'chappy', 'allholiday',
  'riesen', 'corobokkle', 'hojiro', 'kavell', 'sloop', 'mugicha5', 'vivi', 'karoo',
];

export const VILLAINS_CARD_POOL = [
  'crocodile', 'enel', 'lucci', 'doflamingo', 'katakuri', 'buggy', 'arlong',
  'wapol', 'moria', 'magellan', 'hody', 'caesar', 'kaido', 'foxy', 'creek',
];

export const REVOLUTIONARY_CARD_POOL = [
  'dragon', 'sabo', 'koala', 'hack', 'ivankov', 'inazuma', 'beloBetty',
  'morley', 'lindbergh', 'karasu', 'ahiru', 'ushiarno', 'gambo', 'jiron',
  'bunnyJoe', 'terryGilteo',
];

// 有効なデッキなら { defId: 枚数 } に正規化して返し、不正なら null
export function normalizeDeck(deck) {
  if (!deck || typeof deck !== 'object' || Array.isArray(deck)) return null;
  const out = {};
  let total = 0;
  for (const [id, raw] of Object.entries(deck)) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) return null;
    if (n === 0) continue;
    if (!CARD_DEFS[id] || n > MAX_COPIES) return null;
    out[id] = n;
    total += n;
  }
  return total === DECK_SIZE ? out : null;
}

export const ACTIVE_CARDS = new Set([
  'mugicha',
  'dorobou',
  'allholiday',
  'corobokkle',
  'kavell',
  'sloop',
  'karoo',
  'enel',
  'arlong',
  'wapol',
  'dragon',
  'koala',
  'inazuma',
  'beloBetty',
  'ahiru',
  'ushiarno',
]);

export const MUGICHA_GENRES = ['age', 'height', 'food', 'blood'];
