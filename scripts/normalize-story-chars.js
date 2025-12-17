// file: scripts/normalize-story-chars.js
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const DIR = path.join(process.cwd(), 'public', 'story', 'char');

// 統一したいキャンバスサイズ（必要なら変えてOK）
const OUT_W = 900;
const OUT_H = 1200;

async function main() {
  const files = await fs.readdir(DIR);
  const targets = files.filter((f) => /\.png$/i.test(f));

  for (const f of targets) {
    const p = path.join(DIR, f);
    const img = sharp(p);

    // ① 透明余白をトリム
    // ② 指定キャンバスに contain で配置（余白は透明）
    const out = await img
      .trim()
      .resize(OUT_W, OUT_H, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();

    await fs.writeFile(p, out);
    console.log('normalized:', f);
  }

  console.log('DONE');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
