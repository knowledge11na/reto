// file: app/api/tenipuri/problems/route.js

import { NextResponse } from 'next/server';
import {
  tenipuriAll,
  tenipuriGet,
  tenipuriRun,
} from '@/lib/tenipuriDb.js';

export const runtime = 'nodejs';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
]);

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;


/**
 * =========================================================
 * 共通レスポンス
 * =========================================================
 */

function json(data, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  });
}


function errorResponse(
  message,
  status = 500,
  extra = {}
) {
  console.error(
    '[tenipuri/problems]',
    message,
    extra
  );

  return json(
    {
      ok: false,
      success: false,
      error: message,
    },
    status
  );
}


function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}


function validateAnswerType(answerType) {
  return [
    'hitter',
    'target',
    'technique',
  ].includes(answerType);
}


/**
 * =========================================================
 * 画像保存
 *
 * 現在のDB方式をそのまま維持。
 * Supabase Storageは使用しない。
 * =========================================================
 */

async function saveImage(file) {
  if (
    !file ||
    typeof file.arrayBuffer !== 'function'
  ) {
    throw new Error(
      '画像ファイルがありません'
    );
  }


  if (
    !ALLOWED_IMAGE_TYPES.has(file.type)
  ) {
    throw new Error(
      `対応していない画像形式です: ${
        file.type || 'unknown'
      }`
    );
  }


  if (
    file.size > MAX_IMAGE_SIZE
  ) {
    throw new Error(
      `画像サイズが大きすぎます。最大 ${
        MAX_IMAGE_SIZE / 1024 / 1024
      }MBです`
    );
  }


  const arrayBuffer =
    await file.arrayBuffer();


  const buffer =
    Buffer.from(arrayBuffer);


  return {
    url:
      `data:${file.type};base64,${buffer.toString('base64')}`,

    contentType:
      file.type,

    size:
      file.size,
  };
}


/**
 * =========================================================
 * GET
 *
 * ---------------------------------------------------------
 * 通常
 *
 * /api/tenipuri/problems
 *
 * → 画像なし
 * → 軽量
 *
 * ---------------------------------------------------------
 * 個別
 *
 * /api/tenipuri/problems?id=123
 *
 * → その1問だけ
 * → 画像あり
 *
 * ---------------------------------------------------------
 * 全画像
 *
 * /api/tenipuri/problems?includeImages=true
 *
 * → 管理用途などで必要な場合のみ
 * =========================================================
 */

export async function GET(request) {

  try {

    const {
      searchParams,
    } = new URL(request.url);


    const id =
      searchParams.get('id');


    const includeImages =
      searchParams.get(
        'includeImages'
      ) === 'true';


    // =====================================================
    // 個別問題取得
    //
    // ★Meteorがここを使う
    // =====================================================

    if (id !== null) {

      if (
        !/^\d+$/.test(id)
      ) {

        return errorResponse(
          'IDが不正です',
          400
        );

      }


      console.log(
        `[tenipuri/problems] GET detail id=${id}`
      );


      const problem =
        await tenipuriGet(
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
            WHERE id = $1
            LIMIT 1
          `,
          [id]
        );


      if (!problem) {

        console.error(
          `[tenipuri/problems] detail not found id=${id}`
        );


        return errorResponse(
          '問題が見つかりません',
          404
        );

      }


      console.log(
        `[tenipuri/problems] GET detail success id=${id}`
      );


      // ---------------------------------------------------
      // ★ok と success の両方を返す
      //
      // 古いコード、新しいコードのどちらでも対応可能
      // ---------------------------------------------------

      return json({
        ok: true,
        success: true,
        problem,
      });

    }


    // =====================================================
    // 全問題取得
    //
    // ★通常は画像を絶対に取得しない
    // =====================================================

    let problems;


    if (includeImages) {

      console.log(
        '[tenipuri/problems] GET all WITH images'
      );


      problems =
        await tenipuriAll(
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

    } else {

      problems =
        await tenipuriAll(
          `
            SELECT
              id,
              hitter,
              target,
              answer_type,
              episode,
              technique,
              location,
              hand,
              result,
              created_at,
              updated_at,

              CASE
                WHEN image_url IS NOT NULL
                  AND image_url <> ''
                THEN true
                ELSE false
              END AS has_image,

              CASE
                WHEN explanation_image_url IS NOT NULL
                  AND explanation_image_url <> ''
                THEN true
                ELSE false
              END AS has_explanation_image

            FROM tenipuri_problems

            ORDER BY id DESC
          `
        );

    }


    console.log(
      `[tenipuri/problems] GET ${problems.length} problems`
    );


    return json({

      ok: true,

      success: true,

      problems,

      count:
        problems.length,

      includeImages,

    });


  } catch (error) {

    return errorResponse(
      '問題の取得に失敗しました',
      500,
      {
        message:
          error?.message,

        code:
          error?.code,

        stack:
          error?.stack,
      }
    );

  }

}


/**
 * =========================================================
 * POST
 * =========================================================
 */

export async function POST(request) {

  try {

    const formData =
      await request.formData();


    const image =
      formData.get('image');


    const explanationImage =
      formData.get(
        'explanationImage'
      );


    const hitter =
      cleanText(
        formData.get('hitter')
      );


    const target =
      cleanText(
        formData.get('target')
      );


    const answerType =
      cleanText(
        formData.get(
          'answerType'
        )
      );


    const episode =
      cleanText(
        formData.get('episode')
      );


    const technique =
      cleanText(
        formData.get('technique')
      );


    const location =
      cleanText(
        formData.get('location')
      );


    const hand =
      cleanText(
        formData.get('hand')
      );


    const result =
      cleanText(
        formData.get('result')
      );


    // =====================================================
    // バリデーション
    // =====================================================

    if (!image) {

      return errorResponse(
        '問題画像が必要です',
        400
      );

    }


    if (
      !validateAnswerType(
        answerType
      )
    ) {

      return errorResponse(
        '回答タイプが不正です',
        400
      );

    }


    if (
      answerType === 'hitter' &&
      !hitter
    ) {

      return errorResponse(
        '打球者を入力してください',
        400
      );

    }


    if (
      answerType === 'target' &&
      !target
    ) {

      return errorResponse(
        '対象を入力してください',
        400
      );

    }


    if (
      answerType === 'technique' &&
      !technique
    ) {

      return errorResponse(
        '技名を入力してください',
        400
      );

    }


    // =====================================================
    // 画像保存
    // =====================================================

    const savedImage =
      await saveImage(image);


    let savedExplanationImage =
      null;


    if (
      explanationImage &&
      typeof explanationImage.arrayBuffer ===
        'function' &&
      explanationImage.size > 0
    ) {

      savedExplanationImage =
        await saveImage(
          explanationImage
        );

    }


    // =====================================================
    // INSERT
    // =====================================================

    const problem =
      await tenipuriGet(
        `
          INSERT INTO tenipuri_problems (
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
          VALUES (
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

          RETURNING
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
        `,
        [
          savedImage.url,

          savedExplanationImage?.url ??
            null,

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
      `[tenipuri/problems] POST created id=${problem.id}`
    );


    return json({

      ok: true,

      success: true,

      problem,

    });


  } catch (error) {

    return errorResponse(
      '問題の登録に失敗しました',
      500,
      {
        message:
          error?.message,

        code:
          error?.code,
      }
    );

  }

}


/**
 * =========================================================
 * PUT
 * =========================================================
 */

export async function PUT(request) {

  try {

    const formData =
      await request.formData();


    const id =
      cleanText(
        formData.get('id')
      );


    if (
      !id ||
      !/^\d+$/.test(id)
    ) {

      return errorResponse(
        'IDが不正です',
        400
      );

    }


    // =====================================================
    // 現在の画像を取得
    // =====================================================

    const current =
      await tenipuriGet(
        `
          SELECT
            id,
            image_url,
            explanation_image_url
          FROM tenipuri_problems
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );


    if (!current) {

      return errorResponse(
        '編集対象の問題が見つかりません',
        404
      );

    }


    const hitter =
      cleanText(
        formData.get('hitter')
      );


    const target =
      cleanText(
        formData.get('target')
      );


    const answerType =
      cleanText(
        formData.get(
          'answerType'
        )
      );


    const episode =
      cleanText(
        formData.get('episode')
      );


    const technique =
      cleanText(
        formData.get('technique')
      );


    const location =
      cleanText(
        formData.get('location')
      );


    const hand =
      cleanText(
        formData.get('hand')
      );


    const result =
      cleanText(
        formData.get('result')
      );


    // =====================================================
    // バリデーション
    // =====================================================

    if (
      !validateAnswerType(
        answerType
      )
    ) {

      return errorResponse(
        '回答タイプが不正です',
        400
      );

    }


    if (
      answerType === 'hitter' &&
      !hitter
    ) {

      return errorResponse(
        '打球者を入力してください',
        400
      );

    }


    if (
      answerType === 'target' &&
      !target
    ) {

      return errorResponse(
        '対象を入力してください',
        400
      );

    }


    if (
      answerType === 'technique' &&
      !technique
    ) {

      return errorResponse(
        '技名を入力してください',
        400
      );

    }


    // =====================================================
    // 既存画像
    // =====================================================

    let imageUrl =
      current.image_url;


    let explanationImageUrl =
      current.explanation_image_url;


    // =====================================================
    // 問題画像が変更された場合
    // =====================================================

    const image =
      formData.get('image');


    if (
      image &&
      typeof image.arrayBuffer ===
        'function' &&
      image.size > 0
    ) {

      const savedImage =
        await saveImage(
          image
        );


      imageUrl =
        savedImage.url;

    }


    // =====================================================
    // 解説画像が変更された場合
    // =====================================================

    const explanationImage =
      formData.get(
        'explanationImage'
      );


    if (
      explanationImage &&
      typeof explanationImage.arrayBuffer ===
        'function' &&
      explanationImage.size > 0
    ) {

      const savedExplanationImage =
        await saveImage(
          explanationImage
        );


      explanationImageUrl =
        savedExplanationImage.url;

    }


    // =====================================================
    // UPDATE
    // =====================================================

    const problem =
      await tenipuriGet(
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

          RETURNING
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
      `[tenipuri/problems] PUT updated id=${id}`
    );


    return json({

      ok: true,

      success: true,

      problem,

    });


  } catch (error) {

    return errorResponse(
      '問題の更新に失敗しました',
      500,
      {
        message:
          error?.message,

        code:
          error?.code,
      }
    );

  }

}


/**
 * =========================================================
 * DELETE
 * =========================================================
 */

export async function DELETE(request) {

  try {

    const {
      searchParams,
    } = new URL(request.url);


    const id =
      searchParams.get('id');


    if (
      !id ||
      !/^\d+$/.test(id)
    ) {

      return errorResponse(
        'IDが不正です',
        400
      );

    }


    const current =
      await tenipuriGet(
        `
          SELECT id
          FROM tenipuri_problems
          WHERE id = $1
          LIMIT 1
        `,
        [id]
      );


    if (!current) {

      return errorResponse(
        '削除対象の問題が見つかりません',
        404
      );

    }


    await tenipuriRun(
      `
        DELETE FROM tenipuri_problems
        WHERE id = $1
      `,
      [id]
    );


    console.log(
      `[tenipuri/problems] DELETE id=${id}`
    );


    return json({

      ok: true,

      success: true,

      id,

    });


  } catch (error) {

    return errorResponse(
      '問題の削除に失敗しました',
      500,
      {
        message:
          error?.message,

        code:
          error?.code,
      }
    );

  }

}