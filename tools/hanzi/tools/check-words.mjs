// ---------------------------------------------------------------------------
// check-words.mjs — validate the authored 组词 files in content/words/.
//
// Checks, per volume: JSON parses, every textbook character has an entry,
// word count is sane, no duplicate words inside one character, and every
// authored word actually exists in the jieba dictionary (so I cannot invent
// a word that no one uses).
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORDS_DIR = path.join(ROOT, 'content', 'words');

const src = fs.readFileSync(path.join(ROOT, 'data', 'index.js'), 'utf8');
let LABELS = [], IDX = {};
new Function('HZ_INDEX', src)((l, i) => { LABELS = l; IDX = i; });
const byVol = LABELS.map(() => []);
for (const ch in IDX) byVol[IDX[ch][1]].push(ch);

// jieba dictionary -> set of known words
const known = new Set();
for (const line of fs.readFileSync(path.join(ROOT, 'tools', '.cache', 'jieba-dict.txt'), 'utf8').split('\n')) {
  const sp = line.indexOf(' ');
  if (sp > 0) known.add(line.slice(0, sp));
}

let bad = 0, totalChars = 0, totalWords = 0;
const unknownWords = [];

for (let v = 0; v < LABELS.length; v++) {
  const f = path.join(WORDS_DIR, 'w' + v + '.json');
  if (!fs.existsSync(f)) { console.log(`v${v} ${LABELS[v]}: (not authored yet)  ${byVol[v].length} chars`); continue; }
  let data;
  try { data = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { console.log(`v${v} ${LABELS[v]}: JSON ERROR -> ${e.message}`); bad++; continue; }

  const want = new Set(byVol[v]);
  const have = new Set(Object.keys(data));
  const missing = [...want].filter(c => !have.has(c));
  const extra = [...have].filter(c => !want.has(c));

  let words = 0, thin = [];
  for (const ch in data) {
    const list = data[ch];
    if (!Array.isArray(list) || !list.length) { thin.push(ch + '(empty)'); continue; }
    const seen = new Set();
    for (const pair of list) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair[0] || !pair[1]) { thin.push(ch + '(bad pair)'); break; }
      if (seen.has(pair[0])) thin.push(ch + '(dup ' + pair[0] + ')');
      seen.add(pair[0]);
      if (!known.has(pair[0])) unknownWords.push(pair[0]);
      words++;
    }
    if (list.length < 3) thin.push(ch + '(' + list.length + ')');
  }

  const flag = (missing.length || extra.length) ? '  <-- MISMATCH' : '';
  console.log(`v${v} ${LABELS[v]}: ${have.size}/${want.size} chars, ${words} words` +
    (missing.length ? `, missing=${missing.join('')}` : '') +
    (extra.length ? `, extra=${extra.join('')}` : '') + flag);
  if (missing.length || extra.length) bad++;
  if (thin.length) console.log('     thin/odd: ' + thin.join(' '));
  totalChars += have.size; totalWords += words;
}

console.log(`\ntotal: ${totalChars} chars, ${totalWords} words authored`);
if (unknownWords.length) {
  const u = [...new Set(unknownWords)];
  console.log(`words not in jieba dict (${u.length}): ` + u.join(' '));
}
console.log(bad ? `\n${bad} volume(s) with problems` : '\nall authored volumes OK');
