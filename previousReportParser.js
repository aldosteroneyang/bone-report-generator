// previousReportParser.js
// Conservative rule-based parsing for prior bone scan reports.
(function initPreviousReportParser(global) {
  const SIDE_RE = '(?:left|right|bilateral)';
  const WORD_CHAR_RE = 'A-Za-z0-9';

  function getLesionCandidates() {
    return Array.isArray(global.lesionsCandidates) ? global.lesionsCandidates : [];
  }

  function normalizeSpace(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeLesionValue(lesion) {
    return String(lesion || '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeLesionValue(value).toLowerCase();
  }

  function normalizeDate(dateString) {
    if (!dateString || typeof dateString !== 'string') return '';
    const match = dateString.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (!match) return '';
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  function normalizeSensitiveReportLabel(label) {
    return String(label || '')
      .normalize('NFKC')
      .replace(/\s*\/\s*/g, '/')
      .replace(/[._-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isSensitiveReportLabel(label) {
    const normalizedLabel = normalizeSensitiveReportLabel(label);
    if (!normalizedLabel) return false;

    const sensitiveLabels = new Set([
      'accession no',
      'accession number',
      'patient name/id',
      'patient name',
      'patient id',
      'id no',
      'id number',
      'chart no',
      'chart number',
      'medical record no',
      'medical record number',
      'mrn',
      'national id',
      'dob',
      'date of birth',
      'birth date',
      'phone',
      'telephone',
      'mobile',
      'address',
      '姓名',
      '病歷號',
      '病歷號碼',
      '身分證',
      '身份證',
      '身分證號',
      '身份證號',
      '生日',
      '出生日期',
      '電話',
      '手機',
      '地址'
    ]);

    return sensitiveLabels.has(normalizedLabel);
  }

  function sanitizeExamDateLine(line) {
    const match = String(line || '').match(/^(\s*Exam\s+Date\s*[:：]?\s*)(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/i);
    return match ? `Exam Date : ${match[2]}` : line;
  }

  function sanitizePreviousReportText(reportText) {
    const normalized = String(reportText || '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(line => line.replace(/[ \t]+$/g, ''));

    const sanitizedLines = normalized
      .map(line => {
        const labelMatch = line.match(/^\s*([^:：]{1,80})\s*[:：]/);
        if (labelMatch && isSensitiveReportLabel(labelMatch[1])) {
          return null;
        }
        return sanitizeExamDateLine(line);
      })
      .filter(line => line !== null);

    return sanitizedLines
      .join('\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function normalizeReportInput(reportText) {
    return sanitizePreviousReportText(reportText);
  }

  function extractExamDate(reportText) {
    const examDateMatch = reportText.match(/Exam Date\s*[:：]?\s*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?/i);
    return examDateMatch ? normalizeDate(examDateMatch[1]) : '';
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildPhrasePattern(phrase) {
    const phrasePattern = normalizeLesionValue(phrase)
      .split(/\s+/)
      .map(escapeRegExp)
      .join('\\s+');
    return new RegExp(`(^|[^${WORD_CHAR_RE}])(${phrasePattern})(?=$|[^${WORD_CHAR_RE}])`, 'gi');
  }

  function getExtractionAliases() {
    const canonicalizer = global.lesionCanonicalizer;
    return typeof canonicalizer?.getExtractionAliases === 'function'
      ? canonicalizer.getExtractionAliases()
      : [];
  }

  function getSearchPhrases() {
    const seen = new Set();
    return [
      ...getLesionCandidates(),
      ...getExtractionAliases()
    ]
      .map(normalizeLesionValue)
      .filter(Boolean)
      .filter(phrase => {
        const key = normalizeKey(phrase);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => b.length - a.length);
  }

  function extractSearchPhraseLesions(text) {
    let working = ` ${normalizeSpace(text)} `;
    const lesions = [];

    getSearchPhrases().forEach(phrase => {
      working = working.replace(buildPhrasePattern(phrase), (match, prefix) => {
        lesions.push(phrase);
        return `${prefix} `;
      });
    });

    return {
      lesions,
      working
    };
  }

  function containsSearchPhrase(text) {
    const working = ` ${normalizeSpace(text)} `;
    return getSearchPhrases().some(phrase => buildPhrasePattern(phrase).test(working));
  }

  function extractFindingsSection(reportText) {
    const findingsMatch = reportText.match(/\[Findings\]([\s\S]*?)(?=\[Impression\]|\[Conclusion\]|$)/i);
    if (findingsMatch) {
      return findingsMatch[1].trim();
    }

    const labeledMatch = reportText.match(/Findings?\s*[:：]([\s\S]*?)(?=Impressions?\s*[:：]|Conclusion\s*[:：]|$)/i);
    if (labeledMatch) {
      return labeledMatch[1].trim();
    }

    const sentences = reportText
      .split(/\n+/)
      .map(line => line.trim())
      .filter(line => /(radioactivity|bone scan|Tc-99m|lesion|rib|vertebra|skull)/i.test(line) || containsSearchPhrase(line));

    return sentences.join(' ');
  }

  function expandGroupedRibPhrase(prefix, groupText, suffix) {
    const cleanedGroupText = groupText.replace(/\band\b/gi, ',');
    return cleanedGroupText
      .split(',')
      .map(part => part.trim())
      .filter(Boolean)
      .map(part => `${prefix} ${part} ${suffix}`.replace(/\s+/g, ' ').trim());
  }

  function extractGrammarLesions(text) {
    let working = ` ${normalizeSpace(text)} `;
    const lesions = [];
    const numberRange = `\\d+(?:st|nd|rd|th)?(?:[-–]\\d+(?:st|nd|rd|th)?)?`;
    const groupedNumbers = `${numberRange}(?:\\s*,\\s*${numberRange})*(?:\\s+and\\s+(?:(?:left|right|bilateral)\\s+)?${numberRange})?`;
    const structuredChunkPattern = new RegExp(
      `((?:anterior|posterior|lateral|medial|anterolateral|posterolateral|costovertebral|costochondral|costosternal)\\s+aspects?\\s+of\\s+(?:the\\s+)?)?` +
      `(?:(?:${SIDE_RE})\\s+${groupedNumbers})\\s*` +
      '(rib|ribs|costovertebral joint|costovertebral joints|costovertebral junction|costovertebral junctions|costochondral junction|costochondral junctions|costosternal joint|costosternal joints|costosternal junction|costosternal junctions)',
      'gi'
    );

    working = working.replace(structuredChunkPattern, match => {
      const aspectMatch = match.match(/^((?:anterior|posterior|lateral|medial|anterolateral|posterolateral|costovertebral|costochondral|costosternal)\s+aspects?\s+of\s+(?:the\s+)?)?/i);
      const structureMatch = match.match(/(rib|ribs|costovertebral joint|costovertebral joints|costovertebral junction|costovertebral junctions|costochondral junction|costochondral junctions|costosternal joint|costosternal joints|costosternal junction|costosternal junctions)\s*$/i);
      const aspect = aspectMatch?.[1] || '';
      const structure = structureMatch?.[1] || '';
      const singularStructure = structure.replace(/s\b/i, '');
      const pairPattern = new RegExp(`(${SIDE_RE})\\s+((?:${numberRange})(?:\\s*,\\s*${numberRange})*(?:\\s+and\\s+${numberRange})*)`, 'gi');
      let pairMatch;

      while ((pairMatch = pairPattern.exec(match)) !== null) {
        const prefix = `${aspect}${pairMatch[1]}`.replace(/\s+/g, ' ').trim();
        expandGroupedRibPhrase(prefix, pairMatch[2], singularStructure).forEach(item => lesions.push(item));
      }
      return ' ';
    });

    const vertebraPattern = /\b([CTLS]\d+(?:[-–][CTLS]?\d+)?)\b/g;
    working = working.replace(vertebraPattern, match => {
      lesions.push(match.toUpperCase().replace(/–/g, '-'));
      return ' ';
    });

    return {
      lesions,
      working
    };
  }

  function extractLesionsFromFindings(findingsText) {
    const grammarResult = extractGrammarLesions(findingsText);
    const candidateResult = extractSearchPhraseLesions(grammarResult.working);
    return [
      ...grammarResult.lesions,
      ...candidateResult.lesions
    ];
  }

  function getCandidateRank(lesion) {
    const canonicalizer = global.lesionCanonicalizer;
    if (typeof canonicalizer?.getCandidateRank === 'function') {
      return canonicalizer.getCandidateRank(lesion);
    }

    const normalizedLesion = normalizeKey(lesion);
    const candidateIndex = getLesionCandidates()
      .findIndex(candidate => normalizeKey(candidate) === normalizedLesion);

    return candidateIndex >= 0 ? candidateIndex : Number.POSITIVE_INFINITY;
  }

  function getFallbackLesionSortRank(lesion) {
    const rankRules = [
      { pattern: /skull|frontal|parietal|temporal|occipital|maxilla|mandible|mastoid|paranasal/i, rank: 10 },
      { pattern: /^(?:upper |middle |lower )?c-?spine|^[c]\d/i, rank: 20 },
      { pattern: /^(?:upper |middle |lower )?t-?spine|^[t]\d/i, rank: 30 },
      { pattern: /stern|rib|cost/i, rank: 40 },
      { pattern: /^(?:lower )?l-?spine|^[l]\d/i, rank: 50 },
      { pattern: /sacroiliac|si joint|pelvis|pelvic|sacrum|ilium|iliac|ischium|ischia|pubis|pubes|acetabul/i, rank: 60 },
      { pattern: /clavicle|scapula|shoulder|humer|elbow|radius|ulna|wrist|hand/i, rank: 70 },
      { pattern: /hip|femur|femora|knee|tibia|fibula|ankle|foot|calcane/i, rank: 80 }
    ];

    return rankRules.find(rule => rule.pattern.test(lesion))?.rank ?? 999;
  }

  function sortLesionsHeadToToe(lesions) {
    return lesions
      .map((lesion, index) => ({
        lesion,
        index,
        candidateRank: getCandidateRank(lesion),
        fallbackRank: getFallbackLesionSortRank(lesion)
      }))
      .sort((a, b) => {
        if (a.candidateRank !== b.candidateRank) return a.candidateRank - b.candidateRank;
        if (a.fallbackRank !== b.fallbackRank) return a.fallbackRank - b.fallbackRank;
        return a.index - b.index;
      })
      .map(item => item.lesion);
  }

  function canonicalizeLesionValues(lesions) {
    const canonicalizer = global.lesionCanonicalizer;
    const flattened = [];

    (lesions || []).forEach(lesion => {
      const normalized = normalizeLesionValue(lesion);
      if (!normalized) return;
      const canonicalized = typeof canonicalizer?.canonicalizeLesion === 'function'
        ? canonicalizer.canonicalizeLesion(normalized)
        : [normalized];
      canonicalized.forEach(item => {
        const normalizedItem = normalizeLesionValue(item);
        if (normalizedItem) flattened.push(normalizedItem);
      });
    });

    const deduplicated = [];
    const seen = new Set();
    flattened.forEach(lesion => {
      const key = normalizeKey(lesion);
      if (seen.has(key)) return;
      seen.add(key);
      deduplicated.push(lesion);
    });

    return sortLesionsHeadToToe(deduplicated);
  }

  function parseRuleBased(reportText) {
    const normalizedReport = normalizeReportInput(reportText);
    const findingsText = extractFindingsSection(normalizedReport);
    const lesions = canonicalizeLesionValues(extractLesionsFromFindings(findingsText));

    return {
      records: lesions.map(lesion => ({
        lesion,
        radioactivity: '',
        previousImpression: ''
      })),
      examDate: extractExamDate(normalizedReport)
    };
  }

  global.previousReportParser = {
    parseRuleBased,
    normalizeReportInput,
    normalizeDate,
    normalizeLesionValue,
    extractExamDate,
    extractFindingsSection,
    extractLesionsFromFindings,
    canonicalizeLesionValues
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.previousReportParser;
  }
})(typeof window !== 'undefined' ? window : globalThis);
