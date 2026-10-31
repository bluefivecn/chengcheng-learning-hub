// ---------------------------------------------------------------------------
// build-content.mjs — merge the authored 组词/释义 (content/words/*.json) and
// 造句 (content/sents.json) into the per-volume data chunks.
//
// The chunks stay the single lazy-loaded payload: a chunk already carried the
// stroke geometry, and now also carries, per character,
//     w: [[word, definition], ...]
//     s: [sentence, ...]        parallel to w, "" where there is no sentence
//
// Idempotent: it strips any previously injected w/s and re-adds them, so it is
// safe to re-run after every authoring batch.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORDS_DIR = path.join(ROOT, 'content', 'words');
const SENTS = path.join(ROOT, 'content', 'sents.json');

const sents = fs.existsSync(SENTS) ? JSON.parse(fs.readFileSync(SENTS, 'utf8')) : {};

// A character can sit in more than one volume (index.js keeps the earliest grade,
// the chunks keep every copy). Key the 组词 by character rather than by volume so
// that *every* copy of a character carries its 组词 — otherwise a later-volume
// duplicate is a chunk entry with strokes but no words, a trap for any code that
// resolves a character through a chunk instead of through the index.
const byChar = {};
const dupIn = [];
for (let v = 0; v < 12; v++) {
  const p = path.join(WORDS_DIR, 'w' + v + '.json');
  if (!fs.existsSync(p)) continue;
  const words = JSON.parse(fs.readFileSync(p, 'utf8'));
  for (const ch in words) {
    if (byChar[ch]) dupIn.push(ch + ' (w' + v + ')');
    else byChar[ch] = words[ch];
  }
}

let wordsTotal = 0, sentsUsed = 0;
const covered = new Set(), uncovered = [];
const missingSents = new Set();
const badSents = [];

for (let v = 0; v < 12; v++) {
  const chunkPath = path.join(ROOT, 'data', 'g' + v + '.js');
  const src = fs.readFileSync(chunkPath, 'utf8');
  const m = src.match(/^HZ_LOAD\((\d+),([\s\S]*)\);\s*$/);
  if (!m) throw new Error('cannot parse ' + chunkPath);
  const vol = m[1];
  const obj = JSON.parse(m[2]);

  let vWords = 0, vSents = 0;

  // strip any previous injection first (idempotency)
  for (const ch in obj) { delete obj[ch].w; delete obj[ch].s; }

  for (const ch in obj) {
    const list = byChar[ch];
    if (!Array.isArray(list) || !list.length) { uncovered.push(ch + '@g' + v); continue; }
    obj[ch].w = list;
    let have = 0;
    const arr = list.map(([w]) => {
      const s = sents[w];
      if (s) {
        have++; vSents++;
        // a sentence that never uses its word teaches nothing
        if (s.indexOf(w) < 0) badSents.push(w + '  ->  ' + s);
      } else missingSents.add(w);
      return s || '';
    });
    if (have > 0) obj[ch].s = arr;   // only carry s when this char has any
    vWords += list.length;
    covered.add(ch);
  }

  fs.writeFileSync(chunkPath, 'HZ_LOAD(' + vol + ',' + JSON.stringify(obj) + ');\n');
  console.log(`g${v}.js: ${vWords} word slots, ${vSents} sentence slots  (${fs.statSync(chunkPath).size} bytes)`);
}

// distinct totals (a character shared by two volumes is counted once)
for (const ch of covered) {
  wordsTotal += byChar[ch].length;
  sentsUsed += byChar[ch].filter(([w]) => sents[w]).length;
}

console.log(`\nchars with 组词 (distinct): ${covered.size}`);
console.log(`words authored: ${wordsTotal}`);
console.log(`sentences embedded (distinct char-word pairs): ${sentsUsed}`);
console.log(`unique words still without a sentence: ${missingSents.size}`);
if (dupIn.length) console.log(`note: ${dupIn.length} character(s) authored in more than one volume: ${dupIn.join(' ')}`);
if (uncovered.length) {
  console.log(`\n!! ${uncovered.length} chunk entries have no 组词: ${uncovered.join(' ')}`);
}
if (badSents.length) {
  console.log(`\n!! sentences that do not contain their word (${badSents.length}):`);
  for (const b of badSents) console.log('   ' + b);
}
