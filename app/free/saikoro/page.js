// file: app/free/saikoro/page.js
'use client';

import {useEffect,useMemo,useRef,useState,}from'react';

import {
  loadSaikoroVivreProfiles,
  createVivreCardState,
  VIVRE_INFO_LABELS,
  VIVRE_INFO_COSTS,
  isCorrectVivreAnswer,
} from './vivreCard';

const RESOURCE_NAMES = {
  berry: 'ベリー',
  verse: 'ヴァース',
  eternal: '永久指針',
};

const RESOURCE_ICONS = {
  berry: '/saikoro/berry.png',
  verse: '/saikoro/vasu.png',
  eternal: '/saikoro/pors.png',
};

const EXTRA_SYMBOL_REGEX =
  /[\s「」『』（）()［］【】〈〉《》〔〕、。・，．！？!?：:；;／/\\＼〜～—−―…‥“”"']/;

function isExtraSymbol(char) {
  return EXTRA_SYMBOL_REGEX.test(char);
}

function createExtraCharacterBoard(description) {
  return Array.from(
    String(description || '')
  ).map((char, index) => ({
    index,
    char,
    revealed: isExtraSymbol(char),
  }));
}

const INITIAL_RESOURCES = [
  {
    berry: 3,
    verse: 0,
    eternal: 0,
  },
  {
    berry: 2,
    verse: 0,
    eternal: 0,
  },
  {
    berry: 1,
    verse: 0,
    eternal: 0,
  },
  {
    berry: 0,
    verse: 0,
    eternal: 0,
  },
];

const INITIAL_DICE_A = [
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'verse', value: 1 },
];

const INITIAL_DICE_B = [
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'berry', value: 1 },
  { type: 'eternal', value: 1 },
];

const VIVRE_INFO_FALLBACK = {
  nameLength: {
    label: '名前の文字数',
    cost: {
      berry: 8,
    },
  },

  favoriteFood: {
    label: '好物',
    cost: {
      verse: 3,
    },
  },

  height: {
    label: '身長',
    cost: {
      eternal: 2,
    },
  },

  age: {
    label: '年齢',
    cost: {
      eternal: 4,
    },
  },

  blood: {
    label: '血液型',
    cost: {
      eternal: 2,
    },
  },

  origin: {
    label: '出身',
    cost: {
      verse: 2,
      eternal: 2,
    },
  },

  gender: {
    label: '性別',
    cost: {
      verse: 1,
    },
  },

  family: {
    label: '家族',
    cost: {
      eternal: 2,
    },
  },
};

const INFO_ORDER = [
  'nameLength',
  'favoriteFood',
  'height',
  'age',
  'blood',
  'origin',
  'gender',
  'family',
];

function getInfoLabel(type) {
  return (
    VIVRE_INFO_LABELS?.[type] ||
    VIVRE_INFO_FALLBACK[type]?.label ||
    type
  );
}

function getInfoCost(type) {
  return (
    VIVRE_INFO_COSTS?.[type] ||
    VIVRE_INFO_FALLBACK[type]?.cost ||
    {}
  );
}

function formatCost(cost) {
  const result = [];

  if (cost?.berry) {
    result.push(`ベリー${cost.berry}`);
  }

  if (cost?.verse) {
    result.push(`ヴァース${cost.verse}`);
  }

  if (cost?.eternal) {
    result.push(`永久指針${cost.eternal}`);
  }

  return result.join(' / ');
}

function createPlayer(index) {
  const names = [
    'あなた',
    'CPU1',
    'CPU2',
    'CPU3',
  ];

  return {
    seat: index,
    id: `player-${index}`,
    name: names[index],
    isCpu: index !== 0,

    resources: {
      ...INITIAL_RESOURCES[index],
    },

    maxResources: {
      berry: 12,
      verse: 6,
      eternal: 6,
    },

    diceA: INITIAL_DICE_A.map(
      (face) => ({ ...face })
    ),

    diceB: INITIAL_DICE_B.map(
      (face) => ({ ...face })
    ),

    diceResult: null,

    cards: [],

    extraCharacterInfo: [],

    vivreCardInfo: {},

    extraCharacterCount: 0,

    vivreCardCount: 0,
  };
}

function clonePlayers() {
  return [
    createPlayer(0),
    createPlayer(1),
    createPlayer(2),
    createPlayer(3),
  ];
}

function randomChoice(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }

  return array[
    Math.floor(
      Math.random() * array.length
    )
  ];
}

function rollDice(dice) {
  if (!Array.isArray(dice) || dice.length === 0) {
    return null;
  }

  const index =
    Math.floor(
      Math.random() * dice.length
    );

  return {
    ...dice[index],
    index,
  };
}

function addResource(player, type, value) {
  if (!player || !type || !value) {
    return player;
  }

  const current =
    Number(
      player.resources?.[type] || 0
    );

  const max =
    Number(
      player.maxResources?.[type] || 999
    );

  return {
    ...player,
    resources: {
      ...player.resources,
      [type]: Math.min(
        max,
        current + value
      ),
    },
  };
}

function spendResources(
  player,
  cost
) {
  if (!player) {
    return false;
  }

  for (
    const type of [
      'berry',
      'verse',
      'eternal',
    ]
  ) {
    const required =
      Number(cost?.[type] || 0);

    const current =
      Number(
        player.resources?.[type] || 0
      );

    if (current < required) {
      return false;
    }
  }

  return true;
}

function applyCost(
  player,
  cost
) {
  const next = {
    ...player,
    resources: {
      ...player.resources,
    },
  };

  for (
    const type of [
      'berry',
      'verse',
      'eternal',
    ]
  ) {
    const required =
      Number(cost?.[type] || 0);

    next.resources[type] =
      Math.max(
        0,
        Number(
          next.resources[type] || 0
        ) - required
      );
  }

  return next;
}

function getCardProfile(card) {
  if (!card) {
    return null;
  }

  return (
    card.profile ||
    card.character ||
    card.data ||
    card
  );
}

function normalizeAnswerText(value) {
  return String(
    value ?? ''
  )
    .normalize('NFKC')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/[・･]/g, '')
    .replace(
      /[\s　]/g,
      ''
    )
    .toLowerCase()
    .trim();
}

function getNameAliases(name) {
  const raw =
    String(name ?? '');

  const normalized =
    normalizeAnswerText(raw);

  const parts =
    raw
      .split(
        /[-‐-‒–—―ー・･\s　]+/
      )
      .map(
        (item) =>
          normalizeAnswerText(item)
      )
      .filter(Boolean);

  const aliases = [
    normalized,
    ...parts,
  ];

  return Array.from(
    new Set(
      aliases.filter(Boolean)
    )
  );
}

function isSimpleAnswerCorrect(
  card,
  answer
) {
  const profile =
    getCardProfile(card);

  if (!profile) {
    return false;
  }

  const input =
    normalizeAnswerText(answer);

  if (!input) {
    return false;
  }

  const official =
    String(
      profile.name ?? ''
    );

  const aliases =
    getNameAliases(
      official
    );

  return aliases.some(
    (alias) =>
      alias === input ||
      input === alias ||
      alias.endsWith(input)
  );
}

function getFavoriteFoodCharacters(
  food
) {
  return Array.from(
    String(food ?? '')
  );
}

function getDigitItems(value) {
  return Array.from(
    String(value ?? '')
  ).map(
    (char, index) => ({
      char,
      index,
    })
  );
}

function getFamilyItems(profile) {
  if (
    !Array.isArray(
      profile?.family
    )
  ) {
    return [];
  }

  return profile.family
    .filter(
      (item) =>
        String(
          item ?? ''
        ).trim()
    )
    .map(
      (item, index) => ({
        value: String(item),
        index,
      })
    );
}

function createInitialInfoState() {
  return {
    nameLength: null,
    favoriteFood: [],
    height: [],
    age: [],
    blood: null,
    origin: null,
    gender: null,
    family: [],
  };
}

function getInfoDisplay(
  card,
  info
) {
  const profile =
    getCardProfile(card);

  if (!profile) {
    return '---';
  }

if (info === 'nameLength') {
  const value =
    card?.revealedInfo?.nameLength;

  if (
    value === null ||
    value === undefined
  ) {
    return '？？？';
  }

  return `${value}文字`;
}

  if (info === 'favoriteFood') {
    const chars =
      getFavoriteFoodCharacters(
        profile.favoriteFood
      );

    if (!chars.length) {
      return '情報なし';
    }

    const indexes =
      Array.isArray(
        card?.revealedInfo?.favoriteFood
      )
        ? card.revealedInfo.favoriteFood
        : [];

    return chars
      .map(
        (char, index) =>
          indexes.includes(index)
            ? char
            : '□'
      )
      .join('');
  }

  if (info === 'height') {
    const chars =
      getDigitItems(
        profile.height
      );

    const indexes =
      Array.isArray(
        card?.revealedInfo?.height
      )
        ? card.revealedInfo.height
        : [];

    if (!chars.length) {
      return '---';
    }

    return chars
      .map(
        (item) =>
          indexes.includes(item.index)
            ? item.char
            : '□'
      )
      .join('');
  }

  if (info === 'age') {
    const chars =
      getDigitItems(
        profile.age
      );

    const indexes =
      Array.isArray(
        card?.revealedInfo?.age
      )
        ? card.revealedInfo.age
        : [];

    if (!chars.length) {
      return '---';
    }

    return chars
      .map(
        (item) =>
          indexes.includes(item.index)
            ? item.char
            : '□'
      )
      .join('');
  }

  if (info === 'blood') {
    return (
      card?.revealedInfo?.blood ||
      '？？？'
    );
  }

  if (info === 'origin') {
    return (
      card?.revealedInfo?.origin ||
      '？？？'
    );
  }

  if (info === 'gender') {
    return (
      card?.revealedInfo?.gender ||
      '？？？'
    );
  }

  if (info === 'family') {
    const values =
      Array.isArray(
        card?.revealedInfo?.family
      )
        ? card.revealedInfo.family
        : [];

    if (
      values.length === 0
    ) {
      return '？？？';
    }

    return values.join(' / ');
  }

  return '？？？';
}

function getCardPublicSummary(
  card
) {
  if (!card) {
    return [];
  }

  return INFO_ORDER.map(
    (type) => ({
      type,
      label: getInfoLabel(type),
      value: getInfoDisplay(
        card,
        type
      ),
    })
  );
}

function ForgeFaceDisplay({
  face,
  faces,
}) {
  const list =
    Array.isArray(faces)
      ? faces
      : face
        ? [face]
        : [];

  if (!list.length) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        flexWrap: 'wrap',
      }}
    >
      {list.map(
        (item, index) => {
          if (
            item.type === 'random'
          ) {
            return (
              <div
                key={index}
                style={{
                  width: 58,
                  height: 58,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 12,
                  background:
                    'linear-gradient(145deg, #514936, #282219)',
                  border:
                    '2px dashed rgba(255,210,120,0.7)',
                  color: '#ffe29b',
                  fontSize: 30,
                  fontWeight: 1000,
                }}
              >
                ?
              </div>
            );
          }

          return (
            <div
              key={index}
              style={{
                width: 68,
                height: 68,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2,
                background: 'transparent',
                border: 'none',
                boxShadow: 'none',
              }}
            >
              <img
                src={
                  RESOURCE_ICONS[
                    item.type
                  ]
                }
                alt={
                  RESOURCE_NAMES[
                    item.type
                  ] ||
                  item.type
                }
                style={{
                  width: 48,
                  height: 48,
                  objectFit: 'contain',
                  display: 'block',
                  background: 'transparent',
                  mixBlendMode: 'multiply',
                }}
              />

<strong
  style={{
    fontSize: 15,
    fontWeight: 1000,
    color: '#172033',
    textShadow: 'none',
    lineHeight: 1,
  }}
>
  ×{item.value}
</strong>
            </div>
          );
        }
      )}
    </div>
  );
}

function getResourceNameForFace(
  type
) {
  return (
    RESOURCE_NAMES[type] ||
    type
  );
}

function ForgeOfferCard({
  offer,
  stock,
  selected,
  disabled,
  onSelect,
}) {
  if (!offer) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() =>
        onSelect(offer)
      }
      disabled={disabled}
      style={{
        ...styles.diceTempleCard,
        ...(selected
          ? styles.diceTempleCardSelected
          : {}),
        ...(disabled
          ? styles.diceTempleCardDisabled
          : {}),
      }}
    >
      <div
        style={
          styles.diceTempleCardTop
        }
      >
        <span
          style={
            styles.diceTempleStockLarge
          }
        >
          残り {stock}
        </span>

        {selected && (
          <span
            style={
              styles.diceTempleSelectedBadge
            }
          >
            選択中
          </span>
        )}
      </div>

      <div
        style={
          styles.diceTempleFaceArea
        }
      >
        <ForgeFaceDisplay
          faces={
            offer.faces
          }
        />
      </div>

      <div
        style={
          styles.diceTempleTouchGuide
        }
      >
        {disabled
          ? stock <= 0
            ? '在庫切れ'
            : 'ベリー不足'
          : selected
            ? 'この面を選択中'
            : 'タップして選択'}
      </div>
    </button>
  );
}

export default function SaikoroPage() {
  const [players, setPlayers] =
    useState(
      () => clonePlayers()
    );

const [extraCharacter, setExtraCharacter] =
  useState(null);

const [extraCharacterBoard, setExtraCharacterBoard] =
  useState([]);

  const [showExtraCharacterShop, setShowExtraCharacterShop] =
    useState(false);

  const [extraCharacterPurchaseMode, setExtraCharacterPurchaseMode] =
    useState(null);

  const [extraCharacterSelecting, setExtraCharacterSelecting] =
    useState(false);

  const [extraCharacters, setExtraCharacters] =
    useState([]);

  const [profiles, setProfiles] =
    useState([]);

  const [currentVivreCard, setCurrentVivreCard] =
    useState(null);

  const [usedVivreIds, setUsedVivreIds] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [loadError, setLoadError] =
    useState('');

  const [round, setRound] =
    useState(1);

  const [turnPlayer, setTurnPlayer] =
    useState(0);

  const [phase, setPhase] =
    useState('loading');

  const [message, setMessage] =
    useState(
      'ゲームを準備しています……'
    );

  const [answer, setAnswer] =
    useState('');

  const [selectedInfo, setSelectedInfo] =
    useState(null);

  const [showInfoShop, setShowInfoShop] =
    useState(false);

  const [showPlayerInfo, setShowPlayerInfo] =
    useState(false);

  const [selectedPlayer, setSelectedPlayer] =
    useState(null);

  const [diceResult, setDiceResult] =
    useState(null);

  const [diceRolling, setDiceRolling] =
    useState(false);

  const [dice3DRotation, setDice3DRotation] =
    useState({
      a: {
        x: -18,
        y: 28,
        z: 0,
      },
      b: {
        x: -18,
        y: -28,
        z: 0,
      },
    });

  const diceRollTimerRef =
    useRef(null);

  const diceRollIntervalRef =
    useRef(null);

  const [showDiceResults, setShowDiceResults] =
    useState(false);

  const [allDiceResults, setAllDiceResults] =
    useState({});

  const [actionUsed, setActionUsed] =
    useState(false);

  const [selectedForgeOffer, setSelectedForgeOffer] =
    useState(null);

  const [selectedForgeDice, setSelectedForgeDice] =
    useState(null);

  const [showForgeConfirm, setShowForgeConfirm] =
    useState(false);

  const [forgeStocks, setForgeStocks] =
    useState({
      berry2_a: 4,
      berry2_b: 4,

      berry3_a: 4,
      berry3_b: 4,

      berry4_a: 1,
      berry4_b: 1,
      berry4_c: 1,
      berry4_d: 1,

      berry5_a: 2,
      berry5_b: 2,

      berry6_a: 4,
      berry8_a: 4,

      berry12_a: 2,
      berry12_b: 2,
    });


  const FORGE_OFFERS = [
    {
      id: 'berry2_a',
      cost: {
        berry: 2,
      },
      faces: [
        {
          type: 'berry',
          value: 3,
        },
      ],
    },

    {
      id: 'berry2_b',
      cost: {
        berry: 2,
      },
      faces: [
        {
          type: 'eternal',
          value: 1,
        },
      ],
    },

    {
      id: 'berry3_a',
      cost: {
        berry: 3,
      },
      faces: [
        {
          type: 'berry',
          value: 4,
        },
      ],
    },

    {
      id: 'berry3_b',
      cost: {
        berry: 3,
      },
      faces: [
        {
          type: 'verse',
          value: 1,
        },
      ],
    },

    {
      id: 'berry4_a',
      cost: {
        berry: 4,
      },
      faces: [
        {
          type: 'berry',
          value: 6,
        },
      ],
    },

    {
      id: 'berry4_b',
      cost: {
        berry: 4,
      },
      faces: [
        {
          type: 'berry',
          value: 2,
        },
        {
          type: 'eternal',
          value: 1,
        },
      ],
    },

    {
      id: 'berry4_c',
      cost: {
        berry: 4,
      },
      faces: [
        {
          type: 'berry',
          value: 2,
        },
        {
          type: 'random',
          value: '?',
        },
      ],
    },

    {
      id: 'berry4_d',
      cost: {
        berry: 4,
      },
      faces: [
        {
          type: 'berry',
          value: 2,
        },
        {
          type: 'verse',
          value: 1,
        },
      ],
    },

    {
      id: 'berry5_a',
      cost: {
        berry: 5,
      },
      faces: [
        {
          type: 'berry',
          value: 3,
        },
        {
          type: 'verse',
          value: 2,
        },
      ],
    },

    {
      id: 'berry5_b',
      cost: {
        berry: 5,
      },
      faces: [
        {
          type: 'berry',
          value: 3,
        },
        {
          type: 'eternal',
          value: 2,
        },
      ],
    },

    {
      id: 'berry6_a',
      cost: {
        berry: 6,
      },
      faces: [
        {
          type: 'eternal',
          value: 2,
        },
      ],
    },

    {
      id: 'berry8_a',
      cost: {
        berry: 8,
      },
      faces: [
        {
          type: 'verse',
          value: 2,
        },
      ],
    },

    {
      id: 'berry12_a',
      cost: {
        berry: 12,
      },
      faces: [
        {
          type: 'verse',
          value: 2,
        },
        {
          type: 'eternal',
          value: 2,
        },
      ],
    },

    {
      id: 'berry12_b',
      cost: {
        berry: 12,
      },
      faces: [
        {
          type: 'eternal',
          value: 1,
        },
        {
          type: 'verse',
          value: 1,
        },
        {
          type: 'berry',
          value: 1,
        },
      ],
    },
  ];

const CARD_OFFERS = [
  {
    id: 'dorudoru',
    name: 'ドルドルの実',
    image: '/saikoro/dorudoru.png',
    cost: { eternal: 1 },
    description:
      '所持数の上限を増やす。ベリー＋4枠、ヴァース＋3枠、永久指針＋3枠。',
  },
  {
    id: 'yomiyomi',
    name: 'ヨミヨミの実',
    image: '/saikoro/yomiyomi.png',
    cost: { eternal: 2 },
    description:
      '毎ターン、指定した片方のダイスをもう一度振ることができる。',
  },
  {
    id: 'jikijiki',
    name: 'ジキジキの実',
    image: '/saikoro/jikijiki.png',
    cost: { eternal: 3 },
    description:
      'プレイヤーを1人指定し、そのプレイヤーが持っている1枚ビブカまたはエクストラの情報を入手する。※1度きり',
  },
  {
    id: 'manemane',
    name: 'マネマネの実',
    image: '/saikoro/manemane.png',
    cost: { eternal: 4 },
    description:
      'ダイスの出目を2つマネマネマスに変える。マネマネマスは他人が出したダイスの出目を好きなダイスから1つ指定し、その出目にする。',
  },
  {
    id: 'bakubaku',
    name: 'バクバクの実',
    image: '/saikoro/bakubaku.png',
    cost: { eternal: 5 },
    description:
      '毎ターン、回答回数が1回増える。',
  },
  {
    id: 'barabara',
    name: 'バラバラの実',
    image: '/saikoro/barabara.png',
    cost: { eternal: 6 },
    description:
      '自分の毎ターン開始時、まだ自分が見えていないエクストラキャラのマスがランダムで3つ見える。',
  },
  {
    id: 'daiaru',
    name: '衝撃貝',
    image: '/saikoro/daiaru.png',
    cost: { eternal: 1 },
    description:
      '毎ターン、ダイスの振り直しを1度だけできる。',
  },
  {
    id: 'takara',
    name: '食糧宝船',
    image: '/saikoro/takara.png',
    cost: { eternal: 2 },
    description:
      '毎ターン、ミニダイスが1個追加で振られる。ミニダイスはゴールド3が1面、ゴールド2が1面、ゴールド1が3面。',
  },
  {
    id: 'smile',
    name: 'SMILE',
    image: '/saikoro/smile.png',
    cost: { eternal: 3 },
    description:
      '毎ターン10％の確率で、出た目の3倍の資源をもらえることがある。',
  },
  {
    id: 'news',
    name: 'ニュース・クー',
    image: '/saikoro/news.png',
    cost: { eternal: 4 },
    description:
      '毎ターン、好きな資源を1つもらう。',
  },
  {
    id: 'tact',
    name: '魔法の天候棒',
    image: '/saikoro/tact.png',
    cost: { eternal: 5 },
    description:
      'ダイスの出目を2つ天候棒マスに変える。天候棒マスは好きな資源を3つ獲得できる。',
  },
  {
    id: 'kuroden',
    name: '黒電伝虫',
    image: '/saikoro/kuroden.png',
    cost: { eternal: 6 },
    description:
      '他人が1枚ビブカの情報を買った時、30％の確率で自分も同じ情報を得られる。',
  },
];

const [cardStocks, setCardStocks] =
  useState(() => {
    const stocks = {};

    CARD_OFFERS.forEach((card) => {
      stocks[card.id] = 2;
    });

    return stocks;
  });

const [selectedCard, setSelectedCard] =
  useState(null);

const [showCardConfirm, setShowCardConfirm] =
  useState(false);

  const getForgeOffer =
    (id) =>
      FORGE_OFFERS.find(
        (offer) =>
          offer.id === id
      ) || null;

  const getForgeFaceText =
    (face) => {
      if (!face) {
        return '';
      }

      if (face.type === 'random') {
        return '?';
      }

      return `×${face.value}`;
    };

  const getForgeResourceName =
    (type) => {
      return (
        RESOURCE_NAMES[type] ||
        type
      );
    };

  const getForgeResourceIcon =
    (type) => {
      if (type === 'random') {
        return null;
      }

      return (
        RESOURCE_ICONS[type] ||
        null
      );
    };

  const canSelectForgeOffer =
    (offer) => {
      if (!offer) {
        return false;
      }

      const stock =
        Number(
          forgeStocks?.[offer.id] || 0
        );

      if (stock <= 0) {
        return false;
      }

      return spendResources(
        myPlayer,
        offer.cost
      );
    };

  const handleForgeOfferSelect =
    (offer) => {
      if (
        !canSelectForgeOffer(
          offer
        )
      ) {
        return;
      }

      setSelectedForgeOffer(
        offer
      );

      setSelectedForgeDice(
        null
      );

      setShowForgeConfirm(
        false
      );
    };

  const handleForgeDiceSelect =
    (dieType, index) => {
      if (!selectedForgeOffer) {
        return;
      }

      setSelectedForgeDice({
        dieType,
        index,
      });

      setShowForgeConfirm(
        true
      );
    };

  const handleForgeCancel =
    () => {
      setShowForgeConfirm(
        false
      );

      setSelectedForgeDice(
        null
      );
    };

  const handleForgeClose =
    () => {
      setSelectedForgeOffer(
        null
      );

      setSelectedForgeDice(
        null
      );

      setShowForgeConfirm(
        false
      );
    };

  const handleForgeExchange =
    () => {
      if (
        !selectedForgeOffer ||
        !selectedForgeDice
      ) {
        return;
      }

      const stock =
        Number(
          forgeStocks?.[
            selectedForgeOffer.id
          ] || 0
        );

      if (stock <= 0) {
        handleForgeClose();
        return;
      }

      if (
        !spendResources(
          myPlayer,
          selectedForgeOffer.cost
        )
      ) {
        handleForgeClose();
        return;
      }

      const {
        dieType,
        index,
      } = selectedForgeDice;

      const diceKey =
        dieType === 'A'
          ? 'diceA'
          : 'diceB';

      setPlayers(
        (prev) => {
          const next =
            prev.map(
              (player) => ({
                ...player,

                resources: {
                  ...player.resources,
                },

                diceA:
                  player.diceA.map(
                    (face) => ({
                      ...face,
                    })
                  ),

                diceB:
                  player.diceB.map(
                    (face) => ({
                      ...face,
                    })
                  ),
              })
            );

          const player =
            next[0];

          if (
            !Array.isArray(
              player[diceKey]
            )
          ) {
            return prev;
          }

          if (
            index < 0 ||
            index >=
              player[diceKey].length
          ) {
            return prev;
          }

          const updatedPlayer =
            applyCost(
              player,
              selectedForgeOffer.cost
            );

          let newFace;

          if (
            selectedForgeOffer.faces
              .length === 1
          ) {
            newFace = {
              ...selectedForgeOffer.faces[0],
            };
          } else {
            newFace = {
              type: 'combo',

              faces:
                selectedForgeOffer.faces.map(
                  (face) => ({
                    ...face,
                  })
                ),
            };
          }

          updatedPlayer[diceKey][
            index
          ] = newFace;

          next[0] =
            updatedPlayer;

          return next;
        }
      );

      setForgeStocks(
        (prev) => ({
          ...prev,

          [selectedForgeOffer.id]:
            Math.max(
              0,
              Number(
                prev[
                  selectedForgeOffer.id
                ] || 0
              ) - 1
            ),
        })
      );

      setSelectedForgeOffer(
        null
      );

      setSelectedForgeDice(
        null
      );

      setShowForgeConfirm(
        false
      );
    };

  const [answerUsed, setAnswerUsed] =
    useState(false);

  const handleCardPurchase =
    () => {
      if (!selectedCard) {
        return;
      }

      const stock =
        Number(
          cardStocks?.[
            selectedCard.id
          ] || 0
        );

      if (stock <= 0) {
        window.alert(
          'このカードは売り切れです。'
        );

        setSelectedCard(null);
        setShowCardConfirm(false);

        return;
      }

      if (
        !spendResources(
          myPlayer,
          selectedCard.cost
        )
      ) {
        window.alert(
          '永久指針が足りません。'
        );

        return;
      }

      setPlayers((prev) => {
        const next =
          prev.map((player) => ({
            ...player,

            resources: {
              ...player.resources,
            },

            cards: Array.isArray(
              player.cards
            )
              ? [...player.cards]
              : [],
          }));

        const player =
          next[0];

        const updatedPlayer =
          applyCost(
            player,
            selectedCard.cost
          );

        updatedPlayer.cards.push({
          id: selectedCard.id,
          name: selectedCard.name,
          image: selectedCard.image,
          description:
            selectedCard.description,
        });

        next[0] =
          updatedPlayer;

        return next;
      });

      setCardStocks((prev) => ({
        ...prev,

        [selectedCard.id]:
          Math.max(
            0,
            Number(
              prev[
                selectedCard.id
              ] || 0
            ) - 1
          ),
      }));

      setMessage(
        `${selectedCard.name}を入手しました！`
      );

      setSelectedCard(null);
      setShowCardConfirm(false);
    };

  const [winner, setWinner] =
    useState(null);

  const [lastAnswer, setLastAnswer] =
    useState(null);

  const myPlayer =
    players[0];

  const currentPlayer =
    players[turnPlayer];

  const isMyTurn =
    turnPlayer === 0 &&
    phase === 'action';

  const currentCardProfile =
    getCardProfile(
      currentVivreCard
    );

  const infoSummary =
    useMemo(
      () =>
        getCardPublicSummary(
          currentVivreCard
        ),
      [currentVivreCard]
    );

  const getExtraCharacterHiddenIndexes = () => {
    return extraCharacterBoard
      .filter((item) => !item.revealed)
      .map((item) => item.index);
  };

  const getExtraCharacterPurchaseCost = (
    purchaseType
  ) => {
    switch (purchaseType) {
      case 'berry3':
        return {
          berry: 3,
          verse: 0,
          eternal: 0,
        };

      case 'berry10':
        return {
          berry: 10,
          verse: 0,
          eternal: 0,
        };

      case 'verse2':
        return {
          berry: 0,
          verse: 2,
          eternal: 0,
        };

      case 'eternal2':
        return {
          berry: 0,
          verse: 0,
          eternal: 2,
        };

      default:
        return null;
    }
  };

  const revealExtraCharacterIndex = (
    index
  ) => {
    if (
      !Number.isInteger(index)
    ) {
      return false;
    }

    let changed = false;

    setExtraCharacterBoard((prev) => {
      const target =
        prev.find(
          (item) =>
            item.index === index
        );

      if (
        !target ||
        target.revealed
      ) {
        return prev;
      }

      changed = true;

      return prev.map((item) =>
        item.index === index
          ? {
              ...item,
              revealed: true,
            }
          : item
      );
    });

    return changed;
  };

  const handleExtraCharacterPurchase = (
    purchaseType
  ) => {
    if (
      !extraCharacter ||
      !Array.isArray(
        extraCharacterBoard
      )
    ) {
      return;
    }

    const hiddenIndexes =
      getExtraCharacterHiddenIndexes();

    if (
      hiddenIndexes.length === 0
    ) {
      window.alert(
        'すべての文字が公開されています。'
      );
      return;
    }

    const cost =
      getExtraCharacterPurchaseCost(
        purchaseType
      );

    if (!cost) {
      return;
    }

    const currentPlayer =
      players[0];

    if (!currentPlayer) {
      return;
    }

    if (
      !spendResources(
        currentPlayer,
        cost
      )
    ) {
      window.alert(
        '必要な資源が足りません。'
      );
      return;
    }

    if (
      purchaseType === 'berry3'
    ) {
      const randomIndex =
        randomChoice(
          hiddenIndexes
        );

      if (
        !Number.isInteger(
          randomIndex
        )
      ) {
        return;
      }

      setPlayers((prev) => {
        const next =
          prev.map((player) => ({
            ...player,
            resources: {
              ...player.resources,
            },
          }));

        next[0] =
          applyCost(
            next[0],
            cost
          );

        return next;
      });

      setExtraCharacterBoard(
        (prev) =>
          prev.map((item) =>
            item.index ===
              randomIndex
              ? {
                  ...item,
                  revealed: true,
                }
              : item
          )
      );

      setExtraCharacterPurchaseMode(
        null
      );
      setExtraCharacterSelecting(
        false
      );
      setShowExtraCharacterShop(
        false
      );

      setMessage(
        'ベリー3を使って、エクストラキャラの文字を1文字公開しました。'
      );

      return;
    }

    if (
      purchaseType === 'berry10' ||
      purchaseType === 'verse2' ||
      purchaseType === 'eternal2'
    ) {
      setExtraCharacterPurchaseMode(
        purchaseType
      );

      setExtraCharacterSelecting(
        true
      );

      return;
    }
  };

  const handleExtraCharacterSelectPosition = (
    index
  ) => {
    if (
      !extraCharacterPurchaseMode ||
      !extraCharacterSelecting
    ) {
      return;
    }

    const item =
      extraCharacterBoard.find(
        (entry) =>
          entry.index === index
      );

    if (
      !item ||
      item.revealed
    ) {
      return;
    }

    const cost =
      getExtraCharacterPurchaseCost(
        extraCharacterPurchaseMode
      );

    if (!cost) {
      return;
    }

    const currentPlayer =
      players[0];

    if (!currentPlayer) {
      return;
    }

    if (
      !spendResources(
        currentPlayer,
        cost
      )
    ) {
      window.alert(
        '必要な資源が足りません。'
      );
      return;
    }

    setPlayers((prev) => {
      const next =
        prev.map((player) => ({
          ...player,
          resources: {
            ...player.resources,
          },
        }));

      next[0] =
        applyCost(
          next[0],
          cost
        );

      return next;
    });

    setExtraCharacterBoard(
      (prev) =>
        prev.map((entry) =>
          entry.index === index
            ? {
                ...entry,
                revealed: true,
              }
            : entry
        )
    );

    const purchaseName =
      extraCharacterPurchaseMode ===
      'berry10'
        ? 'ベリー10'
        : extraCharacterPurchaseMode ===
          'verse2'
        ? 'ヴァース2'
        : '永久指針2';

    setExtraCharacterPurchaseMode(
      null
    );

    setExtraCharacterSelecting(
      false
    );

    setShowExtraCharacterShop(
      false
    );

    setMessage(
      `${purchaseName}を使って、選択した文字を公開しました。`
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setLoadError('');

        const loaded =
          await loadSaikoroVivreProfiles();

        if (
          cancelled
        ) {
          return;
        }

        if (
          !Array.isArray(loaded) ||
          loaded.length === 0
        ) {
          throw new Error(
            'profile2.xlsx のビブカデータがありません。'
          );
        }

        setProfiles(
          loaded
        );

        const first =
          chooseNewVivreCard(
            loaded,
            []
          );

        setCurrentVivreCard(
          first
        );

        setPhase('dice');

        setMessage(
          'ラウンド1開始！全員がダイスを振ります。'
        );
      } catch (error) {
        console.error(
          '看板たぬき profile2.xlsx load failed',
          error
        );

        if (
          !cancelled
        ) {
          setLoadError(
            error?.message ||
              'ビブカデータの読み込みに失敗しました。'
          );

          setPhase(
            'error'
          );
        }
      } finally {
        if (
          !cancelled
        ) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadExtraCharacters() {
      try {
        const response =
          await fetch(
            '/api/extra-character',
            {
              cache: 'no-store',
            }
          );

        if (!response.ok) {
          throw new Error(
            `extra-character API error: ${response.status}`
          );
        }

        const data =
          await response.json();

        if (
          !data?.success ||
          !Array.isArray(
            data.characters
          ) ||
          data.characters.length === 0
        ) {
          throw new Error(
            'エクストラキャラデータがありません。'
          );
        }

        if (cancelled) {
          return;
        }

        setExtraCharacters(
          data.characters
        );
      } catch (error) {
        console.error(
          '看板たぬき extra.xlsx load failed',
          error
        );
      }
    }

    loadExtraCharacters();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !Array.isArray(
        extraCharacters
      ) ||
      extraCharacters.length === 0
    ) {
      return;
    }

    const character =
      randomChoice(
        extraCharacters
      );

    if (!character) {
      return;
    }

    setExtraCharacter(
      character
    );

    const description =
      String(
        character?.description ||
          ''
      );

    setExtraCharacterBoard(
      createExtraCharacterBoard(
        description
      )
    );
  }, [extraCharacters]);

  function chooseNewVivreCard(
    list,
    usedIds
  ) {
    const candidates =
      list.filter(
        (profile) => {
          const id =
            String(
              profile?.id ??
                profile?.number ??
                profile?.name ??
                ''
            );

          return !usedIds.includes(
            id
          );
        }
      );

    const source =
      candidates.length
        ? candidates
        : list;

    const profile =
      randomChoice(
        source
      );

    if (!profile) {
      return null;
    }

    const card =
      createVivreCardState(
        profile
      );

    return {
      ...card,

      revealedInfo: {
        ...createInitialInfoState(),
        ...(card?.revealedInfo || {}),
      },

      cardInstanceId:
        `${String(
          profile?.id ??
            profile?.number ??
            profile?.name ??
            'card'
        )}-${Date.now()}-${Math.random()}`,
    };
  }

  function updatePlayer(
    seat,
    updater
  ) {
    setPlayers(
      (prev) =>
        prev.map(
          (player) =>
            player.seat === seat
              ? updater(player)
              : player
        )
    );
  }

  function rollAllDice() {
    if (
      phase !== 'dice' ||
      diceRolling
    ) {
      return;
    }

    setDiceRolling(true);
    setShowDiceResults(false);
    setDiceResult(null);
    setAllDiceResults({});

    setMessage(
      '全員のサイコロを振っています……'
    );

    setTimeout(() => {
      const results = {};

      setPlayers(
        (prev) =>
          prev.map(
            (player) => {
              const a =
                rollDice(
                  player.diceA
                );

              const b =
                rollDice(
                  player.diceB
                );

              results[
                player.seat
              ] = {
                a,
                b,
              };

              let next = {
                ...player,

                diceResult: {
                  a,
                  b,
                },
              };

              if (a) {
                next =
                  addResource(
                    next,
                    a.type,
                    a.value
                  );
              }

              if (b) {
                next =
                  addResource(
                    next,
                    b.type,
                    b.value
                  );
              }

              return next;
            }
          )
      );

      setAllDiceResults(
        results
      );

      setDiceResult(
        results[0]
      );

      setDiceRolling(false);

      setShowDiceResults(
        true
      );

      setMessage(
        '全員のサイコロ結果が出ました！'
      );

      setTimeout(() => {
        setShowDiceResults(false);

        setPhase(
          'action'
        );

        setTurnPlayer(
          0
        );

        setActionUsed(
          false
        );

        setAnswerUsed(
          false
        );

        setSelectedInfo(
          null
        );

        setMessage(
          '全員のダイス結果が確定しました。あなたのターンです。'
        );
      }, 2600);
    }, 1500);
  }


  function startNextRound() {
    const nextRound =
      round + 1;

    setRound(
      nextRound
    );

    setTurnPlayer(
      0
    );

    setPhase(
      'dice'
    );

    setActionUsed(
      false
    );

    setAnswerUsed(
      false
    );

    setAnswer('');

    setLastAnswer(
      null
    );

    setMessage(
      `ラウンド${nextRound}開始！全員がダイスを振ります。`
    );

    setDiceResult(
      null
    );

    setDiceRolling(
      false
    );

    setShowDiceResults(
      false
    );

    setAllDiceResults(
      {}
    );
  }



function getDiceFrontRotation(faceIndex) {
  switch (Number(faceIndex)) {
    case 1:
      // 裏面
      return {
        x: 0,
        y: 180,
        z: 0,
      };

    case 2:
      // 右面
      return {
        x: 0,
        y: -90,
        z: 0,
      };

    case 3:
      // 左面
      return {
        x: 0,
        y: 90,
        z: 0,
      };

    case 4:
      // 上面
      return {
        x: -90,
        y: 0,
        z: 0,
      };

    case 5:
      // 下面
      return {
        x: 90,
        y: 0,
        z: 0,
      };

    case 0:
    default:
      // 正面
      return {
        x: 0,
        y: 0,
        z: 0,
      };
  }
}

function getDiceFinalRotation(faceIndex) {
  const target =
    getDiceFrontRotation(
      faceIndex
    );

  return {
    x:
      target.x +
      720,

    y:
      target.y +
      720,

    z:
      target.z,
  };
}

function handleRollButton() {
  if (
    phase !== 'dice' ||
    diceRolling
  ) {
    return;
  }

  setDiceRolling(true);

  setShowDiceResults(false);

  setDiceResult(null);

  setAllDiceResults({});

  setMessage(
    '🎲 ダイスを振っています……'
  );

  let tick = 0;

  if (
    diceRollIntervalRef.current
  ) {
    clearInterval(
      diceRollIntervalRef.current
    );
  }

  diceRollIntervalRef.current =
    setInterval(() => {
      tick += 1;

      setDice3DRotation({
        a: {
          x:
            tick * 55 +
            Math.random() * 40,

          y:
            tick * 65 +
            Math.random() * 40,

          z:
            Math.random() * 40 -
            20,
        },

        b: {
          x:
            tick * 60 +
            Math.random() * 40,

          y:
            -tick * 70 +
            Math.random() * 40,

          z:
            Math.random() * 40 -
            20,
        },
      });
    }, 90);

  if (
    diceRollTimerRef.current
  ) {
    clearTimeout(
      diceRollTimerRef.current
    );
  }

  diceRollTimerRef.current =
    setTimeout(() => {
      if (
        diceRollIntervalRef.current
      ) {
        clearInterval(
          diceRollIntervalRef.current
        );

        diceRollIntervalRef.current =
          null;
      }

      const results = {};

      setPlayers(
        (prev) =>
          prev.map(
            (player) => {
              const a =
                rollDice(
                  player.diceA
                );

              const b =
                rollDice(
                  player.diceB
                );

              results[
                player.seat
              ] = {
                a,
                b,
              };

              let next = {
                ...player,

                diceResult: {
                  a,
                  b,
                },
              };

              if (a) {
                next =
                  addResource(
                    next,
                    a.type,
                    a.value
                  );
              }

              if (b) {
                next =
                  addResource(
                    next,
                    b.type,
                    b.value
                  );
              }

              return next;
            }
          )
      );

      const myResult =
        results[0];

      setAllDiceResults(
        results
      );

      setDiceResult(
        myResult
      );

      /*
       * 実際に出た面を正面に向ける。
       *
       * Aの出目
       */
      const rotationA =
        getDiceFinalRotation(
          myResult?.a?.index
        );

      /*
       * Bの出目
       */
      const rotationB =
        getDiceFinalRotation(
          myResult?.b?.index
        );

      /*
       * ここで最終位置を指定。
       * 720度以上回転させてから
       * 出目の面が真正面に来る。
       */
      setDice3DRotation({
        a: rotationA,
        b: rotationB,
      });

      setMessage(
        '🎲 全員のサイコロ結果が出ました！'
      );

      /*
       * すぐにrollingをfalseにすると
       * 最終位置へのアニメーションが
       * きれいに出ないことがあるため、
       * 少し待ってから解除する。
       */
      setTimeout(() => {
        setDiceRolling(false);
        setShowDiceResults(true);
      }, 750);

      /*
       * 結果表示を少し見せてから
       * 次のアクションフェーズへ。
       */
      setTimeout(() => {
        setShowDiceResults(false);

        setPhase('action');

        setTurnPlayer(0);

        setActionUsed(false);

        setAnswerUsed(false);

        setSelectedInfo(null);

        setMessage(
          '全員のダイス結果が確定しました。あなたのターンです。'
        );
      }, 3200);
    }, 1200);
}

  function canBuyInfo(
    player,
    infoType
  ) {
    if (!player) {
      return false;
    }

    const cost =
      getInfoCost(
        infoType
      );

    return spendResources(
      player,
      cost
    );
  }

  function revealFavoriteFood(
    card
  ) {
    const profile =
      getCardProfile(card);

    const chars =
      getFavoriteFoodCharacters(
        profile?.favoriteFood
      );

    const already =
      Array.isArray(
        card?.revealedInfo?.favoriteFood
      )
        ? card.revealedInfo.favoriteFood
        : [];

    const remaining =
      chars
        .map(
          (_, index) =>
            index
        )
        .filter(
          (index) =>
            !already.includes(index)
        );

    if (
      remaining.length === 0
    ) {
      return card;
    }

    const picked =
      randomChoice(
        remaining
      );

    return {
      ...card,

      revealedInfo: {
        ...card.revealedInfo,

        favoriteFood: [
          ...already,
          picked,
        ],
      },
    };
  }

  function revealDigit(
    card,
    type
  ) {
    const profile =
      getCardProfile(card);

    const value =
      type === 'height'
        ? profile?.height
        : profile?.age;

    const chars =
      getDigitItems(
        value
      );

    const already =
      Array.isArray(
        card?.revealedInfo?.[type]
      )
        ? card.revealedInfo[type]
        : [];

    const remaining =
      chars
        .map(
          (_, index) =>
            index
        )
        .filter(
          (index) =>
            !already.includes(index)
        );

    if (
      remaining.length === 0
    ) {
      return card;
    }

    const picked =
      randomChoice(
        remaining
      );

    return {
      ...card,

      revealedInfo: {
        ...card.revealedInfo,

        [type]: [
          ...already,
          picked,
        ],
      },
    };
  }

  function revealSimpleInfo(
    card,
    type
  ) {
    const profile =
      getCardProfile(card);

    let value = '';

    if (
      type === 'blood'
    ) {
      value =
        profile?.blood ||
        '';
    }

    if (
      type === 'origin'
    ) {
      const sea =
        String(
          profile?.bornSea ||
            ''
        ).trim();

      const place =
        String(
          profile?.bornPlace ||
            ''
        ).trim();

      value =
        [sea, place]
          .filter(Boolean)
          .join(' / ');
    }

    if (
      type === 'gender'
    ) {
      value =
        profile?.gender ||
        '';
    }

    return {
      ...card,

      revealedInfo: {
        ...card.revealedInfo,

        [type]: value,
      },
    };
  }

  function revealFamily(
    card
  ) {
    const profile =
      getCardProfile(card);

    const family =
      getFamilyItems(
        profile
      );

    const already =
      Array.isArray(
        card?.revealedInfo?.family
      )
        ? card.revealedInfo.family
        : [];

    const remaining =
      family.filter(
        (item) =>
          !already.includes(
            item.value
          )
      );

    if (
      remaining.length === 0
    ) {
      return {
        ...card,

        revealedInfo: {
          ...card.revealedInfo,

          family:
            family.length === 0
              ? ['なし']
              : already,
        },
      };
    }

    const picked =
      randomChoice(
        remaining
      );

    return {
      ...card,

      revealedInfo: {
        ...card.revealedInfo,

        family: [
          ...already,
          picked.value,
        ],
      },
    };
  }

  function applyLocalVivreReveal(
    card,
    infoType
  ) {
    if (
      !card
    ) {
      return card;
    }

    if (
      infoType ===
      'nameLength'
    ) {
      const profile =
        getCardProfile(
          card
        );

      return {
        ...card,

        revealedInfo: {
          ...card.revealedInfo,

          nameLength:
            Array.from(
              String(
                profile?.name ||
                  ''
              )
            ).length,
        },
      };
    }

    if (
      infoType ===
      'favoriteFood'
    ) {
      return revealFavoriteFood(
        card
      );
    }

    if (
      infoType === 'height'
    ) {
      return revealDigit(
        card,
        'height'
      );
    }

    if (
      infoType === 'age'
    ) {
      return revealDigit(
        card,
        'age'
      );
    }

    if (
      infoType === 'family'
    ) {
      return revealFamily(
        card
      );
    }

    if (
      infoType === 'blood' ||
      infoType === 'origin' ||
      infoType === 'gender'
    ) {
      return revealSimpleInfo(
        card,
        infoType
      );
    }

    return card;
  }

 function handleBuyInfo(
  infoType
) {
  if (
    !isMyTurn ||
    !currentVivreCard
  ) {
    return;
  }

  if (
    actionUsed
  ) {
    setMessage(
      'このターンのアクションはすでに使用しました。'
    );

    return;
  }

  if (
    !canBuyInfo(
      myPlayer,
      infoType
    )
  ) {
    setMessage(
      `${getInfoLabel(
        infoType
      )}を購入するための資源が足りません。`
    );

    return;
  }

  const cost =
    getInfoCost(
      infoType
    );

  const nextCard =
    applyLocalVivreReveal(
      currentVivreCard,
      infoType
    );

  updatePlayer(
    0,
    (player) => ({
      ...applyCost(
        player,
        cost
      ),

      vivreCardInfo: {
        ...(player.vivreCardInfo || {}),

        [infoType]:
          Array.isArray(
            nextCard?.revealedInfo?.[
              infoType
            ]
          )
            ? [
                ...nextCard.revealedInfo[
                  infoType
                ],
              ]
            : nextCard?.revealedInfo?.[
                infoType
              ],
      },
    })
  );

  setCurrentVivreCard(
    nextCard
  );

  setSelectedInfo(
    infoType
  );

  setActionUsed(
    true
  );

  setShowInfoShop(
    false
  );

  setMessage(
    `あなたが「${getInfoLabel(
      infoType
    )}」の情報を購入しました。`
  );
}

  function getKnownInfoForPlayer(
    player,
    type
  ) {
    if (!player) {
      return false;
    }

    const info =
      player.vivreCardInfo ||
      {};

    if (
      type ===
      'favoriteFood' ||
      type === 'height' ||
      type === 'age' ||
      type === 'family'
    ) {
      return (
        Array.isArray(
          info[type]
        ) &&
        info[type].length > 0
      );
    }

    return (
      info[type] !==
      undefined &&
      info[type] !== null
    );
  }

  function savePlayerInfo(
    seat,
    card,
    infoType
  ) {
    const value =
      card?.revealedInfo?.[
        infoType
      ];

    updatePlayer(
      seat,
      (player) => ({
        ...player,

        vivreCardInfo: {
          ...(player.vivreCardInfo || {}),

          [infoType]:
            Array.isArray(value)
              ? [...value]
              : value,
        },
      })
    );
  }

  function finishAction() {
    if (
      !isMyTurn
    ) {
      return;
    }

    if (
      !actionUsed
    ) {
      setMessage(
        '先に1つアクションを選んでください。'
      );

      return;
    }

    setPhase(
      'answer'
    );

    setAnswer('');

    setAnswerUsed(
      false
    );

    setMessage(
      '回答フェーズです。1枚ビブカのキャラクター名を入力してください。'
    );
  }

  function handleAnswerSubmit(
    event
  ) {
    event.preventDefault();

    if (
      phase !== 'answer' ||
      turnPlayer !== 0 ||
      answerUsed ||
      !currentVivreCard
    ) {
      return;
    }

    const input =
      answer.trim();

    if (!input) {
      return;
    }

    const correct =
      isCorrectVivreAnswer
        ? isCorrectVivreAnswer(
            currentVivreCard,
            input
          )
        : isSimpleAnswerCorrect(
            currentVivreCard,
            input
          );

    setLastAnswer({
      player: 'あなた',
      answer: input,
      correct,
    });

    setAnswerUsed(
      true
    );

    if (
      correct
    ) {
      handleVivreWin(
        0,
        input
      );

      return;
    }

    setMessage(
      `あなたの回答「${input}」は不正解。CPUの回答フェーズへ移ります。`
    );

    setTimeout(
      () => {
        runCpuAnswers();
      },
      900
    );
  }

  function handleVivreWin(
    seat,
    submittedAnswer
  ) {
    const profile =
      getCardProfile(
        currentVivreCard
      );

    if (!profile) {
      return;
    }

    const name =
      String(
        profile.name ||
          submittedAnswer ||
          '不明'
      );

    updatePlayer(
      seat,
      (player) => ({
        ...player,

        vivreCardCount:
          Number(
            player.vivreCardCount ||
              0
          ) + 1,

        vivreCardInfo: {
          ...(player.vivreCardInfo || {}),
        },

        cards: [
          ...(player.cards || []),
          {
            id:
              `vivre-${profile.id || profile.number || name}`,
            type: 'vivre',
            name,
            profile,
          },
        ],
      })
    );

    setWinner(
      seat
    );

    setPhase(
      'reveal'
    );

    setMessage(
      `正解！${players[seat]?.name || `${seat + 1}P`}が「${name}」を獲得しました。`
    );

    setTimeout(
      () => {
        replaceVivreCard();
      },
      1800
    );
  }

  function replaceVivreCard() {
    const profile =
      getCardProfile(
        currentVivreCard
      );

    const oldId =
      String(
        profile?.id ??
          profile?.number ??
          profile?.name ??
          ''
      );

    const nextUsed =
      oldId
        ? [
            ...usedVivreIds,
            oldId,
          ]
        : usedVivreIds;

    const nextCard =
      chooseNewVivreCard(
        profiles,
        nextUsed
      );

    setUsedVivreIds(
      nextUsed
    );

    setCurrentVivreCard(
      nextCard
    );

    setWinner(
      null
    );

    setAnswer('');

    setLastAnswer(
      null
    );

    setActionUsed(
      false
    );

    setAnswerUsed(
      false
    );

    setTurnPlayer(
      0
    );

    setPhase(
      'action'
    );

    setMessage(
      '新しい1枚ビブカが補充されました。あなたのターンです。'
    );
  }

  function runCpuAnswers() {
    if (
      !currentVivreCard
    ) {
      return;
    }

    const profile =
      getCardProfile(
        currentVivreCard
      );

    if (!profile) {
      return;
    }

    const order = [
      1,
      2,
      3,
    ];

    let winnerSeat =
      null;

    for (
      const seat of order
    ) {
      const cpu =
        players[seat];

      if (!cpu) {
        continue;
      }

      const chance =
        0.18 +
        round * 0.015;

      const correct =
        Math.random() <
        chance;

      const cpuAnswer =
        correct
          ? profile.name
          : randomCpuAnswer(
              profiles
            );

      setLastAnswer({
        player:
          cpu.name,
        answer:
          cpuAnswer,
        correct,
      });

      if (
        correct
      ) {
        winnerSeat =
          seat;

        break;
      }
    }

    if (
      winnerSeat !== null
    ) {
      handleVivreWin(
        winnerSeat,
        profile.name
      );

      return;
    }

    setMessage(
      '全員不正解。次のターンへ進みます。'
    );

    setTimeout(
      () => {
        startNextRound();
      },
      1000
    );
  }

  function randomCpuAnswer(
    list
  ) {
    if (
      !Array.isArray(list) ||
      list.length === 0
    ) {
      return '？？？';
    }

    const profile =
      randomChoice(
        list
      );

    return (
      profile?.name ||
      '？？？'
    );
  }

  function handleCpuTurn(
    seat
  ) {
    const cpu =
      players[seat];

    if (!cpu) {
      return;
    }

    setTurnPlayer(
      seat
    );

    setPhase(
      'cpu'
    );

    setMessage(
      `${cpu.name}が行動しています……`
    );

    setTimeout(
      () => {
        const possibleInfos =
          INFO_ORDER.filter(
            (type) =>
              !getKnownInfoForPlayer(
                cpu,
                type
              ) &&
              canBuyInfo(
                cpu,
                type
              )
          );

        const info =
          randomChoice(
            possibleInfos
          );

        if (info) {
          const cost =
            getInfoCost(
              info
            );

          const revealedCard =
            applyLocalVivreReveal(
              currentVivreCard,
              info
            );

          updatePlayer(
            seat,
            (player) =>
              applyCost(
                player,
                cost
              )
          );

          setCurrentVivreCard(
            revealedCard
          );

          savePlayerInfo(
            seat,
            revealedCard,
            info
          );

          setMessage(
            `${cpu.name}が「${getInfoLabel(
              info
            )}」の情報を購入しました。`
          );
        } else {
          setMessage(
            `${cpu.name}は情報を購入しませんでした。`
          );
        }

        setTimeout(
          () => {
            const profile =
              getCardProfile(
                currentVivreCard
              );

            const correct =
              Math.random() <
              0.16;

            const cpuAnswer =
              correct
                ? profile?.name
                : randomCpuAnswer(
                    profiles
                  );

            setLastAnswer({
              player:
                cpu.name,
              answer:
                cpuAnswer,
              correct,
            });

            if (
              correct
            ) {
              handleVivreWin(
                seat,
                cpuAnswer
              );

              return;
            }

            setMessage(
              `${cpu.name}の回答「${cpuAnswer}」は不正解。`
            );

            setTimeout(
              () => {
                const next =
                  seat + 1;

                if (
                  next <= 3
                ) {
                  handleCpuTurn(
                    next
                  );
                } else {
                  startNextRound();
                }
              },
              700
            );
          },
          700
        );
      },
      900
    );
  }

  function handleEndMyTurn() {
    if (
      !isMyTurn
    ) {
      return;
    }

    if (
      !actionUsed
    ) {
      setMessage(
        '先にアクションを1つ実行してください。'
      );

      return;
    }

    setPhase(
      'answer'
    );

    setAnswer('');

    setAnswerUsed(
      false
    );

    setMessage(
      'あなたの回答です。'
    );
  }

  function handlePlayerClick(
    player
  ) {
    setSelectedPlayer(
      player
    );

    setShowPlayerInfo(
      true
    );
  }

  function resetGame() {
    setPlayers(
      clonePlayers()
    );

    setRound(
      1
    );

    setTurnPlayer(
      0
    );

    setPhase(
      'dice'
    );

    setAnswer('');

    setMessage(
      'ゲームをリセットしました。ダイスを振ってください。'
    );

    setDiceResult(
      null
    );

    setActionUsed(
      false
    );

    setAnswerUsed(
      false
    );

    setWinner(
      null
    );

    setLastAnswer(
      null
    );

    setSelectedInfo(
      null
    );

    setUsedVivreIds(
      []
    );

    if (
      profiles.length
    ) {
      setCurrentVivreCard(
        chooseNewVivreCard(
          profiles,
          []
        )
      );
    }
  }

  if (
    loading
  ) {
    return (
      <main
        style={styles.page}
      >
        <div
          style={styles.loading}
        >
          <div
            style={styles.loadingTitle}
          >
            看板たぬき
          </div>

          <div>
            1枚ビブカを読み込んでいます……
          </div>

          <div
            style={styles.loadingSub}
          >
            profile2.xlsx
          </div>
        </div>
      </main>
    );
  }

  if (
    phase === 'error'
  ) {
    return (
      <main
        style={styles.page}
      >
        <div
          style={styles.errorBox}
        >
          <h1>
            看板たぬき
          </h1>

          <p>
            {loadError}
          </p>

          <button
            onClick={() =>
              window.location.reload()
            }
            style={styles.primaryButton}
          >
            再読み込み
          </button>
        </div>
      </main>
    );
  }

return (
  <main
    style={styles.page}
  >
    <div
      style={styles.gameShell}
    >
      <header
        style={styles.header}
      >
        <div>
          <div
            style={styles.eyebrow}
          >
            SAikORO KNOWLEDGE GAME
          </div>

          <h1
            style={styles.title}
          >
            看板たぬき
          </h1>
        </div>

        <div
          style={styles.headerRight}
        >
          <div
            style={styles.roundBadge}
          >
            ラウンド {round}
          </div>

          <div
            style={styles.phaseText}
          >
            {phase === 'dice'
              ? '全員ダイス'
              : phase === 'action'
                ? `${currentPlayer?.name || ''} のアクション`
                : phase === 'answer'
                  ? '回答フェーズ'
                  : phase === 'cpu'
                    ? 'CPU思考中'
                    : phase === 'reveal'
                      ? '正解！'
                      : ''}
          </div>
        </div>
      </header>

      {/* =====================================================
          4人のプレイヤー
      ====================================================== */}
      <section
        style={styles.playerStrip}
      >
        {players.map(
          (player) => {
            const isMe =
              player.seat === 0;

            const isTurn =
              player.seat ===
              turnPlayer;

            const isWinner =
              winner ===
              player.seat;

            return (
              <button
                key={
                  player.seat
                }
                type="button"
                onClick={() =>
                  handlePlayerClick(
                    player
                  )
                }
                style={{
                  ...styles.playerCard,

                  ...(isTurn
                    ? styles.playerTurn
                    : {}),

                  ...(isMe
                    ? styles.playerMe
                    : {}),

                  ...(isWinner
                    ? styles.playerWinner
                    : {}),
                }}
              >
                <div
                  style={
                    styles.playerTop
                  }
                >
                  <div
                    style={
                      styles.playerName
                    }
                  >
                    <span
                      style={
                        styles.playerAvatar
                      }
                    >
                      {player.seat ===
                      0
                        ? '👑'
                        : player.seat ===
                            1
                          ? '🏴‍☠️'
                          : player.seat ===
                              2
                            ? '☠️'
                            : '🏝️'}
                    </span>

                    <span>
                      {player.name}
                    </span>
                  </div>

                  {isTurn && (
                    <span
                      style={
                        styles.turnBadge
                      }
                    >
                      手番
                    </span>
                  )}
                </div>

                <div
                  style={
                    styles.resourceRow
                  }
                >
                  <ResourceBox
                    type="berry"
                    value={
                      player
                        .resources
                        ?.berry ?? 0
                    }
                  />

                  <ResourceBox
                    type="verse"
                    value={
                      player
                        .resources
                        ?.verse ?? 0
                    }
                  />

                  <ResourceBox
                    type="eternal"
                    value={
                      player
                        .resources
                        ?.eternal ?? 0
                    }
                  />
                </div>

                <div
                  style={
                    styles.playerBottom
                  }
                >
                  <div>
                    カード
                    <strong>
                      {
                        player.cards
                          ?.length ??
                        0
                      }
                    </strong>
                  </div>

                  <div>
                    ビブカ
                    <strong>
                      {
                        player
                          .vivreCardCount ??
                        0
                      }
                    </strong>
                  </div>
                </div>
              </button>
            );
          }
        )}
      </section>

      {/* =====================================================
          あなたのサイコロ
          プレイヤー4人のすぐ下
      ====================================================== */}
 <section
  style={
    styles.diceWorkshop
  }
>
  <div
    style={
      styles.diceWorkshopHeader
    }
  >
    <div>
      <div
        style={
          styles.diceWorkshopEyebrow
        }
      >
        YOUR DICE WORKSHOP
      </div>

      <div
        style={
          styles.diceWorkshopTitle
        }
      >
        あなたのサイコロ
      </div>
    </div>

    <div
      style={
        styles.diceWorkshopResource
      }
    >
      手持ちの資源

      <div
        style={
          styles.diceWorkshopResourceRow
        }
      >
        <ResourceBox
          type="berry"
          value={
            myPlayer
              ?.resources
              ?.berry ?? 0
          }
        />

        <ResourceBox
          type="verse"
          value={
            myPlayer
              ?.resources
              ?.verse ?? 0
          }
        />

        <ResourceBox
          type="eternal"
          value={
            myPlayer
              ?.resources
              ?.eternal ?? 0
          }
        />
      </div>
    </div>
  </div>

  <div
    style={
      styles.diceWorkshopBody
    }
  >
    {/* ==============================
        サイコロA
    ============================== */}
    <div
      style={
        styles.diceWorkshopSide
      }
    >
      <div
        style={
          styles.diceWorkshopSideTitle
        }
      >
        サイコロA
      </div>

      <DiceFaceList
        title=""
        dice={
          myPlayer?.diceA ||
          INITIAL_DICE_A
        }
      />
    </div>

    {/* ==============================
        3DサイコロA
    ============================== */}
    <Dice3D
      label="サイコロA"
      dice={
        myPlayer?.diceA ||
        INITIAL_DICE_A
      }
      rotation={
        dice3DRotation.a
      }
      result={
        allDiceResults?.[0]?.a
      }
      rolling={
        diceRolling
      }
    />

    {/* ==============================
        3DサイコロB
    ============================== */}
    <Dice3D
      label="サイコロB"
      dice={
        myPlayer?.diceB ||
        INITIAL_DICE_B
      }
      rotation={
        dice3DRotation.b
      }
      result={
        allDiceResults?.[0]?.b
      }
      rolling={
        diceRolling
      }
    />

    {/* ==============================
        サイコロB
    ============================== */}
    <div
      style={
        styles.diceWorkshopSide
      }
    >
      <div
        style={
          styles.diceWorkshopSideTitle
        }
      >
        サイコロB
      </div>

      <DiceFaceList
        title=""
        dice={
          myPlayer?.diceB ||
          INITIAL_DICE_B
        }
      />
    </div>

    {/* ==============================
        全員のダイス結果
        常時表示
    ============================== */}
    <div
      style={{
        background:
          'rgba(255,253,242,0.72)',
        border:
          '2px solid rgba(128,99,63,0.35)',
        borderRadius: '10px',
        padding: '8px 10px',
        minHeight: '150px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: '14px',
          fontWeight: '900',
          color: '#3d2c1b',
          marginBottom: '7px',
          textAlign: 'center',
        }}
      >
        🎲 全員のダイス結果
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(4, minmax(0, 1fr))',
          gap: '6px',
        }}
      >
        {players.map(
          (player) => {
            const result =
              allDiceResults?.[
                player.seat
              ];

            return (
              <div
                key={
                  player.seat
                }
                style={{
                  background:
                    'rgba(255,255,255,0.62)',
                  border:
                    '1px solid rgba(128,99,63,0.25)',
                  borderRadius:
                    '7px',
                  padding:
                    '6px 4px',
                  textAlign:
                    'center',
                }}
              >
                <div
                  style={{
                    fontSize:
                      '11px',
                    fontWeight:
                      '900',
                    color:
                      '#4b3926',
                    marginBottom:
                      '4px',
                    whiteSpace:
                      'nowrap',
                    overflow:
                      'hidden',
                    textOverflow:
                      'ellipsis',
                  }}
                >
                  {player.name}
                </div>

                <div
                  style={{
                    display:
                      'flex',
                    justifyContent:
                      'center',
                    alignItems:
                      'center',
                    gap: '5px',
                  }}
                >
                  <div
                    style={{
                      width:
                        '32px',
                      height:
                        '32px',
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'center',
                    }}
                  >
                    {result?.a ? (
                      <img
                        src={
                          RESOURCE_ICONS[
                            result
                              .a
                              .type
                          ]
                        }
                        alt={
                          RESOURCE_NAMES[
                            result
                              .a
                              .type
                          ]
                        }
                        style={{
                          width:
                            '30px',
                          height:
                            '30px',
                          objectFit:
                            'contain',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize:
                            '18px',
                          color:
                            '#8c7a62',
                        }}
                      >
                        ？
                      </span>
                    )}
                  </div>

                  <span
                    style={{
                      fontSize:
                        '11px',
                      color:
                        '#806f57',
                      fontWeight:
                        '900',
                    }}
                  >
                    ＋
                  </span>

                  <div
                    style={{
                      width:
                        '32px',
                      height:
                        '32px',
                      display:
                        'flex',
                      alignItems:
                        'center',
                      justifyContent:
                        'center',
                    }}
                  >
                    {result?.b ? (
                      <img
                        src={
                          RESOURCE_ICONS[
                            result
                              .b
                              .type
                          ]
                        }
                        alt={
                          RESOURCE_NAMES[
                            result
                              .b
                              .type
                          ]
                        }
                        style={{
                          width:
                            '30px',
                          height:
                            '30px',
                          objectFit:
                            'contain',
                        }}
                      />
                    ) : (
                      <span
                        style={{
                          fontSize:
                            '18px',
                          color:
                            '#8c7a62',
                        }}
                      >
                        ？
                      </span>
                    )}
                  </div>
                </div>

                <div
                  style={{
                    marginTop:
                      '3px',
                    fontSize:
                      '9px',
                    color:
                      '#786348',
                    fontWeight:
                      '800',
                    whiteSpace:
                      'nowrap',
                  }}
                >
                  {result?.a
                    ? RESOURCE_NAMES[
                        result.a
                          .type
                      ]
                    : '---'}

                  {' ＋ '}

                  {result?.b
                    ? RESOURCE_NAMES[
                        result.b
                          .type
                      ]
                    : '---'}
                </div>
              </div>
            );
          }
        )}
      </div>
    </div>
  </div>

  <div
    style={
      styles.diceWorkshopRollArea
    }
  >
    <button
      type="button"
      onClick={
        handleRollButton
      }
      disabled={
        phase !== 'dice' ||
        diceRolling
      }
      style={{
        ...styles.diceWorkshopRollButton,

        opacity:
          phase !== 'dice' ||
          diceRolling
            ? 0.5
            : 1,
      }}
    >
      <span
        style={
          styles.diceWorkshopRollIcon
        }
      >
        🎲
      </span>

      <span>
        {diceRolling
          ? '抽選中……'
          : 'ダイスを振る'}
      </span>
    </button>

    {diceRolling && (
      <div
        style={
          styles.diceWorkshopRollingText
        }
      >
        ダイスを振っています……
      </div>
    )}
  </div>
</section>

{/* =====================================================
          ビブカ・メインボード
====================================================== */}
      <section
        style={styles.board}
      >
        <div
          style={styles.boardTop}
        >
          <div>
            <div
              style={
                styles.boardLabel
              }
            >
              現在の手番
            </div>

            <div
              style={
                styles.boardTurn
              }
            >
              {currentPlayer?.name ||
                '---'}
            </div>
          </div>

          <div
            style={
              styles.boardMessage
            }
          >
            {message}
          </div>
        </div>

        <div
          style={{
            ...styles.boardContent,
            gridTemplateColumns:
              '1fr 1fr',
            gap: 18,
          }}
        >
          {/* ================================================== */}
          {/* 1枚ビブカ */}
          {/* ================================================== */}

          <section
            style={{
              ...styles.centerPanel,
              minWidth: 0,
            }}
          >
            <div
              style={
                styles.centerLabel
              }
            >
              1枚ビブカ
            </div>

            <div
              style={
                styles.vivreCard
              }
            >
              <div
                style={
                  styles.vivreCardHeader
                }
              >
                <span>
                  VIVRE CARD
                </span>

                <span>
                  1枚
                </span>
              </div>

              <div
                style={
                  styles.vivreQuestion
                }
              >
                このキャラクターは誰？
              </div>

{extraCharacterSelecting && (
  <div
    style={
      styles.extraCharacterSelectingMessage
    }
  >
    公開する文字の位置を選択してください
  </div>
)}

              <div
                style={
                  styles.vivreHiddenName
                }
              >
                ？？？？？？？
              </div>

              <div
                style={
                  styles.infoGrid
                }
              >
                {infoSummary.map(
                  (item) => (
                    <div
                      key={
                        item.type
                      }
                      style={{
                        ...styles.infoCell,

                        ...(selectedInfo ===
                        item.type
                          ? styles.infoCellSelected
                          : {}),
                      }}
                    >
                      <div
                        style={
                          styles.infoLabel
                        }
                      >
                        {item.label}
                      </div>

                      <div
                        style={
                          styles.infoValue
                        }
                      >
                        {item.type ===
                        'nameLength'
                          ? currentVivreCard
                              ?.revealedInfo
                              ?.nameLength !=
                            null
                            ? `${currentVivreCard.revealedInfo.nameLength}文字`
                            : '？？？'
                          : item.value}
                      </div>
                    </div>
                  )
                )}
              </div>

              <div
                style={
                  styles.cardFooter
                }
              >
                <span>
                  正解したプレイヤーが獲得
                </span>

                <span>
                  現在：
                  {myPlayer
                    ?.vivreCardCount ??
                    0}
                  枚
                </span>
              </div>
            </div>

            {lastAnswer && (
              <div
                style={{
                  ...styles.answerNotice,

                  background:
                    lastAnswer.correct
                      ? '#153b22'
                      : '#3b2020',

                  borderColor:
                    lastAnswer.correct
                      ? '#2c8b4a'
                      : '#8b3434',
                }}
              >
                <strong>
                  {lastAnswer.player}
                </strong>

                <span>
                  「
                  {lastAnswer.answer}
                  」
                </span>

                <span>
                  {lastAnswer.correct
                    ? '正解！'
                    : '不正解'}
                </span>
              </div>
            )}

            {winner !==
              null &&
              currentVivreCard && (
                <div
                  style={
                    styles.winPanel
                  }
                >
                  <div
                    style={
                      styles.winTitle
                    }
                  >
                    正解！
                  </div>

                  <div
                    style={
                      styles.winAnswer
                    }
                  >
                    「
                    {
                      currentCardProfile
                        ?.name
                    }
                    」
                  </div>

                  <div>
                    {
                      players[
                        winner
                      ]?.name
                    }
                    が獲得しました
                  </div>
                </div>
              )}
          </section>

          {/* ================================================== */}
          {/* エクストラキャラ */}
          {/* ================================================== */}

          <section
            style={{
              ...styles.centerPanel,
              minWidth: 0,
            }}
          >
            <div
              style={
                styles.centerLabel
              }
            >
              エクストラキャラ
            </div>

            <div
              style={
                styles.extraCharacterPanel
              }
            >
              <div
                style={
                  styles.extraCharacterHeader
                }
              >
                <span>
                  EXTRA CHARACTER
                </span>

                <span>
                  情報
                </span>
              </div>

              <div
                style={
                  styles.extraCharacterQuestion
                }
              >
                このキャラクターは誰？
              </div>

              <div
                style={
                  styles.extraCharacterBoard
                }
              >
{extraCharacter &&
extraCharacterBoard.length > 0 ? (
  extraCharacterBoard.map(
    (item) => (
      <div
        key={item.index}
        onClick={() => {
          if (
            extraCharacterSelecting &&
            !item.revealed
          ) {
            handleExtraCharacterSelectPosition(
              item.index
            );
          }
        }}
        style={{
          ...styles.extraCharacterCell,
          ...(item.revealed
            ? styles.extraCharacterCellRevealed
            : {}),
          ...(extraCharacterSelecting &&
          !item.revealed
            ? styles.extraCharacterCellSelectable
            : {}),
        }}
      >
        {item.revealed
          ? item.char
          : String(
              item.index + 1
            ).padStart(2, '0')}
      </div>
    )
  )
) : (
  <div style={styles.extraCharacterEmpty}>
    エクストラキャラを
    <br />
    準備しています……
  </div>
)}              </div>

        <div style={styles.extraCharacterFooter}>
        <div>
          記号は最初から公開
          <br />
          購入した文字は自分だけ公開
        </div>

        <button
          type="button"
          onClick={() =>
            setShowExtraCharacterShop(true)
          }
          style={styles.extraCharacterPurchaseButton}
        >
          🔍 文字を購入する
        </button>
      </div>
            </div>
          </section>
        </div>

        {/* ================================================== */}
        {/* アクションエリア */}
        {/* ================================================== */}

        <div
          style={
            styles.actionArea
          }
        >
          {phase ===
            'dice' && (
            <button
              type="button"
              onClick={
                handleRollButton
              }
              disabled={
                diceRolling
              }
              style={{
                ...styles.primaryButton,

                opacity:
                  diceRolling
                    ? 0.6
                    : 1,
              }}
            >
              {diceRolling
                ? '🎲 サイコロを振っています……'
                : '🎲 サイコロを2つ振る'}
            </button>
          )}

          {phase ===
            'action' &&
            isMyTurn && (
            <>
              <button
                type="button"
                onClick={() =>
                  setShowInfoShop(
                    true
                  )
                }
                disabled={
                  actionUsed
                }
                style={{
                  ...styles.actionButton,

                  opacity:
                    actionUsed
                      ? 0.45
                      : 1,
                }}
              >
                🔎 ビブカ情報を買う
              </button>

              <button
                type="button"
                onClick={
                  handleEndMyTurn
                }
                disabled={
                  !actionUsed
                }
                style={{
                  ...styles.primaryButton,

                  opacity:
                    !actionUsed
                      ? 0.45
                      : 1,
                }}
              >
                回答フェーズへ
              </button>
            </>
          )}

          {phase ===
            'answer' &&
            isMyTurn && (
            <form
              onSubmit={
                handleAnswerSubmit
              }
              style={
                styles.answerForm
              }
            >
              <input
                value={
                  answer
                }
                onChange={(
                  event
                ) =>
                  setAnswer(
                    event.target
                      .value
                  )
                }
                placeholder="キャラクター名を入力"
                autoComplete="off"
                style={
                  styles.answerInput
                }
              />

              <button
                type="submit"
                disabled={
                  !answer.trim() ||
                  answerUsed
                }
                style={
                  styles.primaryButton
                }
              >
                回答する
              </button>
            </form>
          )}

          {phase ===
            'cpu' && (
            <div
              style={
                styles.cpuThinking
              }
            >
              CPUがビブカを調査・回答しています……
            </div>
          )}

          {phase ===
            'reveal' && (
            <div
              style={
                styles.cpuThinking
              }
            >
              新しいビブカを準備しています……
            </div>
          )}
        </div>
      </section>
/* =====================================================
  鍛造
 ====================================================== */

<section
  style={
    styles.diceTemple
  }
>
  <div
    style={
      styles.diceTempleHeader
    }
  >
    <div>
      <div
        style={
          styles.diceTempleEyebrow
        }
      >
        DICE TEMPLE
      </div>

      <div
        style={
          styles.diceTempleTitle
        }
      >
        鍛造
      </div>

      <div
        style={
          styles.diceTempleSubtitle
        }
      >
        ベリーを使って、ダイスの面を強化しよう
      </div>
    </div>

    <div
      style={
        styles.diceTempleDescription
      }
    >
      <div
        style={
          styles.diceTempleDescriptionMain
        }
      >
        ダイスフェイスを選択
      </div>

      <div
        style={
          styles.diceTempleDescriptionSub
        }
      >
        商品を選択 → 自分のダイス面を選択
      </div>
    </div>
  </div>

  {selectedForgeOffer && (
    <div
      style={
        styles.diceTempleSelectionGuide
      }
    >
      <div>
        <strong>
          鍛造する面を選択中
        </strong>
      </div>

      <div>
        次に、交換したい
        <strong>
          自分のダイス面
        </strong>
        を選択してください
      </div>

      <button
        type="button"
        onClick={
          handleForgeClose
        }
        style={
          styles.diceTempleCancelButton
        }
      >
        選択解除
      </button>
    </div>
  )}

  <div
    style={
      styles.diceTempleForgeList
    }
  >

    {/* ================================================== */}
    {/* 2ベリー */}
    {/* ================================================== */}

    <div
      style={
        styles.diceTempleForgeRow
      }
    >
      <div
        style={
          styles.diceTempleCostColumn
        }
      >
<img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×2
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>
      </div>

      <div
        style={
          styles.diceTempleOffers
        }
      >
        {[
          'berry2_a',
          'berry2_b',
        ].map(
          (id) => {
            const offer =
              getForgeOffer(id);

            return (
              <ForgeOfferCard
                key={id}
                offer={offer}
                stock={
                  forgeStocks[id]
                }
                selected={
                  selectedForgeOffer?.id ===
                  id
                }
                disabled={
                  !canSelectForgeOffer(
                    offer
                  )
                }
                onSelect={
                  handleForgeOfferSelect
                }
              />
            );
          }
        )}
      </div>
    </div>

    {/* ================================================== */}
    {/* 3ベリー */}
    {/* ================================================== */}

    <div
      style={
        styles.diceTempleForgeRow
      }
    >
      <div
        style={
          styles.diceTempleCostColumn
        }
      >
<img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×3
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>
      </div>

      <div
        style={
          styles.diceTempleOffers
        }
      >
        {[
          'berry3_a',
          'berry3_b',
        ].map(
          (id) => {
            const offer =
              getForgeOffer(id);

            return (
              <ForgeOfferCard
                key={id}
                offer={offer}
                stock={
                  forgeStocks[id]
                }
                selected={
                  selectedForgeOffer?.id ===
                  id
                }
                disabled={
                  !canSelectForgeOffer(
                    offer
                  )
                }
                onSelect={
                  handleForgeOfferSelect
                }
              />
            );
          }
        )}
      </div>
    </div>

    {/* ================================================== */}
    {/* 4ベリー */}
    {/* ================================================== */}

    <div
      style={
        styles.diceTempleForgeRow
      }
    >
      <div
        style={
          styles.diceTempleCostColumn
        }
      >
<img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×4
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>
      </div>

      <div
        style={
          styles.diceTempleOffers
        }
      >
        {[
          'berry4_a',
          'berry4_b',
          'berry4_c',
          'berry4_d',
        ].map(
          (id) => {
            const offer =
              getForgeOffer(id);

            return (
              <ForgeOfferCard
                key={id}
                offer={offer}
                stock={
                  forgeStocks[id]
                }
                selected={
                  selectedForgeOffer?.id ===
                  id
                }
                disabled={
                  !canSelectForgeOffer(
                    offer
                  )
                }
                onSelect={
                  handleForgeOfferSelect
                }
              />
            );
          }
        )}
      </div>
    </div>

    {/* ================================================== */}
    {/* 5ベリー */}
    {/* ================================================== */}

    <div
      style={
        styles.diceTempleForgeRow
      }
    >
      <div
        style={
          styles.diceTempleCostColumn
        }
      >
<img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×5
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>
      </div>

      <div
        style={
          styles.diceTempleOffers
        }
      >
        {[
          'berry5_a',
          'berry5_b',
        ].map(
          (id) => {
            const offer =
              getForgeOffer(id);

            return (
              <ForgeOfferCard
                key={id}
                offer={offer}
                stock={
                  forgeStocks[id]
                }
                selected={
                  selectedForgeOffer?.id ===
                  id
                }
                disabled={
                  !canSelectForgeOffer(
                    offer
                  )
                }
                onSelect={
                  handleForgeOfferSelect
                }
              />
            );
          }
        )}
      </div>
    </div>

    {/* ================================================== */}
    {/* 6・8ベリー */}
    {/* ================================================== */}

    <div
      style={
        styles.diceTempleForgeRow
      }
    >
      <div
        style={
          styles.diceTempleCostColumn
        }
      >
<img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×6
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>

        <div
          style={
            styles.diceTempleCostDivider
          }
        />

 <img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×8
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>
      </div>

      <div
        style={
          styles.diceTempleOffers
        }
      >
        {[
          'berry6_a',
          'berry8_a',
        ].map(
          (id) => {
            const offer =
              getForgeOffer(id);

            return (
              <ForgeOfferCard
                key={id}
                offer={offer}
                stock={
                  forgeStocks[id]
                }
                selected={
                  selectedForgeOffer?.id ===
                  id
                }
                disabled={
                  !canSelectForgeOffer(
                    offer
                  )
                }
                onSelect={
                  handleForgeOfferSelect
                }
              />
            );
          }
        )}
      </div>
    </div>

    {/* ================================================== */}
    {/* 12ベリー */}
    {/* ================================================== */}

    <div
      style={
        styles.diceTempleForgeRow
      }
    >
      <div
        style={
          styles.diceTempleCostColumn
        }
      >
<img
  src={
    RESOURCE_ICONS.berry
  }
  alt="ベリー"
  style={{
    ...styles.diceTempleCostIconLarge,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

        <strong>
          ×12
        </strong>

<span
  style={
    styles.diceTempleCostColumnLabel
  }
>
  必要
</span>
      </div>

      <div
        style={
          styles.diceTempleOffers
        }
      >
        {[
          'berry12_a',
          'berry12_b',
        ].map(
          (id) => {
            const offer =
              getForgeOffer(id);

            return (
              <ForgeOfferCard
                key={id}
                offer={offer}
                stock={
                  forgeStocks[id]
                }
                selected={
                  selectedForgeOffer?.id ===
                  id
                }
                disabled={
                  !canSelectForgeOffer(
                    offer
                  )
                }
                onSelect={
                  handleForgeOfferSelect
                }
              />
            );
          }
        )}
      </div>
    </div>
  </div>

  {/* ================================================== */}
  {/* 自分のダイス選択 */}
  {/* ================================================== */}

  {selectedForgeOffer && (
    <div
      style={
        styles.diceTempleOwnDicePanel
      }
    >
      <div
        style={
          styles.diceTempleOwnDiceTitle
        }
      >
        交換する自分のダイス面を選択
      </div>

      <div
        style={
          styles.diceTempleOwnDiceSubtitle
        }
      >
        赤く光っている面が、鍛造で手に入る面です
      </div>

      <div
        style={
          styles.diceTempleOwnDiceGrid
        }
      >
        {myPlayer.diceA.map(
          (face, index) => (
            <button
              key={`A-${index}`}
              type="button"
              onClick={() =>
                handleForgeDiceSelect(
                  'A',
                  index
                )
              }
              style={
                {
                  ...styles.diceTempleOwnDiceFace,
                  ...(selectedForgeDice?.dieType === 'A' &&
                  selectedForgeDice?.index === index
                    ? styles.diceTempleOwnDiceFaceSelected
                    : {}),
                }
              }
            >
              <span
                style={
                  styles.diceTempleOwnDiceLabel
                }
              >
                A{index + 1}
              </span>

              <ForgeFaceDisplay
                face={face}
              />
            </button>
          )
        )}

        {myPlayer.diceB.map(
          (face, index) => (
            <button
              key={`B-${index}`}
              type="button"
              onClick={() =>
                handleForgeDiceSelect(
                  'B',
                  index
                )
              }
              style={
                {
                  ...styles.diceTempleOwnDiceFace,
                  ...(selectedForgeDice?.dieType === 'B' &&
                  selectedForgeDice?.index === index
                    ? styles.diceTempleOwnDiceFaceSelected
                    : {}),
                }
              }
            >
              <span
                style={
                  styles.diceTempleOwnDiceLabel
                }
              >
                B{index + 1}
              </span>

              <ForgeFaceDisplay
                face={face}
              />
            </button>
          )
        )}
      </div>
    </div>
  )}

  {/* ================================================== */}
  {/* 交換確認 */}
  {/* ================================================== */}

  {showForgeConfirm &&
    selectedForgeOffer &&
    selectedForgeDice && (
      <div
        style={
          styles.diceTempleConfirmOverlay
        }
      >
        <div
          style={
            styles.diceTempleConfirmBox
          }
        >
          <div
            style={
              styles.diceTempleConfirmTitle
            }
          >
            この面と交換しますか？
          </div>

          <div
            style={
              styles.diceTempleConfirmFaces
            }
          >
            <div
              style={
                styles.diceTempleConfirmFace
              }
            >
              <div
                style={
                  styles.diceTempleConfirmLabel
                }
              >
                鍛造後
              </div>

              <ForgeFaceDisplay
                faces={
                  selectedForgeOffer.faces
                }
              />
            </div>

            <div
              style={
                styles.diceTempleConfirmArrow
              }
            >
              ⇄
            </div>

            <div
              style={
                styles.diceTempleConfirmFace
              }
            >
              <div
                style={
                  styles.diceTempleConfirmLabel
                }
              >
                現在の面
              </div>

              <ForgeFaceDisplay
                face={
                  selectedForgeDice.dieType ===
                  'A'
                    ? myPlayer.diceA[
                        selectedForgeDice.index
                      ]
                    : myPlayer.diceB[
                        selectedForgeDice.index
                      ]
                }
              />
            </div>
          </div>

          <div
            style={
              styles.diceTempleConfirmCost
            }
          >
            ベリー ×
            {
              selectedForgeOffer.cost
                ?.berry || 0
            }
          </div>

          <div
            style={
              styles.diceTempleConfirmButtons
            }
          >
            <button
              type="button"
              onClick={
                handleForgeCancel
              }
              style={
                styles.diceTempleConfirmNo
              }
            >
              NO
            </button>

            <button
              type="button"
              onClick={
                handleForgeExchange
              }
              style={
                styles.diceTempleConfirmYes
              }
            >
              YES
            </button>
          </div>
        </div>
      </div>
    )}
</section>


 {/* =====================================================
          カードショップ
 ====================================================== */}

<section style={styles.cardShopSection}>
  <div style={styles.cardShopHeader}>
    <div>
      <div style={styles.cardShopTitle}>
        カード
      </div>

      <div style={styles.cardShopSubtitle}>
        エターナルコンパスを使って特殊能力を持つカードを購入できます
      </div>
    </div>

    <div style={styles.cardShopStockNote}>
      各カード2枚・早い者勝ち
    </div>
  </div>

  <div style={styles.cardShopGrid}>
    {CARD_OFFERS.map((card) => {
      const stock =
        Number(
          cardStocks?.[card.id] || 0
        );

      const soldOut =
        stock <= 0;

      const canBuy =
        !soldOut &&
        spendResources(
          myPlayer,
          card.cost
        );

      return (
        <button
          key={card.id}
          type="button"
          disabled={!canBuy}
          onClick={() => {
            if (!canBuy) {
              if (soldOut) {
                window.alert(
                  'このカードは売り切れです。'
                );
              } else {
                window.alert(
                  '永久指針が足りません。'
                );
              }

              return;
            }

            setSelectedCard(card);
            setShowCardConfirm(true);
          }}
          style={{
            ...styles.cardShopCard,

            ...(soldOut
              ? styles.cardShopCardSoldOut
              : {}),

            ...(!soldOut && !canBuy
              ? styles.cardShopCardDisabled
              : {}),

            ...(canBuy
              ? styles.cardShopCardAvailable
              : {}),
          }}
        >
          <div style={styles.cardShopImageWrap}>
            <img
              src={card.image}
              alt={card.name}
              style={styles.cardShopImage}
            />
          </div>

          <div style={styles.cardShopCardName}>
            {card.name}
          </div>

          <div style={styles.cardShopCardDescription}>
            {card.description}
          </div>

          <div style={styles.cardShopCardBottom}>
            <div style={styles.cardShopCost}>
              <img
                src={RESOURCE_ICONS.eternal}
                alt="永久指針"
                style={styles.cardShopCostIcon}
              />

              <span>
                ×{card.cost.eternal}
              </span>
            </div>

            <div
              style={{
                ...styles.cardShopStock,
                ...(soldOut
                  ? styles.cardShopStockSoldOut
                  : {}),
              }}
            >
              {soldOut
                ? '売り切れ'
                : `残り ${stock}枚`}
            </div>
          </div>
        </button>
      );
    })}
  </div>
</section>

{showCardConfirm &&
selectedCard ? (
  <div style={styles.cardConfirmOverlay}>
    <div style={styles.cardConfirmModal}>
      <div style={styles.cardConfirmTitle}>
        このカードを購入しますか？
      </div>

      <div style={styles.cardConfirmContent}>
        <div style={styles.cardConfirmImageWrap}>
          <img
            src={selectedCard.image}
            alt={selectedCard.name}
            style={styles.cardConfirmImage}
          />
        </div>

        <div style={styles.cardConfirmInfo}>
          <div style={styles.cardConfirmName}>
            {selectedCard.name}
          </div>

          <div style={styles.cardConfirmDescription}>
            {selectedCard.description}
          </div>

          <div style={styles.cardConfirmCost}>
            <img
              src={RESOURCE_ICONS.eternal}
              alt="永久指針"
              style={styles.cardConfirmCostIcon}
            />

            <span>
              永久指針 ×
              {selectedCard.cost.eternal}
            </span>
          </div>

          <div style={styles.cardConfirmRemaining}>
            購入後の残り：
            {Math.max(
              0,
              Number(
                cardStocks?.[
                  selectedCard.id
                ] || 0
              ) - 1
            )}
            枚
          </div>
        </div>
      </div>

      <div style={styles.cardConfirmButtons}>
        <button
          type="button"
          onClick={() => {
            setSelectedCard(null);
            setShowCardConfirm(false);
          }}
          style={styles.cardConfirmCancel}
        >
          キャンセル
        </button>

        <button
          type="button"
          onClick={handleCardPurchase}
          style={styles.cardConfirmPurchase}
        >
          購入する
        </button>
      </div>
    </div>
  </div>
) : null}

 {/* =====================================================
          下部
 ====================================================== */}
      <section
        style={
          styles.bottomArea
        }
      >
        <div
          style={
            styles.bottomCard
          }
        >
          <div
            style={
              styles.bottomTitle
            }
          >
            所持カード
          </div>

          {myPlayer
            ?.cards
            ?.length ? (
            <div
              style={
                styles.ownedCards
              }
            >
              {myPlayer.cards.map(
                (
                  card,
                  index
                ) => (
                  <div
                    key={`${card.id}-${index}`}
                    style={
                      styles.ownedCard
                    }
                  >
                    {card.name ||
                      card.id}
                  </div>
                )
              )}
            </div>
          ) : (
            <div
              style={
                styles.emptyText
              }
            >
              まだカードを持っていません
            </div>
          )}
        </div>

        <div
          style={
            styles.bottomCard
          }
        >
          <div
            style={
              styles.bottomTitle
            }
          >
            テスト状況
          </div>

          <div
            style={
              styles.testStatus
            }
          >
            <div>
              ビブカ獲得：
              <strong>
                {myPlayer
                  ?.vivreCardCount ??
                  0}
              </strong>
              枚
            </div>

            <div>
              CPU合計：
              <strong>
                {players
                  .slice(1)
                  .reduce(
                    (
                      total,
                      player
                    ) =>
                      total +
                      Number(
                        player
                          .vivreCardCount ||
                          0
                      ),
                    0
                  )}
              </strong>
              枚
            </div>

            <button
              type="button"
              onClick={
                resetGame
              }
              style={
                styles.resetButton
              }
            >
              テストをリセット
            </button>
          </div>
        </div>
      </section>
    </div>

    {showInfoShop && (
      <Modal
        title="1枚ビブカの情報を購入"
        onClose={() =>
          setShowInfoShop(
            false
          )
        }
      >
        <div
          style={
            styles.modalDescription
          }
        >
          購入した情報は
          <strong>
            あなたにだけ
          </strong>
          公開されます。
          CPUが知っている情報とは別管理です。
        </div>

        <div
          style={
            styles.infoShopGrid
          }
        >
          {INFO_ORDER.map(
            (type) => {
              const cost =
                getInfoCost(
                  type
                );

              const canBuy =
                canBuyInfo(
                  myPlayer,
                  type
                );

              return (
                <button
                  key={
                    type
                  }
                  type="button"
                  onClick={() =>
                    handleBuyInfo(
                      type
                    )
                  }
                  disabled={
                    !canBuy ||
                    actionUsed
                  }
                  style={{
                    ...styles.infoShopButton,

                    opacity:
                      !canBuy ||
                      actionUsed
                        ? 0.45
                        : 1,
                  }}
                >
                  <div
                    style={
                      styles.infoShopName
                    }
                  >
                    {getInfoLabel(
                      type
                    )}
                  </div>

                  <div
                    style={
                      styles.infoShopCost
                    }
                  >
                    {formatCost(
                      cost
                    )}
                  </div>

                  <div
                    style={
                      styles.infoShopCurrent
                    }
                  >
                    {getInfoDisplay(
                      currentVivreCard,
                      type
                    )}
                  </div>
                </button>
              );
            }
          )}
        </div>
      </Modal>
    )}

    {showPlayerInfo &&
      selectedPlayer && (
        <Modal
          title={`${selectedPlayer.name}の情報`}
          onClose={() =>
            setShowPlayerInfo(
              false
            )
          }
        >
          <div
            style={
              styles.playerModalGrid
            }
          >
            <div
              style={
                styles.playerModalResource
              }
            >
              <strong>
                所持資源
              </strong>

              <ResourceLarge
                type="berry"
                value={
                  selectedPlayer
                    .resources
                    ?.berry ??
                  0
                }
                max={
                  selectedPlayer
                    .maxResources
                    ?.berry ??
                  12
                }
              />

              <ResourceLarge
                type="verse"
                value={
                  selectedPlayer
                    .resources
                    ?.verse ??
                  0
                }
                max={
                  selectedPlayer
                    .maxResources
                    ?.verse ??
                  6
                }
              />

              <ResourceLarge
                type="eternal"
                value={
                  selectedPlayer
                    .resources
                    ?.eternal ??
                  0
                }
                max={
                  selectedPlayer
                    .maxResources
                    ?.eternal ??
                  6
                }
              />
            </div>

            <div
              style={
                styles.playerModalInfo
              }
            >
              <strong>
                そのプレイヤーが知っている1枚ビブカ情報
              </strong>

              {INFO_ORDER.map(
                (type) => {
                  const value =
                    selectedPlayer
                      .vivreCardInfo
                      ?.[
                        type
                      ];

                  return (
                    <div
                      key={
                        type
                      }
                      style={
                        styles.knownInfoRow
                      }
                    >
                      <span>
                        {getInfoLabel(
                          type
                        )}
                      </span>

                      <strong>
                        {Array.isArray(
                          value
                        )
                          ? value.join(
                              ' / '
                            )
                          : value !=
                              null
                            ? String(
                                value
                              )
                            : '---'}
                      </strong>
                    </div>
                  );
                }
              )}
            </div>
          </div>

          <div
            style={
              styles.modalFooter
            }
          >
            エクストラキャラ：
            {
              selectedPlayer
                .extraCharacterInfo
                ?.length ||
              0
            }
            個

            <br />

            1枚ビブカ獲得：
            {
              selectedPlayer
                .vivreCardCount ??
              0
            }
            枚

            <br />

            所持カード：
            {
              selectedPlayer
                .cards
                ?.length
                ? selectedPlayer.cards
                    .map(
                      (card) =>
                        card.name ||
                        card.id
                    )
                    .join(
                      '、'
                    )
                : 'なし'
            }
          </div>
        </Modal>
      )}
      {showExtraCharacterShop && (
        <div
          style={styles.extraCharacterShopOverlay}
          onClick={() =>
            setShowExtraCharacterShop(false)
          }
        >
          <div
            style={styles.extraCharacterShopModal}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={styles.extraCharacterShopTitle}
            >
              エクストラキャラ
              <br />
              <span>
                文字を購入する
              </span>
            </div>

            <div
              style={styles.extraCharacterShopDescription}
            >
              公開したい文字を購入できます。
              <br />
              購入した文字はあなたにだけ公開されます。
            </div>

            <div
              style={styles.extraCharacterPurchaseList}
            >
              <button
                type="button"
                style={styles.extraCharacterPurchaseCard}
onClick={() =>
  handleExtraCharacterPurchase(
    'berry3'
  )
}
              >
                <div
                  style={styles.extraCharacterPurchaseIcon}
                >
                  <img
                    src="/saikoro/berry.png"
                    alt="ベリー"
                    style={
                      styles.extraCharacterPurchaseImage
                    }
                  />
                </div>

                <div
                  style={styles.extraCharacterPurchaseMain}
                >
                  <div
                    style={
                      styles.extraCharacterPurchaseName
                    }
                  >
                    ランダム公開
                  </div>

                  <div
                    style={
                      styles.extraCharacterPurchaseDetail
                    }
                  >
                    隠れている文字を
                    <strong>1文字</strong>
                    ランダムで公開
                  </div>
                </div>

                <div
                  style={styles.extraCharacterPurchaseCost}
                >
                  ×3
                </div>
              </button>

              <button
                type="button"
                style={styles.extraCharacterPurchaseCard}
onClick={() =>
  handleExtraCharacterPurchase(
    'berry10'
  )
}
              >
                <div
                  style={styles.extraCharacterPurchaseIcon}
                >
                  <img
                    src="/saikoro/berry.png"
                    alt="ベリー"
                    style={
                      styles.extraCharacterPurchaseImage
                    }
                  />
                </div>

                <div
                  style={styles.extraCharacterPurchaseMain}
                >
                  <div
                    style={
                      styles.extraCharacterPurchaseName
                    }
                  >
                    位置を選択
                  </div>

                  <div
                    style={
                      styles.extraCharacterPurchaseDetail
                    }
                  >
                    好きな位置の文字を
                    <strong>1文字</strong>
                    公開
                  </div>
                </div>

                <div
                  style={styles.extraCharacterPurchaseCost}
                >
                  ×10
                </div>
              </button>

              <button
                type="button"
                style={styles.extraCharacterPurchaseCard}
onClick={() =>
  handleExtraCharacterPurchase(
    'verse2'
  )
}
              >
                <div
                  style={styles.extraCharacterPurchaseIcon}
                >
                  <img
                    src="/saikoro/vasu.png"
                    alt="ヴァース"
                    style={
                      styles.extraCharacterPurchaseImage
                    }
                  />
                </div>

                <div
                  style={styles.extraCharacterPurchaseMain}
                >
                  <div
                    style={
                      styles.extraCharacterPurchaseName
                    }
                  >
                    位置を選択
                  </div>

                  <div
                    style={
                      styles.extraCharacterPurchaseDetail
                    }
                  >
                    好きな位置の文字を
                    <strong>1文字</strong>
                    公開
                  </div>
                </div>

                <div
                  style={styles.extraCharacterPurchaseCost}
                >
                  ×2
                </div>
              </button>

              <button
                type="button"
                style={styles.extraCharacterPurchaseCard}
onClick={() =>
  handleExtraCharacterPurchase(
    'eternal2'
  )
}
              >
                <div
                  style={styles.extraCharacterPurchaseIcon}
                >
                  <img
                    src="/saikoro/pors.png"
                    alt="永久指針"
                    style={
                      styles.extraCharacterPurchaseImage
                    }
                  />
                </div>

                <div
                  style={styles.extraCharacterPurchaseMain}
                >
                  <div
                    style={
                      styles.extraCharacterPurchaseName
                    }
                  >
                    位置を選択
                  </div>

                  <div
                    style={
                      styles.extraCharacterPurchaseDetail
                    }
                  >
                    好きな位置の文字を
                    <strong>1文字</strong>
                    公開
                  </div>
                </div>

                <div
                  style={styles.extraCharacterPurchaseCost}
                >
                  ×2
                </div>
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setExtraCharacterPurchaseMode(null);
                setExtraCharacterSelecting(false);
                setShowExtraCharacterShop(false);
              }}
              style={styles.extraCharacterShopCloseButton}
            >
              閉じる
            </button>
          </div>
        </div>
      )}

  </main>
);}

function ResourceBox({
  type,
  value,
}) {
  return (
    <div
      style={
        styles.resourceBox
      }
    >
      <img
        src={
          RESOURCE_ICONS[type]
        }
        alt={
          RESOURCE_NAMES[type]
        }
        style={
          styles.resourceIcon
        }
      />

      <div
        style={
          styles.resourceBoxText
        }
      >
        <span>
          {RESOURCE_NAMES[type]}
        </span>

        <strong>
          {value}
        </strong>
      </div>
    </div>
  );
}

function ResourceLarge({
  type,
  value,
  max,
}) {
  return (
    <div
      style={
        styles.resourceLarge
      }
    >
      <img
        src={
          RESOURCE_ICONS[type]
        }
        alt={
          RESOURCE_NAMES[type]
        }
        style={
          styles.resourceLargeIcon
        }
      />

      <div
        style={
          styles.resourceLargeBody
        }
      >
        <div
          style={
            styles.resourceLargeName
          }
        >
          {RESOURCE_NAMES[type]}
        </div>

        <div
          style={
            styles.resourceLargeValue
          }
        >
          {value}

          <span
            style={
              styles.resourceLargeMax
            }
          >
            / {max}
          </span>
        </div>
      </div>
    </div>
  );
}

function Dice3D({
  label,
  dice,
  rotation,
  rolling,
  result,
}) {
  const safeDice =
    Array.isArray(dice) &&
    dice.length === 6
      ? dice
      : INITIAL_DICE_A;

  const displayRotation =
    rotation || {
      x: 0,
      y: 0,
      z: 0,
    };

  return (
    <div
      style={
        styles.dice3DSection
      }
    >
      <div
        style={
          styles.dice3DLabel
        }
      >
        {label}
      </div>

      <div
        style={{
          ...styles.dice3DStage,

          ...(rolling
            ? styles.dice3DStageRolling
            : {}),
        }}
      >
        <div
          style={{
            ...styles.dice3D,

            transform:
              `rotateX(${displayRotation.x || 0}deg) ` +
              `rotateY(${displayRotation.y || 0}deg) ` +
              `rotateZ(${displayRotation.z || 0}deg)`,

            transition:
              rolling
                ? 'transform 90ms linear'
                : 'transform 700ms cubic-bezier(.15,.75,.2,1)',
          }}
        >
          <div
            style={{
              ...styles.dice3DFace,
              ...styles.dice3DFaceFront,
            }}
          >
            <Dice3DFaceContent
              face={
                safeDice[0]
              }
            />
          </div>

          <div
            style={{
              ...styles.dice3DFace,
              ...styles.dice3DFaceBack,
            }}
          >
            <Dice3DFaceContent
              face={
                safeDice[1]
              }
            />
          </div>

          <div
            style={{
              ...styles.dice3DFace,
              ...styles.dice3DFaceRight,
            }}
          >
            <Dice3DFaceContent
              face={
                safeDice[2]
              }
            />
          </div>

          <div
            style={{
              ...styles.dice3DFace,
              ...styles.dice3DFaceLeft,
            }}
          >
            <Dice3DFaceContent
              face={
                safeDice[3]
              }
            />
          </div>

          <div
            style={{
              ...styles.dice3DFace,
              ...styles.dice3DFaceTop,
            }}
          >
            <Dice3DFaceContent
              face={
                safeDice[4]
              }
            />
          </div>

          <div
            style={{
              ...styles.dice3DFace,
              ...styles.dice3DFaceBottom,
            }}
          >
            <Dice3DFaceContent
              face={
                safeDice[5]
              }
            />
          </div>
        </div>
      </div>

      <div
        style={
          styles.dice3DStatus
        }
      >
        {rolling
          ? '抽選中……'
          : result
            ? `出目：${RESOURCE_NAMES[result.type] || result.type} +${result.value}`
            : '待機中'}
      </div>
    </div>
  );
}

function Dice3DFaceContent({
  face,
}) {
  if (!face) {
    return (
      <span
        style={
          styles.dice3DEmpty
        }
      >
        ？
      </span>
    );
  }

  return (
    <div
      style={
        styles.dice3DFaceInner
      }
    >
<img
  src={RESOURCE_ICONS[face.type]}
  alt={RESOURCE_NAMES[face.type] || face.type}
  style={{
    ...styles.dice3DIcon,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

      <span
        style={
          styles.dice3DValue
        }
      >
        +{face.value}
      </span>
    </div>
  );
}

function DiceFaceList({
  title,
  dice,
}) {
  return (
    <div
      style={
        styles.diceFaceBlock
      }
    >
      {title && (
        <div
          style={
            styles.diceFaceTitle
          }
        >
          {title}
        </div>
      )}

      <div
        style={
          styles.diceFaceGrid
        }
      >
        {dice.map(
          (
            face,
            index
          ) => (
            <div
              key={`${title || 'dice'}-${index}`}
              style={
                styles.diceFace
              }
            >
<img
  src={RESOURCE_ICONS[face.type]}
  alt={RESOURCE_NAMES[face.type] || face.type}
  style={{
    ...styles.diceFaceIcon,
    background: 'transparent',
    mixBlendMode: 'multiply',
  }}
/>

              <strong>
                +{face.value}
              </strong>
            </div>
          )
        )}
      </div>
    </div>
  );
}


function Modal({
  title,
  children,
  onClose,
}) {
  return (
    <div
      style={
        styles.modalOverlay
      }
    >
      <div
        style={
          styles.modal
        }
      >
        <div
          style={
            styles.modalHeader
          }
        >
          <h2
            style={
              styles.modalTitle
            }
          >
            {title}
          </h2>

          <button
            type="button"
            onClick={
              onClose
            }
            style={
              styles.modalClose
            }
          >
            ×
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100vh',
    width: '100%',
    minWidth: '1180px',
    background:
      'linear-gradient(180deg, #d9c3a1 0%, #b89d76 100%)',
    color: '#241d15',
    padding: '16px',
    boxSizing: 'border-box',
    overflowX: 'auto',
    overflowY: 'auto',
  },

  gameShell: {
    width: '1140px',
    minWidth: '1140px',
    margin: '0 auto',
  },

  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background:
      'rgba(247,238,218,0.96)',
    border:
      '1px solid rgba(80,58,34,0.25)',
    borderRadius: '14px',
    padding: '16px 22px',
    marginBottom: '12px',
    boxShadow:
      '0 4px 14px rgba(55,38,20,0.15)',
  },

  eyebrow: {
    fontSize: '11px',
    letterSpacing: '0.16em',
    color: '#826b4a',
    fontWeight: '800',
  },

  title: {
    margin: '4px 0 0',
    fontSize: '30px',
    lineHeight: 1,
  },

  headerRight: {
    textAlign: 'right',
  },

  roundBadge: {
    display: 'inline-block',
    background: '#4b3824',
    color: '#fff',
    borderRadius: '999px',
    padding: '6px 14px',
    fontSize: '14px',
    fontWeight: '800',
  },

  phaseText: {
    marginTop: '6px',
    fontSize: '13px',
    color: '#765e3e',
    fontWeight: '700',
  },

  playerStrip: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(4, minmax(250px, 1fr))',
    gap: '10px',
    marginBottom: '12px',
  },

  playerCard: {
    appearance: 'none',
    border:
      '2px solid rgba(84,63,39,0.22)',
    borderRadius: '10px',
    background:
      'rgba(245,235,211,0.98)',
    color: '#2c241a',
    padding: '11px',
    minWidth: 0,
    cursor: 'pointer',
    textAlign: 'left',
    boxShadow:
      '0 3px 9px rgba(45,30,15,0.13)',
  },

  playerMe: {
    background:
      'rgba(255,248,220,0.99)',
  },

  playerTurn: {
    border:
      '2px solid #c28b24',
    boxShadow:
      '0 0 0 3px rgba(194,139,36,0.18), 0 4px 12px rgba(45,30,15,0.18)',
  },

  playerWinner: {
    border:
      '2px solid #268547',
    background:
      'rgba(224,248,228,0.99)',
  },

  playerTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '9px',
  },

  playerName: {
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
    fontWeight: '900',
    fontSize: '16px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  playerAvatar: {
    fontSize: '20px',
  },

  turnBadge: {
    flexShrink: 0,
    background: '#c18a25',
    color: '#fff',
    borderRadius: '999px',
    padding: '3px 8px',
    fontSize: '10px',
    fontWeight: '900',
  },

  resourceRow: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(3, minmax(0, 1fr))',
    gap: '5px',
  },

  resourceBox: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    background:
      'rgba(255,255,255,0.55)',
    borderRadius: '6px',
    padding: '6px 5px',
    minWidth: 0,
    fontSize: '15px',
  },

  resourceIcon: {
    width: '24px',
    height: '24px',
    objectFit: 'contain',
    display: 'block',
  },

  playerBottom: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(2, 1fr)',
    gap: '5px',
    marginTop: '7px',
    paddingTop: '7px',
    borderTop:
      '1px solid rgba(84,63,39,0.12)',
    fontSize: '10px',
    color: '#806e56',
    textAlign: 'center',
  },

  board: {
    position: 'relative',
    background:
      'linear-gradient(135deg, #76945f 0%, #607e4d 50%, #536f45 100%)',
    border:
      '5px solid #7b6240',
    borderRadius: '14px',
    padding: '14px',
    minHeight: '720px',
    boxShadow:
      'inset 0 0 0 2px rgba(255,255,255,0.15), 0 6px 20px rgba(45,30,15,0.25)',
    boxSizing: 'border-box',
  },

  boardTop: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '20px',
    color: '#fff',
    padding:
      '5px 10px 13px',
  },

  boardLabel: {
    fontSize: '11px',
    opacity: 0.72,
  },

  boardTurn: {
    fontSize: '24px',
    fontWeight: '900',
    textShadow:
      '0 1px 2px rgba(0,0,0,0.25)',
  },

  boardMessage: {
    maxWidth: '65%',
    textAlign: 'right',
    fontSize: '14px',
    lineHeight: 1.5,
    fontWeight: '700',
  },

  boardContent: {
    display: 'grid',
    gridTemplateColumns:
      'minmax(0, 1fr) 250px',
    gap: '14px',
    alignItems: 'start',
  },

  centerPanel: {
    background:
      'rgba(238,232,207,0.98)',
    border:
      '3px solid rgba(81,61,37,0.45)',
    borderRadius: '12px',
    padding: '18px',
    minWidth: 0,
    boxShadow:
      '0 5px 15px rgba(30,30,10,0.2)',
  },

  rightPanel: {
    background:
      'rgba(235,226,196,0.96)',
    border:
      '2px solid rgba(81,61,37,0.35)',
    borderRadius: '10px',
    padding: '12px',
    boxShadow:
      '0 4px 10px rgba(30,30,10,0.16)',
    minWidth: 0,
  },

  sideTitle: {
    fontSize: '13px',
    fontWeight: '900',
    color: '#4d3b27',
    marginBottom: '9px',
  },

  resourceLarge: {
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    background:
      'rgba(255,255,255,0.54)',
    borderRadius: '8px',
    padding: '7px',
    marginBottom: '6px',
  },

  resourceLargeIcon: {
    width: '32px',
    height: '32px',
    objectFit: 'contain',
    display: 'block',
  },

  resourceLargeBody: {
    minWidth: 0,
  },

  resourceLargeName: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },

  resourceLargeValue: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '4px',
    fontSize: '18px',
    fontWeight: '900',
  },

  resourceLargeMax: {
    fontSize: '12px',
    fontWeight: '500',
    color: '#8d806d',
  },

  centerLabel: {
    textAlign: 'center',
    fontSize: '13px',
    color: '#7a684f',
    fontWeight: '900',
    letterSpacing: '0.1em',
    marginBottom: '9px',
  },

  vivreCard: {
    width: '100%',
    boxSizing: 'border-box',
    background:
      'linear-gradient(135deg, #fffdf4, #f3e9ce)',
    border:
      '3px solid #a48b61',
    borderRadius: '12px',
    padding: '18px',
    boxShadow:
      '0 5px 14px rgba(50,35,20,0.18)',
  },

  vivreCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#89714e',
    fontWeight: '900',
    letterSpacing: '0.08em',
  },

  vivreQuestion: {
    textAlign: 'center',
    marginTop: '12px',
    fontSize: '16px',
    fontWeight: '800',
  },

  vivreHiddenName: {
    margin:
      '14px auto 16px',
    width: '78%',
    boxSizing: 'border-box',
    textAlign: 'center',
    background:
      '#d7c9a7',
    border:
      '1px solid #ad9b75',
    borderRadius: '6px',
    padding: '11px',
    fontSize: '25px',
    letterSpacing: '0.18em',
    fontWeight: '900',
    color: '#65543d',
  },

  infoGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(2, minmax(0, 1fr))',
    gap: '7px',
  },

  infoCell: {
    background:
      'rgba(255,255,255,0.55)',
    border:
      '1px solid rgba(118,96,61,0.23)',
    borderRadius: '6px',
    padding: '8px',
    minHeight: '54px',
    boxSizing: 'border-box',
  },

  infoCellSelected: {
    border:
      '2px solid #c38a24',
    background:
      '#fff8db',
  },

  infoLabel: {
    fontSize: '10px',
    color: '#857258',
  },

  infoValue: {
    marginTop: '3px',
    fontSize: '15px',
    fontWeight: '900',
    overflowWrap: 'anywhere',
  },

  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    marginTop: '10px',
    paddingTop: '8px',
    borderTop:
      '1px solid rgba(118,96,61,0.2)',
    fontSize: '10px',
    color: '#88775d',
  },

  answerNotice: {
    display: 'flex',
    justifyContent: 'center',
    gap: '10px',
    alignItems: 'center',
    marginTop: '10px',
    border:
      '1px solid',
    borderRadius: '7px',
    padding: '8px',
    fontSize: '13px',
  },

  winPanel: {
    marginTop: '10px',
    background:
      '#e2f6e5',
    border:
      '2px solid #388b4e',
    borderRadius: '8px',
    padding: '11px',
    textAlign: 'center',
    color: '#225e32',
    fontSize: '13px',
  },

  winTitle: {
    fontSize: '22px',
    fontWeight: '900',
  },

  winAnswer: {
    margin:
      '3px 0',
    fontSize: '20px',
    fontWeight: '900',
  },

  myInfoList: {
    display: 'grid',
    gap: '5px',
  },

  myInfoItem: {
    background:
      'rgba(255,255,255,0.5)',
    borderRadius: '6px',
    padding: '7px',
    fontSize: '9px',
    color: '#7b6a52',
  },

  rightHint: {
    marginTop: '12px',
    fontSize: '9px',
    lineHeight: 1.5,
    color: '#7d6c54',
  },

  actionArea: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '9px',
    flexWrap: 'wrap',
    marginTop: '12px',
    padding:
      '11px 9px',
    background:
      'rgba(48,66,38,0.72)',
    borderRadius: '8px',
  },

  primaryButton: {
    border: 'none',
    borderRadius: '7px',
    padding:
      '11px 22px',
    background:
      '#d29328',
    color: '#fff',
    fontWeight: '900',
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow:
      '0 3px 6px rgba(0,0,0,0.2)',
  },

  actionButton: {
    border:
      '1px solid #d5b77e',
    borderRadius: '7px',
    padding:
      '11px 18px',
    background:
      '#f2e4bd',
    color: '#4c3922',
    fontWeight: '900',
    fontSize: '14px',
    cursor: 'pointer',
  },

  answerForm: {
    display: 'flex',
    gap: '8px',
    width: '100%',
    maxWidth: '650px',
  },

  answerInput: {
    flex: 1,
    minWidth: 0,
    border:
      '1px solid #a58e68',
    borderRadius: '7px',
    padding:
      '11px 13px',
    fontSize: '16px',
    outline: 'none',
  },

  cpuThinking: {
    color: '#fff',
    fontWeight: '800',
    fontSize: '14px',
  },

  diceRollingOverlay: {
    position: 'relative',
    minHeight: '250px',
    marginBottom: '14px',
    borderRadius: '12px',
    background:
      'radial-gradient(circle, rgba(244,231,187,0.98) 0%, rgba(202,177,112,0.94) 100%)',
    border:
      '4px solid #8c7048',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    boxShadow:
      '0 7px 20px rgba(35,25,12,0.3)',
  },

  diceRollingTitle: {
    fontSize: '25px',
    fontWeight: '900',
    color: '#4b3824',
    textShadow:
      '0 2px 2px rgba(255,255,255,0.4)',
  },

  rollingDice: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '30px',
    marginTop: '18px',
  },

  rollingDiceOne: {
    width: '90px',
    height: '90px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '70px',
    animation:
      'saikoroDiceRollOne 0.32s linear infinite',
  },

  rollingDiceTwo: {
    width: '90px',
    height: '90px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '70px',
    animation:
      'saikoroDiceRollTwo 0.27s linear infinite',
  },

  diceRollingText: {
    marginTop: '8px',
    fontSize: '16px',
    fontWeight: '900',
    color: '#6b5232',
  },

  diceResultsStage: {
    position: 'relative',
    minHeight: '310px',
    marginBottom: '14px',
    padding: '18px',
    boxSizing: 'border-box',
    borderRadius: '12px',
    background:
      'linear-gradient(135deg, rgba(255,248,215,0.99), rgba(224,204,151,0.98))',
    border:
      '4px solid #8c7048',
    boxShadow:
      '0 8px 24px rgba(35,25,12,0.34)',
    animation:
      'saikoroResultBang 0.45s ease-out',
  },

  diceResultsTitle: {
    textAlign: 'center',
    fontSize: '27px',
    fontWeight: '900',
    color: '#4b3824',
    marginBottom: '16px',
  },

  diceResultsPlayers: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(4, minmax(0, 1fr))',
    gap: '12px',
  },

  diceResultPlayer: {
    background:
      'rgba(255,255,255,0.72)',
    border:
      '2px solid rgba(116,91,48,0.35)',
    borderRadius: '10px',
    padding: '11px',
    textAlign: 'center',
    boxShadow:
      '0 4px 9px rgba(45,30,15,0.14)',
  },

  diceResultPlayerName: {
    fontSize: '16px',
    fontWeight: '900',
    color: '#4d3b27',
    marginBottom: '8px',
  },

  diceResultDiceRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '10px',
  },

  diceResultBig: {
    width: '74px',
    height: '74px',
    background:
      '#fffdf2',
    border:
      '2px solid #a48b61',
    borderRadius: '9px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow:
      '0 3px 7px rgba(45,30,15,0.18)',
    fontSize: '30px',
    fontWeight: '900',
  },

  diceResultBigImg: {
    width: '56px',
    height: '56px',
    objectFit: 'contain',
  },

  diceResultResourceText: {
    marginTop: '8px',
    fontSize: '11px',
    fontWeight: '800',
    color: '#725d3e',
  },

  bottomArea: {
    display: 'grid',
    gridTemplateColumns:
      '1.3fr 1fr 1fr',
    gap: '10px',
    marginTop: '12px',
  },

  bottomCard: {
    background:
      'rgba(245,235,211,0.98)',
    border:
      '1px solid rgba(80,58,34,0.24)',
    borderRadius: '10px',
    padding: '11px',
    minWidth: 0,
  },

  bottomTitle: {
    fontSize: '13px',
    fontWeight: '900',
    marginBottom: '9px',
    color: '#5d4930',
  },

  ownedCards: {
    display: 'flex',
    gap: '5px',
    flexWrap: 'wrap',
  },

  ownedCard: {
    background:
      '#fffdf2',
    border:
      '1px solid #b7a27c',
    borderRadius: '999px',
    padding:
      '5px 8px',
    fontSize: '10px',
    fontWeight: '800',
  },

  emptyText: {
    color: '#94846e',
    fontSize: '10px',
  },

  testStatus: {
    display: 'grid',
    gap: '7px',
    fontSize: '11px',
    color: '#756149',
  },

  resetButton: {
    marginTop: '5px',
    border:
      '1px solid #a58e68',
    background:
      '#f7efd9',
    color: '#58452e',
    borderRadius: '6px',
    padding:
      '7px 11px',
    fontSize: '10px',
    fontWeight: '800',
    cursor: 'pointer',
  },

  loading: {
    width: 'min(500px, 92vw)',
    margin:
      '18vh auto 0',
    background:
      '#f4ead4',
    border:
      '2px solid #a58c63',
    borderRadius: '12px',
    padding: '35px',
    textAlign: 'center',
    boxShadow:
      '0 6px 20px rgba(50,35,20,0.2)',
  },

  loadingTitle: {
    fontSize: '30px',
    fontWeight: '900',
    marginBottom: '12px',
  },

  loadingSub: {
    marginTop: '10px',
    color: '#88775f',
    fontSize: '12px',
  },

  errorBox: {
    width: 'min(700px, 92vw)',
    margin:
      '12vh auto 0',
    background:
      '#f5e9d4',
    border:
      '2px solid #a56a4a',
    borderRadius: '12px',
    padding: '30px',
    boxShadow:
      '0 6px 20px rgba(50,35,20,0.2)',
  },

  modalOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    background:
      'rgba(24,18,10,0.62)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '15px',
    boxSizing: 'border-box',
  },

  modal: {
    width:
      'min(800px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    background:
      '#f3ead5',
    border:
      '2px solid #8c7048',
    borderRadius: '12px',
    padding: '16px',
    boxSizing: 'border-box',
    boxShadow:
      '0 10px 40px rgba(0,0,0,0.35)',
  },

  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },

  modalTitle: {
    margin: 0,
    fontSize: '20px',
    color: '#40301e',
  },

  modalClose: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border:
      '1px solid #9c8868',
    background:
      '#fff8e8',
    color: '#4a3824',
    cursor: 'pointer',
    fontSize: '20px',
    lineHeight: 1,
  },

  modalDescription: {
    background:
      '#fff9e9',
    border:
      '1px solid #c9b58d',
    borderRadius: '7px',
    padding: '9px',
    fontSize: '11px',
    lineHeight: 1.6,
    marginBottom: '12px',
  },

  infoShopGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(2, minmax(0, 1fr))',
    gap: '7px',
  },

  infoShopButton: {
    border:
      '1px solid #b29b72',
    borderRadius: '7px',
    background:
      '#fff9e9',
    padding: '10px',
    textAlign: 'left',
    cursor: 'pointer',
    color: '#493822',
  },

  infoShopName: {
    fontWeight: '900',
    fontSize: '13px',
  },

  infoShopCost: {
    marginTop: '3px',
    fontSize: '10px',
    color: '#ad741d',
    fontWeight: '800',
  },

  infoShopCurrent: {
    marginTop: '7px',
    padding:
      '5px 6px',
    borderRadius: '4px',
    background:
      '#eee2c2',
    fontSize: '12px',
    fontWeight: '900',
  },

  playerModalGrid: {
    display: 'grid',
    gridTemplateColumns:
      '220px 1fr',
    gap: '12px',
  },

  playerModalResource: {
    background:
      '#fff8e6',
    border:
      '1px solid #c6b28c',
    borderRadius: '8px',
    padding: '10px',
  },

  playerModalInfo: {
    background:
      '#fff8e6',
    border:
      '1px solid #c6b28c',
    borderRadius: '8px',
    padding: '10px',
  },

  knownInfoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '10px',
    padding:
      '6px 0',
    borderBottom:
      '1px solid #e2d7bd',
    fontSize: '10px',
  },

  modalFooter: {
    marginTop: '12px',
    background:
      '#eee2c2',
    borderRadius: '7px',
    padding: '9px',
    fontSize: '10px',
    lineHeight: 1.7,
    color: '#66533a',
  },

  infoShopButtonDisabled: {
    cursor: 'not-allowed',
  },

  diceResultValue: {
    marginTop: '3px',
    fontSize: '15px',
    fontWeight: '900',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
  },

  diceResultIcon: {
    width: '20px',
    height: '20px',
    objectFit: 'contain',
  },

  diceWorkshop: {
    marginTop: '8px',
    background:
      'linear-gradient(180deg, #eee3c8 0%, #dfd0ad 100%)',
    border:
      '3px solid #80633f',
    borderRadius: '12px',
    padding: '9px',
    boxShadow:
      '0 5px 16px rgba(45,30,15,0.22)',
  },

  diceWorkshopHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '12px',
    padding:
      '1px 4px 7px',
    borderBottom:
      '1px solid rgba(93,70,39,0.2)',
  },

  diceWorkshopEyebrow: {
    fontSize: '8px',
    letterSpacing: '0.16em',
    color: '#8a704c',
    fontWeight: '900',
  },

  diceWorkshopTitle: {
    marginTop: '1px',
    fontSize: '18px',
    fontWeight: '900',
    color: '#3d2c1b',
  },

  diceWorkshopResource: {
    minWidth: '220px',
    textAlign: 'right',
    fontSize: '9px',
    color: '#786348',
    fontWeight: '900',
  },

  diceWorkshopResourceRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '3px',
    marginTop: '3px',
  },

  diceWorkshopBody: {
    display: 'grid',
    gridTemplateColumns:
      '145px 135px 135px 145px minmax(300px, 1fr)',
    gap: '10px',
    alignItems: 'center',
    minHeight: '190px',
    padding: '8px 3px 4px',
  },

  diceWorkshopSide: {
    background:
      'rgba(255,255,255,0.42)',
    border:
      '1px solid rgba(101,78,46,0.22)',
    borderRadius: '9px',
    padding: '7px',
    minWidth: 0,
  },

  diceWorkshopSideTitle: {
    textAlign: 'center',
    fontSize: '11px',
    fontWeight: '900',
    color: '#5d452a',
    marginBottom: '5px',
  },

  dice3DSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },

  dice3DLabel: {
    fontSize: '10px',
    fontWeight: '900',
    color: '#6b5131',
    marginBottom: '2px',
  },

  dice3DStage: {
    width: '120px',
    height: '120px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    perspective: '600px',
    perspectiveOrigin: '50% 50%',
  },

  dice3DStageRolling: {
    filter:
      'drop-shadow(0 8px 7px rgba(0,0,0,0.25))',
  },

  dice3D: {
    position: 'relative',
    width: '78px',
    height: '78px',
    transformStyle: 'preserve-3d',
    transformOrigin:
      'center center',
  },

  dice3DFace: {
    position: 'absolute',
    width: '78px',
    height: '78px',
    left: 0,
    top: 0,
    border: '2px solid #5d452b',
    borderRadius: '11px',
    background:
      'linear-gradient(145deg, #fffdf4, #d9c9a4)',
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backfaceVisibility: 'hidden',
    boxShadow:
      'inset 0 0 12px rgba(90,60,25,0.10)',
  },

  dice3DFaceFront: {
    transform:
      'translateZ(39px)',
  },

  dice3DFaceBack: {
    transform:
      'rotateY(180deg) translateZ(39px)',
  },

  dice3DFaceRight: {
    transform:
      'rotateY(90deg) translateZ(39px)',
  },

  dice3DFaceLeft: {
    transform:
      'rotateY(-90deg) translateZ(39px)',
  },

  dice3DFaceTop: {
    transform:
      'rotateX(90deg) translateZ(39px)',
  },

  dice3DFaceBottom: {
    transform:
      'rotateX(-90deg) translateZ(39px)',
  },

  dice3DFaceInner: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    boxShadow: 'none',
    border: 'none',
  },

  dice3DIcon: {
    width: '45px',
    height: '45px',
    objectFit: 'contain',
    display: 'block',
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    filter: 'none',
  },

  dice3DValue: {
    marginTop: '5px',
    fontSize: '16px',
    fontWeight: '900',
    lineHeight: 1,
    color: '#3f2e1c',
    background: 'transparent',
    textShadow:
      '0 1px 0 rgba(255,255,255,0.45)',
  },

  dice3DEmpty: {
    fontSize: '28px',
    fontWeight: '900',
    color: '#9c8968',
    background: 'transparent',
  },

  dice3DStatus: {
    minHeight: '15px',
    fontSize: '9px',
    fontWeight: '900',
    color: '#896d47',
  },

  diceFaceBlock: {
    display: 'block',
    width: '100%',
    margin: 0,
  },

  diceFaceTitle: {
    fontSize: '10px',
    color: '#857258',
    marginBottom: '5px',
    fontWeight: '800',
  },

  diceFaceGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(2, 58px)',
    gridTemplateRows:
      'repeat(3, 58px)',
    gap: '5px',
    justifyContent: 'center',
  },

  diceFace: {
    width: '58px',
    height: '58px',
    background:
      'linear-gradient(145deg, #fffdf4, #e3d5b5)',
    border:
      '1px solid #a99570',
    borderRadius: '7px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '9px',
    boxSizing: 'border-box',
    boxShadow:
      'inset 0 0 7px rgba(90,60,25,0.08)',
  },

  diceFaceIcon: {
    width: '38px',
    height: '38px',
    objectFit: 'contain',
    display: 'block',
    background:
      'transparent',
  },

  diceWorkshopRollArea: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    marginTop: '3px',
    paddingTop: '8px',
    borderTop:
      '1px solid rgba(93,70,39,0.2)',
  },

  diceWorkshopRollButton: {
    border:
      '3px solid #704719',
    borderRadius: '999px',
    padding:
      '12px 28px',
    background:
      'linear-gradient(180deg, #e0a43b 0%, #bd7920 100%)',
    color: '#fff',
    fontSize: '15px',
    fontWeight: '900',
    cursor: 'pointer',
    boxShadow:
      '0 4px 8px rgba(70,40,10,0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
  },

  diceWorkshopRollIcon: {
    fontSize: '21px',
  },

  diceWorkshopRollingText: {
    fontSize: '10px',
    color: '#856943',
    fontWeight: '800',
  },

diceTemple: {
  marginTop: 24,
  padding: 26,
  borderRadius: 26,
  background:
    'linear-gradient(180deg, #f8f9fb 0%, #e9edf2 100%)',
  border:
    '2px solid #cbd3dc',
  boxShadow:
    '0 12px 35px rgba(0,0,0,0.16)',
  position: 'relative',
  overflow: 'hidden',
},

diceTempleHeader: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 24,
  marginBottom: 22,
  paddingBottom: 18,
  borderBottom:
    '2px solid #cbd3dc',
},

diceTempleEyebrow: {
  fontSize: 13,
  fontWeight: 900,
  letterSpacing: 4,
  color: '#64748b',
  marginBottom: 5,
},

diceTempleTitle: {
  fontSize: 32,
  fontWeight: 1000,
  color: '#172033',
  letterSpacing: 1,
},


diceTempleSubtitle: {
  marginTop: 7,
  fontSize: 16,
  color: '#526173',
  fontWeight: 700,
},

  diceTempleDescription: {
    padding: '13px 18px',
    borderRadius: 14,

    background:
      'rgba(20,18,15,0.28)',

    border:
      '1px solid rgba(255,255,255,0.16)',

    color: '#fff0c7',
    fontSize: 14,
    lineHeight: 1.7,
    textAlign: 'right',
    whiteSpace: 'nowrap',

    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.10)',
  },

  diceTempleDescriptionMain: {
    fontSize: 15,
    fontWeight: 900,
    color: '#ffe6a9',
  },

  diceTempleDescriptionSub: {
    color:
      'rgba(255,248,232,0.65)',
    fontSize: 12,
    marginTop: 3,
    fontWeight: 700,
  },

  diceTempleSelectionGuide: {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    marginBottom: 18,
    padding: '15px 18px',
    borderRadius: 14,

    background:
      'linear-gradient(90deg, rgba(180,30,30,0.32), rgba(90,20,20,0.18))',

    border:
      '2px solid rgba(255,80,80,0.45)',

    color: '#ffe7e7',
    fontSize: 16,
    fontWeight: 800,

    boxShadow:
      '0 0 20px rgba(255,40,40,0.12)',
  },

  diceTempleCancelButton: {
    marginLeft: 'auto',
    padding: '8px 14px',
    borderRadius: 9,

    border:
      '1px solid rgba(255,255,255,0.22)',

    background:
      'rgba(0,0,0,0.28)',

    color: '#fff',
    fontSize: 14,
    fontWeight: 900,
    cursor: 'pointer',
  },

  diceTempleForgeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },

  diceTempleForgeRow: {
    display: 'grid',
    gridTemplateColumns:
      '125px minmax(0, 1fr)',
    gap: 14,
    alignItems: 'stretch',
  },

diceTempleCostColumn: {
  minHeight: 150,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  borderRadius: 16,
  background: '#ffffff',
  border:
    '2px solid #b9c4d0',
  color: '#172033',
  boxShadow:
    '0 5px 14px rgba(15,23,42,0.10)',
  fontSize: 21,
  fontWeight: 1000,
  textShadow: 'none',
},

diceTempleCostIconLarge: {
  width: 38,
  height: 38,
  objectFit: 'contain',
  background: 'transparent',
  mixBlendMode: 'multiply',
  filter:
    'drop-shadow(0 2px 3px rgba(0,0,0,0.55))',
},

diceTempleCostIconSmall: {
  width: 27,
  height: 27,
  objectFit: 'contain',
  background: 'transparent',
  mixBlendMode: 'multiply',
  filter:
    'drop-shadow(0 2px 3px rgba(0,0,0,0.55))',
},

diceTempleCostColumnLabel: {
  fontSize: 12,
  color: '#64748b',
  fontWeight: 800,
},

diceTempleCostDivider: {
  width: 55,
  height: 1,
  margin: '7px 0',
  background: '#cbd5e1',
},

  diceTempleOffers: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(190px, 1fr))',
    gap: 12,
  },

diceTempleCard: {
  position: 'relative',
  minHeight: 170,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  padding: 13,
  borderRadius: 16,
  background: '#ffffff',
  border:
    '2px solid #cbd5e1',
  boxShadow:
    '0 5px 14px rgba(15,23,42,0.10)',
  overflow: 'hidden',
  color: '#172033',
  cursor: 'pointer',
  transition:
    'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
},

diceTempleCardSelected: {
  border:
    '3px solid #ef4444',
  background: '#fff7f7',
  boxShadow:
    '0 0 0 3px rgba(239,68,68,0.15), 0 8px 22px rgba(239,68,68,0.22)',
  transform:
    'translateY(-2px) scale(1.02)',
},

diceTempleCardDisabled: {
  opacity: 0.72,
  cursor: 'not-allowed',
  background: '#e5e7eb',
  border:
    '2px solid #cbd5e1',
},

diceTempleCardTop: {
  minHeight: 29,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
},

diceTempleStockLarge: {
  padding: '4px 8px',
  borderRadius: 8,
  background: '#eef2f7',
  color: '#475569',
  fontSize: 14,
  fontWeight: 900,
},

diceTempleSelectedBadge: {
  padding: '4px 8px',
  borderRadius: 8,
  background: '#ef4444',
  color: '#fff',
  fontSize: 12,
  fontWeight: 1000,
},

 diceTempleFaceArea: {
  flex: 1,
  minHeight: 92,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  marginTop: 7,
  padding: 8,
  borderRadius: 12,
  background: '#f8fafc',
  border:
    '1px solid #e2e8f0',
},

diceTempleTouchGuide: {
  marginTop: 8,
  textAlign: 'center',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 800,
},

diceTempleOwnDicePanel: {
  marginTop: 22,
  padding: 20,
  borderRadius: 18,
  background: '#ffffff',
  border: '2px solid #cbd5e1',
  boxShadow:
    '0 6px 18px rgba(15,23,42,0.10)',
},

diceTempleOwnDiceTitle: {
  fontSize: 21,
  fontWeight: 1000,
  color: '#172033',
  textAlign: 'center',
},

diceTempleOwnDiceSubtitle: {
  marginTop: 5,
  marginBottom: 15,
  fontSize: 14,
  color: '#64748b',
  textAlign: 'center',
  fontWeight: 700,
},

  diceTempleOwnDiceGrid: {
    display: 'grid',
    gridTemplateColumns:
      'repeat(6, minmax(90px, 1fr))',
    gap: 10,
  },

diceTempleOwnDiceFace: {
  minHeight: 110,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 5,
  borderRadius: 14,
  background: '#f8fafc',
  border: '2px solid #cbd5e1',
  color: '#172033',
  cursor: 'pointer',
  boxShadow:
    '0 4px 10px rgba(15,23,42,0.08)',
},

diceTempleOwnDiceFaceSelected: {
  border: '3px solid #ef4444',
  background: '#fff7f7',
  boxShadow:
    '0 0 0 3px rgba(239,68,68,0.14), 0 6px 18px rgba(239,68,68,0.20)',
},

diceTempleOwnDiceLabel: {
  fontSize: 12,
  fontWeight: 1000,
  color: '#475569',
},

  diceTempleConfirmOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,

    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',

    padding: 20,

    background:
      'rgba(0,0,0,0.68)',

    backdropFilter:
      'blur(5px)',
  },

  diceTempleConfirmBox: {
    width: 'min(620px, 92vw)',

    padding: 28,

    borderRadius: 22,

    background:
      'linear-gradient(145deg, #777067, #4d4943)',

    border:
      '2px solid rgba(255,255,255,0.22)',

    boxShadow:
      '0 25px 70px rgba(0,0,0,0.55),' +
      'inset 0 2px 0 rgba(255,255,255,0.14)',

    textAlign: 'center',
  },

  diceTempleConfirmTitle: {
    fontSize: 25,
    fontWeight: 1000,
    color: '#fff5dc',
    marginBottom: 24,
  },

  diceTempleConfirmFaces: {
    display: 'grid',
    gridTemplateColumns:
      '1fr 70px 1fr',
    alignItems: 'center',
    gap: 10,
  },

  diceTempleConfirmFace: {
    minHeight: 130,
    padding: 14,

    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,

    borderRadius: 16,

    background:
      'rgba(0,0,0,0.20)',

    border:
      '1px solid rgba(255,255,255,0.12)',
  },

  diceTempleConfirmLabel: {
    fontSize: 14,
    fontWeight: 900,
    color:
      'rgba(255,248,232,0.65)',
  },

  diceTempleConfirmArrow: {
    fontSize: 38,
    fontWeight: 1000,
    color: '#ffdc8b',
  },

  diceTempleConfirmCost: {
    marginTop: 18,

    fontSize: 17,
    fontWeight: 1000,

    color: '#ffe0a0',
  },

  diceTempleConfirmButtons: {
    display: 'grid',
    gridTemplateColumns:
      '1fr 1fr',
    gap: 12,
    marginTop: 22,
  },

  diceTempleConfirmNo: {
    padding: '14px 18px',
    borderRadius: 12,

    border:
      '2px solid rgba(255,255,255,0.18)',

    background:
      'rgba(0,0,0,0.28)',

    color: '#fff',

    fontSize: 17,
    fontWeight: 1000,

    cursor: 'pointer',
  },

  diceTempleConfirmYes: {
    padding: '14px 18px',
    borderRadius: 12,

    border:
      '2px solid rgba(255,100,100,0.50)',

    background:
      'linear-gradient(180deg, #d83c3c, #8f1f1f)',

    color: '#fff',

    fontSize: 17,
    fontWeight: 1000,

    cursor: 'pointer',

    boxShadow:
      '0 6px 16px rgba(0,0,0,0.28),' +
      '0 0 18px rgba(255,50,50,0.20)',
  },

extraCharacterPanel: {
  width: '100%',
  minHeight: 420,
  boxSizing: 'border-box',
  padding: 16,
  borderRadius: 18,
  background: '#ffffff',
  border: '2px solid #cbd5e1',
  boxShadow:
    '0 6px 18px rgba(15,23,42,0.10)',
  color: '#172033',
},

extraCharacterHeader: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingBottom: 10,
  marginBottom: 14,
  borderBottom:
    '2px solid #e2e8f0',
  fontSize: 14,
  fontWeight: 1000,
  color: '#475569',
  letterSpacing: 1,
},

extraCharacterQuestion: {
  marginBottom: 14,
  textAlign: 'center',
  fontSize: 17,
  fontWeight: 1000,
  color: '#172033',
},

extraCharacterBoard: {
  display: 'grid',
  gridTemplateColumns:
    'repeat(5, 1fr)',
  gap: 6,
  padding: 10,
  borderRadius: 14,
  background: '#f8fafc',
  border:
    '1px solid #e2e8f0',
},

extraCharacterCell: {
  minHeight: 42,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 8,
  background: '#e2e8f0',
  border:
    '1px solid #cbd5e1',
  color: '#64748b',
  fontSize: 13,
  fontWeight: 900,
},

extraCharacterCellRevealed: {
  background: '#ffffff',
  border:
    '1px solid #cbd5e1',
  color: '#172033',
  fontSize: 18,
  fontWeight: 1000,
},

extraCharacterEmpty: {
  minHeight: 285,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  lineHeight: 1.8,
  fontSize: 15,
  fontWeight: 800,
  color: '#64748b',
},

extraCharacterFooter: {
  marginTop: 12,
  textAlign: 'center',
  fontSize: 12,
  fontWeight: 800,
  color: '#64748b',
},

  extraCharacterPurchaseButton: {
    marginTop: 12,
    width: '100%',
    padding: '13px 16px',
    border: 'none',
    borderRadius: 12,
    background: '#2563eb',
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 1000,
    cursor: 'pointer',
    boxShadow:
      '0 4px 10px rgba(37,99,235,0.25)',
  },

  extraCharacterShopOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    background:
      'rgba(15,23,42,0.48)',
    boxSizing: 'border-box',
  },

  extraCharacterShopModal: {
    width: 'min(560px, 100%)',
    maxHeight: '90vh',
    overflowY: 'auto',
    padding: 24,
    borderRadius: 22,
    background: '#ffffff',
    border: '2px solid #cbd5e1',
    boxShadow:
      '0 20px 50px rgba(15,23,42,0.25)',
    boxSizing: 'border-box',
  },

  extraCharacterShopTitle: {
    textAlign: 'center',
    fontSize: 25,
    lineHeight: 1.35,
    fontWeight: 1000,
    color: '#172033',
  },

  extraCharacterShopDescription: {
    marginTop: 12,
    marginBottom: 20,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 1.7,
    fontWeight: 700,
    color: '#64748b',
  },

  extraCharacterPurchaseList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },

  extraCharacterPurchaseCard: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 16,
    border: '2px solid #dbe3ee',
    background: '#f8fafc',
    cursor: 'pointer',
    textAlign: 'left',
    boxSizing: 'border-box',
  },

  extraCharacterPurchaseIcon: {
    width: 54,
    height: 54,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    background: '#ffffff',
  },

  extraCharacterPurchaseImage: {
    width: 42,
    height: 42,
    objectFit: 'contain',
    background: 'transparent',
    mixBlendMode: 'multiply',
  },

  extraCharacterPurchaseMain: {
    flex: 1,
    minWidth: 0,
  },

  extraCharacterPurchaseName: {
    fontSize: 16,
    fontWeight: 1000,
    color: '#172033',
  },

  extraCharacterPurchaseDetail: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 1.5,
    fontWeight: 700,
    color: '#64748b',
  },

  extraCharacterPurchaseCost: {
    flexShrink: 0,
    fontSize: 22,
    fontWeight: 1000,
    color: '#172033',
  },

  extraCharacterShopCloseButton: {
    width: '100%',
    marginTop: 18,
    padding: '12px 16px',
    borderRadius: 12,
    border: '2px solid #cbd5e1',
    background: '#ffffff',
    color: '#475569',
    fontSize: 15,
    fontWeight: 900,
    cursor: 'pointer',
  },
  extraCharacterCellSelectable: {
    background: '#dbeafe',
    border:
      '2px solid #2563eb',
    color: '#1d4ed8',
    cursor: 'pointer',
    boxShadow:
      '0 0 0 3px rgba(37,99,235,0.15)',
  },

  extraCharacterSelectingMessage: {
    marginBottom: 12,
    padding: '10px 12px',
    borderRadius: 10,
    background: '#eff6ff',
    border:
      '1px solid #93c5fd',
    color: '#1d4ed8',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: 1000,
  },

cardShopSection: {
  marginTop: 24,
  padding: 18,
  borderRadius: 20,
  background: '#f8fafc',
  border: '2px solid #cbd5e1',
  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
},

cardShopHeader: {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-end',
  gap: 12,
  marginBottom: 16,
  flexWrap: 'wrap',
},

cardShopTitle: {
  fontSize: 24,
  fontWeight: 1000,
  color: '#111827',
},

cardShopSubtitle: {
  marginTop: 4,
  fontSize: 12,
  fontWeight: 700,
  color: '#64748b',
},

cardShopStockNote: {
  padding: '7px 10px',
  borderRadius: 999,
  background: '#fff7ed',
  border: '1px solid #fdba74',
  color: '#c2410c',
  fontSize: 11,
  fontWeight: 1000,
},

cardShopGrid: {
  display: 'grid',
  gridTemplateColumns:
    'repeat(4, minmax(0, 1fr))',
  gap: 12,
},

cardShopCard: {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  padding: 12,
  borderRadius: 16,
  border: '2px solid #cbd5e1',
  background: '#ffffff',
  textAlign: 'left',
  cursor: 'pointer',
  transition:
    'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
},

cardShopCardAvailable: {
  border: '2px solid #f59e0b',
  boxShadow:
    '0 5px 16px rgba(245,158,11,0.16)',
},

cardShopCardDisabled: {
  opacity: 0.55,
  cursor: 'not-allowed',
},

cardShopCardSoldOut: {
  opacity: 0.42,
  filter: 'grayscale(0.7)',
  cursor: 'not-allowed',
},

cardShopImageWrap: {
  width: '100%',
  aspectRatio: '1 / 1',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  marginBottom: 8,
  borderRadius: 12,
  background: '#f1f5f9',
  overflow: 'hidden',
},

cardShopImage: {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
},

cardShopCardName: {
  marginBottom: 6,
  fontSize: 16,
  fontWeight: 1000,
  color: '#111827',
  textAlign: 'center',
},

cardShopCardDescription: {
  minHeight: 58,
  fontSize: 11,
  lineHeight: 1.55,
  fontWeight: 700,
  color: '#475569',
},

cardShopCardBottom: {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  marginTop: 10,
},

cardShopCost: {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  padding: '5px 8px',
  borderRadius: 999,
  background: '#eef2ff',
  color: '#3730a3',
  fontSize: 12,
  fontWeight: 1000,
},

cardShopCostIcon: {
  width: 20,
  height: 20,
  objectFit: 'contain',
},

cardShopStock: {
  fontSize: 11,
  fontWeight: 1000,
  color: '#15803d',
},

cardShopStockSoldOut: {
  color: '#dc2626',
},

cardConfirmOverlay: {
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 20,
  background:
    'rgba(15,23,42,0.62)',
},

cardConfirmModal: {
  width: 'min(620px, 100%)',
  maxHeight: '90vh',
  overflowY: 'auto',
  padding: 22,
  borderRadius: 22,
  background: '#ffffff',
  boxShadow:
    '0 24px 70px rgba(0,0,0,0.28)',
},

cardConfirmTitle: {
  marginBottom: 18,
  fontSize: 22,
  fontWeight: 1000,
  color: '#111827',
  textAlign: 'center',
},

cardConfirmContent: {
  display: 'flex',
  gap: 18,
  alignItems: 'center',
},

cardConfirmImageWrap: {
  flex: '0 0 180px',
  width: 180,
  height: 180,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 16,
  background: '#f1f5f9',
  overflow: 'hidden',
},

cardConfirmImage: {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
},

cardConfirmInfo: {
  flex: 1,
  minWidth: 0,
},

cardConfirmName: {
  marginBottom: 10,
  fontSize: 22,
  fontWeight: 1000,
  color: '#111827',
},

cardConfirmDescription: {
  fontSize: 13,
  lineHeight: 1.7,
  fontWeight: 700,
  color: '#475569',
},

cardConfirmCost: {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  marginTop: 14,
  padding: '7px 10px',
  borderRadius: 999,
  background: '#eef2ff',
  color: '#3730a3',
  fontSize: 13,
  fontWeight: 1000,
},

cardConfirmCostIcon: {
  width: 24,
  height: 24,
  objectFit: 'contain',
},

cardConfirmRemaining: {
  marginTop: 8,
  fontSize: 11,
  fontWeight: 800,
  color: '#64748b',
},

cardConfirmButtons: {
  display: 'flex',
  gap: 10,
  marginTop: 22,
},

cardConfirmCancel: {
  flex: 1,
  padding: '13px 16px',
  borderRadius: 12,
  border: '1px solid #cbd5e1',
  background: '#f8fafc',
  color: '#334155',
  fontSize: 14,
  fontWeight: 1000,
  cursor: 'pointer',
},

cardConfirmPurchase: {
  flex: 1,
  padding: '13px 16px',
  borderRadius: 12,
  border: 'none',
  background: '#f59e0b',
  color: '#ffffff',
  fontSize: 14,
  fontWeight: 1000,
  cursor: 'pointer',
},
};