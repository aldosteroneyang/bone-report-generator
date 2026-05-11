const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(rootDir, 'extension-manifest.json'), 'utf8'));

function getReport(mciid) {
  return manifest.reports.find(report => report.mciid === mciid);
}

function getAreaMap(report) {
  return Object.fromEntries(report.areas.map(area => [area.key, {
    webnmId: area.webnmId,
    read: area.read,
    write: area.write
  }]));
}

{
  const report = getReport('9310401');
  assert.ok(report);
  assert.equal(report.name, 'Whole Body Bone Scan');
  assert.deepEqual(getAreaMap(report), {
    ClinicalHistory: { webnmId: 'area_128', read: true, write: false },
    Procedure: { webnmId: 'area_129', read: true, write: true },
    Findings: { webnmId: 'area_130', read: true, write: true },
    Impression: { webnmId: 'area_131', read: true, write: true },
    Keyword: { webnmId: 'keyword', read: true, write: true }
  });
}

{
  const report = getReport('9310409');
  assert.ok(report);
  assert.equal(report.name, 'Bone scan with SPECT');
  assert.deepEqual(getAreaMap(report), {
    ClinicalHistory: { webnmId: 'area_163', read: true, write: false },
    Procedure: { webnmId: 'area_164', read: true, write: true },
    Findings: { webnmId: 'area_165', read: true, write: true },
    Impression: { webnmId: 'area_166', read: true, write: true },
    Keyword: { webnmId: 'keyword', read: true, write: true }
  });
}

console.log('extension manifest regression tests passed');
