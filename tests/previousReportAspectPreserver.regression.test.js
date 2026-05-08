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
  'previousReportAspectPreserver.js'
].forEach(file => {
  const filePath = path.join(rootDir, file);
  vm.runInContext(fs.readFileSync(filePath, 'utf8'), context, { filename: filePath });
});

const preserver = context.window.previousReportAspectPreserver;

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

{
  const result = preserver.preserveAspectDetails(
    {
      examDate: '2026-05-08',
      records: [{
        lesion: 'right 5th rib',
        radioactivity: 'increased radioactivity in {}',
        previousImpression: 'probable bone metastasis'
      }]
    },
    {
      records: [{
        lesion: 'lateral aspect of right 5th rib',
        radioactivity: '',
        previousImpression: ''
      }]
    },
    { lesionCandidates: context.window.lesionsCandidates }
  );

  assert.deepEqual(plain(result.records), [{
    lesion: 'lateral aspect of right 5th rib',
    radioactivity: 'increased radioactivity in {}',
    previousImpression: 'probable bone metastasis'
  }]);
}

{
  const result = preserver.preserveAspectDetails(
    {
      records: [{
        lesion: 'left 6th rib',
        radioactivity: 'faint spot in {}',
        previousImpression: ''
      }]
    },
    {
      records: [
        { lesion: 'posterior aspect of left 6th rib' },
        { lesion: 'anterior aspect of left 6th rib' }
      ]
    },
    { lesionCandidates: context.window.lesionsCandidates }
  );

  assert.deepEqual(plain(result.records), [
    {
      lesion: 'posterior aspect of left 6th rib',
      radioactivity: 'faint spot in {}',
      previousImpression: ''
    },
    {
      lesion: 'anterior aspect of left 6th rib',
      radioactivity: 'faint spot in {}',
      previousImpression: ''
    }
  ]);
}

{
  const result = preserver.preserveAspectDetails(
    {
      records: [{
        lesion: 'right 7th rib',
        radioactivity: 'increased radioactivity in {}',
        previousImpression: ''
      }]
    },
    {
      records: [{
        lesion: 'medial aspect of right 7th rib'
      }]
    },
    { lesionCandidates: context.window.lesionsCandidates }
  );

  assert.deepEqual(plain(result.records), [{
    lesion: 'right 7th rib',
    radioactivity: 'increased radioactivity in {}',
    previousImpression: ''
  }]);
}

{
  const result = preserver.preserveAspectDetails(
    {
      records: [{
        lesion: 'posterior aspect of right 8th rib',
        radioactivity: 'increased radioactivity in {}',
        previousImpression: ''
      }]
    },
    {
      records: [{
        lesion: 'lateral aspect of right 8th rib'
      }]
    },
    { lesionCandidates: context.window.lesionsCandidates }
  );

  assert.deepEqual(plain(result.records), [{
    lesion: 'posterior aspect of right 8th rib',
    radioactivity: 'increased radioactivity in {}',
    previousImpression: ''
  }]);
}

console.log('previousReportAspectPreserver regression tests passed');
