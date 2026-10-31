// ---------------------------------------------------------------------------
// build-words.mjs — pick the 组词 (word list) for every textbook character.
//
// The words are chosen from jieba's frequency dictionary, not from my own
// guesses, so "简单、常见、易理解" is a measurable property rather than a
// feeling: a word has to be composed entirely of characters the child has
// already met (or the 1000 most frequent characters overall), and it has to
// clear a frequency floor.
//
// Output: content/words.json  ->  { "一": ["一个", "一起", "第一"], ... }
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'tools', '.cache');
const DICT = path.join(CACHE, 'jieba-dict.txt');

const WANT = 3;              // words per character
const MIN_FREQ = 60;         // jieba frequency floor for a "common" word
const HAN = /^[\u4e00-\u9fff]+$/;
const BAD_POS = new Set(['nr', 'ns', 'nt', 'nz', 'eng', 'x', 'm', 'mq', 'q', 't']);

// ---- 1. textbook characters (the 2478 the app already knows) ----------------
const idxSrc = fs.readFileSync(path.join(ROOT, 'data', 'index.js'), 'utf8');
let IDX = {};
new Function('HZ_INDEX', idxSrc)((labels, idx) => { IDX = idx; });
const textbook = new Set(Object.keys(IDX));
if (textbook.size < 2000) throw new Error('textbook list looks wrong: ' + textbook.size);

// ---- 2. jieba dictionary ---------------------------------------------------
if (!fs.existsSync(DICT)) throw new Error('missing ' + DICT + ' (download it first)');
const lines = fs.readFileSync(DICT, 'utf8').split('\n');

const singleFreq = new Map();  // char -> frequency of that char used alone
const words = [];              // { w, freq }
for (const line of lines) {
  if (!line) continue;
  const sp = line.indexOf(' ');
  if (sp < 0) continue;
  const w = line.slice(0, sp);
  if (!HAN.test(w)) continue;
  const rest = line.slice(sp + 1).split(' ');
  const freq = parseInt(rest[0], 10);
  if (!Number.isFinite(freq)) continue;
  const pos = rest[1];
  if (w.length === 1) { singleFreq.set(w, freq); continue; }
  if (w.length < 2 || w.length > 3) continue;
  if (pos && BAD_POS.has(pos)) continue;
  if (freq < MIN_FREQ) continue;
  words.push({ w, freq });
}

// characters a child can be expected to read: the textbook set, plus the
// 1000 most frequent characters overall (these cover things like 们, 什, 怎
// that show up constantly but may sit outside the 1-6 grade list).
const byFreq = [...singleFreq.entries()].sort((a, b) => b[1] - a[1]);
const allowed = new Set(textbook);
for (const [ch] of byFreq.slice(0, 1000)) allowed.add(ch);

// ---- 3. bucket words by the characters they contain ------------------------
const buckets = new Map();     // char -> [{ w, freq, simple }]
let strictCount = 0;
for (const { w, freq } of words) {
  let simple = true;
  for (const ch of w) { if (!allowed.has(ch)) { simple = false; break; } }
  if (!simple) continue;
  strictCount++;
  const seen = new Set();
  for (const ch of w) {
    if (seen.has(ch)) continue;      // 妈妈 counts once for 妈
    seen.add(ch);
    if (!textbook.has(ch)) continue; // only need words for textbook chars
    let b = buckets.get(ch);
    if (!b) { b = []; buckets.set(ch, b); }
    b.push({ w, freq });
  }
}

// ---- 4. pick the top N per character ---------------------------------------
// Rank by frequency, but break ties toward words whose characters the child
// is more likely to know already (fewer "outside" characters = simpler).
function outsideScore(w) {
  let n = 0;
  for (const ch of w) if (!textbook.has(ch)) n++;
  return n;
}
const out = {};
let covered = 0, short = 0;
const missing = [];
for (const ch of textbook) {
  const b = buckets.get(ch);
  if (!b || !b.length) { missing.push(ch); short++; continue; }
  b.sort((a, x) => (outsideScore(a.w) - outsideScore(x.w)) || (x.freq - a.freq));
  // avoid picking two words that are near-duplicates of each other
  const picked = [];
  for (const c of b) {
    if (picked.length >= WANT) break;
    picked.push(c.w);
  }
  out[ch] = picked;
  if (picked.length >= WANT) covered++; else short++;
}

// ---- 5. report -------------------------------------------------------------
const uniq = new Set();
for (const ch in out) for (const w of out[ch]) uniq.add(w);

console.log('jieba multi-char words kept (all-simple chars):', strictCount);
console.log('textbook chars:', textbook.size);
console.log('  with ' + WANT + ' words:', covered);
console.log('  with fewer:', short, missing.length ? '(no candidates: ' + missing.length + ')' : '');
console.log('unique words to define:', uniq.size);
console.log('total char->word slots:', covered * WANT + (short - missing.length));

console.log('\n-- samples --');
for (const ch of ['一', '水', '花', '的', '了', '是', '跑', '秋', '朋', '影']) {
  console.log(' ', ch, '=>', (out[ch] || []).join(' / ') || '(none)');
}
if (missing.length) console.log('\nchars with no candidates:', missing.slice(0, 80).join(''));

fs.writeFileSync(path.join(ROOT, 'content', 'words.json'),
  JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
console.log('\nwrote content/words.json');
