// ---------------------------------------------------------------------------
// merge-sents.mjs — validate a batch of authored 造句 and merge into sents.json.
//
//   node tools/merge-sents.mjs content/sents-gN.json
//
// A batch is a flat { "词": "句子。" } file. Before merging, every sentence must
// literally contain its word (otherwise the highlight in the UI would have
// nothing to mark), and we report which volume words are still uncovered.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTS = path.join(ROOT, 'content', 'sents.json');

const batchPath = process.argv[2];
if (!batchPath) { console.error('usage: merge-sents.mjs <batch.json> [volume]'); process.exit(2); }
const volArg = process.argv[3] !== undefined ? Number(process.argv[3]) : null;

const batch = JSON.parse(fs.readFileSync(path.resolve(ROOT, batchPath), 'utf8'));
const main = JSON.parse(fs.readFileSync(SENTS, 'utf8'));

// ---- gate 1: no invisible characters --------------------------------------
// A zero-width space pasted into a sentence is invisible in every editor and in
// the rendered page, but it makes indexOf() miss, breaks the highlight, and can
// split a word across a line. This runs *before* the word-presence check, so a
// stray ZW inside a word is repaired rather than reported as a missing word.
const ZW = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;
const hadZW = Object.keys(batch).filter(w => ZW.test(batch[w]));
if (hadZW.length) {
  console.log('stripped invisible characters from: ' + hadZW.join(' '));
  for (const w of hadZW) batch[w] = batch[w].replace(ZW, '');
}

// ---- gate 2: every sentence contains its word -----------------------------
const missingWord = Object.keys(batch).filter(w => batch[w].indexOf(w) < 0);
if (missingWord.length) {
  console.log('SENTENCES THAT DO NOT CONTAIN THEIR WORD (' + missingWord.length + '):');
  for (const w of missingWord) console.log('  ' + w + '  ->  ' + batch[w]);
  process.exit(1);
}

// ---- gate 3: sentence length is sane for a child reader -------------------
const tooShort = [], tooLong = [];
for (const w in batch) {
  const n = batch[w].length;
  if (n < 6) tooShort.push(w + '(' + n + ')');
  if (n > 40) tooLong.push(w + '(' + n + ')');
}
if (tooShort.length) console.log('very short: ' + tooShort.join(' '));
if (tooLong.length) console.log('very long: ' + tooLong.join(' '));

// ---- merge ----------------------------------------------------------------
let added = 0, replaced = 0;
for (const w in batch) {
  if (main[w]) replaced++; else added++;
  main[w] = batch[w];
}
const sorted = {};
for (const k of Object.keys(main).sort()) sorted[k] = main[k];
fs.writeFileSync(SENTS, JSON.stringify(sorted, null, 1) + '\n');

console.log(`merged: +${added} new, ${replaced} replaced  |  sents.json now ${Object.keys(sorted).length} entries`);

// ---- coverage report ------------------------------------------------------
if (volArg !== null) {
  const src = fs.readFileSync(path.join(ROOT, 'data', 'index.js'), 'utf8');
  let LABELS = [], IDX = {};
  new Function('HZ_INDEX', src)((l, i) => { LABELS = l; IDX = i; });
  const wf = path.join(ROOT, 'content', 'words', 'w' + volArg + '.json');
  const words = JSON.parse(fs.readFileSync(wf, 'utf8'));
  const all = new Set();
  for (const ch in words) for (const [word] of words[ch]) all.add(word);
  const gap = [...all].filter(w => !sorted[w]);
  const pct = ((all.size - gap.length) / all.size * 100).toFixed(1);
  console.log(`v${volArg} ${LABELS[volArg]}: ${all.size - gap.length}/${all.size} words have a sentence (${pct}%)`);
  if (gap.length) console.log('  still missing (' + gap.length + '): ' + gap.join(' '));
}
