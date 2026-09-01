// file: app/api/tenipuri/problems/route.js

import { NextResponse } from 'next/server';
import db from '@/lib/db.js';


// =========================================================
// Runtime
// =========================================================

export const runtime = 'nodejs';


// =========================================================
// 共通設定
// =========================================================

// 画像として受け付けるMIMEタイプ
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
];


// 画像サイズ上限
//
// DBにBase64で保存するため、あまり巨大な画像は拒否する。
// 10MBまで。
//
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;


// =========================================================
// 共通：画像をData URLへ変換
// =========================================================
//
// Supabase Storageは使用しない。
// 画像をBase64のData URLとしてDBへ直接保存する。
//
// 例：
// data:image/jpeg;base64,/9j/4AAQ...
//
// =========================================================

async function saveImage(file) {
  if (!file || typeof file === 'string') {
    return null;
  }


  // -------------------------------------------------------
  // File確認
  // -------------------------------------------------------

  if (
    typeof file.arrayBuffer !== 'function'
  ) {
    throw new Error(
      '画像ファイルを正しく読み込めませんでした。'
    );
  }


  // -------------------------------------------------------
  // MIMEタイプ確認
  // -------------------------------------------------------

  const contentType =
    file.type || 'image/jpeg';


  if (
    !ALLOWED_MIME_TYPES.includes(contentType)
  ) {
    throw new Error(
      '対応していない画像形式です。JPG、PNG、GIF、WEBP、BMPのみ使用できます。'
    );
  }


  // -------------------------------------------------------
  // サイズ確認
  // -------------------------------------------------------

  if (
    typeof file.size === 'number' &&
    file.size > MAX_IMAGE_SIZE
  ) {
    throw new Error(
      '画像サイズが大きすぎます。10MB以下の画像を使用してください。'
    );
  }


  // -------------------------------------------------------
  // File → Buffer
  // -------------------------------------------------------

  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(arrayBuffer);


  if (
    buffer.length === 0
  ) {
    throw new Error(
      '画像ファイルが空です。'
    );
  }


  if (
    buffer.length > MAX_IMAGE_SIZE
  ) {
    throw new Error(
      '画像サイズが大きすぎます。10MB以下の画像を使用してください。'
    );
  }


  // -------------------------------------------------------
  // Base64化
  // -------------------------------------------------------

  const base64 =
    buffer.toString('base64');


  // -------------------------------------------------------
  // Data URL作成
  // -------------------------------------------------------

  const dataUrl =
    `data:${contentType};base64,${base64}`;


  console.log(
    '[tenipuri/problems] 画像をData URLへ変換:',
    contentType,
    `${Math.round(buffer.length / 1024)}KB`
  );


  return {
    url: dataUrl,
    contentType,
    size: buffer.length,
  };
}


// =========================================================
// 共通：画像削除
// =========================================================
//
// 今回は画像そのものをDBに保存しているため、
// DBのimage_urlを更新・削除すれば画像も消える。
//
// この関数は互換性のため残しているが、
// 外部Storageへのアクセスは一切しない。
//
// =========================================================

async function deleteImageByUrl(imageUrl) {
  if (!imageUrl) {
    return;
  }

  console.log(
    '[tenipuri/problems] DB内画像データを削除対象として処理'
  );
}


// =========================================================
// 共通：画像Data URLか確認
// =========================================================

function isDataUrl(value) {
  return (
    typeof value === 'string' &&
    value.startsWith('data:image/')
  );
}


// =========================================================
// GET
// 打球問題一覧取得
// =========================================================

export async function GET() {
  console.log(
    '[tenipuri/problems] GET開始'
  );


  try {

    const problems =
      await db.query(
        `
          SELECT
            id,
            image_url,
            explanation_image_url,
            hitter,
            target,
            answer_type,
            episode,
            technique,
            location,
            hand,
            result,
            created_at,
            updated_at
          FROM tenipuri_problems
          ORDER BY id DESC
        `
      );


    console.log(
      '[tenipuri/problems] 問題取得:',
      problems.length,
      '件'
    );


    return NextResponse.json({
      ok: true,
      problems,
    });

  } catch (error) {

    console.error(
      '[tenipuri/problems] GETエラー:',
      error
    );


    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          '問題一覧の取得に失敗しました。',
      },
      {
        status: 500,
      }
    );
  }
}


// =========================================================
// POST
// 打球問題登録
// =========================================================

export async function POST(request) {
  console.log(
    '[tenipuri/problems] POST開始'
  );


  let savedImage = null;
  let savedExplanationImage = null;


  try {

    // -------------------------------------------------------
    // FormData取得
    // -------------------------------------------------------

    const formData =
      await request.formData();


    // -------------------------------------------------------
    // フォーム取得
    // -------------------------------------------------------

    const image =
      formData.get('image');

    const explanationImage =
      formData.get('explanationImage');


    const hitter =
      String(
        formData.get('hitter') || ''
      ).trim();


    const target =
      String(
        formData.get('target') || ''
      ).trim();


    const answerType =
      String(
        formData.get('answerType') || ''
      ).trim();


    const episode =
      String(
        formData.get('episode') || ''
      ).trim();


    const technique =
      String(
        formData.get('technique') || ''
      ).trim();


    const location =
      String(
        formData.get('location') || ''
      ).trim();


    const hand =
      String(
        formData.get('hand') || ''
      ).trim();


    const result =
      String(
        formData.get('result') || ''
      ).trim();


    // -------------------------------------------------------
    // 必須画像チェック
    // -------------------------------------------------------

    if (
      !image ||
      typeof image === 'string'
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '画像が選択されていません。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 答えの種類チェック
    // -------------------------------------------------------

    if (
      ![
        'hitter',
        'target',
        'technique',
      ].includes(answerType)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えの種類が不正です。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 誰が
    // -------------------------------------------------------

    if (
      answerType === 'hitter' &&
      !hitter
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えを「誰が打ったか」にする場合は、「誰が」を入力してください。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 誰に
    // -------------------------------------------------------

    if (
      answerType === 'target' &&
      !target
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えを「誰に打ったか」にする場合は、「誰に」を入力してください。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 技名
    // -------------------------------------------------------

    if (
      answerType === 'technique' &&
      !technique
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えを「技名」にする場合は、「技名」を入力してください。',
        },
        {
          status: 400,
        }
      );
    }


    // =======================================================
    // 問題画像保存
    // =======================================================

    try {

      savedImage =
        await saveImage(image);


      console.log(
        '[tenipuri/problems] 問題画像変換成功'
      );

    } catch (error) {

      console.error(
        '[tenipuri/problems] 問題画像保存失敗:',
        error
      );


      return NextResponse.json(
        {
          ok: false,
          error:
            `画像の保存に失敗しました：${
              error?.message || error
            }`,
        },
        {
          status: 500,
        }
      );
    }


    // =======================================================
    // 解説画像保存
    // =======================================================

    if (
      explanationImage &&
      typeof explanationImage !== 'string'
    ) {

      try {

        savedExplanationImage =
          await saveImage(
            explanationImage
          );


        console.log(
          '[tenipuri/problems] 解説画像変換成功'
        );

      } catch (error) {

        console.error(
          '[tenipuri/problems] 解説画像保存失敗:',
          error
        );


        return NextResponse.json(
          {
            ok: false,
            error:
              `解説画像の保存に失敗しました：${
                error?.message || error
              }`,
          },
          {
            status: 500,
          }
        );
      }
    }


    // =======================================================
    // DB登録
    // =======================================================

    try {

      const problem =
        await db.get(
          `
            INSERT INTO tenipuri_problems
            (
              image_url,
              explanation_image_url,
              hitter,
              target,
              answer_type,
              episode,
              technique,
              location,
              hand,
              result
            )
            VALUES
            (
              $1,
              $2,
              $3,
              $4,
              $5,
              $6,
              $7,
              $8,
              $9,
              $10
            )
            RETURNING *
          `,
          [
            savedImage.url,

            savedExplanationImage
              ? savedExplanationImage.url
              : null,

            hitter || null,
            target || null,
            answerType,
            episode || null,
            technique || null,
            location || null,
            hand || null,
            result || null,
          ]
        );


      console.log(
        '[tenipuri/problems] 登録成功:',
        problem?.id
      );


      return NextResponse.json(
        {
          ok: true,
          problem,
        },
        {
          status: 201,
        }
      );

    } catch (error) {

      console.error(
        '[tenipuri/problems] DB登録失敗:',
        error
      );


      return NextResponse.json(
        {
          ok: false,
          error:
            `問題の保存に失敗しました：${
              error?.message || error
            }`,
        },
        {
          status: 500,
        }
      );
    }


  } catch (error) {

    console.error(
      '[tenipuri/problems] POSTエラー:',
      error
    );


    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          '問題の登録に失敗しました。',
      },
      {
        status: 500,
      }
    );
  }
}


// =========================================================
// PUT
// 打球問題更新
// =========================================================

export async function PUT(request) {
  console.log(
    '[tenipuri/problems] PUT開始'
  );


  try {

    const formData =
      await request.formData();


    // -------------------------------------------------------
    // フォーム取得
    // -------------------------------------------------------

    const id =
      String(
        formData.get('id') || ''
      ).trim();


    const hitter =
      String(
        formData.get('hitter') || ''
      ).trim();


    const target =
      String(
        formData.get('target') || ''
      ).trim();


    const answerType =
      String(
        formData.get('answerType') || ''
      ).trim();


    const episode =
      String(
        formData.get('episode') || ''
      ).trim();


    const technique =
      String(
        formData.get('technique') || ''
      ).trim();


    const location =
      String(
        formData.get('location') || ''
      ).trim();


    const hand =
      String(
        formData.get('hand') || ''
      ).trim();


    const result =
      String(
        formData.get('result') || ''
      ).trim();


    const image =
      formData.get('image');


    const explanationImage =
      formData.get('explanationImage');


    // -------------------------------------------------------
    // ID確認
    // -------------------------------------------------------

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '問題IDが指定されていません。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 答えの種類確認
    // -------------------------------------------------------

    if (
      ![
        'hitter',
        'target',
        'technique',
      ].includes(answerType)
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えの種類が不正です。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 答え確認
    // -------------------------------------------------------

    if (
      answerType === 'hitter' &&
      !hitter
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えを「誰が打ったか」にする場合は、「誰が」を入力してください。',
        },
        {
          status: 400,
        }
      );
    }


    if (
      answerType === 'target' &&
      !target
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えを「誰に打ったか」にする場合は、「誰に」を入力してください。',
        },
        {
          status: 400,
        }
      );
    }


    if (
      answerType === 'technique' &&
      !technique
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '答えを「技名」にする場合は、「技名」を入力してください。',
        },
        {
          status: 400,
        }
      );
    }


    // =======================================================
    // 現在の問題取得
    // =======================================================

    const current =
      await db.get(
        `
          SELECT *
          FROM tenipuri_problems
          WHERE id = $1
        `,
        [id]
      );


    if (!current) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '問題が見つかりません。',
        },
        {
          status: 404,
        }
      );
    }


    // =======================================================
    // 現在の画像を維持
    // =======================================================

    let imageUrl =
      current.image_url;


    let explanationImageUrl =
      current.explanation_image_url;


    // =======================================================
    // 新しい問題画像
    // =======================================================

    if (
      image &&
      typeof image !== 'string'
    ) {

      try {

        const newImage =
          await saveImage(image);


        imageUrl =
          newImage.url;


        console.log(
          '[tenipuri/problems] 新しい問題画像変換成功'
        );

      } catch (error) {

        console.error(
          '[tenipuri/problems] 新画像保存失敗:',
          error
        );


        return NextResponse.json(
          {
            ok: false,
            error:
              `画像の保存に失敗しました：${
                error?.message || error
              }`,
          },
          {
            status: 500,
          }
        );
      }
    }


    // =======================================================
    // 新しい解説画像
    // =======================================================

    if (
      explanationImage &&
      typeof explanationImage !== 'string'
    ) {

      try {

        const newExplanationImage =
          await saveImage(
            explanationImage
          );


        explanationImageUrl =
          newExplanationImage.url;


        console.log(
          '[tenipuri/problems] 新しい解説画像変換成功'
        );

      } catch (error) {

        console.error(
          '[tenipuri/problems] 新解説画像保存失敗:',
          error
        );


        return NextResponse.json(
          {
            ok: false,
            error:
              `解説画像の保存に失敗しました：${
                error?.message || error
              }`,
          },
          {
            status: 500,
          }
        );
      }
    }


    // =======================================================
    // DB更新
    // =======================================================

    try {

      const problem =
        await db.get(
          `
            UPDATE tenipuri_problems
            SET
              image_url = $1,
              explanation_image_url = $2,
              hitter = $3,
              target = $4,
              answer_type = $5,
              episode = $6,
              technique = $7,
              location = $8,
              hand = $9,
              result = $10,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = $11
            RETURNING *
          `,
          [
            imageUrl,
            explanationImageUrl,
            hitter || null,
            target || null,
            answerType,
            episode || null,
            technique || null,
            location || null,
            hand || null,
            result || null,
            id,
          ]
        );


      console.log(
        '[tenipuri/problems] 更新成功:',
        problem?.id
      );


      return NextResponse.json({
        ok: true,
        problem,
      });

    } catch (error) {

      console.error(
        '[tenipuri/problems] DB更新失敗:',
        error
      );


      return NextResponse.json(
        {
          ok: false,
          error:
            `問題の更新に失敗しました：${
              error?.message || error
            }`,
        },
        {
          status: 500,
        }
      );
    }


  } catch (error) {

    console.error(
      '[tenipuri/problems] PUTエラー:',
      error
    );


    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          '問題の更新に失敗しました。',
      },
      {
        status: 500,
      }
    );
  }
}


// =========================================================
// DELETE
// 打球問題削除
// =========================================================

export async function DELETE(request) {
  console.log(
    '[tenipuri/problems] DELETE開始'
  );


  try {

    const {
      searchParams,
    } = new URL(request.url);


    const id =
      searchParams.get('id');


    // -------------------------------------------------------
    // ID確認
    // -------------------------------------------------------

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '問題IDが指定されていません。',
        },
        {
          status: 400,
        }
      );
    }


    // -------------------------------------------------------
    // 問題取得
    // -------------------------------------------------------

    const problem =
      await db.get(
        `
          SELECT *
          FROM tenipuri_problems
          WHERE id = $1
        `,
        [id]
      );


    if (!problem) {
      return NextResponse.json(
        {
          ok: false,
          error:
            '問題が見つかりません。',
        },
        {
          status: 404,
        }
      );
    }


    // -------------------------------------------------------
    // DB削除
    // -------------------------------------------------------

    await db.run(
      `
        DELETE FROM tenipuri_problems
        WHERE id = $1
      `,
      [id]
    );


    console.log(
      '[tenipuri/problems] 削除成功:',
      id
    );


    return NextResponse.json({
      ok: true,
    });


  } catch (error) {

    console.error(
      '[tenipuri/problems] DELETEエラー:',
      error
    );


    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          '問題の削除に失敗しました。',
      },
      {
        status: 500,
      }
    );
  }
}

