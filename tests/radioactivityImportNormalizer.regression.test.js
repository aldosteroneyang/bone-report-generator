const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const context = { console };
context.window = context;
context.globalThis = context;
vm.createContext(context);

[
  'radioactivityImportNormalizer.js'
].forEach(file => {
  const filePath = path.join(rootDir, file);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
});

const normalizer = context.window.radioactivityImportNormalizer;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepEqual(
  plain(normalizer.getAllowedRadioactivityCandidates()),
  [
    'increased radioactivity in {}',
    'faint spot in {}',
    'cold area in {}'
  ]
);

assert.equal(
  normalizer.normalizeImportedRadioactivity('mildly increased radioactivity in {}'),
  'increased radioactivity in {}'
);
assert.equal(
  normalizer.normalizeImportedRadioactivity('markedly increased radioactivity in {}'),
  'increased radioactivity in {}'
);
assert.equal(
  normalizer.normalizeImportedRadioactivity('tiny spot in {}'),
  'faint spot in {}'
);
assert.equal(
  normalizer.normalizeImportedRadioactivity('slightly increased radioactivity in {}'),
  'faint spot in {}'
);
assert.equal(
  normalizer.normalizeImportedRadioactivity('decreased radioactivity in {}'),
  'cold area in {}'
);

assert.deepEqual(
  plain(normalizer.splitEmbeddedRadioactivity({
    lesion: 'mildly increased radioactivity in L4',
    radioactivity: ''
  })),
  {
    lesion: 'L4',
    radioactivity: 'increased radioactivity in {}'
  }
);

assert.deepEqual(
  plain(normalizer.splitEmbeddedRadioactivity({
    lesion: 'a tiny spot in lateral aspect of left 6th rib',
    radioactivity: ''
  })),
  {
    lesion: 'lateral aspect of left 6th rib',
    radioactivity: 'faint spot in {}'
  }
);

assert.deepEqual(
  plain(normalizer.splitEmbeddedRadioactivity({
    lesion: 'decreased radioactivity in T7',
    radioactivity: ''
  })),
  {
    lesion: 'T7',
    radioactivity: 'cold area in {}'
  }
);

assert.deepEqual(
  plain(normalizer.splitEmbeddedRadioactivity({
    lesion: 'cold area of left hip',
    radioactivity: ''
  })),
  {
    lesion: 'left hip',
    radioactivity: 'cold area in {}'
  }
);

console.log('radioactivityImportNormalizer regression tests passed');
