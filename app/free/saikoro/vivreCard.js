// ============================================================
// 看板たぬき
// 1枚ビブルカード処理
// ============================================================
//
// データ元:
// data/profile2.xlsx
//
// 既存のビブルサーチ:
// data/profile.xlsx
//
// 看板たぬきでは profile2.xlsx を使用する。
// ============================================================


// ============================================================
// 共通
// ============================================================

export const VIVRE_INFO_TYPES = {
    NAME_LENGTH: "nameLength",
    FAVORITE_FOOD: "favoriteFood",
    HEIGHT: "height",
    AGE: "age",
    BLOOD: "blood",
    ORIGIN: "origin",
    GENDER: "gender",
    FAMILY: "family"
};


// ============================================================
// 表示名
// ============================================================

export const VIVRE_INFO_LABELS = {
    [VIVRE_INFO_TYPES.NAME_LENGTH]:
        "名前の文字数",

    [VIVRE_INFO_TYPES.FAVORITE_FOOD]:
        "好物",

    [VIVRE_INFO_TYPES.HEIGHT]:
        "身長",

    [VIVRE_INFO_TYPES.AGE]:
        "年齢",

    [VIVRE_INFO_TYPES.BLOOD]:
        "血液型",

    [VIVRE_INFO_TYPES.ORIGIN]:
        "出身",

    [VIVRE_INFO_TYPES.GENDER]:
        "性別",

    [VIVRE_INFO_TYPES.FAMILY]:
        "家族"
};


// ============================================================
// 購入コスト
// ============================================================
//
// berry = ベリー
// verse = ベース
// eternal = 永久指針
//
// ============================================================

export const VIVRE_INFO_COSTS = {

    [VIVRE_INFO_TYPES.NAME_LENGTH]: {
        berry: 8,
        verse: 0,
        eternal: 0
    },

    [VIVRE_INFO_TYPES.FAVORITE_FOOD]: {
        berry: 0,
        verse: 3,
        eternal: 0
    },

    [VIVRE_INFO_TYPES.HEIGHT]: {
        berry: 0,
        verse: 0,
        eternal: 2
    },

    [VIVRE_INFO_TYPES.AGE]: {
        berry: 0,
        verse: 0,
        eternal: 4
    },

    [VIVRE_INFO_TYPES.BLOOD]: {
        berry: 0,
        verse: 0,
        eternal: 2
    },

    [VIVRE_INFO_TYPES.ORIGIN]: {
        berry: 0,
        verse: 2,
        eternal: 2
    },

    [VIVRE_INFO_TYPES.GENDER]: {
        berry: 0,
        verse: 1,
        eternal: 0
    },

    [VIVRE_INFO_TYPES.FAMILY]: {
        berry: 0,
        verse: 0,
        eternal: 2
    }
};


// ============================================================
// profile2 読み込み
// ============================================================

export async function loadSaikoroVivreProfiles() {

    const response =
        await fetch(
            "/free/saikoro/api/profile",
            {
                cache: "no-store"
            }
        );

    if (!response.ok) {

        throw new Error(
            "看板たぬき用 profile2.xlsx の読み込みに失敗しました"
        );
    }

    const json =
        await response.json();

    if (!json.ok) {

        throw new Error(
            json.error ||
            "看板たぬき用ビブルカードの読み込みに失敗しました"
        );
    }

    return Array.isArray(json.items)
        ? json.items
        : [];
}

// ============================================================
// ランダム
// ============================================================

function randomInt(max) {

    if (max <= 0) {
        return 0;
    }

    return Math.floor(
        Math.random() * max
    );
}


function randomItem(array) {

    if (
        !Array.isArray(array) ||
        array.length === 0
    ) {
        return null;
    }

    return array[
        randomInt(array.length)
    ];
}


// ============================================================
// 名前の文字数
// ============================================================
//
// 「モンキー・D・ルフィ」
// のような名前を、そのまま文字数として扱う。
//
// 今後、記号を除外する等のルールに変更する場合は
// ここだけ変更すればよい。
// ============================================================

export function getNameLength(profile) {

    if (!profile) {
        return 0;
    }

    return Array.from(
        String(profile.name || "")
    ).length;
}


// ============================================================
// 好物文字列
// ============================================================
//
// 好物:
// 肉全般
//
// ↓
//
// [肉, 全, 般]
//
// 同じ文字が複数存在する場合、
// それぞれ別のマスとして扱う。
//
// 例:
// ホットドッグ
//
// ホ / ッ / ト / ド / ッ / グ
//
// なら「ッ」は2つ存在する。
// ============================================================

export function getFavoriteFoodCharacters(
    profile
) {

    if (!profile) {
        return [];
    }

    const food =
        String(
            profile.favoriteFood || ""
        ).trim();

    if (!food) {
        return [];
    }

    return Array.from(food);
}


// ============================================================
// 身長の数字
// ============================================================
//
// 例:
// 192
//
// ↓
//
// 1 / 9 / 2
//
// それぞれ位置を保持する。
// ============================================================

export function getHeightDigits(profile) {

    if (!profile) {
        return [];
    }

    const value =
        String(
            profile.height ?? ""
        ).trim();

    if (!value) {
        return [];
    }

    return Array.from(value).map(
        (character, index) => ({
            character,
            index
        })
    );
}


// ============================================================
// 年齢の数字
// ============================================================

export function getAgeDigits(profile) {

    if (!profile) {
        return [];
    }

    const value =
        String(
            profile.age ?? ""
        ).trim();

    if (!value) {
        return [];
    }

    return Array.from(value).map(
        (character, index) => ({
            character,
            index
        })
    );
}


// ============================================================
// 出身
// ============================================================

export function getOrigin(profile) {

    if (!profile) {
        return {
            sea: "",
            place: ""
        };
    }

    return {
        sea:
            String(
                profile.bornSea || ""
            ).trim(),

        place:
            String(
                profile.bornPlace || ""
            ).trim()
    };
}


// ============================================================
// 家族
// ============================================================

export function getFamily(profile) {

    if (!profile) {
        return [];
    }

    if (
        !Array.isArray(profile.family)
    ) {
        return [];
    }

    return [
        ...profile.family
    ];
}


// ============================================================
// 血液型
// ============================================================

export function getBloodType(profile) {

    if (!profile) {
        return "";
    }

    return String(
        profile.blood || ""
    ).trim();
}


// ============================================================
// 性別
// ============================================================

export function getGender(profile) {

    if (!profile) {
        return "";
    }

    return String(
        profile.gender || ""
    ).trim();
}


// ============================================================
// 1枚ビブカの初期状態を作る
// ============================================================
//
// 「まだ何も情報を買っていない」状態。
// ============================================================

export function createVivreCardState(
    profile
) {

    return {

        profileId:
            profile?.id || null,

        name:
            profile?.name || "",

        acquired: {},

        favoriteFoodKnown: [],

        heightKnown: [],

        ageKnown: [],

        familyKnown: [],

        familyRemaining:
            getFamily(profile).length
    };
}


// ============================================================
// 好物情報を1文字取得
// ============================================================
//
// 既に取得した「同じ位置」は除外する。
//
// つまり「ッ」が2個ある場合、
// 1個目の「ッ」を取得したあとでも
// 2個目の「ッ」を取得できる。
// ============================================================

export function revealRandomFavoriteFood(
    profile,
    cardState
) {

    const characters =
        getFavoriteFoodCharacters(
            profile
        );

    const alreadyKnown =
        Array.isArray(
            cardState?.favoriteFoodKnown
        )
            ? cardState.favoriteFoodKnown
            : [];

    const available =
        characters
            .map(
                (character, index) => ({
                    character,
                    index
                })
            )
            .filter(
                item =>
                    !alreadyKnown.some(
                        known =>
                            known.index ===
                            item.index
                    )
            );

    if (available.length === 0) {

        return {
            ok: false,
            reason: "すべての好物文字を取得済みです"
        };
    }

    const selected =
        randomItem(
            available
        );

    return {
        ok: true,

        value:
            selected.character,

        index:
            selected.index
    };
}


// ============================================================
// 身長情報を1箇所取得
// ============================================================

export function revealRandomHeight(
    profile,
    cardState
) {

    const digits =
        getHeightDigits(
            profile
        );

    const alreadyKnown =
        Array.isArray(
            cardState?.heightKnown
        )
            ? cardState.heightKnown
            : [];

    const available =
        digits.filter(
            item =>
                !alreadyKnown.includes(
                    item.index
                )
        );

    if (available.length === 0) {

        return {
            ok: false,
            reason: "すべての身長情報を取得済みです"
        };
    }

    const selected =
        randomItem(
            available
        );

    return {
        ok: true,

        value:
            selected.character,

        index:
            selected.index,

        total:
            digits.length
    };
}


// ============================================================
// 年齢情報を1箇所取得
// ============================================================

export function revealRandomAge(
    profile,
    cardState
) {

    const digits =
        getAgeDigits(
            profile
        );

    const alreadyKnown =
        Array.isArray(
            cardState?.ageKnown
        )
            ? cardState.ageKnown
            : [];

    const available =
        digits.filter(
            item =>
                !alreadyKnown.includes(
                    item.index
                )
        );

    if (available.length === 0) {

        return {
            ok: false,
            reason: "すべての年齢情報を取得済みです"
        };
    }

    const selected =
        randomItem(
            available
        );

    return {
        ok: true,

        value:
            selected.character,

        index:
            selected.index,

        total:
            digits.length
    };
}


// ============================================================
// 家族情報を1つ取得
// ============================================================
//
// ルフィ:
// 父
// 祖父
//
// なら、最初は2つとも未知。
// 1回購入するとどちらか1つが判明。
// ============================================================

export function revealRandomFamily(
    profile,
    cardState
) {

    const family =
        getFamily(profile);

    const alreadyKnown =
        Array.isArray(
            cardState?.familyKnown
        )
            ? cardState.familyKnown
            : [];

    const available =
        family
            .map(
                (member, index) => ({
                    member,
                    index
                })
            )
            .filter(
                item =>
                    !alreadyKnown.includes(
                        item.index
                    )
            );

    if (available.length === 0) {

        return {
            ok: false,
            reason:
                family.length === 0
                    ? "家族情報はありません"
                    : "すべての家族情報を取得済みです"
        };
    }

    const selected =
        randomItem(
            available
        );

    return {
        ok: true,

        value:
            selected.member,

        index:
            selected.index,

        remaining:
            Math.max(
                0,
                available.length - 1
            )
    };
}


// ============================================================
// 指定情報を取得
// ============================================================

export function revealSpecifiedExtraInfo(
    profile,
    type,
    position
) {

    if (!profile) {
        return {
            ok: false,
            reason: "対象キャラクターがありません"
        };
    }

    if (
        type ===
        VIVRE_INFO_TYPES.HEIGHT
    ) {

        const digits =
            getHeightDigits(
                profile
            );

        const target =
            digits.find(
                item =>
                    item.index ===
                    position
            );

        if (!target) {
            return {
                ok: false,
                reason: "指定位置がありません"
            };
        }

        return {
            ok: true,
            value:
                target.character,
            index:
                target.index
        };
    }


    if (
        type ===
        VIVRE_INFO_TYPES.AGE
    ) {

        const digits =
            getAgeDigits(
                profile
            );

        const target =
            digits.find(
                item =>
                    item.index ===
                    position
            );

        if (!target) {
            return {
                ok: false,
                reason: "指定位置がありません"
            };
        }

        return {
            ok: true,
            value:
                target.character,
            index:
                target.index
        };
    }


    if (
        type ===
        VIVRE_INFO_TYPES.FAVORITE_FOOD
    ) {

        const characters =
            getFavoriteFoodCharacters(
                profile
            );

        if (
            position < 0 ||
            position >= characters.length
        ) {
            return {
                ok: false,
                reason: "指定位置がありません"
            };
        }

        return {
            ok: true,
            value:
                characters[position],
            index:
                position
        };
    }


    return {
        ok: false,
        reason:
            "指定情報には対応していません"
    };
}


// ============================================================
// 情報購入結果をカード状態へ反映
// ============================================================

export function applyVivreReveal(
    cardState,
    type,
    result
) {

    if (
        !cardState ||
        !result?.ok
    ) {
        return cardState;
    }

    const next = {
        ...cardState,

        acquired: {
            ...(cardState.acquired || {})
        }
    };


    if (
        type ===
        VIVRE_INFO_TYPES.FAVORITE_FOOD
    ) {

        next.favoriteFoodKnown = [
            ...(cardState.favoriteFoodKnown || []),
            {
                index:
                    result.index,

                value:
                    result.value
            }
        ];

    }


    if (
        type ===
        VIVRE_INFO_TYPES.HEIGHT
    ) {

        next.heightKnown = [
            ...(cardState.heightKnown || []),
            result.index
        ];

    }


    if (
        type ===
        VIVRE_INFO_TYPES.AGE
    ) {

        next.ageKnown = [
            ...(cardState.ageKnown || []),
            result.index
        ];

    }


    if (
        type ===
        VIVRE_INFO_TYPES.FAMILY
    ) {

        next.familyKnown = [
            ...(cardState.familyKnown || []),
            {
                index:
                    result.index,

                value:
                    result.value
            }
        ];

        next.familyRemaining =
            Math.max(
                0,
                Number(
                    result.remaining ?? 0
                )
            );
    }


    next.acquired[type] =
        true;

    return next;
}


// ============================================================
// 完全情報を取得
// ============================================================
//
// CPUの回答判定などで使用する。
// ============================================================

export function getFullVivreAnswer(
    profile
) {

    if (!profile) {
        return null;
    }

    return {

        name:
            profile.name,

        nameLength:
            getNameLength(profile),

        favoriteFood:
            profile.favoriteFood,

        height:
            profile.height,

        age:
            profile.age,

        blood:
            profile.blood,

        origin: {
            sea:
                profile.bornSea,

            place:
                profile.bornPlace
        },

        gender:
            profile.gender,

        family:
            getFamily(profile)
    };
}


// ============================================================
// 回答候補を正規化
// ============================================================
//
// 「モンキー・D・ルフィ」
// 「モンキー・D・ルフィ（19歳）」などの将来の表記にも
// 対応しやすいように基本的な正規化だけ行う。
// ============================================================

export function normalizeVivreAnswer(
    value
) {

    return String(
        value ?? ""
    )
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .replace(
            /[\s　]+/g,
            ""
        )
        .replace(
            /（/g,
            "("
        )
        .replace(
            /）/g,
            ")"
        )
        .replace(
            /・/g,
            ""
        );
}


// ============================================================
// 回答判定
// ============================================================
//
// 本人の名前だけでなく、
// 「ルフィ」のような名前も許可するため、
// 現段階では名前を分解して候補を作る。
// ============================================================

export function isCorrectVivreAnswer(
    profile,
    answer
) {

    if (!profile) {
        return false;
    }

    const input =
        normalizeVivreAnswer(
            answer
        );

    if (!input) {
        return false;
    }

    const name =
        String(
            profile.name || ""
        );

    const candidates = [
        name
    ];

    const parts =
        name
            .split(/[-・\s　]+/)
            .filter(Boolean);

    candidates.push(
        ...parts
    );

    // ONE PIECEで一般的な呼び方を
    // 後から追加できるようにしておく。
    //
    // 例:
    // モンキー・D・ルフィ → ルフィ
    //
    const lastPart =
        parts.length > 0
            ? parts[parts.length - 1]
            : "";

    if (lastPart) {
        candidates.push(
            lastPart
        );
    }

    return candidates.some(
        candidate =>
            normalizeVivreAnswer(
                candidate
            ) === input
    );
}


// ============================================================
// 情報を「購入できるか」の判定
// ============================================================

export function canBuyVivreInfo(
    resources,
    type
) {

    const cost =
        VIVRE_INFO_COSTS[type];

    if (!cost) {
        return false;
    }

    const berry =
        Number(
            resources?.berry || 0
        );

    const verse =
        Number(
            resources?.verse || 0
        );

    const eternal =
        Number(
            resources?.eternal || 0
        );

    return (
        berry >= cost.berry &&
        verse >= cost.verse &&
        eternal >= cost.eternal
    );
}


// ============================================================
// 購入後の資源
// ============================================================

export function payVivreInfoCost(
    resources,
    type
) {

    const cost =
        VIVRE_INFO_COSTS[type];

    if (!cost) {
        return resources;
    }

    return {

        ...resources,

        berry:
            Math.max(
                0,
                Number(
                    resources?.berry || 0
                ) -
                cost.berry
            ),

        verse:
            Math.max(
                0,
                Number(
                    resources?.verse || 0
                ) -
                cost.verse
            ),

        eternal:
            Math.max(
                0,
                Number(
                    resources?.eternal || 0
                ) -
                cost.eternal
            )
    };
}


// ============================================================
// 情報の説明文
// ============================================================

export function getVivreInfoDescription(
    profile,
    type
) {

    if (!profile) {
        return "";
    }


    switch (type) {

        case VIVRE_INFO_TYPES.NAME_LENGTH:

            return `${getNameLength(profile)}文字`;


        case VIVRE_INFO_TYPES.FAVORITE_FOOD:

            return profile.favoriteFood ||
                "不明";


        case VIVRE_INFO_TYPES.HEIGHT:

            return profile.height === "" ||
                profile.height == null
                ? "不明"
                : `${profile.height}cm`;


        case VIVRE_INFO_TYPES.AGE:

            return profile.age === "" ||
                profile.age == null
                ? "不明"
                : `${profile.age}歳`;


        case VIVRE_INFO_TYPES.BLOOD:

            return profile.blood ||
                "不明";


        case VIVRE_INFO_TYPES.ORIGIN: {

            const sea =
                profile.bornSea || "";

            const place =
                profile.bornPlace || "";

            if (
                sea &&
                place
            ) {
                return `${sea} / ${place}`;
            }

            return sea ||
                place ||
                "不明";
        }


        case VIVRE_INFO_TYPES.GENDER:

            return profile.gender ||
                "不明";


        case VIVRE_INFO_TYPES.FAMILY:

            return getFamily(profile);


        default:

            return "";
    }
}