// file: app/api/tenipuri/problems/route.js

import { NextResponse } from 'next/server';
import db from '@/lib/db.js';
import fs from 'fs/promises';
import path from 'path';


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

  try {
    const formData = await request.formData();

    const image = formData.get('image');
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

    if (!hitter) {
      return NextResponse.json(
        {
          ok: false,
          error: '誰が打ったかを入力してください。',
        },
        { status: 400 }
      );
    }

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: '誰に打ったかを入力してください。',
        },
        { status: 400 }
      );
    }

    if (!['hitter', 'target'].includes(answerType)) {
      return NextResponse.json(
        {
          ok: false,
          error: '答えの種類が不正です。',
        },
        { status: 400 }
      );
    }


    // -------------------------------------------------------
    // 拡張子
    // -------------------------------------------------------

    const originalName = image.name || 'image.jpg';

    let ext = path
      .extname(originalName)
      .toLowerCase();

    if (!ext) {
      ext = '.jpg';
    }

    const allowedExt = [
      '.jpg',
      '.jpeg',
      '.png',
      '.gif',
      '.webp',
      '.bmp',
    ];

    if (!allowedExt.includes(ext)) {
      return NextResponse.json(
        {
          ok: false,
          error: '対応していない画像形式です。',
        },
        { status: 400 }
      );
    }


    // -------------------------------------------------------
    // 画像保存
    // -------------------------------------------------------

    const uploadDir = path.join(
      process.cwd(),
      'public',
      'uploads',
      'tenipuri'
    );

    await fs.mkdir(uploadDir, {
      recursive: true,
    });

    const fileName =
      `${Date.now()}-${crypto.randomUUID()}${ext}`;

    const filePath = path.join(
      uploadDir,
      fileName
    );

    try {
      const arrayBuffer =
        await image.arrayBuffer();

      const buffer =
        Buffer.from(arrayBuffer);

      await fs.writeFile(
        filePath,
        buffer
      );

      console.log(
        '[tenipuri/problems] 画像保存成功:',
        filePath
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
    // 画像URL
    // -------------------------------------------------------

    const imageUrl =
      `/uploads/tenipuri/${fileName}`;

    // -------------------------------------------------------
    // 解説画像保存
    // -------------------------------------------------------

    let explanationImageUrl = null;
    let explanationImagePath = null;

    if (
      explanationImage &&
      typeof explanationImage !== 'string'
    ) {
      const originalExplanationName =
        explanationImage.name || 'explanation.jpg';

      let explanationExt =
        path
          .extname(originalExplanationName)
          .toLowerCase();

      if (!explanationExt) {
        explanationExt = '.jpg';
      }

      const allowedExt = [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
      ];

      if (!allowedExt.includes(explanationExt)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              '対応していない解説画像形式です。',
          },
          { status: 400 }
        );
      }

      const uploadDir = path.join(
        process.cwd(),
        'public',
        'uploads',
        'tenipuri'
      );

      await fs.mkdir(uploadDir, {
        recursive: true,
      });

      const explanationFileName =
        `${Date.now()}-${crypto.randomUUID()}${explanationExt}`;

      explanationImagePath = path.join(
        uploadDir,
        explanationFileName
      );

      try {
        const arrayBuffer =
          await explanationImage.arrayBuffer();

        const buffer =
          Buffer.from(arrayBuffer);

        await fs.writeFile(
          explanationImagePath,
          buffer
        );

        explanationImageUrl =
          `/uploads/tenipuri/${explanationFileName}`;

        console.log(
          '[tenipuri/problems] 解説画像保存成功:',
          explanationImagePath
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
  imageUrl,
  explanationImageUrl,
  hitter,
  target,
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

// DB登録失敗時は画像削除
try {
  await fs.unlink(filePath);
} catch {
  // 無視
}

if (explanationImagePath) {
  try {
    await fs.unlink(explanationImagePath);
  } catch {
    // 無視
  }
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

  try {
    const formData = await request.formData();

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

    const image = formData.get('image');

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

    if (!hitter) {
      return NextResponse.json(
        {
          ok: false,
          error: '誰が打ったかを入力してください。',
        },
        { status: 400 }
      );
    }

    if (!target) {
      return NextResponse.json(
        {
          ok: false,
          error: '誰に打ったかを入力してください。',
        },
        { status: 400 }
      );
    }

    if (!['hitter', 'target'].includes(answerType)) {
      return NextResponse.json(
        {
          ok: false,
          error: '答えの種類が不正です。',
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
    // 新しい画像がある場合
    // -------------------------------------------------------

let imageUrl = current.image_url;
let explanationImageUrl =
  current.explanation_image_url;

let newImagePath = null;
let newExplanationImagePath = null;

       // -------------------------------------------------------
    // 新しい問題画像がある場合
    // -------------------------------------------------------

    if (image && typeof image !== 'string') {

      const originalName =
        image.name || 'image.jpg';

      let ext =
        path.extname(originalName).toLowerCase();

      if (!ext) {
        ext = '.jpg';
      }

      const allowedExt = [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
      ];

      if (!allowedExt.includes(ext)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              '対応していない画像形式です。',
          },
          { status: 400 }
        );
      }

      const uploadDir = path.join(
        process.cwd(),
        'public',
        'uploads',
        'tenipuri'
      );

      await fs.mkdir(uploadDir, {
        recursive: true,
      });

      const fileName =
        `${Date.now()}-${crypto.randomUUID()}${ext}`;

      newImagePath = path.join(
        uploadDir,
        fileName
      );

      const arrayBuffer =
        await image.arrayBuffer();

      const buffer =
        Buffer.from(arrayBuffer);

      await fs.writeFile(
        newImagePath,
        buffer
      );

      imageUrl =
        `/uploads/tenipuri/${fileName}`;
    }


    // -------------------------------------------------------
    // 新しい解説画像がある場合
    // -------------------------------------------------------

    if (
      explanationImage &&
      typeof explanationImage !== 'string'
    ) {

      const originalExplanationName =
        explanationImage.name || 'explanation.jpg';

      let explanationExt =
        path
          .extname(originalExplanationName)
          .toLowerCase();

      if (!explanationExt) {
        explanationExt = '.jpg';
      }

      const allowedExt = [
        '.jpg',
        '.jpeg',
        '.png',
        '.gif',
        '.webp',
        '.bmp',
      ];

      if (!allowedExt.includes(explanationExt)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              '対応していない解説画像形式です。',
          },
          { status: 400 }
        );
      }

      const uploadDir = path.join(
        process.cwd(),
        'public',
        'uploads',
        'tenipuri'
      );

      await fs.mkdir(uploadDir, {
        recursive: true,
      });

      const fileName =
        `${Date.now()}-${crypto.randomUUID()}${explanationExt}`;

      newExplanationImagePath =
        path.join(uploadDir, fileName);

      const arrayBuffer =
        await explanationImage.arrayBuffer();

      const buffer =
        Buffer.from(arrayBuffer);

      await fs.writeFile(
        newExplanationImagePath,
        buffer
      );

      explanationImageUrl =
        `/uploads/tenipuri/${fileName}`;
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
  hitter,
  target,
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
      // 古い画像を削除
      // -----------------------------------------------------

      if (
        newExplanationImagePath &&
        current.explanation_image_url &&
        current.explanation_image_url.startsWith(
          '/uploads/tenipuri/'
        )
      ) {
        const oldExplanationPath =
          path.join(
            process.cwd(),
            'public',
            current.explanation_image_url
          );

        try {
          await fs.unlink(
            oldExplanationPath
          );
        } catch {
          // 古い画像が存在しなくても問題なし
        }
      }
      if (
        newImagePath &&
        current.image_url &&
        current.image_url.startsWith(
          '/uploads/tenipuri/'
        )
      ) {
        const oldPath = path.join(
          process.cwd(),
          'public',
          current.image_url
        );

        try {
          await fs.unlink(oldPath);
        } catch {
          // 古い画像が存在しなくても問題なし
        }
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

      // DB更新失敗時、新画像を削除
      if (newImagePath) {
        try {
          await fs.unlink(
            newImagePath
          );
        } catch {
          // 無視
        }
      }

if (newExplanationImagePath) {
  try {
    await fs.unlink(
      newExplanationImagePath
    );
  } catch {
    // 無視
  }
}

      console.error(
        '[tenipuri/problems] UPDATE失敗:',
        error
      );

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
    // 画像削除
    // -------------------------------------------------------

    if (
      problem.image_url &&
      problem.image_url.startsWith(
        '/uploads/tenipuri/'
      )
    ) {
      const imagePath = path.join(
        process.cwd(),
        'public',
        problem.image_url
      );

      try {
        await fs.unlink(imagePath);

        console.log(
          '[tenipuri/problems] 画像削除成功:',
          imagePath
        );

      } catch {
        // 画像が既に存在しない場合は無視
      }
    }
    // -------------------------------------------------------
    // 解説画像削除
    // -------------------------------------------------------

    if (
      problem.explanation_image_url &&
      problem.explanation_image_url.startsWith(
        '/uploads/tenipuri/'
      )
    ) {
      const explanationImagePath =
        path.join(
          process.cwd(),
          'public',
          problem.explanation_image_url
        );

      try {
        await fs.unlink(
          explanationImagePath
        );

        console.log(
          '[tenipuri/problems] 解説画像削除成功:',
          explanationImagePath
        );

      } catch {
        // 画像が既に存在しない場合は無視
      }
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