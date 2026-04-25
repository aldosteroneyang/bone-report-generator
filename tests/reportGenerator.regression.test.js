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
  'radioactivities.js',
  'changes.js',
  'lesions.js',
  'impressions.js',
  'appendices.js',
  'reportGenerator.js'
].forEach(file => {
  const filePath = path.join(rootDir, file);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
});

function reportFor(rows, examDate = '') {
  return context.window.reportGenerator.getReport(rows, examDate);
}

function lesionRow(lesion, change, impression = '', radioactivity = 'increased radioactivity in {}') {
  return [radioactivity, lesion, change, impression, '', '', '', '', ''];
}

function assertNoMalformedComparisonText(report) {
  const combinedText = `${report.textFindings}\n${report.textFindingsSeparated}`;
  assert.doesNotMatch(combinedText, /\bmildly\s+L4\b/i);
  assert.doesNotMatch(
    combinedText,
    /no more abnormally increased radioactivity in (?:mildly\s+)?increased radioactivity/i
  );
}

{
  const report = reportFor([
    ['increased radioactivity in {}', 'L3', '{}, more intense', '', '', '', '', '', ''],
    ['mildly increased radioactivity in {}', 'L4', 'no more abnormally increased radioactivity in {}', '', '', '', '', '', '']
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in L3, more intense; no more abnormally increased radioactivity in L4; in comparison with the previous study.'
  );
  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in L3.\n\nIn comparison with the previous study, this study shows more intense in L3; no more abnormally increased radioactivity in L4.'
  );
  assertNoMalformedComparisonText(report);
}

{
  const report = reportFor([
    ['mildly increased radioactivity in {}', 'L3', '{}, more intense', '', '', '', '', '', ''],
    ['mildly increased radioactivity in {}', 'L4', 'no more abnormally increased radioactivity in {}', '', '', '', '', '', '']
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows mildly increased radioactivity in L3, more intense; no more abnormally increased radioactivity in L4; in comparison with the previous study.'
  );
  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows mildly increased radioactivity in L3.\n\nIn comparison with the previous study, this study shows more intense in L3; no more abnormally increased radioactivity in L4.'
  );
  assertNoMalformedComparisonText(report);
}

{
  const report = reportFor([
    ['mildly increased radioactivity in {}', 'L4', 'complete resolution in {}', '', '', '', '', '', '']
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows complete resolution in L4 in comparison with the previous study.'
  );
  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows no abnormal increased radioactivity.\n\nIn comparison with the previous study, this study shows complete resolution in L4.'
  );
  assertNoMalformedComparisonText(report);
}

{
  const report = reportFor([
    ['mildly increased radioactivity in {}', 'L4', 'no more abnormally increased radioactivity in {}', '', '', '', '', '', ''],
    ['increased radioactivity in {}', 'L5', 'complete resolution in {}', '', '', '', '', '', '']
  ]);

  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows no abnormal increased radioactivity.\n\nIn comparison with the previous study, this study shows no more abnormally increased radioactivity in L4; complete resolution in L5.'
  );
  assertNoMalformedComparisonText(report);
}

{
  const report = reportFor([
    lesionRow(
      'C3',
      '{}, more intense',
      'Bone lesion in {}, follow-up bone scan is recommended to exclude bone metastasis.'
    ),
    lesionRow(
      'C-T spine',
      '{}, less intense',
      'Suspect traumatic insult in {}.'
    )
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in C3, more intense; C-T spine (except C3), less intense; in comparison with the previous study.'
  );
  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in C-T spine.\n\nIn comparison with the previous study, this study shows more intense in C3; less intense in C-T spine.'
  );
  assert.equal(
    report.textImpressions,
    '1. Bone lesion in C3, with progression, follow-up bone scan is recommended to exclude bone metastasis.\n2. Suspect traumatic insult in C-T spine (except C3).'
  );
}

{
  const report = reportFor([
    lesionRow('left pubis', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('bilateral pelvic bones', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.equal(
    report.textImpressions,
    'Bone lesions in left pubis, with progression; while with regression in bilateral pelvic bones (except left pubis), imaging correlation is recommended.'
  );
}

{
  const report = reportFor([
    lesionRow('C-T-L spine', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('L5', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('L2', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.equal(
    report.textImpressions,
    'Bone lesions in C-T-L spine (except L2, L5), with progression; while with regression in L2, L5, imaging correlation is recommended.'
  );
}

{
  const report = reportFor([
    lesionRow('left ribs', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('left 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in left ribs (except for left 3rd rib), more intense; left 3rd rib, less intense; in comparison with the previous study.'
  );
  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in left ribs.\n\nIn comparison with the previous study, this study shows more intense in left ribs; less intense in left 3rd rib.'
  );
  assert.equal(
    report.textImpressions,
    'Bone lesions in left ribs (except for left 3rd rib), with progression; while with regression in left 3rd rib, imaging correlation is recommended.'
  );
}

{
  const report = reportFor([
    lesionRow(
      'bilateral ribs',
      '{}, more intense',
      'Bone lesion in {}, follow-up bone scan is recommended to exclude bone metastasis.'
    ),
    lesionRow(
      'posterior aspect of right 3rd rib',
      '{}, less intense',
      'Bone lesion in {}, follow-up bone scan is recommended to exclude bone metastasis.'
    )
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in bilateral ribs (except for right 3rd rib), more intense; posterior aspect of right 3rd rib, less intense; in comparison with the previous study.'
  );
  assert.equal(
    report.textFindingsSeparated,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in bilateral ribs.\n\nIn comparison with the previous study, this study shows more intense in bilateral ribs; less intense in posterior aspect of right 3rd rib.'
  );
  assert.equal(
    report.textImpressions,
    'Bone lesions in bilateral ribs (except for right 3rd rib), with progression; while with regression in right 3rd rib, follow-up bone scan is recommended to exclude bone metastasis.'
  );
}

{
  const report = reportFor([
    lesionRow('bilateral ribs', ''),
    lesionRow('posterior aspect of right 3rd rib', '{}, less intense'),
    lesionRow('anterior aspect of right 4th rib', '{}, less intense'),
    lesionRow('anterior aspect of right 3rd rib', '{}, less intense')
  ]);

  assert.equal(
    report.textFindings,
    'Tc-99m MDP whole body bone scan shows increased radioactivity in anterior aspect of right 3rd-4th ribs, posterior aspect of right 3rd rib, less intense in comparison with the previous study.\n\nIncreased radioactivity in bilateral ribs (except for right 3rd-4th ribs) is also noted.'
  );
  assert.doesNotMatch(report.textFindingsSeparated, /\(except /);
}

{
  const report = reportFor([
    lesionRow(
      'bilateral ribs',
      '{}, more intense',
      'Bone lesion in {}, follow-up bone scan is recommended to exclude bone metastasis.'
    ),
    lesionRow(
      'posterior aspect of right 3rd rib',
      '{}, less intense',
      'Suspect traumatic insult in {}.'
    ),
    lesionRow(
      'anterior aspect of right 4th rib',
      '{}, less intense',
      'Suspect traumatic insult in {}.'
    )
  ]);

  assert.match(
    report.textFindings,
    /bilateral ribs \(except for right 3rd-4th ribs\)/
  );
  assert.doesNotMatch(report.textFindingsSeparated, /\(except /);
  assert.equal(
    report.textImpressions,
    '1. Bone lesions in bilateral ribs (except for right 3rd-4th ribs), with progression, follow-up bone scan is recommended to exclude bone metastasis.\n2. Suspect traumatic insults in right 3rd-4th ribs.'
  );
}

{
  const report = reportFor([
    lesionRow('bilateral ribs', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('posterior aspect of right 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('anterior aspect of right 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.match(report.textFindings, /bilateral ribs \(except for right 3rd rib\)/);
  assert.doesNotMatch(report.textFindings, /except (?:posterior|anterior) aspect of right 3rd rib/);
  assert.match(report.textImpressions, /bilateral ribs \(except for right 3rd rib\)/);
  assert.equal((report.textImpressions.match(/right 3rd rib/g) || []).length, 2);
  assert.doesNotMatch(report.textImpressions, /except right 3rd rib/);
  assert.doesNotMatch(report.textImpressions, /except (?:posterior|anterior) aspect of right 3rd rib/);
}

{
  const report = reportFor([
    lesionRow('left ribs', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('right 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.doesNotMatch(report.textFindings, /\(except right 3rd rib\)/);
  assert.doesNotMatch(report.textImpressions, /\(except right 3rd rib\)/);
}

{
  const report = reportFor([
    lesionRow('bilateral ribs', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('left 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('right 4th rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.match(report.textFindings, /bilateral ribs \(except for right 4th, left 3rd ribs\)/);
  assert.match(report.textImpressions, /bilateral ribs \(except for right 4th, left 3rd ribs\)/);
  assert.doesNotMatch(report.textFindingsSeparated, /\(except /);
}

{
  const report = reportFor([
    lesionRow('bilateral 3rd ribs', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('left 4th rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.doesNotMatch(report.textFindings, /\(except left 4th rib\)/);
  assert.doesNotMatch(report.textImpressions, /\(except left 4th rib\)/);
}

{
  const genericParent = reportFor([
    lesionRow('left 3rd rib', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('anterior aspect of left 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.match(genericParent.textFindings, /left 3rd rib \(except for left 3rd rib\)/);
  assert.doesNotMatch(genericParent.textFindings, /except anterior aspect of left 3rd rib/);
  assert.match(genericParent.textImpressions, /left 3rd rib \(except for left 3rd rib\)/);
  assert.doesNotMatch(genericParent.textImpressions, /except left 3rd rib/);
  assert.doesNotMatch(genericParent.textImpressions, /except anterior aspect of left 3rd rib/);

  const aspectParent = reportFor([
    lesionRow('anterior aspect of left 3rd rib', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('left 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.doesNotMatch(aspectParent.textFindings, /anterior aspect of left 3rd rib \(except left 3rd rib\)/);
  assert.doesNotMatch(aspectParent.textImpressions, /anterior aspect of left 3rd rib \(except left 3rd rib\)/);

  const differentAspect = reportFor([
    lesionRow('anterior aspect of left 3rd rib', '{}, more intense', 'Bone lesion in {}, imaging correlation is recommended.'),
    lesionRow('posterior aspect of left 3rd rib', '{}, less intense', 'Bone lesion in {}, imaging correlation is recommended.')
  ]);

  assert.doesNotMatch(differentAspect.textFindings, /\(except posterior aspect of left 3rd rib\)/);
  assert.doesNotMatch(differentAspect.textImpressions, /\(except posterior aspect of left 3rd rib\)/);
}

assert.equal(
  JSON.stringify(context.window.reportGenerator.mergeLesionsAnatomies(['left ribs', 'left 3rd rib'])),
  JSON.stringify(['left ribs'])
);

console.log('reportGenerator regression tests passed');
