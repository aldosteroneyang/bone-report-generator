// previousReportAspectPreserver.js
// Uses rule-based prior-report extraction to restore rib aspect details omitted by AI.
(function initPreviousReportAspectPreserver(global) {
  const RIB_ASPECT_PATTERN = /^(?:anterior|anterolateral|lateral|posterior|posterolateral)\s+aspect\s+of\s+/i;

  function normalizeSpace(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeSpace(value).toLowerCase();
  }

  function stripRibAspectPrefix(lesion) {
    return normalizeSpace(lesion).replace(RIB_ASPECT_PATTERN, '').trim();
  }

  function hasPreservableRibAspect(lesion) {
    return RIB_ASPECT_PATTERN.test(normalizeSpace(lesion));
  }

  function isAllowedLesion(lesion, candidates) {
    if (!Array.isArray(candidates) || candidates.length === 0) return true;
    const allowed = new Set(candidates.map(normalizeKey));
    return allowed.has(normalizeKey(lesion));
  }

  function buildAspectRecordsByBaseKey(records, candidates) {
    const recordsByBaseKey = new Map();

    (records || []).forEach(record => {
      const lesion = normalizeSpace(record?.lesion || '');
      if (!lesion || !hasPreservableRibAspect(lesion) || !isAllowedLesion(lesion, candidates)) {
        return;
      }

      const baseKey = normalizeKey(stripRibAspectPrefix(lesion));
      if (!baseKey) return;
      if (!recordsByBaseKey.has(baseKey)) {
        recordsByBaseKey.set(baseKey, []);
      }
      recordsByBaseKey.get(baseKey).push(record);
    });

    return recordsByBaseKey;
  }

  function deduplicateRecords(records) {
    const deduplicated = [];
    const seen = new Set();

    (records || []).forEach(record => {
      const key = normalizeKey(record?.lesion || '');
      if (!key || seen.has(key)) return;
      seen.add(key);
      deduplicated.push(record);
    });

    return deduplicated;
  }

  function preserveAspectDetails(parsedResult, aspectSourceResult, options = {}) {
    const sourceRecords = Array.isArray(aspectSourceResult?.records) ? aspectSourceResult.records : [];
    const aspectRecordsByBaseKey = buildAspectRecordsByBaseKey(sourceRecords, options.lesionCandidates || []);

    if (aspectRecordsByBaseKey.size === 0) {
      return parsedResult;
    }

    const records = (parsedResult?.records || []).flatMap(record => {
      const lesion = normalizeSpace(record?.lesion || '');
      if (!lesion || hasPreservableRibAspect(lesion)) {
        return [record];
      }

      const aspectRecords = aspectRecordsByBaseKey.get(normalizeKey(lesion)) || [];
      if (aspectRecords.length === 0) {
        return [record];
      }

      return aspectRecords.map(aspectRecord => ({
        ...record,
        lesion: aspectRecord.lesion
      }));
    });

    return {
      ...parsedResult,
      records: deduplicateRecords(records)
    };
  }

  global.previousReportAspectPreserver = {
    preserveAspectDetails,
    stripRibAspectPrefix,
    hasPreservableRibAspect
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.previousReportAspectPreserver;
  }
})(typeof window !== 'undefined' ? window : globalThis);
