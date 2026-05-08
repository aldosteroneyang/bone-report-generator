// radioactivityImportNormalizer.js
// Normalizes AI-imported prior-report radioactivity into a small stable vocabulary.
(function initRadioactivityImportNormalizer(global) {
  const INCREASED_RADIOACTIVITY = 'increased radioactivity in {}';
  const FAINT_RADIOACTIVITY = 'faint spot in {}';
  const COLD_RADIOACTIVITY = 'cold area in {}';

  const IMPORT_RADIOACTIVITY_CANDIDATES = [
    INCREASED_RADIOACTIVITY,
    FAINT_RADIOACTIVITY,
    COLD_RADIOACTIVITY
  ];

  const INCREASED_ALIASES = [
    'increased radioactivity in {}',
    'mildly increased radioactivity in {}',
    'markedly increased radioactivity in {}',
    'focal increased radioactivity in {}',
    'focally increased radioactivity in {}',
    'heterogeneously increased radioactivity in {}',
    'band-like uptake in {}'
  ];

  const FAINT_ALIASES = [
    'faint spot in {}',
    'faint spots in {}',
    'tiny spot in {}',
    'tiny spots in {}',
    'slightly increased radioactivity in {}'
  ];

  const COLD_ALIASES = [
    'cold area in {}',
    'cold areas in {}',
    'decreased radioactivity in {}'
  ];

  function normalizeSpace(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizeKey(value) {
    return normalizeSpace(value).toLowerCase();
  }

  const aliasMap = new Map();
  [
    [INCREASED_ALIASES, INCREASED_RADIOACTIVITY],
    [FAINT_ALIASES, FAINT_RADIOACTIVITY],
    [COLD_ALIASES, COLD_RADIOACTIVITY]
  ].forEach(([aliases, standard]) => {
    aliases.forEach(alias => aliasMap.set(normalizeKey(alias), standard));
  });

  function hasNegatedMeaning(value) {
    return /\b(?:no|without|absence of|resolved|resolution of)\b/i.test(value);
  }

  function normalizeImportedRadioactivity(value) {
    const normalizedValue = normalizeKey(value);
    if (!normalizedValue || hasNegatedMeaning(normalizedValue)) {
      return '';
    }

    if (aliasMap.has(normalizedValue)) {
      return aliasMap.get(normalizedValue);
    }

    if (/\b(?:decreased radioactivity|cold areas?)\b/i.test(normalizedValue)) {
      return COLD_RADIOACTIVITY;
    }
    if (/\b(?:faint spots?|tiny spots?|slightly increased radioactivity)\b/i.test(normalizedValue)) {
      return FAINT_RADIOACTIVITY;
    }
    if (/\b(?:increased radioactivity|band[- ]like uptake)\b/i.test(normalizedValue)) {
      return INCREASED_RADIOACTIVITY;
    }

    return '';
  }

  const embeddedRadioactivityPatterns = [
    {
      radioactivity: INCREASED_RADIOACTIVITY,
      pattern: /^(?:an?\s+)?(?:mildly\s+|markedly\s+|focally\s+|focal\s+|heterogeneously\s+)?increased radioactivity\s+(?:in|of|over)\s+(?:the\s+)?/i
    },
    {
      radioactivity: INCREASED_RADIOACTIVITY,
      pattern: /^(?:an?\s+)?band[- ]like uptake\s+(?:in|of|over)\s+(?:the\s+)?/i
    },
    {
      radioactivity: FAINT_RADIOACTIVITY,
      pattern: /^(?:an?\s+)?(?:faint|tiny)\s+spots?\s+(?:in|of|over)\s+(?:the\s+)?/i
    },
    {
      radioactivity: FAINT_RADIOACTIVITY,
      pattern: /^(?:an?\s+)?slightly increased radioactivity\s+(?:in|of|over)\s+(?:the\s+)?/i
    },
    {
      radioactivity: COLD_RADIOACTIVITY,
      pattern: /^(?:an?\s+)?cold areas?\s+(?:in|of|over)\s+(?:the\s+)?/i
    },
    {
      radioactivity: COLD_RADIOACTIVITY,
      pattern: /^(?:an?\s+)?decreased radioactivity\s+(?:in|of|over)\s+(?:the\s+)?/i
    }
  ];

  function splitEmbeddedRadioactivity(record, normalizeLesion = normalizeSpace) {
    const sourceRecord = (record && typeof record === 'object') ? record : {};
    const lesion = normalizeSpace(sourceRecord.lesion || sourceRecord.location || '');
    const radioactivity = normalizeImportedRadioactivity(sourceRecord.radioactivity || '');

    if (radioactivity || !lesion) {
      return {
        lesion: normalizeLesion(lesion),
        radioactivity
      };
    }

    for (const { pattern, radioactivity: normalizedRadioactivity } of embeddedRadioactivityPatterns) {
      const match = lesion.match(pattern);
      if (match) {
        return {
          lesion: normalizeLesion(lesion.slice(match[0].length)),
          radioactivity: normalizedRadioactivity
        };
      }
    }

    return {
      lesion: normalizeLesion(lesion),
      radioactivity: ''
    };
  }

  function getAllowedRadioactivityCandidates() {
    return [...IMPORT_RADIOACTIVITY_CANDIDATES];
  }

  global.radioactivityImportNormalizer = {
    INCREASED_RADIOACTIVITY,
    FAINT_RADIOACTIVITY,
    COLD_RADIOACTIVITY,
    getAllowedRadioactivityCandidates,
    normalizeImportedRadioactivity,
    splitEmbeddedRadioactivity
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.radioactivityImportNormalizer;
  }
})(typeof window !== 'undefined' ? window : globalThis);
