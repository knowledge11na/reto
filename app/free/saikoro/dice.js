// ============================================================
// 看板たぬき
// ダイス処理
// ============================================================
//
// ダイスA / ダイスB
//
// ダイスA 初期:
// ベリー1 × 5
// ヴァース1 × 1
//
// ダイスB 初期:
// ベリー1 × 5
// 永久指針1 × 1
//
// 今後追加予定:
// ・マネマネマス
// ・魔法の天候棒マス
// ・ヨミヨミの実による再振り
// ・食糧宝船のミニダイス
// ・その他カード効果
// ============================================================


// ============================================================
// ダイス面タイプ
// ============================================================

export const DICE_FACE_TYPES = {

    BERRY:
        "berry",

    VERSE:
        "verse",

    ETERNAL:
        "eternal",

    MANE:
        "mane",

    TACT:
        "tact"
};


// ============================================================
// 資源アイコン
// ============================================================

export const RESOURCE_ICONS = {

    berry:
        "/saikoro/berry.png",

    verse:
        "/saikoro/vasu.png",

    eternal:
        "/saikoro/pors.png"
};


// ============================================================
// ダイス面の作成
// ============================================================

export function createBerryFace(
    amount
) {

    return {

        type:
            DICE_FACE_TYPES.BERRY,

        amount:
            Number(amount) || 0
    };
}


export function createVerseFace(
    amount
) {

    return {

        type:
            DICE_FACE_TYPES.VERSE,

        amount:
            Number(amount) || 0
    };
}


export function createEternalFace(
    amount
) {

    return {

        type:
            DICE_FACE_TYPES.ETERNAL,

        amount:
            Number(amount) || 0
    };
}


export function createManeFace() {

    return {

        type:
            DICE_FACE_TYPES.MANE
    };
}


export function createTactFace() {

    return {

        type:
            DICE_FACE_TYPES.TACT
    };
}


// ============================================================
// ダイス面をコピー
// ============================================================

export function cloneDiceFace(
    face
) {

    if (!face) {
        return null;
    }

    return {
        ...face
    };
}


// ============================================================
// 初期ダイスA
// ============================================================

export function createInitialDiceA() {

    return [

        createBerryFace(1),

        createBerryFace(1),

        createBerryFace(1),

        createBerryFace(1),

        createBerryFace(1),

        createVerseFace(1)
    ];
}


// ============================================================
// 初期ダイスB
// ============================================================

export function createInitialDiceB() {

    return [

        createBerryFace(1),

        createBerryFace(1),

        createBerryFace(1),

        createBerryFace(1),

        createBerryFace(1),

        createEternalFace(1)
    ];
}


// ============================================================
// 初期ダイスセット
// ============================================================

export function createInitialDiceSet() {

    return {

        diceA:
            createInitialDiceA(),

        diceB:
            createInitialDiceB()
    };
}


// ============================================================
// ダイスを振る
// ============================================================

export function rollDice(
    faces
) {

    if (
        !Array.isArray(faces) ||
        faces.length === 0
    ) {

        return {
            faceIndex: -1,
            face: null
        };
    }

    const faceIndex =
        Math.floor(
            Math.random() *
            faces.length
        );

    return {

        faceIndex,

        face:
            cloneDiceFace(
                faces[faceIndex]
            )
    };
}


// ============================================================
// 2個のダイスを振る
// ============================================================

export function rollDiceSet(
    diceSet
) {

    const resultA =
        rollDice(
            diceSet?.diceA
        );

    const resultB =
        rollDice(
            diceSet?.diceB
        );

    return {

        diceA:
            resultA,

        diceB:
            resultB
    };
}


// ============================================================
// ダイス結果から獲得資源を計算
// ============================================================
//
// 通常の資源面:
// ベリー / ヴァース / 永久指針
//
// 特殊面:
// マネマネマス
// 魔法の天候棒マス
//
// 特殊面は通常の資源としては計算せず、
// page.js側で処理できるようにそのまま結果に残す。
// ============================================================

export function calculateDiceReward(
    rollResult
) {

    const reward = {

        berry: 0,

        verse: 0,

        eternal: 0
    };

    const specialFaces = [];


    const results = [

        rollResult?.diceA?.face,

        rollResult?.diceB?.face

    ];


    results.forEach(
        face => {

            if (!face) {
                return;
            }


            if (
                face.type ===
                DICE_FACE_TYPES.BERRY
            ) {

                reward.berry +=
                    Number(
                        face.amount || 0
                    );

                return;
            }


            if (
                face.type ===
                DICE_FACE_TYPES.VERSE
            ) {

                reward.verse +=
                    Number(
                        face.amount || 0
                    );

                return;
            }


            if (
                face.type ===
                DICE_FACE_TYPES.ETERNAL
            ) {

                reward.eternal +=
                    Number(
                        face.amount || 0
                    );

                return;
            }


            if (
                face.type ===
                DICE_FACE_TYPES.MANE
            ) {

                specialFaces.push(
                    "mane"
                );

                return;
            }


            if (
                face.type ===
                DICE_FACE_TYPES.TACT
            ) {

                specialFaces.push(
                    "tact"
                );

                return;
            }

        }
    );


    return {

        reward,

        specialFaces
    };
}


// ============================================================
// ダイス面の表示名
// ============================================================

export function getDiceFaceLabel(
    face
) {

    if (!face) {
        return "";
    }


    switch (
        face.type
    ) {

        case DICE_FACE_TYPES.BERRY:

            return `ベリー${face.amount}`;


        case DICE_FACE_TYPES.VERSE:

            return `ヴァース${face.amount}`;


        case DICE_FACE_TYPES.ETERNAL:

            return `永久指針${face.amount}`;


        case DICE_FACE_TYPES.MANE:

            return "マネマネマス";


        case DICE_FACE_TYPES.TACT:

            return "天候棒マス";


        default:

            return "";
    }
}


// ============================================================
// ダイス面の画像
// ============================================================

export function getDiceFaceIcon(
    face
) {

    if (!face) {
        return "";
    }


    switch (
        face.type
    ) {

        case DICE_FACE_TYPES.BERRY:

            return RESOURCE_ICONS.berry;


        case DICE_FACE_TYPES.VERSE:

            return RESOURCE_ICONS.verse;


        case DICE_FACE_TYPES.ETERNAL:

            return RESOURCE_ICONS.eternal;


        case DICE_FACE_TYPES.MANE:

            return "/saikoro/manedice.png";


        case DICE_FACE_TYPES.TACT:

            return "/saikoro/tact.png";


        default:

            return "";
    }
}


// ============================================================
// ダイス面を交換
// ============================================================
//
// diceName:
// "diceA" または "diceB"
//
// faceIndex:
// 0～5
//
// newFace:
// 神殿で購入したダイス面
// ============================================================

export function replaceDiceFace(
    diceSet,
    diceName,
    faceIndex,
    newFace
) {

    if (!diceSet) {
        return diceSet;
    }

    if (
        diceName !== "diceA" &&
        diceName !== "diceB"
    ) {

        return diceSet;
    }

    if (
        !Number.isInteger(faceIndex) ||
        faceIndex < 0 ||
        faceIndex >= 6
    ) {

        return diceSet;
    }

    if (!newFace) {
        return diceSet;
    }


    const next = {

        ...diceSet,

        [diceName]:
            Array.isArray(
                diceSet[diceName]
            )
                ? [
                    ...diceSet[diceName]
                ]
                : []
    };


    next[diceName][faceIndex] =
        cloneDiceFace(
            newFace
        );


    return next;
}


// ============================================================
// 資源上限
// ============================================================

export const DEFAULT_RESOURCE_LIMITS = {

    berry: 12,

    verse: 6,

    eternal: 6
};


// ============================================================
// 資源を上限まで加算
// ============================================================

export function addDiceReward(
    resources,
    reward,
    limits =
        DEFAULT_RESOURCE_LIMITS
) {

    return {

        ...resources,

        berry:
            Math.min(
                Number(
                    limits?.berry ??
                    DEFAULT_RESOURCE_LIMITS.berry
                ),
                Number(
                    resources?.berry || 0
                ) +
                Number(
                    reward?.berry || 0
                )
            ),

        verse:
            Math.min(
                Number(
                    limits?.verse ??
                    DEFAULT_RESOURCE_LIMITS.verse
                ),
                Number(
                    resources?.verse || 0
                ) +
                Number(
                    reward?.verse || 0
                )
            ),

        eternal:
            Math.min(
                Number(
                    limits?.eternal ??
                    DEFAULT_RESOURCE_LIMITS.eternal
                ),
                Number(
                    resources?.eternal || 0
                ) +
                Number(
                    reward?.eternal || 0
                )
            )
    };
}