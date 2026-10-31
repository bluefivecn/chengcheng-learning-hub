/*
 * Rebuilds data/index.js and data/g0..g11.js from scratch.
 *
 *   node tools/build-data.mjs
 *
 * Two upstream sources, both public:
 *   1. The 部编版 primary-school character list (characters + readings),
 *      scraped from hanzipaper.com.
 *   2. Stroke-order geometry from the `hanzi-writer-data` npm package.
 *
 * The character list is split into the 12 textbook volumes so the page only
 * downloads the volume it needs (126 KB – 860 KB each) instead of all 6 MB.
 */
import { gunzipSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIST_URL = 'https://hanzipaper.com/chinese-lexical-list-with-pinyin-for-primary-school/';
const DATA_TGZ = 'https://registry.npmjs.org/hanzi-writer-data/-/hanzi-writer-data-2.0.1.tgz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';

const LABELS = ['一年级上', '一年级下', '二年级上', '二年级下', '三年级上', '三年级下',
                '四年级上', '四年级下', '五年级上', '五年级下', '六年级上', '六年级下'];

async function get(url, as) {
  const r = await fetch(url, { headers: { 'user-agent': UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return as === 'buffer' ? Buffer.from(await r.arrayBuffer()) : r.text();
}

/* ---- 1. character list, grouped by textbook volume ---- */
async function readWordList() {
  const html = await get(LIST_URL);
  const heads = [...html.matchAll(/(一|二|三|四|五|六)年级(上|下)册/g)]
    .map((m) => ({ at: m.index, name: m[0] }));
  heads.push({ at: html.length, name: 'END' });

  const grades = [];
  for (let i = 0; i < heads.length - 1; i++) {
    const seg = html.slice(heads[i].at, heads[i + 1].at);
    const seen = new Set();
    const chars = [];
    for (const m of seg.matchAll(/<a href="[^"]*">(.)<\/a>\s*(?:\(([^)]*)\))?/g)) {
      const ch = m[1];
      if (!/[\u4e00-\u9fff]/.test(ch) || seen.has(ch)) continue;
      seen.add(ch);
      chars.push([ch, (m[2] || '').trim()]);
    }
    grades.push({ name: heads[i].name, chars });
    console.log(`${heads[i].name.padEnd(8)} ${String(chars.length).padStart(4)} chars`);
  }
  return grades;
}

/* ---- 2. stroke geometry out of the npm tarball ---- */
function* tarEntries(buf) {
  let off = 0;
  while (off + 512 <= buf.length) {
    const name = buf.toString('utf8', off, off + 100).replace(/\0.*$/, '');
    if (!name) break;
    const size = parseInt(buf.toString('utf8', off + 124, off + 136).replace(/\0.*$/, '').trim(), 8) || 0;
    yield { name, data: buf.subarray(off + 512, off + 512 + size) };
    off += 512 + Math.ceil(size / 512) * 512;
  }
}

async function readStrokeData(wanted) {
  const tgz = await get(DATA_TGZ, 'buffer');
  const data = {};
  for (const { name, data: bytes } of tarEntries(gunzipSync(tgz))) {
    const m = /^package\/(.)\.json$/.exec(name);
    if (!m || !wanted.has(m[1])) continue;
    data[m[1]] = JSON.parse(bytes.toString('utf8'));
  }
  return data;
}

/* ---- 3. emit ---- */
// Corrections to the scraped word list.
//
// 部编版一年级上册《写字表》第 22 条 is 自 (zì) 己 (jǐ) — the textbook word is
// 自己 — but hanzipaper.com prints 已 (yǐ), a *different* character with a
// different stroke order. 已 is genuine elsewhere in the same list (二年级上
// 《植物妈妈有办法》「孩子如果已经长大」), so this is scoped to grade 0 rather
// than applied globally.
const FIXES = [{ grade: 0, from: '已', to: '己', pinyin: 'jǐ' }];
const fixChar = (ch, g) => {
  for (const f of FIXES) if (f.grade === g && f.from === ch) return f.to;
  return ch;
};
const fixPinyin = (ch, g, pinyin) => {
  for (const f of FIXES) if (f.grade === g && f.from === ch) return f.pinyin;
  return pinyin;
};

const grades = await readWordList();
const wanted = new Set(
  grades.flatMap((g, i) => g.chars.map(([c]) => fixChar(c, i)))
);
console.log(`\nunique characters: ${wanted.size}`);

const raw = await readStrokeData(wanted);
console.log(`stroke data found: ${Object.keys(raw).length}`);

// 顔 (U+9854) is a variant glyph; the textbook means 颜 (U+989C)
if (raw['顔'] && !raw['颜']) { raw['颜'] = raw['顔']; delete raw['顔']; }

const index = {};
const chunks = LABELS.map(() => ({}));
for (let g = 0; g < grades.length; g++) {
  const seen = new Set();
  for (const [rawChar, pinyin] of grades[g].chars) {
    const ch = rawChar === '顔' ? '颜' : fixChar(rawChar, g);
    if (seen.has(ch)) continue;
    seen.add(ch);
    const d = raw[ch];
    if (!d) { console.log(`  no stroke data, skipped: ${ch}`); continue; }
    if (!(ch in index)) index[ch] = [fixPinyin(rawChar, g, pinyin), g];
    chunks[g][ch] = { strokes: d.strokes, medians: d.medians };
  }
}

await mkdir(join(ROOT, 'data'), { recursive: true });
const j = (v) => JSON.stringify(v, null, 0).replace(/\n/g, '');

await writeFile(join(ROOT, 'data', 'index.js'),
  `HZ_INDEX(${j(LABELS)},${j(index)});`, 'utf8');

let total = 0;
for (let i = 0; i < chunks.length; i++) {
  const body = `HZ_LOAD(${i},${j(chunks[i])});`;
  await writeFile(join(ROOT, 'data', `g${i}.js`), body, 'utf8');
  total += Buffer.byteLength(body);
  console.log(`${LABELS[i].padEnd(8)} ${String(Object.keys(chunks[i]).length).padStart(4)} chars  ${(Buffer.byteLength(body) / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`\nindex.js ${(Buffer.byteLength(`HZ_INDEX(${j(LABELS)},${j(index)});`) / 1024).toFixed(0)} KB`);
console.log(`${Object.keys(index).length} characters, ${(total / 1048576).toFixed(2)} MB across ${chunks.length} chunks`);
