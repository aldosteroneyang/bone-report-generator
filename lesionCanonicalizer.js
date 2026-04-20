// lesionCanonicalizer.js
// Canonicalizes lesion names from prior reports against lesions.js while
// preserving meaningful unmatched text.
(function initLesionCanonicalizer(global) {
  const ORDINAL_RE = '(?:st|nd|rd|th)?';
  const SIDE_RE = '(?:left|right|bilateral)';
  const VERTEBRAL_ORDER = [
    'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7',
    'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
    'L1', 'L2', 'L3', 'L4', 'L5',
    'S1'
  ];
  const RIB_ASPECTS = [
    'anterolateral',
    'posterolateral',
    'anterior',
    'posterior',
    'lateral',
    'medial'
  ];

  function getCandidates() {
    return Array.isArray(global.lesionsCandidates) ? global.lesionsCandidates : [];
  }

  function normalizeSpace(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeSpace(value)
      .replace(/\s+([,.;:])/g, '$1')
      .toLowerCase();
  }

  function createCandidateLookup() {
    const lookup = new Map();
    const rank = new Map();
    getCandidates().forEach((candidate, index) => {
      const key = normalizeKey(candidate);
      if (!lookup.has(key)) {
        lookup.set(key, candidate);
      }
      if (!rank.has(key)) {
        rank.set(key, index);
      }
    });
    return { lookup, rank };
  }

  function exactCandidate(value) {
    return createCandidateLookup().lookup.get(normalizeKey(value)) || '';
  }

  function getCandidateRank(value) {
    const rank = createCandidateLookup().rank.get(normalizeKey(value));
    return Number.isInteger(rank) ? rank : Number.POSITIVE_INFINITY;
  }

  function ordinal(number) {
    const n = Number(number);
    if (!Number.isInteger(n)) return '';
    if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
    switch (n % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  }

  function cleanupInput(value) {
    return normalizeSpace(value)
      .replace(/\bmaxiila\b/gi, 'maxilla')
      .replace(/\bpelbic\b/gi, 'pelvic')
      .replace(/\bischiu\b/gi, 'ischium')
      .replace(/\blateroposterior\b/gi, 'posterolateral')
      .replace(/\bpostero-lateral\b/gi, 'posterolateral')
      .replace(/\bantero-lateral\b/gi, 'anterolateral')
      .replace(/\s*\(\s*\d+\s*\)\s*$/g, '')
      .replace(/\bof\s+the\s+/gi, 'of ')
      .replace(/^the\s+/i, '')
      .replace(/\s+([,.;:])/g, '$1')
      .trim();
  }

  function uniqueValues(values) {
    const seen = new Set();
    const result = [];
    values.forEach(value => {
      const cleaned = cleanupInput(value);
      if (!cleaned) return;
      const key = normalizeKey(cleaned);
      if (seen.has(key)) return;
      seen.add(key);
      result.push(exactCandidate(cleaned) || cleaned);
    });
    return result;
  }

  function normalizeVertebralToken(prefix, number) {
    return `${String(prefix || '').toUpperCase()}${Number(number)}`;
  }

  function expandVertebralRange(value) {
    const text = cleanupInput(value).toUpperCase().replace(/\s+/g, '');
    const match = text.match(/^([CTLS])(\d+)(?:[-–]([CTLS])?(\d+))?$/);
    if (!match) return [];

    const start = normalizeVertebralToken(match[1], match[2]);
    if (!match[4]) {
      return exactCandidate(start) ? [start] : [];
    }

    const end = normalizeVertebralToken(match[3] || match[1], match[4]);
    const normalizedRange = `${start}-${end}`;
    if (exactCandidate(normalizedRange)) {
      return [normalizedRange];
    }

    const startIndex = VERTEBRAL_ORDER.indexOf(start);
    const endIndex = VERTEBRAL_ORDER.indexOf(end);
    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      return [normalizedRange];
    }

    return VERTEBRAL_ORDER.slice(startIndex, endIndex + 1)
      .filter(level => exactCandidate(level));
  }

  function applyDirectSynonyms(value) {
    const text = cleanupInput(value);
    const lower = text.toLowerCase();
    const direct = [
      [/^cervical spine$/, 'C-spine'],
      [/^upper cervical spine$/, 'upper C-spine'],
      [/^middle cervical spine$/, 'middle C-spine'],
      [/^lower cervical spine$/, 'lower C-spine'],
      [/^thoracic spine$/, 'T-spine'],
      [/^upper thoracic spine$/, 'upper T-spine'],
      [/^middle thoracic spine$/, 'middle T-spine'],
      [/^lumbar spine$/, 'L-spine'],
      [/^l spine$/, 'L-spine'],
      [/^lower lumbar spine$/, 'lower L-spine'],
      [/^lower l-spine$/, 'lower L-spine'],
      [/^t-l-s spine$/, 'T-L-S spine'],
      [/^bilateral maxillae$/, 'bilateral maxilla'],
      [/^maxillae$/, 'bilateral maxilla'],
      [/^bilateral maxillary areas?$/, 'bilateral maxilla'],
      [/^paranasal region$/, 'paranasal area'],
      [/^paranasal regions$/, 'bilateral paranasal areas'],
      [/^bilateral paranasal regions$/, 'bilateral paranasal areas'],
      [/^left mastoid region$/, 'left temporal mastoid process'],
      [/^right mastoid region$/, 'right temporal mastoid process'],
      [/^scapulae$/, 'bilateral scapulae'],
      [/^humeri$/, 'bilateral humeri'],
      [/^femurs$/, 'bilateral femora'],
      [/^femora$/, 'bilateral femora'],
      [/^bilateral femurs$/, 'bilateral femora'],
      [/^bilateral proximal femurs$/, 'bilateral proximal femora'],
      [/^clavicles$/, 'bilateral clavicles']
    ];

    for (const [pattern, replacement] of direct) {
      if (pattern.test(lower)) return replacement;
    }

    const mandiblePart = lower.match(/^(left|right|middle)\s+part\s+of\s+mandible$/);
    if (mandiblePart) {
      return mandiblePart[1] === 'middle' ? 'mandible' : `${mandiblePart[1]} mandible`;
    }

    const mandibleSide = lower.match(/^(left|right)\s+side\s+of\s+mandible$/);
    if (mandibleSide) {
      return `${mandibleSide[1]} mandible`;
    }

    const siMatch = lower.match(new RegExp(`^(${SIDE_RE})?\\s*(?:si|s/i|sacroiliac)\\s+(?:joint|junction)s?$`));
    if (siMatch) {
      if (!siMatch[1]) return text;
      return siMatch[1] === 'bilateral' ? 'bilateral SI joints' : `${siMatch[1]} SI joint`;
    }

    const sternoclavicular = lower.match(new RegExp(`^(${SIDE_RE})?\\s*sterno-?clavicular\\s+(?:joint|junction)s?$`));
    if (sternoclavicular) {
      if (!sternoclavicular[1]) return text.replace(/sterno-?clavicular/i, 'sternoclavicular').replace(/junction/i, 'joint');
      return sternoclavicular[1] === 'bilateral'
        ? 'bilateral sternoclavicular joints'
        : `${sternoclavicular[1]} sternoclavicular joint`;
    }

    const acromioclavicular = lower.match(new RegExp(`^(${SIDE_RE})?\\s*acro-?mioclavicular\\s+(?:joint|junction)s?$`));
    if (acromioclavicular) {
      if (!acromioclavicular[1]) return text.replace(/acro-?mioclavicular/i, 'acromioclavicular').replace(/junction/i, 'joint');
      return acromioclavicular[1] === 'bilateral'
        ? 'bilateral acromioclavicular joints'
        : `${acromioclavicular[1]} acromioclavicular joint`;
    }

    const iliacBone = lower.match(new RegExp(`^(${SIDE_RE})\\s+iliac\\s+bone?s?$`));
    if (iliacBone) {
      return iliacBone[1] === 'bilateral' ? 'bilateral ilia' : `${iliacBone[1]} ilium`;
    }

    if (lower === 'ilia') return 'bilateral ilia';
    if (lower === 'ischia') return 'bilateral ischia';

    const pubicBone = lower.match(new RegExp(`^(${SIDE_RE})\\s+pubic\\s+bone?s?$`));
    if (pubicBone) {
      return pubicBone[1] === 'bilateral' ? 'bilateral pubes' : `${pubicBone[1]} pubis`;
    }

    if (lower === 'pubic bones' || lower === 'pubes') return 'bilateral pubes';

    const acetabulum = lower.match(new RegExp(`^(${SIDE_RE})?\\s*(?:acetabulums|acetabula)$`));
    if (acetabulum) {
      if (!acetabulum[1] || acetabulum[1] === 'bilateral') return 'bilateral acetabula';
      return `${acetabulum[1]} acetabulum`;
    }

    return text;
  }

  function parseNumberRange(start, end) {
    const first = Number(start);
    const last = end ? Number(end) : first;
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first) {
      return [];
    }
    return Array.from({ length: last - first + 1 }, (_, index) => first + index);
  }

  function detectRibAspect(text) {
    const lower = text.toLowerCase();
    return RIB_ASPECTS.find(aspect => new RegExp(`\\b${aspect}\\s+aspects?\\s+of\\b`).test(lower)) || '';
  }

  function stripStructurePrefix(text) {
    const aspectPattern = RIB_ASPECTS.join('|');
    return text
      .replace(new RegExp(`^(${aspectPattern})\\s+aspects?\\s+of\\s+`, 'i'), '')
      .replace(/^the\s+/i, '')
      .trim();
  }

  function extractSideNumberPairs(prefixText) {
    const normalized = stripStructurePrefix(prefixText)
      .replace(/\band\b/gi, ',')
      .replace(/\s+/g, ' ')
      .trim();
    const pairPattern = new RegExp(`\\b(${SIDE_RE})?\\s*(\\d{1,2})${ORDINAL_RE}(?:\\s*[-–]\\s*(\\d{1,2})${ORDINAL_RE})?`, 'gi');
    const pairs = [];
    let currentSide = '';
    let match;

    while ((match = pairPattern.exec(normalized)) !== null) {
      const side = (match[1] || currentSide || '').toLowerCase();
      if (match[1]) currentSide = side;
      if (!side) continue;
      parseNumberRange(match[2], match[3]).forEach(number => {
        pairs.push({ side, number });
      });
    }

    return pairs;
  }

  function buildRibCandidate(aspect, side, number) {
    const prefix = aspect ? `${aspect} aspect of ` : '';
    if (side === 'bilateral') {
      return `${prefix}bilateral ${ordinal(number)} ribs`;
    }
    return `${prefix}${side} ${ordinal(number)} rib`;
  }

  function buildCostalCandidate(kind, side, number) {
    const ordinalNumber = ordinal(number);
    const structure = kind === 'costochondral' ? 'costochondral junction' :
      kind === 'costovertebral' ? 'costovertebral joint' :
      'costosternal joint';

    if (side === 'bilateral') {
      return `bilateral ${ordinalNumber} ${structure}s`;
    }
    return `${side} ${ordinalNumber} ${structure}`;
  }

  function expandStructuredLesion(value) {
    const text = cleanupInput(value);
    const lower = text.toLowerCase();

    const vertebral = expandVertebralRange(text);
    if (vertebral.length > 0) return vertebral;

    const costalKind = ['costochondral', 'costovertebral', 'costosternal'].find(kind => lower.includes(kind));
    if (costalKind) {
      const prefixText = text.replace(/\b(?:costochondral|costovertebral|costosternal)\s+(?:junction|junctions|joint|joints)\b/i, '').trim();
      const pairs = extractSideNumberPairs(prefixText);
      if (pairs.length === 0) return [];
      return uniqueValues(pairs.map(({ side, number }) => buildCostalCandidate(costalKind, side, number)));
    }

    if (/\bribs?\b/i.test(text)) {
      const aspect = detectRibAspect(text);
      const prefixText = text.replace(/\bribs?\b/i, '').trim();
      const pairs = extractSideNumberPairs(prefixText);
      if (pairs.length === 0) return [];
      return uniqueValues(pairs.map(({ side, number }) => buildRibCandidate(aspect, side, number)));
    }

    return [];
  }

  function canonicalizeLesion(value) {
    const original = cleanupInput(value);
    if (!original) return [];

    const exactOriginal = exactCandidate(original);
    if (exactOriginal) return [exactOriginal];

    const structuredOriginal = expandStructuredLesion(original);
    if (structuredOriginal.length > 0) return structuredOriginal;

    const synonym = applyDirectSynonyms(original);
    const exactSynonym = exactCandidate(synonym);
    if (exactSynonym) return [exactSynonym];

    const structuredSynonym = expandStructuredLesion(synonym);
    if (structuredSynonym.length > 0) return structuredSynonym;

    return [synonym || original];
  }

  function canonicalizeRecord(record) {
    const source = record && typeof record === 'object' ? record : {};
    return canonicalizeLesion(source.lesion || source.location || '').map(lesion => ({
      ...source,
      lesion
    }));
  }

  global.lesionCanonicalizer = {
    canonicalizeLesion,
    canonicalizeRecord,
    getCandidateRank,
    normalizeKey
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.lesionCanonicalizer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
