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
    name: '麦茶ん',
    power: 5,
    cost: 7,
    count: 3,
    blocker: false,
    text: '【起動】ターンに1回、年齢・身長・好物・血液型から選んで出題。正解でパワー+1（永続）。一度使ったジャンルでは、失敗しても強化できない。',
  },
  zori: {
    name: 'ゾリ',
    power: 4,
    cost: 6,
    count: 3,
    blocker: false,
    text: '【攻撃時／攻撃された時】サブタイ間クイズ。正解でパワー+2（バトル後に戻る）。',
  },
  dorobou: {
    name: '泥棒魔女',
    power: 2,
    cost: 3,
    count: 3,
    blocker: false,
    text: '【起動】ターンに1回、技漢字クイズ。正解で相手のライフに2ダメージ。',
  },
  hanap: {
    name: '鼻ップ',
    power: 1,
    cost: 1,
    count: 3,
    blocker: false,
    text: '【攻撃時】季節・趣味・嫌いな食べ物からランダム1問。正解でパワー+2＆ブロックされない。',
  },
  prince: {
    name: 'ミス・プリンス',
    power: 4,
    cost: 6,
    count: 3,
    blocker: false,
    text: '【登場時】サブタイ漢字クイズ。正解でこのターン攻撃でき、パワー+2（このターンのみ）。',
  },
  chappy: {
    name: 'チャッピー',
    power: 2,
    cost: 2,
    count: 2,
    blocker: true,
    text: '【ブロッカー】ブロック時に何年前クイズ。正解でパワー+3（相手よりパワーが高くなっても相手を破壊できない）。',
  },
  allholiday: {
    name: 'オールホリデー',
    power: 2,
    cost: 3,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、何年前クイズ。正解で山札を1枚引く。',
  },
  riesen: {
    name: 'リーゼンコーラ',
    power: 3,
    cost: 4,
    count: 2,
    blocker: true,
    text: '【ブロッカー】ブロック時に趣味／嫌いな食べ物からクイズ。正解でパワー+3。',
  },
  corobokkle: {
    name: 'コロボックル',
    power: 2,
    cost: 4,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、技ヒントと間サブタイを出題。両方正解で相手のキャラ1体をダウンさせる。',
  },
  hojiro: {
    name: 'ホオジロ',
    power: 3,
    cost: 5,
    count: 2,
    blocker: false,
    text: '【攻撃時】間の技と技漢字を1問ずつ出題。両方正解でパワー+4。',
  },
  kavell: {
    name: 'カーヴェル',
    power: 1,
    cost: 4,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、全ジャンルからランダム1問。正解で味方のダウン中キャラ1体を回復する。',
  },
  sloop: {
    name: 'スループ',
    power: 2,
    cost: 5,
    count: 2,
    blocker: false,
    text: '【起動】ターンに1回、全ジャンルからランダム1問。正解でスループ以外の味方キャラ全員のパワー+1（永続・重ね掛け可）。',
  },
  mugicha5: {
    name: '麦茶んファイブ',
    power: 7,
    cost: 10,
    count: 1,
    blocker: false,
    text: '【攻撃時】技ヒント・間の技・技漢字を1問ずつ出題。正解1問につきパワー+1で攻撃（攻撃後に戻る）。2問以上間違えると攻撃失敗。',
  },
};

export const DECK_SIZE = 30;
export const MAX_COPIES = 3;

// スタンダードデッキ（{ defId: 枚数 }）
export const STANDARD_DECK = Object.fromEntries(
  Object.entries(CARD_DEFS).map(([id, def]) => [id, def.count])
);

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
]);

export const MUGICHA_GENRES = ['age', 'height', 'food', 'blood'];
