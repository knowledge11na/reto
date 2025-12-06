// ボスバトル共通設定

// ★ このイベントを一意に表すキー（テーブルにも保存する）
export const BOSS_EVENT_KEY = '2025-12-east-blue';

// ★ 出題するタグ名（管理画面で付けてるタグと一致させる）
export const BOSS_TAG_LABEL = '東の海';

// ★ イベント期間（日本時間でOK）
export const BOSS_EVENT_START = '2025-12-07T00:00:00+09:00';
export const BOSS_EVENT_END   = '2025-12-14T23:59:59+09:00';

// ★ 討伐目標
export const BOSS_GOAL_CORRECT = 3000;

// ★ ベリー報酬
export const BOSS_REWARD_ALL   = 2000;          // 討伐成功時、参加者全員
export const BOSS_REWARD_RANK  = [3000, 2000, 1000]; // 1位,2位,3位 追加
