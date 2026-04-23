// reportGenerator.js
// 骨骼掃描報告生成器
// 完全基於 Google Apps Script 版本的邏輯

// 列索引定義 - 根據實際 GUI 表格順序調整
const COLUMN_INDICES = {
  RADIOACTIVITIES: 0,
  LESIONS: 1,
  CHANGES: 2,
  IMPRESSIONS: 3,
  NOTE: 4,
  S: 5,
  I: 6,
  X: 7,
  Y: 8,
};

const APPENDIX_TRIGGER_PATTERN = /\bmay\s+indicate\b/i;

function normalizeAppendixText(value) {
  let text = String(value || '')
    .replace(/\r\n?/g, '\n')
    .replace(/\bindicates\b/gi, 'may indicate')
    .replace(/\bindicating\b/gi, 'may indicate')
    .replace(/\bmay\s+be\s+due\s+to\b/gi, 'may indicate')
    .replace(/\b(?:is|are)\s+due\s+to\b/gi, 'may indicate')
    .replace(/\b(?:is|are)\s+caused\s+by\b/gi, 'may indicate')
    .replace(/\b(?:is|are)\s+because\b/gi, 'may indicate')
    .replace(/\b(?:is|are)\s+probably\s+related\s+to\b/gi, 'may indicate')
    .replace(/\b(?:is|are)\s+consistent\s+with\b/gi, 'may indicate')
    .replace(/\bthe\s+presence\s+of\b/gi, 'presence of')
    .replace(/\bthe\b/gi, ' ')
    .replace(/^(?:a|an)\s+/i, '')
    .replace(/\s*-\s*/g, '-');

  text = normalizeGeneratedText(text);
  return /[.!?]$/.test(text) ? capitalizeFirstLetter(text) : `${capitalizeFirstLetter(text)}.`;
}

function normalizeAppendixLookupValue(value) {
  return normalizeAppendixText(value).toLowerCase().replace(/\.$/, '');
}

function getAppendixCandidateItems() {
  const root = typeof window !== 'undefined' ? window : globalThis;
  return Array.isArray(root.appendicesCandidates) ? root.appendicesCandidates : [];
}

function isAppendixLesionValue(value) {
  const normalizedValue = normalizeAppendixLookupValue(value);
  return APPENDIX_TRIGGER_PATTERN.test(normalizedValue) ||
    getAppendixCandidateItems()
      .some(candidate => normalizeAppendixLookupValue(candidate) === normalizedValue);
}

// 複數例外規則
const pluralExceptions = {
  'pubis': 'pubes',
  'radius': 'radii',
  'ulna': 'ulnae',
  'tibia': 'tibiae',
  'fibula': 'fibulae',
  'maxilla': 'maxillae',
  'sternum': 'sternum',
  'ilium': 'ilia',
  'ischium': 'ischia',
  'acetabulum': 'acetabula',
  'calcaneus': 'calcanei',
  'humerus': 'humeri',
  'femur': 'femora',
  'scapula': 'scapulae',
  'mandible': 'mandible',
  'foot': 'feet',
  'tibia/fibula': 'tibiae/fibulae',
  'radius/ulna': 'radii/ulnae',
  'acromioclavicular joint': 'acromioclavicular joints',
  'occipital bone': 'occipital bone',
  'frontal bone': 'frontal bone',
  'superior pubic ramus': 'superior pubic rami',
  'inferior pubic ramus': 'inferior pubic rami',
  'iliac crest': 'iliac crests',
  'humeral shaft': 'humeral shafts',
  'femoral shaft': 'femoral shafts',
  'ribs': 'ribs',
  'pelvic bones': 'pelvic bones',
  'sacrum': 'sacrum',
  'supraorbital area of frontal bone': 'supraorbital areas of frontal bone',
  'temporal mastoid process': 'temporal mastoid processes'
};

function applyPluralExceptions(word) {
  const lowerWord = word.toLowerCase();
  if (pluralExceptions.hasOwnProperty(lowerWord)) {
    const replacement = pluralExceptions[lowerWord];
    if (word === word.toLowerCase()) {
      return replacement.toLowerCase();
    }
    if (word === word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) {
      return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
    }
    return replacement;
  }
  return word;
}

// 位置和邊定義
const LOCATIONS = {
  VERTEBRAE: [...Array(7)].map((_, i) => `C${i + 1}`).concat(
    [...Array(12)].map((_, i) => `T${i + 1}`),
    [...Array(5)].map((_, i) => `L${i + 1}`),
    [...Array(1)].map((_, i) => `S${i + 1}`)),
  INTERVERTEBRAL: ["C1-C2", "C2-C3", "C3-C4", "C4-C5", "C5-C6", "C6-C7", "C7-T1",
    "T1-T2", "T2-T3", "T3-T4", "T4-T5", "T5-T6", "T6-T7", "T7-T8", "T8-T9", "T9-T10", "T10-T11", "T11-T12", "T12-L1",
    "L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"],
  RIBS: ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'],
  RIB_REGIONS: ['anterior', 'lateral', 'posterior', 'anterolateral', 'posterolateral', '']
};

const SIDES = {
  NONE: [''],
  BILATERAL: ['left', 'right']
};

// 解剖結構基類 - 完全按照 Google Apps Script 版本
class AnatomicalStructure {
  constructor(locations, sides, dimensionality = 1, updateRules = null) {
    this.locations = locations;
    this.sides = sides;
    this.dimensionality = dimensionality;
    this.updateRules = updateRules;
    this.structure = {};
    this.initializeStructure();
  }

  initializeStructure() {
    this.locations.forEach(location => {
      this.structure[location] = {};
      this.sides.forEach(side => {
        this.structure[location][side] = this.dimensionality === 1 ? 0 : Array(12).fill(0);
      });
    });
  }

  addLesion(location, side, position = null) {
    if (this.isValidLocation(location) && this.isValidSide(side)) {
      if (this.dimensionality === 1) {
        this.structure[location][side] += 1;
      } else if (this.dimensionality === 2 && position !== null && position >= 1 && position <= 12) {
        this.structure[location][side][position - 1] += 1;
      }
      if (this.updateRules) {
        this.applyUpdateRules(location, side, position);
      }
    } else {
      console.error('Invalid location or side');
    }
  }

  applyUpdateRules(location, side, position) {
    const locationsToUpdate = this.updateRules[location] || [];
    locationsToUpdate.forEach(loc => {
      if (this.dimensionality === 1) {
        this.structure[loc][side] += 1;
      } else if (this.dimensionality === 2 && position !== null) {
        this.structure[loc][side][position - 1] += 1;
      }
    });
  }

  getValue(location, side, position = null) {
    if (this.isValidLocation(location) && this.isValidSide(side)) {
      if (this.dimensionality === 1) {
        return this.structure[location][side];
      } else if (this.dimensionality === 2 && position !== null) {
        return this.structure[location][side][position - 1];
      }
    }
    console.error('Invalid location or side');
    return null;
  }

  getAllStructures() {
    return this.structure;
  }

  getNonZeroStructures() {
    return Object.fromEntries(
      Object.entries(this.structure).flatMap(([location, sides]) =>
        Object.entries(sides)
          .filter(([_, value]) => this.dimensionality === 1 ? value > 0 : value.some(v => v > 0))
          .map(([side, value]) => [`${location}-${side}`, value])
      )
    );
  }

  getTotalLesions() {
    return Object.values(this.structure).reduce((sum, sides) =>
      sum + Object.values(sides).reduce((sideSum, value) =>
        sideSum + (this.dimensionality === 1 ? value : value.reduce((a, b) => a + b, 0)), 0), 0
    );
  }

  getRegionStructures(region) {
    const regionMap = {
      'cervical': /^C/,
      'thoracic': /^T/,
      'lumbar': /^L/
    };

    if (!regionMap.hasOwnProperty(region)) {
      console.error('Invalid region. Use "cervical", "thoracic", or "lumbar".');
      return null;
    }

    return Object.fromEntries(
      Object.entries(this.structure)
        .filter(([key]) => regionMap[region].test(key))
        .map(([key, value]) => [key, this.sides.length === 1 ? value[''] : value])
    );
  }

  getSideStructures(side) {
    if (this.isValidSide(side)) {
      return Object.fromEntries(
        Object.entries(this.structure).map(([location, sides]) => [location, sides[side]])
      );
    }
    console.error('Invalid side');
    return null;
  }

  isValidLocation(location) {
    return this.locations.includes(location);
  }

  isValidSide(side) {
    return this.sides.includes(side);
  }

  mergedText() {
    return '';
  }

  arraysEqual(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    return arr1.every((val, index) => val === arr2[index]);
  }
}

// VertebralBodies 類 - 完全按照 Google Apps Script 版本
class VertebralBodies extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.VERTEBRAE, SIDES.NONE);
  }

  parseLocationRange(locationInput) {
    locationInput = this.expandShorthandNotation(locationInput);

    if (!locationInput.includes('-')) {
      return [locationInput];
    }

    const [start, end] = locationInput.split('-');
    const startIndex = this.locations.indexOf(start);
    const endIndex = this.locations.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      console.error(`Invalid location range: ${locationInput}; startIndex: ${startIndex}; endIndex: ${endIndex}`);
      return [];
    }

    return this.locations.slice(startIndex, endIndex + 1);
  }

  expandShorthandNotation(input) {
    const match = input.match(/^([CLT])(\d+)-(\d+)$/);
    if (match) {
      const [, prefix, start, end] = match;
      return `${prefix}${start}-${prefix}${end}`;
    }
    return input;
  }

  addLesion(locationInput, side, position = null) {
    const locations = this.parseLocationRange(locationInput);
    
    locations.forEach(location => {
      if (this.isValidLocation(location)) {
        super.addLesion(location, side, position);
      } else {
        console.error(`Invalid location: ${location}`);
      }
    });
  }

  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locations = Object.keys(nonZero).map(key => key.split('-')[0]);
    const lesionCount = locations.length;
    
    if (lesionCount === 0) {
      return "";
    }
    
    const groupedLocations = this.groupConsecutiveLocations(locations);
    const formattedLocations = groupedLocations.map(group => {
      if (group.length === 1) {
        return group[0];
      } else {
        return `${group[0]}-${group[group.length - 1]}`;
      }
    });
    
    return `${lesionCount > 1 ? 'vertebral bodies' : 'vertebral body'} of ${formattedLocations.join(', ')}`;
  }

  groupConsecutiveLocations(locations) {
    const sorted = locations.sort((a, b) => {
      const aMatch = a.match(/([CLT])(\d+)/);
      const bMatch = b.match(/([CLT])(\d+)/);
      if (aMatch[1] !== bMatch[1]) {
        return aMatch[1].localeCompare(bMatch[1]);
      }
      return parseInt(aMatch[2]) - parseInt(bMatch[2]);
    });

    const groups = [];
    let currentGroup = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const prev = sorted[i - 1];
      
      const currentMatch = current.match(/([CLT])(\d+)/);
      const prevMatch = prev.match(/([CLT])(\d+)/);
      
      if (currentMatch[1] === prevMatch[1] && 
          parseInt(currentMatch[2]) === parseInt(prevMatch[2]) + 1) {
        currentGroup.push(current);
      } else {
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }
    
    groups.push(currentGroup);
    return groups;
  }
}

// Endplates 類 - 完全按照 Google Apps Script 版本
class Endplates extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.INTERVERTEBRAL, SIDES.NONE);
  }

  expandShorthandNotation(input) {
    const match = input.match(/^([CLT])(\d+)-(\d+)$/);
    if (match) {
      const [, prefix, start, end] = match;
      return `${prefix}${start}-${prefix}${end}`;
    }
    return input;
  }

  addLesion(locationInput, side, position = null) {
    locationInput = this.expandShorthandNotation(locationInput);
    const [start, end] = locationInput.split('-');
    
    const vertebrae = LOCATIONS.VERTEBRAE;
    const startIndex = vertebrae.indexOf(start);
    const endIndex = vertebrae.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      console.error(`Invalid location range: ${locationInput}; startIndex: ${startIndex}; endIndex: ${endIndex}`);
      return;
    }

    for (let i = startIndex; i < endIndex; i++) {
      const intervertebral = `${vertebrae[i]}-${vertebrae[i+1]}`;
      if (this.isValidLocation(intervertebral)) {
        super.addLesion(intervertebral, side, position);
      }
    }
  }

  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locations = Object.keys(nonZero).map(key => key.split('-')[0]);
    
    if (locations.length === 0) {
      return "";
    }

    const groupedLocations = this.groupConsecutiveLocations(locations);
    const formattedLocations = groupedLocations.map(group => {
      if (group.length === 1) {
        return `${group[0]}-${this.getNextVertebra(group[0])}`;
      } else {
        return `${group[0]}-${this.getNextVertebra(group[group.length - 1])}`;
      }
    });

    return `endplates of ${formattedLocations.join(', ')}`;
  }

  groupConsecutiveLocations(locations) {
    const sorted = locations.sort((a, b) => {
      const aMatch = a.match(/([CLT])(\d+)/);
      const bMatch = b.match(/([CLT])(\d+)/);
      if (aMatch[1] !== bMatch[1]) {
        return aMatch[1].localeCompare(bMatch[1]);
      }
      return parseInt(aMatch[2]) - parseInt(bMatch[2]);
    });

    const groups = [];
    let currentGroup = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const prev = sorted[i - 1];
      
      if (this.getNextVertebra(prev) === current) {
        currentGroup.push(current);
      } else {
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }
    
    groups.push(currentGroup);
    return groups;
  }

  getNextVertebra(vertebra) {
    const match = vertebra.match(/([CLT])(\d+)/);
    if (match) {
      const [, prefix, number] = match;
      const nextNumber = parseInt(number) + 1;
      if (prefix === 'C' && nextNumber > 7) {
        return 'T1';
      } else if (prefix === 'T' && nextNumber > 12) {
        return 'L1';
      } else if (prefix === 'L' && nextNumber > 5) {
        return 'S1';
      }
      return `${prefix}${nextNumber}`;
    }
    return null;
  }
}

// FacetJoints 類 - 完全按照 Google Apps Script 版本
class FacetJoints extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.INTERVERTEBRAL, SIDES.BILATERAL);
  }

  expandShorthandNotation(input) {
    const match = input.match(/^([CLT])(\d+)-(\d+)$/);
    if (match) {
      const [, prefix, start, end] = match;
      return `${prefix}${start}-${prefix}${end}`;
    }
    return input;
  }

  addLesion(locationInput, side, position = null) {
    locationInput = this.expandShorthandNotation(locationInput);
    const [start, end] = locationInput.split('-');
    
    const vertebrae = LOCATIONS.VERTEBRAE;
    const startIndex = vertebrae.indexOf(start);
    const endIndex = vertebrae.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
      console.error(`Invalid location range: ${locationInput}; startIndex: ${startIndex}; endIndex: ${endIndex}`);
      return;
    }

    for (let i = startIndex; i < endIndex; i++) {
      const intervertebral = `${vertebrae[i]}-${vertebrae[i+1]}`;
      if (this.isValidLocation(intervertebral)) {
        if (side === 'bilateral' || side === '') {
          super.addLesion(intervertebral, 'left', position);
          super.addLesion(intervertebral, 'right', position);
        } else {
          super.addLesion(intervertebral, side, position);
        }
      }
    }
  }
  
  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locationsBySide = { left: [], right: [] };
    for (const [key, value] of Object.entries(nonZero)) {
      const side = key.includes('-right') ? 'right' : 'left';
      const location = key.replace('-right', '').replace('-left', '');
      if (side === 'left' || side === 'right') {
        locationsBySide[side].push(location);
      }
    }

    const { left, right } = locationsBySide;
    if (left.length === 0 && right.length === 0) {
      return '';
    }

    const mergeLocations = (locations) => {
      const sorted = locations.sort();
      const merged = [];
      let current = sorted[0];
      let isMerged = false;
      for (let i = 1; i < sorted.length; i++) {
        const [currentStart, currentEnd] = current.split('-');
        const [nextStart, nextEnd] = sorted[i].split('-');
        if (currentEnd === nextStart) {
          current = `${currentStart}-${nextEnd}`;
          isMerged = true;
        } else {
          merged.push(current);
          current = sorted[i];
        }
      }
      merged.push(current);
      return { merged, isMerged };
    };

    const { merged: mergedLeft, isMerged: leftMerged } = mergeLocations(left);
    const { merged: mergedRight, isMerged: rightMerged } = mergeLocations(right);

    if (this.arraysEqual(mergedLeft.sort(), mergedRight.sort())) {
      return `bilateral facet joint${mergedLeft.length > 1 || leftMerged ? 's' : ''} of ${mergedLeft.join(', ')}`;
    }
    
    const parts = [];
    if (mergedRight.length > 0) {
      parts.push(`right facet joint${mergedRight.length > 1 || rightMerged ? 's' : ''} of ${mergedRight.join(', ')}`);
    }
    if (mergedLeft.length > 0) {
      parts.push(`left facet joint${mergedLeft.length > 1 || leftMerged ? 's' : ''} of ${mergedLeft.join(', ')}`);
    }
    const filteredParts = parts.filter(part => !part.endsWith('of '));
    return filteredParts.join(', ');
  }
}

// CostochondralJunctions 類 - 完全按照 Google Apps Script 版本
class CostochondralJunctions extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.RIBS, SIDES.BILATERAL);
  }

  expandRibRange(start, end) {
    const ribIndices = LOCATIONS.RIBS.map(rib => parseInt(rib.match(/\d+/)[0]));
    const startIndex = ribIndices.indexOf(parseInt(start.match(/\d+/)[0]));
    const endIndex = ribIndices.indexOf(parseInt(end.match(/\d+/)[0]));

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      console.error(`Invalid rib range: ${start}-${end}`);
      return [];
    }

    return LOCATIONS.RIBS.slice(startIndex, endIndex + 1);
  }

  addLesion(locationInput, side, position = null) {
    const [start, end] = locationInput.split('-');
    const ribs = end ? this.expandRibRange(start, end) : [start];

    ribs.forEach(rib => {
      if (this.isValidLocation(rib)) {
        if (side === 'bilateral' || side === '') {
          super.addLesion(rib, 'left', position);
          super.addLesion(rib, 'right', position);
        } else {
          super.addLesion(rib, side, position);
        }
      } else {
        console.error(`Invalid rib: ${rib}`);
      }
    });
  }

  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locationsBySide = { left: [], right: [] };
    for (const [key, value] of Object.entries(nonZero)) {
      const [location, side] = key.split('-');
      if (side === 'left' || side === 'right') {
        locationsBySide[side].push(location);
      }
    }

    const mergeLocations = (locations) => {
      const sorted = locations.sort((a, b) => {
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
      });
      const merged = [];
      let start = sorted[0];
      let current = start;
      for (let i = 1; i < sorted.length; i++) {
        const currentNum = parseInt(current.match(/\d+/)[0]);
        const nextNum = parseInt(sorted[i].match(/\d+/)[0]);
        if (nextNum === currentNum + 1) {
          current = sorted[i];
        } else {
          merged.push(start === current ? start : `${start.split(' ')[0]}-${current}`);
          start = sorted[i];
          current = sorted[i];
        }
      }
      merged.push(start === current ? start : `${start.split(' ')[0]}-${current}`);
      return locations.length > 0 ? merged : [];
    };

    const { left, right } = locationsBySide;
    if (left.length === 0 && right.length === 0) {
      return '';
    }
    const mergedLeft = mergeLocations(left);
    const mergedRight = mergeLocations(right);

    if (this.arraysEqual(mergedLeft.sort(), mergedRight.sort()) && mergedLeft.length > 0) {
      return `bilateral ${mergedLeft.join(', ')} costochondral junctions`;
    }
    
    const parts = [];
    if (mergedRight.length > 0) {
      parts.push(`right ${mergedRight.join(', ')}`);
    }
    if (mergedLeft.length > 0) {
      parts.push(`left ${mergedLeft.join(', ')}`);
    }

    return `${parts.join(', ')} costochondral junction${left.length + right.length > 1 ? 's' : ''}`;
  }
}

// CostovertebralJoints 類 - 完全按照 Google Apps Script 版本
class CostovertebralJoints extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.RIBS, SIDES.BILATERAL);
  }

  expandRibRange(start, end) {
    const ribIndices = LOCATIONS.RIBS.map(rib => parseInt(rib.match(/\d+/)[0]));
    const startIndex = ribIndices.indexOf(parseInt(start.match(/\d+/)[0]));
    const endIndex = ribIndices.indexOf(parseInt(end.match(/\d+/)[0]));

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      console.error(`Invalid rib range: ${start}-${end}`);
      return [];
    }

    return LOCATIONS.RIBS.slice(startIndex, endIndex + 1);
  }

  addLesion(locationInput, side, position = null) {
    const [start, end] = locationInput.split('-');
    const ribs = end ? this.expandRibRange(start, end) : [start];

    ribs.forEach(rib => {
      if (this.isValidLocation(rib)) {
        if (side === 'bilateral' || side === '') {
          super.addLesion(rib, 'left', position);
          super.addLesion(rib, 'right', position);
        } else {
          super.addLesion(rib, side, position);
        }
      } else {
        console.error(`Invalid rib: ${rib}`);
      }
    });
  }

  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locationsBySide = { left: [], right: [] };
    for (const [key, value] of Object.entries(nonZero)) {
      const [location, side] = key.split('-');
      if (side === 'left' || side === 'right') {
        locationsBySide[side].push(location);
      }
    }

    const mergeLocations = (locations) => {
      const sorted = locations.sort((a, b) => {
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
      });
      const merged = [];
      let start = sorted[0];
      let current = start;
      for (let i = 1; i < sorted.length; i++) {
        const currentNum = parseInt(current.match(/\d+/)[0]);
        const nextNum = parseInt(sorted[i].match(/\d+/)[0]);
        if (nextNum === currentNum + 1) {
          current = sorted[i];
        } else {
          merged.push(start === current ? start : `${start.split(' ')[0]}-${current}`);
          start = sorted[i];
          current = sorted[i];
        }
      }
      merged.push(start === current ? start : `${start.split(' ')[0]}-${current}`);
      return locations.length > 0 ? merged : []
    };

    const { left, right } = locationsBySide;
    if (left.length === 0 && right.length === 0) {
      return '';
    }

    const mergedLeft = mergeLocations(left);
    const mergedRight = mergeLocations(right);

    if (this.arraysEqual(mergedLeft.sort(), mergedRight.sort()) && mergedLeft.length > 0) {
      return `bilateral ${mergedLeft.join(', ')} costovertebral joints`;
    }
    
    const parts = [];
    if (mergedRight.length > 0) {
      parts.push(`right ${mergedRight.join(', ')}`);
    }
    if (mergedLeft.length > 0) {
      parts.push(`left ${mergedLeft.join(', ')}`);
    }
    return `${parts.join(', ')} costovertebral joint${left.length + right.length > 1 ? 's' : ''}`;
  }
}

// CostosternalJoints 類 - 完全按照 Google Apps Script 版本
class CostosternalJoints extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.RIBS, SIDES.BILATERAL);
  }

  expandRibRange(start, end) {
    const ribIndices = LOCATIONS.RIBS.map(rib => parseInt(rib.match(/\d+/)[0]));
    const startIndex = ribIndices.indexOf(parseInt(start.match(/\d+/)[0]));
    const endIndex = ribIndices.indexOf(parseInt(end.match(/\d+/)[0]));

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      console.error(`Invalid rib range: ${start}-${end}`);
      return [];
    }

    return LOCATIONS.RIBS.slice(startIndex, endIndex + 1);
  }

  addLesion(locationInput, side, position = null) {
    const [start, end] = locationInput.split('-');
    const ribs = end ? this.expandRibRange(start, end) : [start];

    ribs.forEach(rib => {
      if (this.isValidLocation(rib)) {
        if (side === 'bilateral' || side === '') {
          super.addLesion(rib, 'left', position);
          super.addLesion(rib, 'right', position);
        } else {
          super.addLesion(rib, side, position);
        }
      } else {
        console.error(`Invalid rib: ${rib}`);
      }
    });
  }

  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locationsBySide = { left: [], right: [] };
    for (const [key, value] of Object.entries(nonZero)) {
      const [location, side] = key.split('-');
      if (side === 'left' || side === 'right') {
        locationsBySide[side].push(location);
      }
    }

    const mergeLocations = (locations) => {
      const sorted = locations.sort((a, b) => {
        return parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]);
      });
      const merged = [];
      let start = sorted[0];
      let current = start;
      for (let i = 1; i < sorted.length; i++) {
        const currentNum = parseInt(current.match(/\d+/)[0]);
        const nextNum = parseInt(sorted[i].match(/\d+/)[0]);
        if (nextNum === currentNum + 1) {
          current = sorted[i];
        } else {
          merged.push(start === current ? start : `${start.split(' ')[0]}-${current}`);
          start = sorted[i];
          current = sorted[i];
        }
      }
      merged.push(start === current ? start : `${start.split(' ')[0]}-${current}`);
      return locations.length > 0 ? merged : []
    };

    const { left, right } = locationsBySide;
    if (left.length === 0 && right.length === 0) {
      return '';
    }

    const mergedLeft = mergeLocations(left);
    const mergedRight = mergeLocations(right);

    if (this.arraysEqual(mergedLeft.sort(), mergedRight.sort()) && mergedLeft.length > 0) {
      return `bilateral ${mergedLeft.join(', ')} costosternal joints`;
    }
    
    const parts = [];
    if (mergedRight.length > 0) {
      parts.push(`right ${mergedRight.join(', ')}`);
    }
    if (mergedLeft.length > 0) {
      parts.push(`left ${mergedLeft.join(', ')}`);
    }
    return `${parts.join(', ')} costosternal joint${left.length + right.length > 1 ? 's' : ''}`;
  }
}

// Ribs 類 - 完全按照 Google Apps Script 版本
class Ribs extends AnatomicalStructure {
  constructor() {
    const updateRules = {
      'anterior': ['anterior', 'anterolateral', ''],
      'lateral': ['lateral', 'anterolateral', 'posterolateral', ''],
      'posterior': ['posterior', 'posterolateral', ''],
      'anterolateral': ['anterolateral', ''],
      'posterolateral': ['posterolateral', ''],
      '': ['']
    };
    super(LOCATIONS.RIB_REGIONS, SIDES.BILATERAL, 2, updateRules);
  }

  get DESCRIPTION_ORDER() {
    return ['', 'anterior', 'anterolateral', 'lateral', 'posterolateral', 'posterior'];
  }

  get BILATERAL_LOCATIONS() {
    return ['anterior', 'posterior', 'lateral'];
  }

  addLesion(location, side, ribNumber) {
    if (this.isValidLocation(location) && this.isValidSide(side) && ribNumber >= 1 && ribNumber <= 12) {
      const locationsToUpdate = this.updateRules[location] || [];
      locationsToUpdate.forEach(loc => {
        this.structure[loc][side][ribNumber - 1] += 1;
      });
    } else {
      console.error('Invalid add parameters');
    }
  }

  parseRibRange(start, end = null) {
    const startNum = this.parseRibNumber(start);
    const endNum = end ? this.parseRibNumber(end) : startNum;
    return Array.from({length: endNum - startNum + 1}, (_, i) => startNum + i);
  }

  parseRibNumber(rib) {
    if (typeof rib === 'number') {
      return rib;
    }
    const match = rib.match(/(\d+)(?:st|nd|rd|th)?/);
    return match ? parseInt(match[1]) : NaN;
  }

  mergedText() {
    let descriptions = [];
    let usedRibs = new Set();

    let generalLesions = this.getGeneralLesions();
    if (generalLesions.length > 0) {
      descriptions.push(this.formatGeneralLesions(generalLesions));
      generalLesions.forEach(rib => usedRibs.add(`${rib.side}-${rib.number}`));
    }

    if (this.shouldUseAnterolateral() && this.shouldUsePosterolateral()) {
          let anterolateralRibs = this.combineAnterolateralLesions();
    let posterolateralRibs = this.combinePosterolateralLesions();

      anterolateralRibs = this.filterUsedRibs(anterolateralRibs, usedRibs);
      posterolateralRibs = this.filterUsedRibs(posterolateralRibs, usedRibs);

      if (anterolateralRibs.length > 0) {
        descriptions.push(this.formatAspectDescription('anterolateral', anterolateralRibs));
        this.markRibsAsUsed(anterolateralRibs, usedRibs);
      }
      if (posterolateralRibs.length > 0) {
        descriptions.push(this.formatAspectDescription('posterolateral', posterolateralRibs));
        this.markRibsAsUsed(posterolateralRibs, usedRibs);
      }
    } else if (this.shouldUseAnterolateral()) {
      let anterolateralRibs = this.combineAnterolateralLesions();
      let posteriorRibs = this.combineRibs('posterior');

      anterolateralRibs = this.filterUsedRibs(anterolateralRibs, usedRibs);
      posteriorRibs = this.filterUsedRibs(posteriorRibs, usedRibs);

      if (anterolateralRibs.length > 0) {
        descriptions.push(this.formatAspectDescription('anterolateral', anterolateralRibs));
        this.markRibsAsUsed(anterolateralRibs, usedRibs);
      }
      if (posteriorRibs.length > 0) {
        descriptions.push(this.formatAspectDescription('posterior', posteriorRibs));
        this.markRibsAsUsed(posteriorRibs, usedRibs);
      }
    } else if (this.shouldUsePosterolateral()) {
      let anteriorRibs = this.combineRibs('anterior');
      let posterolateralRibs = this.combinePosterolateralLesions();

      anteriorRibs = this.filterUsedRibs(anteriorRibs, usedRibs);
      posterolateralRibs = this.filterUsedRibs(posterolateralRibs, usedRibs);

      if (anteriorRibs.length > 0) {
        descriptions.push(this.formatAspectDescription('anterior', anteriorRibs));
        this.markRibsAsUsed(anteriorRibs, usedRibs);
      }
      if (posterolateralRibs.length > 0) {
        descriptions.push(this.formatAspectDescription('posterolateral', posterolateralRibs));
        this.markRibsAsUsed(posterolateralRibs, usedRibs);
      }
    } else {
      let locations = ['anterior', 'lateral', 'posterior'];
      locations.forEach(location => {
        let ribs = this.combineRibs(location);
        if (ribs.length > 0) {
          descriptions.push(this.formatAspectDescription(location, ribs));
        }
      });
    }

    return this.combineDescriptions(descriptions);
  }

  combineAnterolateralLesions() {
    let combined = [];
    ['left', 'right'].forEach(side => {
      this.structure['anterolateral'][side].forEach((value, index) => {
        let count = Math.max(
          value,
          this.structure['anterior'][side][index],
          this.structure['lateral'][side][index],
          this.structure['anterolateral'][side][index]
        );
        if (count > 0) {
          combined.push({ side, number: index + 1, count });
        }
      });
    });
    return combined;
  }

  combinePosterolateralLesions() {
    let combined = [];
    ['left', 'right'].forEach(side => {
      this.structure['posterolateral'][side].forEach((value, index) => {
        let count = Math.max(
          value,
          this.structure['posterior'][side][index],
          this.structure['lateral'][side][index],
          this.structure['posterolateral'][side][index]
        );
        if (count > 0) {
          combined.push({ side, number: index + 1, count });
        }
      });
    });
    return combined;
  }

  filterUsedRibs(ribs, usedRibs) {
    return ribs.filter(rib => !usedRibs.has(`${rib.side}-${rib.number}`));
  }

  markRibsAsUsed(ribs, usedRibs) {
    ribs.forEach(rib => usedRibs.add(`${rib.side}-${rib.number}`));
  }

  formatAspectDescription(aspect, ribs) {
    let ribsDescription = this.formatRibsWithSides(ribs);
    let ribWord = ribs.length > 1 || (ribs[0].start !== ribs[0].end) ? 'ribs' : 'rib';
    return `${aspect} aspect of ${ribsDescription} ${ribWord}`;
  }

  formatLocations(locations) {
    return `${formatSeries(locations)} aspect${locations.length > 1 ? 's' : ''}`;
  }

  getGeneralLesions() {
    let generalLesions = [];
    ['left', 'right'].forEach(side => {
      this.structure[''][side].forEach((value, index) => {
        if (value > 0 &&
          value > (this.structure['anterolateral'][side][index] + this.structure['posterior'][side][index]) &&
          value > (this.structure['anterior'][side][index] + this.structure['posterolateral'][side][index])) {
          generalLesions.push({ side, number: index + 1, count: value, start: index + 1, end: index + 1 });
        }
      });
    });
    return generalLesions;
  }

  shouldUseAnterolateral() {
    return ['left', 'right'].some(side =>
      this.structure['anterolateral'][side].some((value, index) =>
        value > (this.structure['anterior'][side][index] + this.structure['lateral'][side][index])
      )
    );
  }

  shouldUsePosterolateral() {
    return ['left', 'right'].some(side =>
      this.structure['posterolateral'][side].some((value, index) =>
        value > (this.structure['posterior'][side][index] + this.structure['lateral'][side][index])
      )
    );
  }

  combineRibs(location) {
    let combined = [];
    ['left', 'right'].forEach(side => {
      this.structure[location][side].forEach((value, index) => {
        if (value > 0) {
          let existingRib = combined.find(rib => rib.side === side && rib.number === index + 1);
          if (existingRib) {
            existingRib.count += value;
          } else {
            combined.push({ side, number: index + 1, count: value });
          }
        }
      });
    });
    return combined;
  }

  formatGeneralLesions(lesions) {
    let formattedRibs = this.formatRibsWithSides(lesions);
    let ribWord = lesions.length > 1 ? 'ribs' : 'rib';
    return `${formattedRibs} ${ribWord}`;
  }

  formatRibsWithSides(ribs) {
    let leftRibs = ribs.filter(rib => rib.side === 'left').map(rib => ({ number: rib.number, count: rib.count }));
    let rightRibs = ribs.filter(rib => rib.side === 'right').map(rib => ({ number: rib.number, count: rib.count }));

    let isBilateral = JSON.stringify(leftRibs) === JSON.stringify(rightRibs);

    if (isBilateral && leftRibs.length > 0) {
      return `bilateral ${this.formatRibNumbers(leftRibs)}`;
    } else {
      let description = [];
      if (rightRibs.length > 0) {
        description.push(`right ${this.formatRibNumbers(rightRibs)}`);
      }
      if (leftRibs.length > 0) {
        description.push(`left ${this.formatRibNumbers(leftRibs)}`);
      }
      return description.join(', ');
    }
  }

  formatRibNumbers(ribs) {
    let groups = [];
    let current = null;
    
    ribs.sort((a, b) => a.number - b.number).forEach(rib => {
      if (!current || rib.number !== current.end + 1) {
        current = { start: rib.number, end: rib.number, count: rib.count };
        groups.push(current);
      } else {
        current.end = rib.number;
        current.count = Math.max(current.count, rib.count);
      }
    });

    return groups.map(group => {
      let ribDesc = group.start === group.end ? 
        this.getOrdinal(group.start) : 
        `${this.getOrdinal(group.start)}-${this.getOrdinal(group.end)}`;
      return group.count > 1 ? `${ribDesc} (${group.count})` : ribDesc;
    }).join(', ');
  }

  formatRib(rib) {
    return `${this.getOrdinal(rib.number)}${rib.count > 1 ? ` (${rib.count})` : ''}`;
  }

  combineDescriptions(descriptions) {
    let combinedDescriptions = {};

    descriptions.forEach(desc => {
      let match = desc.match(/^(\w+(?:\s+\w+)*) aspect of (.+)$/);
      if (match) {
        let [_, aspect, ribDesc] = match;
        if (combinedDescriptions[ribDesc]) {
          combinedDescriptions[ribDesc].push(aspect);
        } else {
          combinedDescriptions[ribDesc] = [aspect];
        }
      } else {
        combinedDescriptions[desc] = null;
      }
    });

    let finalDescriptions = [];
    for (let [ribDesc, aspects] of Object.entries(combinedDescriptions)) {
      if (aspects === null) {
        finalDescriptions.push(ribDesc);
      } else if (aspects.length > 1) {
        finalDescriptions.push(`${this.formatAspects(aspects)} aspects of ${ribDesc}`);
      } else {
        finalDescriptions.push(`${aspects[0]} aspect of ${ribDesc}`);
      }
    }

    if (finalDescriptions.length === 1) {
      return finalDescriptions[0];
    }
    return formatSeries(finalDescriptions);
  }

  formatAspects(aspects) {
    return formatSeries(aspects);
  }

  getOrdinal(n) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]);
  }

  isBilateral() {
    return Object.keys(this.structure).every(location =>
      this.arraysEqual(this.structure[location]['left'], this.structure[location]['right'])
    );
  }

  arraysEqual(arr1, arr2) {
    return arr1.every((val, index) => val === arr2[index]);
  }
}

// VertebralLevels 類 - 完全按照 Google Apps Script 版本
class VertebralLevels extends AnatomicalStructure {
  constructor() {
    super(LOCATIONS.VERTEBRAE.concat(LOCATIONS.INTERVERTEBRAL), SIDES.NONE);
  }

  parseLocationRange(locationInput) {
    locationInput = this.expandShorthandNotation(locationInput);

    if (!locationInput.includes('-')) {
      return [locationInput];
    }

    const [start, end] = locationInput.split('-');
    
    if (this.isValidLocation(locationInput)) {
      return [locationInput];
    }

    const startIndex = this.locations.indexOf(start);
    const endIndex = this.locations.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) {
      console.error(`Invalid location range: ${locationInput}; startIndex: ${startIndex}; endIndex: ${endIndex}`);
      return [];
    }

    return this.locations.slice(startIndex, endIndex + 1);
  }

  expandShorthandNotation(input) {
    const match = input.match(/^([CLT])(\d+)-(\d+)$/);
    if (match) {
      const [, prefix, start, end] = match;
      return `${prefix}${start}-${prefix}${end}`;
    }
    return input;
  }

  addLesion(locationInput, side, position = null) {
    const locations = this.parseLocationRange(locationInput);
    
    locations.forEach(location => {
      if (this.isValidLocation(location)) {
        super.addLesion(location, side, position);
      } else {
        console.error(`Invalid location: ${location}`);
      }
    });
  }

  mergedText() {
    const nonZero = this.getNonZeroStructures();
    const locations = Object.keys(nonZero).map(key => key.replace(/-$/, ''));
    const sortedLocations = locations.sort(this.compareLocations);
    
    let result = [];
    let currentGroup = [];

    for (let i = 0; i < sortedLocations.length; i++) {
      const current = sortedLocations[i];
      const next = sortedLocations[i + 1];

      if (current.includes('-')) {
        this.addGroupToResult(currentGroup, result);
        result.push(current);
        currentGroup = [];
      } else {
        if (currentGroup.length === 0 || this.isConsecutive(currentGroup[currentGroup.length - 1], current)) {
          currentGroup.push(current);
        } else {
          this.addGroupToResult(currentGroup, result);
          currentGroup = [current];
        }

        if (!next || !this.isConsecutive(current, next)) {
          this.addGroupToResult(currentGroup, result);
          currentGroup = [];
        }
      }
    }

    return result.join(', ');
  }

  addGroupToResult(group, result) {
    if (group.length >= 2) {
      result.push(`${group[0]}-${group[group.length - 1]}`);
    } else if (group.length === 1) {
      result.push(group[0]);
    }
  }

  isConsecutive(a, b) {
    const prefixOrder = { 'C': 1, 'T': 2, 'L': 3, 'S': 4 };
    const aPrefix = a.charAt(0);
    const bPrefix = b.charAt(0);
    const aNum = parseInt(a.match(/\d+/)[0]);
    const bNum = parseInt(b.match(/\d+/)[0]);

    if (aPrefix === bPrefix) {
      return bNum - aNum === 1;
    } else {
      return prefixOrder[bPrefix] - prefixOrder[aPrefix] === 1 && 
            ((aPrefix === 'C' && aNum === 7 && bNum === 1) ||
              (aPrefix === 'T' && aNum === 12 && bNum === 1) ||
              (aPrefix === 'L' && aNum === 5 && bNum === 1));
    }
  }

  compareLocations(a, b) {
    const prefixOrder = { 'C': 1, 'T': 2, 'L': 3, 'S': 4 };
    
    const aPrefix = a.charAt(0);
    const bPrefix = b.charAt(0);
    if (aPrefix !== bPrefix) {
      return prefixOrder[aPrefix] - prefixOrder[bPrefix];
    }
    const aNum = parseInt(a.match(/\d+/)[0]);
    const bNum = parseInt(b.match(/\d+/)[0]);
    if (aNum !== bNum) return aNum - bNum;
    return a.length - b.length;
  }
}

// 輔助函數 - 完全按照 Google Apps Script 版本
function capitalizeFirstLetter(str) {
  if (!str || str.length === 0) return str;
  
  if (/^[a-zA-Z]/.test(str)) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  return str;
}

function formatSeries(items, separator = ', ') {
  const normalizedItems = (items || [])
    .filter(item => item != null && item !== '')
    .map(item => `${item}`.trim())
    .filter(Boolean);

  if (normalizedItems.length === 0) return '';
  if (normalizedItems.length === 1) return normalizedItems[0];
  return normalizedItems.join(separator);
}

function hasMultipleEnumeratedItems(text) {
  const normalizedText = `${text || ''}`.toLowerCase();
  return [
    ',',
    '; ',
    'ribs',
    'spots',
    'lesions',
    'areas',
    'bodies',
    'joints',
    'junctions',
    'bones',
    'bilateral',
    'fractures',
    'insults',
    'metastases',
    'sinuses',
    'processes'
  ].some(token => normalizedText.includes(token));
}

function normalizeGeneratedText(text) {
  return `${text || ''}`
    .split('\n')
    .map(line => line
      .replace(/\s+/g, ' ')
      .replace(/\bthe\s+the\b/gi, 'the')
      .replace(/,\s*,+/g, ', ')
      .replace(/,\s*;/g, '; ')
      .replace(/;\s*,/g, '; ')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/,\s*\./g, '.')
      .replace(/;\s*\./g, '.')
      .replace(/:\s*\./g, '.')
      .trim()
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const NEGATIVE_IMPRESSION_TEXT = 'No definite evidence of bone metastasis.';

function stripImpressionNumber(line) {
  return normalizeGeneratedText(line).replace(/^\d+\.\s*/, '');
}

function formatImpressionItems(items) {
  const normalizedItems = (items || [])
    .map(stripImpressionNumber)
    .filter(Boolean);

  if (normalizedItems.length === 0) return '';
  if (normalizedItems.length === 1) return normalizedItems[0];

  return normalizeGeneratedText(
    normalizedItems.map((item, index) => `${index + 1}. ${item}`).join('\n')
  );
}

function stripGenericRadioactivityPrefix(text) {
  return `${text || ''}`.replace(/^increased radioactivity in (?:the )?/i, '');
}

function getFindingsChangeGroup(change) {
  const normalizedChange = `${change || ''}`.toLowerCase();
  if (normalizedChange.includes('newly')) return 'new';
  if (normalizedChange.includes('while')) return 'mixed';
  if (normalizedChange.includes('more intense') || normalizedChange.includes('more extended')) return 'progression';
  if (
    normalizedChange.includes('resolution') ||
    normalizedChange.includes('no more')
  ) {
    return 'resolution';
  }
  if (
    normalizedChange.includes('less intense') ||
    normalizedChange.includes('less extended')
  ) {
    return 'regression';
  }
  if (normalizedChange.includes('stationary') || normalizedChange.includes('without apparent change')) return 'stationary';
  return normalizedChange;
}

function shallowCopyRow(row) {
  return Array.isArray(row) ? [...row] : row;
}

function getAppendixText(appendices, lesionIndex) {
  return (appendices || [])
    .filter(row => row && row[lesionIndex] != null && String(row[lesionIndex]).trim() !== '')
    .map(row => normalizeAppendixText(row[lesionIndex]))
    .join('\n');
}

function appendAppendixText(baseText, appendixText) {
  return [baseText, appendixText]
    .filter(text => String(text || '').trim() !== '')
    .join('\n\n');
}

function mergeLesions(lesions, separator=', ') {
  return formatSeries(lesions, separator);
}

const COMPLETE_SPINE_RANGES = {
  'c-spine': ['C1', 'C7'],
  't-spine': ['T1', 'T12'],
  'l-spine': ['L1', 'L5'],
  'c-t spine': ['C1', 'T12'],
  't-l spine': ['T1', 'L5'],
  'l-s spine': ['L1', 'S1'],
  'c-t-l spine': ['C1', 'L5'],
  't-l-s spine': ['T1', 'S1'],
  'c-t-l-s spine': ['C1', 'S1']
};

function getCompleteSpineRange(lesion) {
  const key = String(lesion || '').trim().replace(/\s+/g, ' ').toLowerCase();
  return COMPLETE_SPINE_RANGES[key] || null;
}

function expandSimpleVertebralLesion(lesion) {
  const text = String(lesion || '').trim().toUpperCase().replace(/\s+/g, '');
  const match = text.match(/^([CTLS])(\d+)(?:-([CTLS])?(\d+))?$/);
  if (!match) return [];

  const start = `${match[1]}${Number(match[2])}`;
  const end = match[4] ? `${match[3] || match[1]}${Number(match[4])}` : start;
  const startIndex = LOCATIONS.VERTEBRAE.indexOf(start);
  const endIndex = LOCATIONS.VERTEBRAE.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || startIndex > endIndex) return [];

  return LOCATIONS.VERTEBRAE.slice(startIndex, endIndex + 1);
}

function spineRangeContainsLevels(spineRange, levels) {
  if (!spineRange || levels.length === 0) return false;

  const startIndex = LOCATIONS.VERTEBRAE.indexOf(spineRange[0]);
  const endIndex = LOCATIONS.VERTEBRAE.indexOf(spineRange[1]);
  return startIndex !== -1 && endIndex !== -1 && levels.every(level => {
    const levelIndex = LOCATIONS.VERTEBRAE.indexOf(level);
    return levelIndex >= startIndex && levelIndex <= endIndex;
  });
}

function filterCoveredSimpleVertebralLesions(lesions) {
  const completeSpineRanges = lesions
    .map(getCompleteSpineRange)
    .filter(Boolean);

  if (completeSpineRanges.length === 0) return lesions;

  return lesions.filter(lesion => {
    if (getCompleteSpineRange(lesion)) return true;

    const levels = expandSimpleVertebralLesion(lesion);
    if (levels.length === 0) return true;

    return !completeSpineRanges.some(spineRange => spineRangeContainsLevels(spineRange, levels));
  });
}

// 合併病灶解剖結構 - 完全按照 Google Apps Script 版本
function mergeLesionsAnatomies(lesions) {
  lesions = filterCoveredSimpleVertebralLesions(lesions);

  let newLesions = [];
  let ribs = new Ribs();
  let vertebralBodies = new VertebralBodies();
  let vertebralLevels = new VertebralLevels();
  let endplates = new Endplates();
  let facetJoints = new FacetJoints();
  let costochondralJunctions = new CostochondralJunctions();
  let costovertebralJoints = new CostovertebralJoints();
  let costosternalJoints = new CostosternalJoints();
  let bilaterRibsReduction = false;
  let rightRibsReduction = false;
  let leftRibsReduction = false;

  let lateralLesions = {};
  let bilateralLesions = new Set();

  function simplePluralize(word) {
    const specialPlural = applyPluralExceptions(word.toLowerCase());
    if (specialPlural !== word.toLowerCase()) {
      return word.charAt(0).toUpperCase() + specialPlural.slice(1);
    }
    return word + 's';
  }

  lesions.forEach(lesion => { 
    if (lesion.includes('rib')) {
      if (!newLesions.includes('{ribs}')) {
        newLesions.push('{ribs}')
      }
      let aspect = LOCATIONS.RIB_REGIONS
        .filter(i => ` ${lesion}`.includes(` ${i}`))
        .reduce((longest, current) => current.length > longest.length ? current : longest, '');
      let side = ['left', 'right', 'bilateral'].filter(i => lesion.includes(i));

      side = side.length > 0 ? side[side.length - 1] : '';

      const ribMatch = lesion.match(/(\d+)(?:st|nd|rd|th)?(?:-(\d+)(?:st|nd|rd|th)?)?/);
      if (ribMatch) {
        const start = parseInt(ribMatch[1]);
        const end = ribMatch[2] ? parseInt(ribMatch[2]) : start;
        
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= 12) {
            if (side === '') {
              bilaterRibsReduction = true;
            } else if (side === 'bilateral') {
              ribs.addLesion(aspect, 'left', i);
              ribs.addLesion(aspect, 'right', i);
            } else {
              ribs.addLesion(aspect, side, i);
            }
          }
        }
      } else {
        if (side === '') {
          bilaterRibsReduction = true;
        } else if (side === 'left') {
          leftRibsReduction = true;
        } else if (side === 'right') {
          rightRibsReduction = true;
        } else {
          bilaterRibsReduction = true;
        }
      }
    } else if (lesion.includes('vertebral bod')) {
      if (!newLesions.includes('{vertebralBodies}')) {
        newLesions.push('{vertebralBodies}');
      }
      const match = lesion.match(/([CTLS])(\d+)(?:-([CTLS])?(\d+))?/);
      if (match) {
        const startPrefix = match[1];
        const startNumber = match[2];
        const endPrefix = match[3] || startPrefix;
        const endNumber = match[4] || startNumber;
        vertebralBodies.addLesion(`${startPrefix}${startNumber}-${endPrefix}${endNumber}`, "");
      }
    } else if (lesion.includes('endplate')) {
      if (!newLesions.includes('{endplates}')) {
        newLesions.push('{endplates}')
      }
      const match = lesion.match(/([CTLS])(\d+)(?:-([CTLS])?(\d+))?/);
      if (match) {
        const startPrefix = match[1];
        const startNumber = match[2];
        const endPrefix = match[3] || startPrefix;
        const endNumber = match[4] || startNumber;
        endplates.addLesion(`${startPrefix}${startNumber}-${endPrefix}${endNumber}`, "");
      }
    } else if (lesion.includes('facet')) {
      if (!newLesions.includes('{facetJoints}')) {
        newLesions.push('{facetJoints}')
      }
      const match = lesion.match(/([CTLS])(\d+)(?:-([CTLS])?(\d+))?/);
      let side = ['left', 'right', 'bilateral'].find(s => lesion.includes(s)) || 'bilateral';
      if (match) {
        const startPrefix = match[1];
        const startNumber = match[2];
        const endPrefix = match[3] || startPrefix;
        const endNumber = match[4] || startNumber;
        facetJoints.addLesion(`${startPrefix}${startNumber}-${endPrefix}${endNumber}`, side);
      }
    } else if (lesion.includes('costochondral')) {
      if (!newLesions.includes('{costochondralJunctions}')) {
        newLesions.push('{costochondralJunctions}')
      }
      const match = lesion.match(/(\d+)(?:st|nd|rd|th)?(?:-(\d+)(?:st|nd|rd|th)?)?/);
      let side = ['left', 'right', 'bilateral'].find(s => lesion.includes(s)) || 'bilateral';
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : start;
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= 12) {
            costochondralJunctions.addLesion(i + getOrdinalSuffix(i), side);
          }
        }
      }
    } else if (lesion.includes('costovertebral')) {
      if (!newLesions.includes('{costovertebralJoints}')) {
        newLesions.push('{costovertebralJoints}')
      }
      const match = lesion.match(/(\d+)(?:st|nd|rd|th)?(?:-(\d+)(?:st|nd|rd|th)?)?/);
      let side = ['left', 'right', 'bilateral'].find(s => lesion.includes(s)) || 'bilateral';
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : start;
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= 12) {
            costovertebralJoints.addLesion(i + getOrdinalSuffix(i), side);
          }
        }
      }
    } else if (lesion.includes('costosternal')) {
      if (!newLesions.includes('{costosternalJoints}')) {
        newLesions.push('{costosternalJoints}')
      }
      const match = lesion.match(/(\d+)(?:st|nd|rd|th)?(?:-(\d+)(?:st|nd|rd|th)?)?/);
      let side = ['left', 'right', 'bilateral'].find(s => lesion.includes(s)) || 'bilateral';
      if (match) {
        const start = parseInt(match[1]);
        const end = match[2] ? parseInt(match[2]) : start;
        for (let i = start; i <= end; i++) {
          if (i >= 1 && i <= 12) {
            costosternalJoints.addLesion(i + getOrdinalSuffix(i), side);
          }
        }
      }
    } else if (lesion.match(/^[CTLS]\d+(-[CTLS]?\d+)?$/)) {
      if (!newLesions.includes('{vertebralLevels}')) {
        newLesions.push('{vertebralLevels}');
      }
      const expandedLesion = vertebralLevels.expandShorthandNotation(lesion);
      vertebralLevels.addLesion(expandedLesion, "");
    } else {
      let side = ['left', 'right'].find(s => lesion.toLowerCase().includes(s));
      if (side) {
        let baseLesion = lesion.replace(new RegExp(side, 'i'), '').trim();
        if (lateralLesions[baseLesion]) {
          if (lateralLesions[baseLesion].side !== side) {
            let index = newLesions.indexOf(lateralLesions[baseLesion].original);
            if (index !== -1) {
              let pluralBaseLesion = simplePluralize(baseLesion);
              let bilateralLesion = 'bilateral ' + pluralBaseLesion;
              
              if (baseLesion === baseLesion.toLowerCase()) {
                bilateralLesion = bilateralLesion.toLowerCase();
              }
              
              newLesions[index] = bilateralLesion;
              bilateralLesions.add(bilateralLesion.toLowerCase());
            }
            lateralLesions[baseLesion].side = 'bilateral';
          }
        } else {
          lateralLesions[baseLesion] = { side: side, original: lesion };
          newLesions.push(lesion);
        }
      } else if (lesion.toLowerCase().includes('bilateral')) {
        bilateralLesions.add(lesion.toLowerCase());
        newLesions.push(lesion);
      } else {
        newLesions.push(lesion);
      }
    }
  });

  bilaterRibsReduction = rightRibsReduction && leftRibsReduction ? true : bilaterRibsReduction;
  if (newLesions.includes('{ribs}')) {
    newLesions[newLesions.indexOf('{ribs}')] = bilaterRibsReduction ? 'bilateral ribs' : (
      rightRibsReduction ? 'right ribs' : (
        leftRibsReduction ? 'left ribs' : ribs.mergedText()
      )
    );
  }  
  if (newLesions.includes('{vertebralBodies}')) {
    newLesions[newLesions.indexOf('{vertebralBodies}')] = vertebralBodies.mergedText();
  } 
  if (newLesions.includes('{endplates}')) {
    newLesions[newLesions.indexOf('{endplates}')] = endplates.mergedText();
  } 
  if (newLesions.includes('{facetJoints}')) {
    newLesions[newLesions.indexOf('{facetJoints}')] = facetJoints.mergedText();
  } 
  if (newLesions.includes('{costochondralJunctions}')) {
    newLesions[newLesions.indexOf('{costochondralJunctions}')] = costochondralJunctions.mergedText();
  } 
  if (newLesions.includes('{costovertebralJoints}')) {
    newLesions[newLesions.indexOf('{costovertebralJoints}')] = costovertebralJoints.mergedText();
  } 
  if (newLesions.includes('{vertebralLevels}')) {
    newLesions[newLesions.indexOf('{vertebralLevels}')] = vertebralLevels.mergedText();
  } 
  if (newLesions.includes('{costosternalJoints}')) {
    newLesions[newLesions.indexOf('{costosternalJoints}')] = costosternalJoints.mergedText();
  } 
  
  let processedBilateral = new Set();
  newLesions = newLesions.filter((lesion, index) => {
    let words = lesion.split(' ');
    words = words.map(word => {
      return simplePluralize(word);
    });
    lesion = words.join(' ');

    if (bilateralLesions.has(lesion.toLowerCase())) {
      if (processedBilateral.has(lesion.toLowerCase())) {
        return false;
      }
      processedBilateral.add(lesion.toLowerCase());
    }
    return true;
  });
  return newLesions;
}

// 輔助函數：獲取序數後綴
function getOrdinalSuffix(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'st';
  if (n % 10 === 2 && n % 100 !== 12) return 'nd';
  if (n % 10 === 3 && n % 100 !== 13) return 'rd';
  return 'th';
}

// 分割肋骨描述 - 完全按照 Google Apps Script 版本
function splitRibDescriptions(input) {
  const regex = /\b(left|right|bilateral)\b\s*((?:\d+(?:st|nd|rd|th)(?:-\d+(?:st|nd|rd|th))?(?:,\s*)?)+)/gi;
  const results = [];
  let match;

  while ((match = regex.exec(input)) !== null) {
    const direction = match[1].toLowerCase();
    const ribDescriptions = match[2].split(/,\s*/).filter(Boolean);

    for (let ribDesc of ribDescriptions) {
      if (direction === 'bilateral') {
        results.push(`left ${ribDesc.trim()}`);
        results.push(`right ${ribDesc.trim()}`);
      } else {
        results.push(`${direction} ${ribDesc.trim()}`);
      }
    }
  }

  results.sort((a, b) => {
    if (a.startsWith('left') && b.startsWith('right')) return -1;
    if (a.startsWith('right') && b.startsWith('left')) return 1;
    return 0;
  });

  return results;
}

// 獲取分類病灶 - 完全按照 Google Apps Script 版本
function getClassifiedLesions(lesions, categories) {
  const indices = categories.reduce((acc, category) => {
    acc[category] = COLUMN_INDICES[category];
    return acc;
  }, {});

  function classifyLesions(lesions, categories) {
    return lesions.reduce((acc, lesion) => {
      let current = acc;
      categories.forEach((category, index) => {
        const value = lesion[indices[category]] || '';
        if (index === categories.length - 1) {
          if (!current[value]) current[value] = '';
        } else {
          if (!current[value]) current[value] = {};
          current = current[value];
        }
      });
      return acc;
    }, {});
  }

  return classifyLesions(lesions, categories);
}

// 組裝項目 - 完全按照 Google Apps Script 版本
function assembleItems(classifiedLesions, categories) {
  const [CATEGORY1, CATEGORY2, CATEGORY3] = categories;
  
  // 獲取變更字典
  function getChangeDict() {
    const changeDict = {};
    const mappingTable = Object.entries(window.changesCandidates || {}).filter(([key, value]) => key !== '' && value !== null);
    mappingTable.forEach(([key, value]) => {
      changeDict[key] = value;
    });
    return changeDict;
  }
  
  const changeDict = getChangeDict();

  // 獲取排序值
  const sortingValues = categories.reduce((acc, category) => {
    acc[category] = category === 'RADIOACTIVITIES' ? window.radioactivitiesCandidates || [] :
                   category === 'LESIONS' ? window.lesionsCandidates || [] :
                   category === 'CHANGES' ? Object.keys(window.changesCandidates || {}) :
                   category === 'IMPRESSIONS' ? window.impressionsCandidates || [] : [];
    return acc;
  }, {});

  function sortByOrder(obj, category) {
    const order = sortingValues[category];
    return Object.keys(obj).sort((a, b) => {
      let placeholders = {'a': a, 'b': b};
      if (category == 'LESIONS') {
        Object.keys(placeholders).forEach(key => {
          if (placeholders[key].match(/^[CTLS]\d+(-[CTLS]?\d+)?$/) && placeholders[key].includes('-')) {
            placeholders[key] = placeholders[key].split('-')[0];
          } else if (placeholders[key].includes('rib')) {
            placeholders[key] = 'bilateral ribs';
          } else if (placeholders[key].includes('vertebral bod')) {
            placeholders[key] = 'vertebral body of C1';
          } else if (placeholders[key].includes('endplate')) {
            placeholders[key] = 'endplates of C1-C2';
          } else if (placeholders[key].includes('facet')) {
            placeholders[key] = 'bilateral facet joints of C1-C2';
          } else if (placeholders[key].includes('costochondral')) {
            placeholders[key] = 'bilateral 1st costochondral junctions';
          } else if (placeholders[key].includes('costovertebral')) {
            placeholders[key] = 'bilateral 1st costovertebral joints';
          } else if (placeholders[key].includes('costosternal')) {
            placeholders[key] = 'bilateral 1st costosternal joints';
          }
        })              
      }

      const indexA = order.indexOf(placeholders['a']);
      const indexB = order.indexOf(placeholders['b']);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }

  let items = {};

  for (const category1 of sortByOrder(classifiedLesions, CATEGORY1)) {
    const dictCategory1 = classifiedLesions[category1];
    let category1Items = [];

    for (const category2 of sortByOrder(dictCategory1, CATEGORY2)) {
      const lesions = dictCategory1[category2];
      
      // 合併 lesions
      const mergedLesions = mergeLesions(mergeLesionsAnatomies(sortByOrder(lesions, CATEGORY3)), ', ')

      // 處理 CATEGORY2 為 'CHANGES' 的特殊情況
      let processedCategory2;
      if (CATEGORY2 === 'CHANGES') {
        if (category2 === '') {
                          processedCategory2 = '{}';
              } else {
                processedCategory2 = changeDict?.[category2] ?? category2;
              }
            } else {
              processedCategory2 = category2;
            }
        
            // 替換 processedCategory2 中的 {}
            let mergedCategory2 = (processedCategory2 || '').replace('{}', mergedLesions);

      category1Items.push(mergedCategory2);
    }

    // 合併該 category1 下的所有 items
    category1Items.forEach((x, i) => {
      category1Items[i] = hasMultipleEnumeratedItems(x)
      ? x.replace('area ', 'areas ').replace('spot ', 'spots ').replace('lesion ', 'lesions ')
      : x
    })
    if (category1Items.some(x => ['newly', 'progression',].some(y => x.includes(y)) && (!x.includes('while')))) {
      for (let index = 0; index < category1Items.length; index++) {
        const item = category1Items[index];
        const regressionMatch = item.match(/, with (mild )?regression/);
        if (regressionMatch) {
          category1Items[index] = `while with ${regressionMatch[1] || ''}regression in ` + item.replace(regressionMatch[0], '');
          break;
        } else if (item.includes(', almost complete resolution')) {
          category1Items[index] = 'while almost complete resolution in ' + item.replace(', almost complete resolution', '');
          break;
        }
      }
    }

    items[category1] = mergeLesions(category1Items, '; ');
  }

  return items;
}

// 主要報告生成函數 - 完全按照 Google Apps Script 版本
function getReport(tableData, examDate) {
  const { LESIONS, RADIOACTIVITIES, CHANGES, IMPRESSIONS } = COLUMN_INDICES;
  const comparisonReference = examDate
    ? `in comparison with the previous study on ${examDate}`
    : 'in comparison with the previous study';
  
  // GUI 版本的資料處理邏輯 - 第1行就是數據，不是標題行
  const recordsValues = tableData;
  const startRow = 1; // GUI 中第1行就是實際數據
  const endRow = recordsValues.length;

  // 使用 reduce 操作來過濾和分類數據 - 完全按照 Google Apps Script 版本
  const result = recordsValues.slice(startRow - 1, endRow).reduce((acc, row, index) => {
    // 在 Web 環境中需要處理 null/undefined 轉換為空字串的情況
    const lesionValue = row[LESIONS];
    const radioactivityValue = row[RADIOACTIVITIES];
    if (lesionValue != null && String(lesionValue).trim() !== '') {
      acc.selected.push(row);
      if (isAppendixLesionValue(lesionValue) || radioactivityValue == null || String(radioactivityValue).trim() === '') {
        acc.appendices.push(row);
      } else {
        acc.lesions.push(row);
      }
    }
    return acc;
  }, { selected: [], lesions: [], appendices: [] });

  // 如果沒有有效數據，返回預設報告
  if (result.selected.length === 0) {
    return {
      textFindings: 'Tc-99m MDP whole body bone scan shows no abnormal increased radioactivity.',
      textFindingsBeta: 'Tc-99m MDP whole body bone scan shows no abnormal increased radioactivity.',
      textFindingsSeparated: 'Tc-99m MDP whole body bone scan shows no abnormal increased radioactivity.',
      textImpressions: formatImpressionItems([NEGATIVE_IMPRESSION_TEXT]),
      textImpressionsNegative: formatImpressionItems([NEGATIVE_IMPRESSION_TEXT])
    };
  }

  const appendixText = getAppendixText(result.appendices, LESIONS);

  if (result.lesions.length === 0) {
    const defaultFindings = normalizeGeneratedText(appendAppendixText(
      'Tc-99m MDP whole body bone scan shows no abnormal increased radioactivity.',
      appendixText
    ));
    return {
      textFindings: defaultFindings,
      textFindingsBeta: defaultFindings,
      textFindingsSeparated: defaultFindings,
      textImpressions: formatImpressionItems([NEGATIVE_IMPRESSION_TEXT]),
      textImpressionsNegative: formatImpressionItems([NEGATIVE_IMPRESSION_TEXT])
    };
  }

  // 處理病灶副本以便分離 rib 描述等 - 完全按照 Google Apps Script 版本
  let resultLesionsCopy = [];
  result.lesions.forEach(row => {
    // 在 Web 環境中處理可能的 null 值
    if (!row[LESIONS] || typeof row[LESIONS] !== 'string') {
      resultLesionsCopy.push(shallowCopyRow(row));
      return;
    }
    
    const matchRib = row[LESIONS].match(/(.*?)\b(left|right|bilateral)(?:.*?\b(?:left|right|bilateral))?\b(.*?)\brib(.*)/i);
    const matchCostovertebralJoint = row[LESIONS].match(/(.*?)\b(left|right|bilateral)(?:.*?\b(?:left|right|bilateral))?\b(.*?)\bcostovertebral joint(.*)/i);
    const matchCostochondralJunction = row[LESIONS].match(/(.*?)\b(left|right|bilateral)(?:.*?\b(?:left|right|bilateral))?\b(.*?)\bcostochondral junction(.*)/i);
    const matchVertebralBody = row[LESIONS].match(/(.*?)\bvertebral bod(?:y|ies) of\s+(.*)/i);
    const matchEndplates = row[LESIONS].match(/(.*?)\bendplate(?:s)? of\s+(.*)/i);
    const matchFacetJoint = row[LESIONS].match(/(.*?)\b(left|right|bilateral)\s+facet joint(?:s)? of\s+(.*)/i);
    const matchCostosternalJoint = row[LESIONS].match(/(.*?)\b(left|right|bilateral)(?:.*?\b(?:left|right|bilateral))?\b(.*?)\bcostosternal joint(.*)/i);

    if (!row[LESIONS].includes(',')) {
      resultLesionsCopy.push(shallowCopyRow(row));
    }
    else if (matchRib) {
      const prefix = matchRib[1].trim();
      const suffix = 'rib' + matchRib[4];
      const directionMatches = row[LESIONS].match(/\b(left|right|bilateral)\b\s*((?:\d+(?:st|nd|rd|th)(?:-\d+(?:st|nd|rd|th))?(?:,\s*)?)+)/gi) || [];
      directionMatches.forEach(match => {
        const [direction, description] = match.split(/\s+(.+)/);
        splitRibDescriptions(`${direction} ${description}`).forEach(x => {
          let rowCurrent = [...row];
          rowCurrent[LESIONS] = `${prefix} ${x} ${suffix}`.trim();
          resultLesionsCopy.push(rowCurrent);
        });
      });
    } else if (matchCostovertebralJoint) {
      const prefix = matchCostovertebralJoint[1].trim();
      const suffix = 'costovertebral joint' + matchCostovertebralJoint[4];
      const directionMatches = row[LESIONS].match(/\b(left|right|bilateral)\b\s*((?:\d+(?:st|nd|rd|th)(?:-\d+(?:st|nd|rd|th))?(?:,\s*)?)+)/gi) || [];
      directionMatches.forEach(match => {
        const [direction, description] = match.split(/\s+(.+)/);
        splitRibDescriptions(`${direction} ${description}`).forEach(x => {
          let rowCurrent = [...row];
          rowCurrent[LESIONS] = `${prefix} ${x} ${suffix}`.trim();
          resultLesionsCopy.push(rowCurrent);
        });
      });
    } else if (matchCostochondralJunction) {
      const prefix = matchCostochondralJunction[1].trim();
      const suffix = 'costochondral junction' + matchCostochondralJunction[4];
      const directionMatches = row[LESIONS].match(/\b(left|right|bilateral)\b\s*((?:\d+(?:st|nd|rd|th)(?:-\d+(?:st|nd|rd|th))?(?:,\s*)?)+)/gi) || [];
      directionMatches.forEach(match => {
        const [direction, description] = match.split(/\s+(.+)/);
        splitRibDescriptions(`${direction} ${description}`).forEach(x => {
          let rowCurrent = [...row];
          rowCurrent[LESIONS] = `${prefix} ${x} ${suffix}`.trim();
          resultLesionsCopy.push(rowCurrent);
        });
      });
    } else if (matchVertebralBody) {
      const prefix = matchVertebralBody[1].trim();
      const vertebralDescriptions = matchVertebralBody[2].split(',').map(s => s.trim());
      
      vertebralDescriptions.forEach(description => {
        let rowCurrent = [...row];
        rowCurrent[LESIONS] = `${prefix} vertebral ${description.includes('-') ? 'bodies' : 'body'} of ${description}`.trim();
        resultLesionsCopy.push(rowCurrent);
      });
    } else if (matchEndplates) {
      const prefix = matchEndplates[1].trim();
      const endplateDescriptions = matchEndplates[2].split(',').map(s => s.trim());
      
      endplateDescriptions.forEach(description => {
        let rowCurrent = [...row];
        rowCurrent[LESIONS] = `${prefix} endplate${description.includes('-') ? 's' : ''} of ${description}`.trim();
        resultLesionsCopy.push(rowCurrent);
      });
    } else if (matchFacetJoint) {
      const prefix = matchFacetJoint[1].trim();
      const direction = matchFacetJoint[2].toLowerCase();
      const facetDescriptions = matchFacetJoint[3].split(',').map(s => s.trim());
      
      facetDescriptions.forEach(description => {
        let rowCurrent = [...row];
        const isPlural = description.includes('-') || facetDescriptions.length > 1;
        rowCurrent[LESIONS] = `${prefix} ${direction} facet joint${isPlural ? 's' : ''} of ${description}`.trim();
        resultLesionsCopy.push(rowCurrent);
      });
    } else if (matchCostosternalJoint) {
      const prefix = matchCostosternalJoint[1].trim();
      const suffix = 'costosternal joint' + matchCostosternalJoint[4];
      const directionMatches = row[LESIONS].match(/\b(left|right|bilateral)\b\s*((?:\d+(?:st|nd|rd|th)(?:-\d+(?:st|nd|rd|th))?(?:,\s*)?)+)/gi) || [];
      directionMatches.forEach(match => {
        const [direction, description] = match.split(/\s+(.+)/);
        splitRibDescriptions(`${direction} ${description}`).forEach(x => {
          let rowCurrent = [...row];
          rowCurrent[LESIONS] = `${prefix} ${x} ${suffix}`.trim();
          resultLesionsCopy.push(rowCurrent);
        });
      });
    } else {
      resultLesionsCopy.push(shallowCopyRow(row))
    }
  });

  result.lesions = resultLesionsCopy

  let assembleFindings = assembleItems(getClassifiedLesions(result.lesions, ['CHANGES', 'RADIOACTIVITIES', 'LESIONS']), ['CHANGES', 'RADIOACTIVITIES', 'LESIONS']);
  const lesionsWithoutChanges = result.lesions.map(row => [...row.slice(0, CHANGES), '', ...row.slice(CHANGES + 1)]);
  const assembleRadioactivitiesSeparated = assembleItems(
    getClassifiedLesions(lesionsWithoutChanges, ['CHANGES', 'RADIOACTIVITIES', 'LESIONS']),
    ['CHANGES', 'RADIOACTIVITIES', 'LESIONS']
  );
  const lesionsWithGenericRadioactivity = result.lesions.map(
    row => [...row.slice(0, RADIOACTIVITIES), 'increased radioactivity in {}', ...row.slice(RADIOACTIVITIES + 1)]
  );
  const assembleChangesSeparated = assembleItems(
    getClassifiedLesions(lesionsWithGenericRadioactivity, ['CHANGES', 'RADIOACTIVITIES', 'LESIONS']),
    ['CHANGES', 'RADIOACTIVITIES', 'LESIONS']
  );

  let changesFindings = Object.keys(assembleFindings)

  let previousLastRadioactivity = '';
  let radioactivities = (window.radioactivitiesCandidates || []).map(x => x.replace("{}", "").trim());

  changesFindings.filter(x => x != "").forEach(key => {
    let currentRadioactivities = radioactivities.filter(radioactivity => assembleFindings[key].includes(radioactivity));
    if (currentRadioactivities.at(0) == previousLastRadioactivity) {
      assembleFindings[key] = assembleFindings[key].replace(previousLastRadioactivity, '').trim();
    }
    previousLastRadioactivity = currentRadioactivities.at(-1);
  })

  let lesionsImpressions = result.lesions.map(row => {
    const rowCopy = shallowCopyRow(row);
    if (rowCopy[LESIONS] && typeof rowCopy[LESIONS] === 'string') {
      rowCopy[LESIONS] = (rowCopy[LESIONS].includes(' of ') && rowCopy[LESIONS].includes('rib'))
        ? rowCopy[LESIONS].split(' of ')[1].trim()
        : rowCopy[LESIONS];
    }
    return rowCopy;
  });
  lesionsImpressions.forEach((lesion, index) => {
    // 在 Web 環境中處理可能的 null 值
    if (lesion[IMPRESSIONS] && typeof lesion[IMPRESSIONS] === 'string') {
      if (!['etastas', 'involvement', 'athologic', 'eactive', 'one lesion'].some(x => lesion[IMPRESSIONS].includes(x)) || lesion[IMPRESSIONS].includes('uspicious')) {
        lesionsImpressions[index][CHANGES] = '';
      }
    }
  })

  let mappingTable = Object.entries(window.changesCandidates || {}).filter(([key, value]) => key !== '' && value !== null);
  const changeCandidateKeys = new Set(Object.keys(window.changesCandidates || {}));
  let mappingChangeInverse = {};
  mappingTable.forEach(([key, value]) => {
    if (value !== '') {
      mappingChangeInverse[value] = key;
    }
  })

  lesionsImpressions.forEach((lesion, index) => {
    const currentChange = lesionsImpressions[index][CHANGES];
    lesionsImpressions[index][CHANGES] =
      currentChange === '' || changeCandidateKeys.has(currentChange)
        ? currentChange
        : mappingChangeInverse[currentChange] ??
      currentChange;
  })

  let assembleImpressions = assembleItems(getClassifiedLesions(lesionsImpressions, ['IMPRESSIONS', 'CHANGES', 'LESIONS']), ['IMPRESSIONS', 'CHANGES', 'LESIONS']);

  Object.keys(assembleImpressions).forEach(impression => {
    assembleImpressions[impression] = assembleImpressions[impression].replace(/;;/g, ';')
  })

  const formatFindings = (changesFindings, assembleFindings, result) => {
    if (changesFindings.includes('') && changesFindings.length === 1) {
      return appendAppendixText(`Tc-99m MDP whole body bone scan shows ${assembleFindings[''].trim()}.`, appendixText);
    }

    const getOrderedChanges = () => {
      const changesOrder = Object.keys(window.changesCandidates || {});
      const orderedChanges = changesOrder.filter(change => changesFindings.includes(change));
      const unorderedChanges = changesFindings.filter(change => !changesOrder.includes(change) && change !== '');
      return [...orderedChanges, ...unorderedChanges];
    };

    const formatChanges = () => getOrderedChanges()
      .map(change => ({
        change,
        text: change.replace('{}', assembleFindings[change])
      }))
      .reduce((parts, item, index, items) => {
        const separator = index > 0 && getFindingsChangeGroup(items[index - 1].change) !== getFindingsChangeGroup(item.change)
          ? '; '
          : ' ';
        return `${parts}${index === 0 ? '' : separator}${item.text}`;
      }, '');

    if (changesFindings.includes('')) {
      const changes = formatChanges();
      const additional = capitalizeFirstLetter(assembleFindings[''].trim());
      return appendAppendixText(`Tc-99m MDP whole body bone scan shows ${changes}; ${comparisonReference}.\n\n${additional} ${(additional.match(/ in /g) || []).length > 1 ? 'are' : 'is'} also noted.`, appendixText);
    }

    const allFindings = formatChanges();

    return appendAppendixText(`Tc-99m MDP whole body bone scan shows ${allFindings}; ${comparisonReference}.`, appendixText);
  };

  function formatFindingsSeparated (changesFindings, result) {
    let findingsSeparated = [`Tc-99m MDP whole body bone scan shows ${assembleRadioactivitiesSeparated['']}.`];
    if (!(changesFindings.includes('') && changesFindings.length === 1)) {
      const changesOrder = Object.keys(window.changesCandidates || {});
      findingsSeparated.push(
        `${capitalizeFirstLetter(comparisonReference)}, this study shows ` +
        changesOrder.filter(x => x != '' && Object.keys(assembleChangesSeparated).includes(x)).map(
        change => change.replace('newly noted', hasMultipleEnumeratedItems(assembleChangesSeparated[change]) ? 'new lesions' : 'new lesion').replace(' in ', ' ').replace(' the ', ' ').replace('{}', '').replace(',', '').replace(';', '').trim() + ' in ' + stripGenericRadioactivityPrefix(assembleChangesSeparated[change])
      ).join('; ') + '.'
      )
    }
    findingsSeparated.push(appendixText)
    return findingsSeparated.filter(x => x != '').join('\n\n')
  }
  
  let textFindings = formatFindings(changesFindings, assembleFindings, result);
  let textFindingsSeparated = formatFindingsSeparated(changesFindings, result);

  textFindings = textFindings.split('\n').map(x => (x.startsWith('Faint spots') || x.startsWith('Tiny spots') || x.startsWith('Cold areas')) ? x.replace('is also', 'are also') : x).join("\n");
  textFindings = changesFindings.filter(change => change != '').length > 1 ? textFindings : textFindings.replace('; in comparison', ' in comparison')
  textFindings = normalizeGeneratedText(textFindings)
  textFindingsSeparated = normalizeGeneratedText(textFindingsSeparated)

  const impressionsOrder = window.impressionsCandidates || [];

  let impressionsMap = new Map();

  result.lesions.forEach(lesion => {
    const impression = lesion[IMPRESSIONS];
    // 在 Web 環境中處理可能的 null 值
    if (!impression || typeof impression !== 'string') {
      return;
    }
    
    let formattedImpression = impression in assembleImpressions
      ? impression.replace('{}', assembleImpressions[impression]).replace(';.', '.').replace(';,', ',')
      : impression;
    
    // 確保 assembleImpressions[impression] 存在
    if (assembleImpressions[impression] && typeof assembleImpressions[impression] === 'string') {
      formattedImpression = hasMultipleEnumeratedItems(
        assembleImpressions[impression]
          .replace(', newly', '')
          .replace(', some', '')
          .replace(', with ', '')
          .replace(', stationary', '')
          .replace(', almost', '')
      ) ?
        formattedImpression
          .replace('metastasis ', 'metastases ')
          .replace('spot ', 'spots ')
          .replace('insult ', 'insults ')
          .replace('fracture ', 'fractures ')
          .replace('area ', 'areas ')
          .replace('lesion ', 'lesions ')
        : formattedImpression
    }

    impressionsMap.set(impression, formattedImpression);
  });
  let sortedImpressions = Array.from(impressionsMap.entries()).sort((a, b) => {
    const indexA = impressionsOrder.indexOf(a[0]);
    const indexB = impressionsOrder.indexOf(b[0]);

    if (indexA === -1 && indexB === -1) return 0;
    if (indexA === -1) return -1;
    if (indexB === -1) return 1;
    return indexA - indexB;
  });

  sortedImpressions = sortedImpressions.map(x => x[1].includes('sinusitis') 
  ? [x[0],x[1]
  .replace('bilateral maxilla', 'bilateral maxillary sinuses')
  .replace('left maxilla', 'left maxillary sinus')
  .replace('right maxilla', 'right maxillary sinus')
  .replace('maxilla', 'maxillary sinus')
  .replace('bilateral paranasal areas', 'bilateral paranasal sinuses')
  .replace('right paranasal area', 'right paranasal sinus')
  .replace('left paranasal area', 'left paranasal sinus')
  .replace('paranasal area', 'paranasal sinus')
  .replace('ethmoid bone', 'ethmoid sinus')
  ]
  : x)

  sortedImpressions = sortedImpressions.map(x => x[1].includes('mastoiditis in the ') 
  ? [x[0],x[1]
  .replace('mastoiditis in the ', '')
  .replace('temporal mastoid processes', 'mastoiditis')
  .replace('temporal mastoid process', 'mastoiditis')
  ]
  : x)

  const impressionItems = sortedImpressions
    .filter(x => x[0] != '' && x[1] != '')
    .map(([_, formattedImpression]) => stripImpressionNumber(formattedImpression));
  let textImpressions = formatImpressionItems(impressionItems);

  const negativeImpressionItems = [
    NEGATIVE_IMPRESSION_TEXT,
    ...impressionItems.filter(item => stripImpressionNumber(item) !== NEGATIVE_IMPRESSION_TEXT)
  ];
  let textImpressionsNegative = formatImpressionItems(negativeImpressionItems);

  return {
    textFindings,
    textFindingsBeta: textFindings,
    textFindingsSeparated, 
    textImpressions,
    textImpressionsNegative,
  };
}

// 將函數暴露到全局
window.reportGenerator = {
  getReport,
  COLUMN_INDICES,
  isAppendixLesionValue,
  normalizeAppendixText,
  applyPluralExceptions,
  AnatomicalStructure,
  VertebralBodies,
  VertebralLevels,
  Endplates,
  FacetJoints,
  CostochondralJunctions,
  CostovertebralJoints,
  CostosternalJoints,
  Ribs,
  mergeLesionsAnatomies,
  splitRibDescriptions,
  capitalizeFirstLetter,
  mergeLesions
}; 
