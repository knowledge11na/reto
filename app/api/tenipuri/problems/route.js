// file: app/api/tenipuri/problems/route.js

import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import path from 'path';
import fs from 'fs/promises';


// =========================================================
// 共通設定
// =========================================================

const UPLOAD_DIR = path.join(
  process.cwd(),
  'public',
  'uploads',
  'tenipuri'
);

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

  let ext = path
    .extname(originalName)
    .toLowerCase();

  if (!ext) {
    ext = defaultExt;
  }

  return ext;
}


// =========================================================
// 共通：画像保存
// =========================================================

async function saveImage(file) {
  if (!file || typeof file === 'string') {
    return null;
  }

  const ext = getImageExtension(file);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    throw new Error('対応していない画像形式です。');
  }

  await fs.mkdir(UPLOAD_DIR, {
    recursive: true,
  });

  const fileName =
    `${Date.now()}-${crypto.randomUUID()}${ext}`;

  const filePath = path.join(
    UPLOAD_DIR,
    fileName
  );

  const arrayBuffer =
    await file.arrayBuffer();

  const buffer =
    Buffer.from(arrayBuffer);

  await fs.writeFile(
    filePath,
    buffer
  );

  return {
    filePath,
    fileName,
    url: `/uploads/tenipuri/${fileName}`,
  };
}


// =========================================================
// 共通：画像削除
// =========================================================

async function deleteImageByUrl(imageUrl) {
  if (
    !imageUrl ||
    !imageUrl.startsWith('/uploads/tenipuri/')
  ) {
    return;
  }

  // 先頭の / を外して public 以下のパスにする
  const relativePath =
    imageUrl.replace(/^\/+/, '');

  const filePath =
    path.join(
      process.cwd(),
      'public',
      relativePath
    );

  try {
    await fs.unlink(filePath);

    console.log(
      '[tenipuri/problems] 画像削除成功:',
      filePath
    );

  } catch {
    // ファイルが存在しなくても無視
  }
}


// =========================================================
// GET
// 打球問題一覧取得
// =========================================================

export async function GET() {
  console.log('[tenipuri/problems] GET開始');

  try {
    const problems = await db.query(
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
      { status: 500 }
    );
  }
}


// =========================================================
// POST
// 打球問題登録
// =========================================================

export async function POST(request) {
  console.log('[tenipuri/problems] POST開始');

  let savedImage = null;
  let savedExplanationImage = null;

  try {
    const formData = await request.formData();

    // -------------------------------------------------------
    // フォーム取得
    // -------------------------------------------------------

    const image =
      formData.get('image');

    const explanationImage =
      formData.get('explanationImage');

    const hitter = String(
      formData.get('hitter') || ''
    ).trim();

    const target = String(
      formData.get('target') || ''
    ).trim();

    const answerType = String(
      formData.get('answerType') || ''
    ).trim();

    const episode = String(
      formData.get('episode') || ''
    ).trim();

    const technique = String(
      formData.get('technique') || ''
    ).trim();

    const location = String(
      formData.get('location') || ''
    ).trim();

    const hand = String(
      formData.get('hand') || ''
    ).trim();

    const result = String(
      formData.get('result') || ''
    ).trim();


    // -------------------------------------------------------
    // バリデーション
    // -------------------------------------------------------

    if (!image || typeof image === 'string') {
      return NextResponse.json(
        {
          ok: false,
          error: '画像が選択されていません。',
        },
        { status: 400 }
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
          error: '答えの種類が不正です。',
        },
        { status: 400 }
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
        { status: 400 }
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
        { status: 400 }
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
        { status: 400 }
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
        savedImage.filePath
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
            `画像の保存に失敗しました：${error?.message || error}`,
        },
        { status: 500 }
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
          await saveImage(explanationImage);

        console.log(
          '[tenipuri/problems] 解説画像保存成功:',
          savedExplanationImage.filePath
        );

      } catch (error) {
        console.error(
          '[tenipuri/problems] 解説画像保存失敗:',
          error
        );

        // 問題画像も削除
        if (savedImage) {
          await deleteImageByUrl(
            savedImage.url
          );
        }

        return NextResponse.json(
          {
            ok: false,
            error:
              `解説画像の保存に失敗しました：${error?.message || error}`,
          },
          { status: 500 }
        );
      }
    }


    // -------------------------------------------------------
    // DB登録
    // -------------------------------------------------------

    try {
      const problem = await db.get(
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
        { status: 201 }
      );

    } catch (error) {
      console.error(
        '[tenipuri/problems] DB登録失敗:',
        error
      );

      // DB登録に失敗したら保存した画像を削除
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
            `問題の保存に失敗しました：${error?.message || error}`,
        },
        { status: 500 }
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
      { status: 500 }
    );
  }
}


// =========================================================
// PUT
// 打球問題更新
// =========================================================

export async function PUT(request) {
  console.log('[tenipuri/problems] PUT開始');

  let newImage = null;
  let newExplanationImage = null;

  try {
    const formData = await request.formData();

    // -------------------------------------------------------
    // フォーム取得
    // -------------------------------------------------------

    const id = String(
      formData.get('id') || ''
    ).trim();

    const hitter = String(
      formData.get('hitter') || ''
    ).trim();

    const target = String(
      formData.get('target') || ''
    ).trim();

    const answerType = String(
      formData.get('answerType') || ''
    ).trim();

    const episode = String(
      formData.get('episode') || ''
    ).trim();

    const technique = String(
      formData.get('technique') || ''
    ).trim();

    const location = String(
      formData.get('location') || ''
    ).trim();

    const hand = String(
      formData.get('hand') || ''
    ).trim();

    const result = String(
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
          error: '問題IDが指定されていません。',
        },
        { status: 400 }
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
          error: '答えの種類が不正です。',
        },
        { status: 400 }
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
        { status: 400 }
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
        { status: 400 }
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
        { status: 400 }
      );
    }


    // -------------------------------------------------------
    // 現在の問題取得
    // -------------------------------------------------------

    const current = await db.get(
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
          error: '問題が見つかりません。',
        },
        { status: 404 }
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
              `画像の保存に失敗しました：${error?.message || error}`,
          },
          { status: 500 }
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

        // 問題画像を新しく保存していたら削除
        if (newImage) {
          await deleteImageByUrl(
            newImage.url
          );
        }

        return NextResponse.json(
          {
            ok: false,
            error:
              `解説画像の保存に失敗しました：${error?.message || error}`,
          },
          { status: 500 }
        );
      }
    }


    // -------------------------------------------------------
    // DB更新
    // -------------------------------------------------------

    try {
      const problem = await db.get(
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
            `問題の更新に失敗しました：${error?.message || error}`,
        },
        { status: 500 }
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
      { status: 500 }
    );
  }
}


// =========================================================
// DELETE
// 打球問題削除
// =========================================================

export async function DELETE(request) {
  console.log('[tenipuri/problems] DELETE開始');

  try {
    const { searchParams } =
      new URL(request.url);

    const id =
      searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        {
          ok: false,
          error: '問題IDが指定されていません。',
        },
        { status: 400 }
      );
    }


    // -------------------------------------------------------
    // 問題取得
    // -------------------------------------------------------

    const problem = await db.get(
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
          error: '問題が見つかりません。',
        },
        { status: 404 }
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
      { status: 500 }
    );
  }
}