// file: app/solo/punkrecords/abilities.js

// -------------------------
// パンクレコード 能力設定
// -------------------------

export const ROLE_ABILITIES = {
  sei: {
    id: 'sei',
    name: '正',
    character: '正(シャカ)',
    title: '守護',
    description:
      '説明文の文字・記号を1つ指定し、その文字を欲（ヨーク）に書き換え・消去されないようにする。',
  },

  aku: {
    id: 'aku',
    name: '悪',
    character: '悪(リリス)',
    title: '改変',
    description:
      '他のプレイヤーが担当している文字を1つだけ書き換える。',
  },

  sou: {
    id: 'sou',
    name: '想',
    character: '想(エジソン)',
    title: '解析',
    description:
      '自分が担当する文字を1つ選び、その正解の文字を確認する。',
  },

  chi: {
    id: 'chi',
    name: '知',
    character: '知(ピタゴラス)',
    title: '解析',
    description:
      '自分以外のプレイヤーが担当する文字を1つ選び、その正解の文字を確認する。',
  },

  bou: {
    id: 'bou',
    name: '暴',
    character: '暴(アトラス)',
    title: '索敵',
    description:
      '文字を1つ指定し、その文字が説明文に含まれている場合、その文字がある位置をすべて確認する。',
  },
};


// -------------------------
// 初期状態
// -------------------------

export const DEFAULT_ABILITY_SETTINGS = {
  sei: true,
  aku: true,
  sou: true,
  chi: true,
  bou: true,
};


// -------------------------
// 能力ID一覧
// -------------------------

export const ABILITY_IDS = [
  'sei',
  'aku',
  'sou',
  'chi',
  'bou',
];


// -------------------------
// 能力がONか確認
// -------------------------

export function isAbilityEnabled(
  abilitySettings,
  abilityId
) {
  return (
    abilitySettings?.[abilityId] === true
  );
}


// -------------------------
// 能力情報取得
// -------------------------

export function getRoleAbility(
  roleId
) {
  return (
    ROLE_ABILITIES[roleId] ?? null
  );
}


// =====================================================
// 能力処理
// =====================================================


// -------------------------
// 正（シャカ）
// 守護
// -------------------------

export function applySeiAbility({
  index,
  abilityUsed,
}) {
  if (abilityUsed) {
    return {
      success: false,
      reason:
        '正（シャカ）の能力はすでに使用しています。',
    };
  }

  if (
    index === null ||
    index === undefined
  ) {
    return {
      success: false,
      reason:
        '保護する文字を選択してください。',
    };
  }

  return {
    success: true,
    used: true,
    protectedIndex: index,
  };
}


// -------------------------
// 悪（リリス）
// 改変
//
// ※正の保護は関係しない
// -------------------------

export function applyAkuAbility({
  index,
  value,
  abilityUsed,
  isOwnSlot,
}) {
  if (abilityUsed) {
    return {
      success: false,
      reason:
        '悪（リリス）の能力はすでに使用しています。',
    };
  }

  if (
    index === null ||
    index === undefined
  ) {
    return {
      success: false,
      reason:
        '書き換える文字を選択してください。',
    };
  }

  if (isOwnSlot) {
    return {
      success: false,
      reason:
        '自分の担当文字は変更できません。',
    };
  }

  const nextValue =
    String(value ?? '');

  if (!nextValue.trim()) {
    return {
      success: false,
      reason:
        '書き換える文字を入力してください。',
    };
  }

  return {
    success: true,
    used: true,
    targetIndex: index,
    value: nextValue,
  };
}


// -------------------------
// 想（エジソン）
// 解析
// -------------------------

export function applySouAbility({
  index,
  abilityUsed,
  isOwnSlot,
  correctValue,
}) {
  if (abilityUsed) {
    return {
      success: false,
      reason:
        '想（エジソン）の能力はすでに使用しています。',
    };
  }

  if (
    index === null ||
    index === undefined
  ) {
    return {
      success: false,
      reason:
        '確認する文字を選択してください。',
    };
  }

  if (!isOwnSlot) {
    return {
      success: false,
      reason:
        '自分の担当文字を選択してください。',
    };
  }

  return {
    success: true,
    used: true,
    targetIndex: index,
    value: correctValue,
  };
}


// -------------------------
// 知（ピタゴラス）
// 解析
// -------------------------

export function applyChiAbility({
  index,
  abilityUsed,
  isOwnSlot,
  correctValue,
}) {
  if (abilityUsed) {
    return {
      success: false,
      reason:
        '自分以外の担当文字を選択してください。',
    };
  }

  if (
    abilityUsed
  ) {
    return {
      success: false,
      reason:
        '知（ピタゴラス）の能力はすでに使用しています。',
    };
  }

  if (
    index === null ||
    index === undefined
  ) {
    return {
      success: false,
      reason:
        '確認する文字を選択してください。',
    };
  }

  if (isOwnSlot) {
    return {
      success: false,
      reason:
        '自分以外の担当文字を選択してください。',
    };
  }

  return {
    success: true,
    used: true,
    targetIndex: index,
    value: correctValue,
  };
}


// -------------------------
// 暴（アトラス）
// 索敵
// -------------------------

export function applyBouAbility({
  target,
  descriptionChars,
  abilityUsed,
}) {
  if (abilityUsed) {
    return {
      success: false,
      reason:
        '暴（アトラス）の能力はすでに使用しています。',
    };
  }

  const value =
    String(target ?? '');

  if (!value.trim()) {
    return {
      success: false,
      reason:
        '調べる文字を入力してください。',
    };
  }

  const indexes = [];

  descriptionChars.forEach(
    (char, index) => {
      if (char === value) {
        indexes.push(index);
      }
    }
  );

  return {
    success: true,
    used: true,
    target: value,
    indexes,
  };
}


// =====================================================
// 能力結果を説明文に反映
// =====================================================


// -------------------------
// 悪による改変文字
// -------------------------

export function getAkuValue(
  akuAbilityValues,
  index
) {
  return (
    akuAbilityValues?.[index] ??
    ''
  );
}


// -------------------------
// ヨークによる改変文字
//
// protectedIndex はヨークにのみ適用。
// 悪の改変には適用しない。
// -------------------------

export function getYorkValue({
  yorkStealthValues,
  index,
  protectedIndex,
}) {
  if (
    protectedIndex === index
  ) {
    return '';
  }

  return (
    yorkStealthValues?.[index] ??
    ''
  );
}


// -------------------------
// 最終的に表示する文字
//
// 優先順位
//
// ① 悪の改変
// ② ヨークの改変
// ③ 通常入力
//
// ※悪は正のプロテクトを無視する
// ※ヨークだけ正のプロテクトを受ける
// -------------------------

export function getEffectiveCharacter({
  index,
  inputValue,
  akuAbilityValues,
  yorkStealthValues,
  protectedIndex,
}) {
  const akuValue =
    getAkuValue(
      akuAbilityValues,
      index
    );

  if (akuValue) {
    return akuValue;
  }

  const yorkValue =
    getYorkValue({
      yorkStealthValues,
      index,
      protectedIndex,
    });

  if (yorkValue) {
    return yorkValue;
  }

  return (
    inputValue ?? ''
  );
}


// -------------------------
// ヨークの記号隠し
//
// 正の保護対象なら隠さない
// -------------------------

export function isYorkSymbolHidden({
  index,
  selectedHiddenSymbolIndexes,
  lastHiddenSymbolIndexes,
  protectedIndex,
}) {
  if (
    protectedIndex === index
  ) {
    return false;
  }

  return (
    selectedHiddenSymbolIndexes?.includes(
      index
    ) ||
    lastHiddenSymbolIndexes?.includes(
      index
    )
  );
}