// file: app/api/tenipuri/problems/route.js

import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import { createClient } from '@supabase/supabase-js';


// =========================================================
// Runtime
// =========================================================

export const runtime = 'nodejs';


// =========================================================
// Supabase
// =========================================================

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);


// =========================================================
// 共通設定
// =========================================================

// Supabase Storageで作成したバケット名
const STORAGE_BUCKET = 'tenipuri-images';


// 許可する画像形式
const ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
];


// =========================================================
// 共通：画像拡張子取得
// =========================================================

function getImageExtension(file, defaultExt = '.jpg') {
  const originalName = file?.name || '';

  let ext = originalName
    ? originalName.substring(
        originalName.lastIndexOf('.')
      ).toLowerCase()
    : '';

  if (
    !ext ||
    ext === originalName.toLowerCase()
  ) {
    ext = defaultExt;
  }

  return ext;
}


// =========================================================
// 共通：画像保存
// Supabase Storageへアップロード
// =========================================================

async function saveImage(file) {
  if (!file || typeof file === 'string') {
    return null;
  }


  // -------------------------------------------------------
  // 拡張子チェック
  // -------------------------------------------------------

  const ext =
    getImageExtension(file);

  if (
    !ALLOWED_EXTENSIONS.includes(ext)
  ) {
    throw new Error(
      '対応していない画像形式です。'
    );
  }


  // -------------------------------------------------------
  // ファイル名作成
  // -------------------------------------------------------

  const fileName =
    `${Date.now()}-${crypto.randomUUID()}${ext}`;


  // Storage内の保存先
  //
  // tenipuri-images
  // └── tenipuri
  //     └── xxxx.jpeg
  //
  const storagePath =
    `tenipuri/${fileName}`;


  // -------------------------------------------------------
  // File → Buffer
  // -------------------------------------------------------

  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(arrayBuffer);


  // -------------------------------------------------------
  // Content-Type
  // -------------------------------------------------------

  const contentType =
    file.type || 'image/jpeg';


  // -------------------------------------------------------
  // Supabase Storageへアップロード
  // -------------------------------------------------------

  console.log(
    '[tenipuri/problems] Storageアップロード開始:',
    storagePath
  );

  const {
    error: uploadError,
  } =
    await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(
        storagePath,
        buffer,
        {
          contentType,
          upsert: false,
        }
      );


  if (uploadError) {
    console.error(
      '[tenipuri/problems] Storageアップロード失敗:',
      uploadError
    );

    throw new Error(
      `Supabase Storageへの画像アップロードに失敗しました：${uploadError.message}`
    );
  }


  // -------------------------------------------------------
  // 公開URL取得
  // -------------------------------------------------------

  const {
    data: publicUrlData,
  } =
    supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);


  if (
    !publicUrlData ||
    !publicUrlData.publicUrl
  ) {
    // URL取得に失敗した場合、
    // 直前にアップロードした画像を削除しておく
    try {
      await supabase.storage
        .from(STORAGE_BUCKET)
        .remove([
          storagePath,
        ]);
    } catch {
      // 無視
    }

    throw new Error(
      '画像の公開URLを取得できませんでした。'
    );
  }


  console.log(
    '[tenipuri/problems] Storageアップロード成功:',
    publicUrlData.publicUrl
  );


  return {
    storagePath,
    fileName,
    url: publicUrlData.publicUrl,
  };
}


// =========================================================
// 共通：画像削除
// Supabase Storageから削除
// =========================================================

async function deleteImageByUrl(imageUrl) {
  if (!imageUrl) {
    return;
  }


  // -------------------------------------------------------
  // Supabase StorageのURLか確認
  // -------------------------------------------------------

  const marker =
    `/storage/v1/object/public/${STORAGE_BUCKET}/`;


  const index =
    imageUrl.indexOf(marker);


  // -------------------------------------------------------
  // 旧方式のURLの場合
  //
  // 例：
  // /uploads/tenipuri/xxxx.jpeg
  //
  // Vercel上では削除できないため何もしない。
  // -------------------------------------------------------

  if (index === -1) {
    console.log(
      '[tenipuri/problems] Supabase Storage URLではないため削除をスキップ:',
      imageUrl
    );

    return;
  }


  // -------------------------------------------------------
  // Storage内のパス取得
  // -------------------------------------------------------

  const storagePath =
    imageUrl.substring(
      index + marker.length
    );


  if (!storagePath) {
    return;
  }


  // -------------------------------------------------------
  // Supabase Storageから削除
  // -------------------------------------------------------

  console.log(
    '[tenipuri/problems] Storage画像削除開始:',
    storagePath
  );


  const {
    error,
  } =
    await supabase.storage
      .from(STORAGE_BUCKET)
      .remove([
        storagePath,
      ]);


  if (error) {
    console.error(
      '[tenipuri/problems] Storage画像削除失敗:',
      error
    );

    return;
  }


  console.log(
    '[tenipuri/problems] Storage画像削除成功:',
    storagePath
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
    // バリデーション
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


    // -------------------------------------------------------
    // 問題画像保存
    // -------------------------------------------------------

    try {

      savedImage =
        await saveImage(image);


      console.log(
        '[tenipuri/problems] 画像保存成功:',
        savedImage.url
      );

    } catch (error) {

      console.error(
        '[tenipuri/problems] 画像保存失敗:',
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


    // -------------------------------------------------------
    // 解説画像保存
    // -------------------------------------------------------

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
          '[tenipuri/problems] 解説画像保存成功:',
          savedExplanationImage.url
        );

      } catch (error) {

        console.error(
          '[tenipuri/problems] 解説画像保存失敗:',
          error
        );


        // 問題画像を削除
        if (savedImage) {
          await deleteImageByUrl(
            savedImage.url
          );
        }


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


    // -------------------------------------------------------
    // DB登録
    // -------------------------------------------------------

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
        problem
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


      // DB登録に失敗したら画像削除
      if (savedImage) {
        await deleteImageByUrl(
          savedImage.url
        );
      }


      if (savedExplanationImage) {
        await deleteImageByUrl(
          savedExplanationImage.url
        );
      }


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


    // 予期せぬエラーでも画像を残さない
    if (savedImage) {
      await deleteImageByUrl(
        savedImage.url
      );
    }


    if (savedExplanationImage) {
      await deleteImageByUrl(
        savedExplanationImage.url
      );
    }


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


  let newImage = null;
  let newExplanationImage = null;


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
    // バリデーション
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


    // -------------------------------------------------------
    // 現在の問題取得
    // -------------------------------------------------------

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


    // -------------------------------------------------------
    // 現在の画像を維持
    // -------------------------------------------------------

    let imageUrl =
      current.image_url;


    let explanationImageUrl =
      current.explanation_image_url;


    // -------------------------------------------------------
    // 新しい問題画像
    // -------------------------------------------------------

    if (
      image &&
      typeof image !== 'string'
    ) {

      try {

        newImage =
          await saveImage(image);


        imageUrl =
          newImage.url;

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


    // -------------------------------------------------------
    // 新しい解説画像
    // -------------------------------------------------------

    if (
      explanationImage &&
      typeof explanationImage !== 'string'
    ) {

      try {

        newExplanationImage =
          await saveImage(
            explanationImage
          );


        explanationImageUrl =
          newExplanationImage.url;

      } catch (error) {

        console.error(
          '[tenipuri/problems] 新解説画像保存失敗:',
          error
        );


        // 新しい問題画像を削除
        if (newImage) {
          await deleteImageByUrl(
            newImage.url
          );
        }


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


    // -------------------------------------------------------
    // DB更新
    // -------------------------------------------------------

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


      // -----------------------------------------------------
      // DB更新成功
      // 古い画像を削除
      // -----------------------------------------------------

      if (
        newImage &&
        current.image_url &&
        current.image_url !== imageUrl
      ) {

        await deleteImageByUrl(
          current.image_url
        );
      }


      if (
        newExplanationImage &&
        current.explanation_image_url &&
        current.explanation_image_url !==
          explanationImageUrl
      ) {

        await deleteImageByUrl(
          current.explanation_image_url
        );
      }


      console.log(
        '[tenipuri/problems] 更新成功:',
        problem
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


      // DB更新失敗なら新画像を削除
      if (newImage) {
        await deleteImageByUrl(
          newImage.url
        );
      }


      if (newExplanationImage) {
        await deleteImageByUrl(
          newExplanationImage.url
        );
      }


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


    if (newImage) {
      await deleteImageByUrl(
        newImage.url
      );
    }


    if (newExplanationImage) {
      await deleteImageByUrl(
        newExplanationImage.url
      );
    }


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

    const { searchParams } =
      new URL(request.url);


    const id =
      searchParams.get('id');


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


    // -------------------------------------------------------
    // 問題画像削除
    // -------------------------------------------------------

    if (problem.image_url) {

      await deleteImageByUrl(
        problem.image_url
      );
    }


    // -------------------------------------------------------
    // 解説画像削除
    // -------------------------------------------------------

    if (
      problem.explanation_image_url
    ) {

      await deleteImageByUrl(
        problem.explanation_image_url
      );
    }


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

