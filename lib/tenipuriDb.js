// file: lib/tenipuriDb.js

import pkg from 'pg';

const { Pool } = pkg;

const globalForTenipuriDb = globalThis;

const pool =
  globalForTenipuriDb.__tenipuriDbPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,

    ssl: {
      rejectUnauthorized: false,
    },

    // テニプリ専用
    max: 3,

    // 接続待ち
    connectionTimeoutMillis: 10_000,

    // アイドル接続を長時間残しすぎない
    idleTimeoutMillis: 60_000,

    // DB接続維持
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

globalForTenipuriDb.__tenipuriDbPool = pool;

/**
 * DBクエリ
 * 一時的な接続エラーなどは自動リトライ
 */
export async function tenipuriQuery(text, params = []) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      lastError = error;

      console.error(
        `[tenipuriDb] query failed`,
        {
          attempt,
          code: error?.code,
          message: error?.message,
        }
      );

      if (attempt >= 3) {
        break;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, 300 * attempt)
      );
    }
  }

  throw lastError;
}

/**
 * 1件取得
 */
export async function tenipuriGet(text, params = []) {
  const result = await tenipuriQuery(text, params);
  return result.rows[0] ?? null;
}

/**
 * 全件取得
 */
export async function tenipuriAll(text, params = []) {
  const result = await tenipuriQuery(text, params);
  return result.rows;
}

/**
 * INSERT / UPDATE / DELETE
 */
export async function tenipuriRun(text, params = []) {
  return await tenipuriQuery(text, params);
}

export default pool;