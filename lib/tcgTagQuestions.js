// 投稿問題の正解はサーバーだけで保持する。
function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('[tcg] 投稿問題の配列データが不正です:', error.message);
    return [];
  }
}

const normalizeText = (value) => String(value ?? '').trim().replace(/\s+/g, '').toLowerCase();

export function makeTagQuestion(row, tag) {
  const type = row.type;
  const options = arrayValue(row.options_json).map(String);
  const alternatives = arrayValue(row.alt_answers_json);
  const rawCorrect = row.correct_answer;
  const correct = type === 'multi' || type === 'order'
    ? arrayValue(rawCorrect).map((value) => typeof value === 'number' ? options[value] : String(value))
    : String(rawCorrect ?? '');
  if (!row.question || !['text', 'single', 'multi', 'order'].includes(type)) return null;
  if (type === 'text' && !correct.trim()) return null;
  if (type === 'single' && (!options.length || !options.includes(correct))) return null;
  if ((type === 'multi' || type === 'order') &&
      (!correct.length || correct.some((value) => value == null || !options.includes(value)))) return null;

  const shuffled = [...options];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const reveal = Array.isArray(correct) ? correct.join(type === 'order' ? ' → ' : ' / ') : correct;
  return {
    label: `タグ【${tag}】`,
    lines: [String(row.question)],
    type,
    options: shuffled,
    reveal,
    check(answer) {
      if (type === 'text') {
        const input = normalizeText(answer);
        return !!input && [correct, ...alternatives].some((value) => normalizeText(value) === input);
      }
      if (type === 'single') {
        return typeof answer === 'string' && shuffled.includes(answer) &&
          [correct, ...alternatives].some((value) => String(value) === answer);
      }
      if (!Array.isArray(answer) || answer.some((value) => typeof value !== 'string' || !shuffled.includes(value))) return false;
      if (type === 'multi') {
        const actual = [...new Set(answer)].sort();
        const expected = [...new Set(correct)].sort();
        return actual.length === answer.length && actual.length === expected.length &&
          actual.every((value, i) => value === expected[i]);
      }
      return answer.length === correct.length && answer.every((value, i) => value === correct[i]);
    },
  };
}

export function selectTagQuestion(rows, tag, usedMap) {
  const pool = rows.filter((row) => arrayValue(row.tags_json).map(String).includes(tag))
    .map((row) => ({ id: String(row.id), question: makeTagQuestion(row, tag) }))
    .filter((entry) => entry.question);
  if (!pool.length) return null;
  const key = `tag:${tag}`;
  let used = usedMap.get(key);
  if (!used) usedMap.set(key, used = new Set());
  let available = pool.filter((entry) => !used.has(entry.id));
  if (!available.length) {
    used.clear();
    available = pool;
  }
  const selected = available[Math.floor(Math.random() * available.length)];
  used.add(selected.id);
  return selected.question;
}

export async function loadTagQuestion(tag, usedMap) {
  const { default: db } = await import('./db.js');
  const rows = await db.query(
    "SELECT id, type, question, correct_answer, options_json, alt_answers_json, tags_json FROM question_submissions WHERE status = 'approved' AND type IN ('single','multi','order','text')"
  );
  return selectTagQuestion(rows, tag, usedMap);
}
