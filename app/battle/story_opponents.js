// file: app/battle/story_opponents.js
// ストーリー用AI対戦の相手データ
// ・tagOffer: 相手が指定してくるタグ候補（ここからプレイヤーが選べる）
// ・forcedTags: 相手が強制的に指定するタグ（選択なし）
// ・batchByDifficulty: 弱いほど一度に出す問題数が多い（1〜4）
// ・correctRate: 正解率（0〜1）
// ・answerSec: 基本解答秒数（ここから±3秒ブレる）
// ・poolSize: その相手との対戦で使う問題数（デッキ上限）

export const STORY_OPPONENTS = [
  {
    key: 'tarou',
    name: 'たろう牛丼',
    face: '/story/char/tarou.png',
    difficulty: 'easy',
    tagOffer: ['東の海', 'SBS', 'セリフ', '扉絵', '表紙'],
    forcedTags: [],
    batchByDifficulty: { easy: 4, normal: 3, hard: 2, boss: 1 },
    correctRate: 0.55,
    answerSec: 18,
    poolSize: 60,
    rewardPoints: 10,
  },
  {
    key: 'fuyu',
    name: 'ふゆ',
    face: '/story/char/fuyu.png',
    difficulty: 'normal',
    tagOffer: ['アラバスタ', '空島', 'ビブルカード', '巻跨ぎ', 'サブタイトル'],
    forcedTags: [],
    batchByDifficulty: { easy: 4, normal: 3, hard: 2, boss: 1 },
    correctRate: 0.68,
    answerSec: 16,
    poolSize: 55,
    rewardPoints: 14,
  },
  {
    key: 'dragon50',
    name: 'ドラゴン50號',
    face: '/story/char/dragon50.png',
    difficulty: 'hard',
    tagOffer: ['ワノ国', '世界会議', 'エッグヘッド', 'SBS', 'ビブルカード'],
    forcedTags: [],
    batchByDifficulty: { easy: 4, normal: 3, hard: 2, boss: 1 },
    correctRate: 0.78,
    answerSec: 14,
    poolSize: 50,
    rewardPoints: 18,
  },
  {
    key: 'mentai',
    name: 'めんたいうどん',
    face: '/story/char/mentai.png',
    difficulty: 'boss',
    tagOffer: ['全タグ（ランダム）'],
    forcedTags: ['ALL'], // ALLは特殊扱い
    batchByDifficulty: { easy: 4, normal: 3, hard: 2, boss: 1 },
    correctRate: 0.86,
    answerSec: 12,
    poolSize: 45,
    rewardPoints: 25,
  },
];

// difficulty から「一度に出す問題数」を確定
export function getBatchCount(opp) {
  const d = opp?.difficulty || 'normal';
  const n = opp?.batchByDifficulty?.[d] ?? 2;
  return Math.max(1, Math.min(4, Number(n) || 2));
}
