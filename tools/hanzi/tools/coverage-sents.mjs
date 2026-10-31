// Reports, for every volume, how many of its 组词 words already have a 造句.
//
//   node tools/coverage-sents.mjs          -> all 12 volumes
//   node tools/coverage-sents.mjs 9 10     -> just those volumes
//
// "Coverage" counts *unique* words per volume, because the same word can be
// authored by several characters; a word only needs one sentence no matter how
// many characters offer it. sents.json is keyed by word, not by volume, for the
// same reason.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SENTS = path.join(ROOT, 'content', 'sents.json');

const sents = JSON.parse(fs.readFileSync(SENTS, 'utf8'));

const src = fs.readFileSync(path.join(ROOT, 'data', 'index.js'), 'utf8');
let LABELS = [];
new Function('HZ_INDEX', src)((l) => { LABELS = l; });

const wanted = process.argv.slice(2).map(Number);
const vols = wanted.length ? wanted : [...Array(12).keys()];

let grandTotal = 0, grandHave = 0;
const rows = [];

for (const v of vols) {
  const wf = path.join(ROOT, 'content', 'words', 'w' + v + '.json');
  if (!fs.existsSync(wf)) continue;
  const words = JSON.parse(fs.readFileSync(wf, 'utf8'));

  const all = new Set();
  for (const ch in words) for (const [word] of words[ch]) all.add(word);

  const gap = [...all].filter((w) => !sents[w]);
  const have = all.size - gap.length;
  const pct = all.size ? (have / all.size) * 100 : 100;
  const bar = '#'.repeat(Math.round(pct / 5)).padEnd(20, '.');

  grandTotal += all.size;
  grandHave += have;
  rows.push({ v, label: LABELS[v], have, size: all.size, pct, bar, gap });
}

for (const r of rows) {
  console.log(
    'v' + String(r.v).padStart(2) + ' ' + r.label.padEnd(6) +
    String(r.have).padStart(5) + '/' + String(r.size).padStart(4) + '  ' +
    r.bar + ' ' + r.pct.toFixed(0).padStart(3) + '%'
  );
}

const pct = grandTotal ? (grandHave / grandTotal) * 100 : 100;
console.log('-'.repeat(46));
console.log(
  '   ' + '合计'.padEnd(6) +
  String(grandHave).padStart(5) + '/' + String(grandTotal).padStart(4) + '  ' +
  '#'.repeat(Math.round(pct / 5)).padEnd(20, '.') + ' ' + pct.toFixed(0).padStart(3) + '%'
);

const remaining = rows.reduce((n, r) => n + r.gap.length, 0);
console.log('\nsents.json: ' + Object.keys(sents).length + ' sentences · ' + remaining + ' volume-word slots still empty');

if (wanted.length === 1) {
  const g = rows[0] && rows[0].gap;
  if (g && g.length) console.log('  still missing (' + g.length + '): ' + g.join(' '));
}
