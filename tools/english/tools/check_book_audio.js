// 校验 index.html 里所有单词/句子是否都有 Emma 音频
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function grab(name) {
  const start = html.indexOf('const ' + name + ' = [');
  if (start < 0) throw new Error('missing ' + name);
  let i = html.indexOf('[', start);
  let depth = 0, inStr = null, esc = false;
  for (let j = i; j < html.length; j++) {
    const c = html[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) return html.slice(i, j + 1); }
  }
  throw new Error('unterminated ' + name);
}

const WORDS = eval(grab('WORDS'));
const SENTENCES = eval(grab('SENTENCES'));

global.window = {};
require(path.join(root, 'audio/manifest.js'));
const clips = window.AUDIO_MANIFEST.clips;

const norm = t => String(t).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

const missing = [];
WORDS.forEach(w => { if (!clips['emma|' + norm(w.en)]) missing.push('WORD ' + w.en); });
SENTENCES.forEach(g => g.items.forEach(s => {
  if (!clips['emma|' + norm(s.en)]) missing.push(g.unit + ' :: ' + s.en);
}));

const cats = {};
WORDS.forEach(w => { cats[w.cat] = (cats[w.cat] || 0) + 1; });

console.log('words:', WORDS.length, 'sentences:', SENTENCES.reduce((n, g) => n + g.items.length, 0));
console.log('categories:', JSON.stringify(cats));
console.log('clips total:', Object.keys(clips).length);
console.log(missing.length ? 'MISSING:\n' + missing.join('\n') : 'all audio present ✔');
