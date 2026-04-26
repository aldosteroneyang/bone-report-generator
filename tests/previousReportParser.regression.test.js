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
  'lesions.js',
  'lesionCanonicalizer.js',
  'previousReportParser.js'
].forEach(file => {
  const filePath = path.join(rootDir, file);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
});

const parser = context.window.previousReportParser;

function parse(reportText) {
  return parser.parseRuleBased(reportText);
}

function lesionNames(reportText) {
  return Array.from(parse(reportText).records, record => record.lesion);
}

{
  const parsed = parse(`
Exam Date : 2026/04/24 15:37:13 ( Approved )

[Findings]
Tc-99m MDP whole body bone scan shows increased radioactivity in the right hip, newly noted; left hip, with progression; in comparison with the previous study on 2023-03-21.

[Impression]
1. No definite evidence of bone metastasis.
2. Suspect arthritis in bilateral hips. Follow-up bone scan is recommended.
`);

  assert.equal(parsed.examDate, '2026-04-24');
  assert.deepEqual(
    Array.from(parsed.records, record => record.lesion),
    ['left hip', 'right hip']
  );
}

{
  assert.deepEqual(
    lesionNames('[Findings]\nTc-99m MDP whole body bone scan shows increased radioactivity in bilateral hips and left femoral head.'),
    ['bilateral hips', 'left femoral head']
  );
}

{
  assert.deepEqual(
    lesionNames('[Findings]\nIncreased radioactivity in lateral aspect of the left 2nd, 6th ribs and anterior aspect of the right 9th and left 8th ribs.'),
    [
      'lateral aspect of left 2nd rib',
      'lateral aspect of left 6th rib',
      'anterior aspect of left 8th rib',
      'anterior aspect of right 9th rib'
    ]
  );
}

{
  assert.deepEqual(
    lesionNames('[Findings]\nIncreased radioactivity in bilateral 3rd costochondral junctions and T7-L2.'),
    [
      'T7',
      'T8',
      'T9',
      'T10',
      'T11',
      'T12',
      'L1',
      'L2',
      'bilateral 3rd costochondral junctions'
    ]
  );
}

{
  assert.deepEqual(
    lesionNames('[Findings]\nIncreased radioactivity in cervical spine, bilateral SI junctions, and left sterno-clavicular junction.'),
    ['C-spine', 'bilateral SI joints', 'left sternoclavicular joint']
  );
}

console.log('previousReportParser regression tests passed');
