import { cleanString, finiteNonNegativeNumber } from './render-utils.js';

export const CAPTION_PRESENTATION_TRACK_VERSION = 'caption-presentation-track-v3';

const CAPTION_LONG_PAUSE_SEC = 0.75;
const CAPTION_ALIGNMENT_WARNING_RATIO = 0.35;
const CAPTION_MAX_WORDS = 5;
const CAPTION_MAX_CHARACTERS = 38;
const CAPTION_SIDE_COLUMN_MAX_LINES = CAPTION_MAX_WORDS + 1;
const CAPTION_REGULAR_METRIC_SCALE = 1.18;
const CAPTION_BOLD_METRIC_SCALE = 1.25;
const CAPTION_LINE_SAFETY_EM = 0.4;
const CAPTION_COLLISION_GAP_EM = 0.06;
const CAPTION_CONTINUITY_FLAGS = ['sceneBoundary', 'resetContinuity', 'discontinuity'];

export function captionWordTimeSeconds(word = {}, key, fallback = 0) {
  let value = word[`${key}Sec`] ?? word[key] ?? fallback;
  let number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

export function overlapMs(aStartMs, aEndMs, bStartMs, bEndMs) {
  return Math.max(0, Math.min(aEndMs, bEndMs) - Math.max(aStartMs, bStartMs));
}

export function captionAttributionForRange(startSec, endSec, cues = []) {
  let startMs = Math.max(0, Number(startSec || 0) * 1000);
  let endMs = Math.max(startMs + 1, Number(endSec || startSec || 0) * 1000);
  let best = null;
  for (let cue of Array.isArray(cues) ? cues : []) {
    let cueId = typeof cue?.cueId === 'string' ? cue.cueId : '';
    if (!cleanString(cueId, '')) continue;
    let cueStartMs = finiteNonNegativeNumber(cue?.startMs, null);
    let cueEndMs = finiteNonNegativeNumber(cue?.endMs, null);
    if (cueStartMs === null || cueEndMs === null) continue;
    let overlap = overlapMs(startMs, endMs, cueStartMs, cueEndMs);
    if (!best || overlap > best.overlapMs) {
      best = {
        speaker: cleanString(cue?.speaker, ''),
        cueIndex: Number.isFinite(Number(cue?.index)) ? Number(cue.index) : null,
        cueId,
        overlapMs: overlap,
      };
    }
  }
  if (best?.overlapMs > 0) return { ...best, source: 'range-map' };
  return { speaker: '', cueIndex: null, cueId: '', overlapMs: 0, source: 'unmapped' };
}

function formatVttTimestamp(seconds) {
  let totalMs = Math.max(0, Math.round(Number(seconds || 0) * 1000));
  let ms = totalMs % 1000;
  let totalSeconds = Math.floor(totalMs / 1000);
  let sec = totalSeconds % 60;
  let totalMinutes = Math.floor(totalSeconds / 60);
  let min = totalMinutes % 60;
  let hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function escapeVttText(value) {
  return cleanString(value, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function finitePositiveNumber(value, fallback = 0) {
  let number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function sameValue(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => sameValue(item, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  let leftKeys = Object.keys(left).sort();
  let rightKeys = Object.keys(right).sort();
  return sameValue(leftKeys, rightKeys)
    && leftKeys.every((key) => sameValue(left[key], right[key]));
}

const PRESETS = {
  youtube: {
    fontName: 'Arial',
    fontWeight: 700,
    fontSizeScale: 0.045,
    fontSizeMin: 16,
    fontSizeMax: 100,
    maxLines: 2,
    maxLineWidthPct: 0.75,
    margins: {
      top: 0.08,
      bottom: 0.08,
      left: 0.1,
      right: 0.1
    },
    preferredZones: ['bottom', 'top'],
    primaryColor: '#FFFFFFFF',
    highlightColor: '#00FFFFFF',
    outlineColor: '#000000FF',
    backColor: '#00000080',
    speakerTreatment: 'prefix',
  },
  tiktok: {
    fontName: 'Arial',
    fontWeight: 400,
    fontSizeScale: 0.035,
    fontSizeMin: 18,
    fontSizeMax: 80,
    maxLines: 3,
    maxLineWidthPct: 0.85,
    margins: {
      top: 0.1,
      bottom: 0.15,
      left: 0.08,
      right: 0.08
    },
    preferredZones: ['bottom', 'top', 'middle'],
    primaryColor: '#FFFFFFFF',
    highlightColor: '#FFFF00FF',
    outlineColor: '#000000FF',
    backColor: '#000000CC',
    speakerTreatment: 'bracket',
  },
  square: {
    fontName: 'Arial',
    fontWeight: 700,
    fontSizeScale: 0.04,
    fontSizeMin: 16,
    fontSizeMax: 90,
    maxLines: 2,
    maxLineWidthPct: 0.8,
    margins: {
      top: 0.1,
      bottom: 0.1,
      left: 0.1,
      right: 0.1
    },
    preferredZones: ['bottom', 'top'],
    primaryColor: '#FFFFFFFF',
    highlightColor: '#FF00FFFF',
    outlineColor: '#000000FF',
    backColor: '#00000099',
    speakerTreatment: 'prefix',
  },
  live: {
    fontName: 'Arial',
    fontWeight: 700,
    fontSizeScale: 0.05,
    fontSizeMin: 20,
    fontSizeMax: 120,
    maxLines: 1,
    maxLineWidthPct: 0.9,
    margins: {
      top: 0.05,
      bottom: 0.05,
      left: 0.05,
      right: 0.05
    },
    preferredZones: ['bottom'],
    primaryColor: '#00FF00FF',
    highlightColor: '#FFFFFFFF',
    outlineColor: '#000000FF',
    backColor: '#000000FF',
    speakerTreatment: 'prefix',
  }
};
const PRESET_ALIASES = Object.freeze({
  horizontal: 'youtube',
  reels: 'tiktok',
  shorts: 'tiktok',
  vertical: 'tiktok',
});

function parseHexColor(value) {
  if (typeof value !== 'string') return null;
  let clean = value.trim();
  if (clean.startsWith('&')) {
    return assToHexColor(clean);
  }
  let val = clean.replace(/^#/, '');
  if (val.length === 3) {
    val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2] + 'FF';
  } else if (val.length === 4) {
    val = val[0] + val[0] + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
  } else if (val.length === 6) {
    val = val + 'FF';
  } else if (val.length === 8) {
    // already 8 chars
  } else {
    return null;
  }
  if (/^[0-9a-f]{8}$/i.test(val)) {
    return '#' + val.toUpperCase();
  }
  return null;
}

function assToHexColor(value) {
  let val = value.trim().replace(/^&[hH]/, '').replace(/&$/, '');
  if (val.length === 6) {
    val = '00' + val;
  }
  if (val.length === 8 && /^[0-9a-f]{8}$/i.test(val)) {
    let aa = val.slice(0, 2);
    let bb = val.slice(2, 4);
    let gg = val.slice(4, 6);
    let rr = val.slice(6, 8);
    let transparencyInt = parseInt(aa, 16);
    let alphaInt = 255 - transparencyInt;
    let alphaHex = alphaInt.toString(16).padStart(2, '0').toUpperCase();
    return `#${rr}${gg}${bb}${alphaHex}`.toUpperCase();
  }
  return null;
}

function toAssColor(hexColor) {
  let rr = hexColor.slice(1, 3);
  let gg = hexColor.slice(3, 5);
  let bb = hexColor.slice(5, 7);
  let aa = hexColor.slice(7, 9);
  let alphaInt = parseInt(aa, 16);
  let transparencyInt = 255 - alphaInt;
  let transparencyHex = transparencyInt.toString(16).padStart(2, '0').toUpperCase();
  return `&H${transparencyHex}${bb}${gg}${rr}`.toUpperCase();
}

function estimateCharWidth(char, fontSize) {
  if (/[wmWM]/.test(char)) return fontSize * 0.75;
  if (/[A-Z0-9]/.test(char)) return fontSize * 0.55;
  if (/[il1tI\.\s,!\-\+=\(\)\[\]:;'"\?`~]/.test(char)) return fontSize * 0.25;
  return fontSize * 0.45;
}

function estimateLineWidth(text, fontSize, fontWeight) {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    width += estimateCharWidth(text[i], fontSize);
  }
  let metricScale = fontWeight >= 600
    ? CAPTION_BOLD_METRIC_SCALE
    : CAPTION_REGULAR_METRIC_SCALE;
  return Math.round(width * metricScale);
}

function captionLineSafetyGutter(fontSize) {
  return Math.ceil(fontSize * CAPTION_LINE_SAFETY_EM);
}

function wrapText(words, maxPixelWidth, fontSize, fontWeight) {
  let lines = [];
  let currentLine = [];
  let safetyGutter = captionLineSafetyGutter(fontSize);
  for (let word of words) {
    let lineWithWord = currentLine.length ? currentLine.join(' ') + ' ' + word : word;
    let w = estimateLineWidth(lineWithWord, fontSize, fontWeight);
    let fits = w <= maxPixelWidth
      && (!currentLine.length || w + safetyGutter <= maxPixelWidth);
    if (fits) {
      currentLine.push(word);
    } else {
      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
        currentLine = [word];
      } else {
        lines.push(word);
        currentLine = [];
      }
    }
  }
  if (currentLine.length > 0) {
    lines.push(currentLine.join(' '));
  }
  return lines;
}

function rectsOverlap(r1, r2) {
  return (
    r1.x < r2.x + r2.width &&
    r1.x + r1.width > r2.x &&
    r1.y < r2.y + r2.height &&
    r1.y + r1.height > r2.y
  );
}

function positiveFiniteRect(rect) {
  return Boolean(rect)
    && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
    && rect.width > 0
    && rect.height > 0;
}

function rectWithinBounds(rect, bounds) {
  return positiveFiniteRect(rect)
    && positiveFiniteRect(bounds)
    && rect.x >= bounds.x
    && rect.y >= bounds.y
    && rect.x + rect.width <= bounds.x + bounds.width
    && rect.y + rect.height <= bounds.y + bounds.height;
}

function safeCaptionBounds(width, height, safeInsets) {
  return {
    x: safeInsets.left,
    y: safeInsets.top,
    width: width - safeInsets.left - safeInsets.right,
    height: height - safeInsets.top - safeInsets.bottom,
  };
}

function timeRangesOverlap(firstStart, firstEnd, secondStart, secondEnd) {
  return Math.max(firstStart, secondStart) < Math.min(firstEnd, secondEnd);
}

function captionPlacementAnchor(rect, alignment) {
  let horizontal = alignment % 3;
  return {
    x: horizontal === 1 ? rect.x
      : horizontal === 2 ? Math.round(rect.x + rect.width / 2)
        : rect.x + rect.width,
    y: alignment >= 7 ? rect.y
      : alignment <= 3 ? rect.y + rect.height
        : Math.round(rect.y + rect.height / 2),
  };
}

function captionAlignment(zone, horizontal) {
  let row = zone === 'top' ? 2 : zone === 'middle' ? 1 : 0;
  let column = horizontal === 'left' ? 1 : horizontal === 'right' ? 3 : 2;
  return row * 3 + column;
}

function captionCharacterCount(words) {
  return [...words.join(' ')].length;
}

function captionRenderedCharacterCount(words, speaker) {
  let speakerOverhead = speaker ? [...String(speaker).trim()].length + 3 : 0;
  return captionCharacterCount(words) + speakerOverhead;
}

function freeHorizontalSpans(bounds, collisionRegions, y, height, gap = 0) {
  let spans = [{ x: bounds.x, width: bounds.width }];
  let band = { x: bounds.x, y, width: bounds.width, height };
  for (let region of collisionRegions) {
    let expanded = {
      x: Number(region.x ?? 0) - gap,
      y: Number(region.y ?? 0) - gap,
      width: Number(region.width ?? 0) + gap * 2,
      height: Number(region.height ?? 0) + gap * 2,
    };
    if (!rectsOverlap(band, expanded)) continue;
    let blockedStart = Math.max(bounds.x, expanded.x);
    let blockedEnd = Math.min(bounds.x + bounds.width, expanded.x + expanded.width);
    if (blockedEnd <= blockedStart) continue;
    spans = spans.flatMap((span) => {
      let spanEnd = span.x + span.width;
      if (blockedEnd <= span.x || blockedStart >= spanEnd) return [span];
      let parts = [];
      if (blockedStart > span.x) parts.push({ x: span.x, width: blockedStart - span.x });
      if (blockedEnd < spanEnd) parts.push({ x: blockedEnd, width: spanEnd - blockedEnd });
      return parts;
    });
  }
  return spans.filter((span) => span.width >= 1);
}

function zoneAnchorY(bounds, zone, height) {
  if (zone === 'top') return bounds.y;
  if (zone === 'middle') return bounds.y + (bounds.height - height) / 2;
  return bounds.y + bounds.height - height;
}

function freeVerticalAnchors(bounds, collisionRegions, zone, height, gap = 0) {
  let minY = bounds.y;
  let maxY = bounds.y + bounds.height - height;
  if (maxY < minY) return [];
  let anchorY = zoneAnchorY(bounds, zone, height);
  let candidates = [anchorY];
  for (let region of collisionRegions) {
    let y = Number(region.y ?? 0);
    let regionHeight = Number(region.height ?? 0);
    if (!Number.isFinite(y) || !Number.isFinite(regionHeight) || regionHeight <= 0) continue;
    candidates.push(y - gap - height, y + regionHeight + gap);
  }
  let unique = [...new Set(candidates
    .filter((y) => Number.isFinite(y) && y >= minY && y <= maxY)
    .map((y) => Math.round(y * 1000) / 1000))];
  if (zone === 'top') return unique.sort((left, right) => left - right);
  if (zone === 'bottom') return unique.sort((left, right) => right - left);
  let centerY = bounds.y + bounds.height / 2;
  return unique.sort((left, right) => (
    Math.abs(left + height / 2 - centerY) - Math.abs(right + height / 2 - centerY)
    || left - right
  ));
}

function normalizedCaptionWord(value) {
  return String(value || '')
    .toLocaleLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

function applySpeakerTreatment(text, speaker, treatment) {
  if (!speaker) return text;
  let spk = String(speaker).trim();
  if (!spk) return text;

  if (treatment === 'prefix') {
    return `${spk.toUpperCase()}: ${text}`;
  }
  if (treatment === 'bracket') {
    return `[${spk.toUpperCase()}] ${text}`;
  }
  return text;
}

function getStyleName(preset) {
  let p = PRESET_ALIASES[String(preset).toLowerCase()] || String(preset).toLowerCase();
  if (p === 'tiktok' || p === 'vertical' || p === 'shorts') return 'TikTok';
  if (p === 'youtube' || p === 'horizontal') return 'YouTube';
  if (p === 'square') return 'Square';
  if (p === 'live') return 'Live';
  return 'Default';
}

export function resolveCaptionProfile(styleOptions = {}, width = null, height = null) {
  let source = styleOptions || {};
  let requestedPreset = cleanString(source.preset || source.presetName, 'tiktok').toLowerCase() || 'tiktok';
  let presetName = PRESET_ALIASES[requestedPreset] || requestedPreset;
  let w = Number(source.width ?? source.outputWidth ?? source.videoWidth ?? source.playResX ?? width);
  let h = Number(source.height ?? source.outputHeight ?? source.videoHeight ?? source.playResY ?? height);

  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) {
    throw new TypeError('caption profile requires positive actual width and height');
  }
  w = Math.round(w);
  h = Math.round(h);

  let preset = PRESETS[presetName];
  if (!preset) {
    throw new TypeError(`unsupported caption preset "${requestedPreset}"`);
  }

  let fontName = cleanString(source.fontName || source.font, preset.fontName);
  let requestedFontWeight = source.fontWeight ?? source.weight ?? preset.fontWeight;
  if (requestedFontWeight === 'normal') requestedFontWeight = 400;
  if (requestedFontWeight === 'bold') requestedFontWeight = 700;
  let fontWeight = Number(requestedFontWeight);
  if (![400, 700].includes(fontWeight)) fontWeight = preset.fontWeight;

  let defaultSize = Math.round(h * preset.fontSizeScale);
  let sizeVal = source.fontSize ?? source.size ?? defaultSize;
  let rawSize = Number(sizeVal);
  if (!Number.isFinite(rawSize) || rawSize <= 0) {
    rawSize = defaultSize;
  }
  let minSize = Math.max(18, Math.round(h * 0.028));
  let maxSize = Math.max(minSize, Math.round(h * 0.12));
  let fontSize = Math.min(maxSize, Math.max(minSize, rawSize));
  let lineHeight = Math.round(fontSize * 1.3);

  let maxLines = Number(source.maxLines ?? preset.maxLines);
  if (!Number.isInteger(maxLines) || maxLines <= 0) {
    maxLines = preset.maxLines;
  }
  maxLines = Math.min(10, Math.max(1, maxLines));

  let maxLineWidthPct = Number(source.maxLineWidthPct ?? source.lineWidthPct ?? preset.maxLineWidthPct);
  if (!Number.isFinite(maxLineWidthPct) || maxLineWidthPct <= 0) {
    maxLineWidthPct = preset.maxLineWidthPct;
  }
  maxLineWidthPct = Math.min(1.0, Math.max(0.1, maxLineWidthPct));

  let margins = {};
  let defaultMargins = preset.margins;

  let overrideTop = source.margins?.top ?? source.marginTop ?? source.marginV;
  let overrideBottom = source.margins?.bottom ?? source.marginBottom ?? source.marginV;
  let overrideLeft = source.margins?.left ?? source.marginLeft ?? source.marginH;
  let overrideRight = source.margins?.right ?? source.marginRight ?? source.marginH;

  let marginPixels = (value, fallback) => {
    let number = value === undefined ? fallback : Number(value);
    return Math.round(Number.isFinite(number) ? number : fallback);
  };
  margins.top = marginPixels(overrideTop, h * defaultMargins.top);
  margins.bottom = marginPixels(overrideBottom, h * defaultMargins.bottom);
  margins.left = marginPixels(overrideLeft, w * defaultMargins.left);
  margins.right = marginPixels(overrideRight, w * defaultMargins.right);

  let maxMarginV = Math.round(h * 0.35);
  let maxMarginH = Math.round(w * 0.35);
  margins.top = Math.min(maxMarginV, Math.max(0, margins.top));
  margins.bottom = Math.min(maxMarginV, Math.max(0, margins.bottom));
  margins.left = Math.min(maxMarginH, Math.max(0, margins.left));
  margins.right = Math.min(maxMarginH, Math.max(0, margins.right));

  let primaryColor = parseHexColor(source.primaryColor || source.color) || preset.primaryColor;
  let highlightColor = parseHexColor(source.highlightColor) || preset.highlightColor;
  let outlineColor = parseHexColor(source.outlineColor) || preset.outlineColor;
  let backColor = parseHexColor(source.backgroundColor || source.backColor) || preset.backColor;

  let primaryColorAss = toAssColor(primaryColor);
  let highlightColorAss = toAssColor(highlightColor);
  let outlineColorAss = toAssColor(outlineColor);
  let backColorAss = toAssColor(backColor);

  let speakerTreatment = cleanString(source.speakerTreatment, preset.speakerTreatment);
  if (!['prefix', 'bracket', 'none'].includes(speakerTreatment)) {
    speakerTreatment = preset.speakerTreatment;
  }

  let preferredZones = source.preferredZones || source.candidateZones || preset.preferredZones;
  if (!Array.isArray(preferredZones)) {
    preferredZones = preset.preferredZones;
  }
  preferredZones = preferredZones.filter(z => ['top', 'bottom', 'middle'].includes(z));
  if (!preferredZones.length) {
    preferredZones = preset.preferredZones;
  }

  return {
    schemaVersion: 'caption-presentation-profile-v1',
    preset: presetName,
    fontName,
    fontWeight,
    fontSize,
    lineHeight,
    maxLines,
    maxLineWidthPct,
    margins,
    primaryColor,
    primaryColorAss,
    highlightColor,
    highlightColorAss,
    outlineColor,
    outlineColorAss,
    backColor,
    backColorAss,
    speakerTreatment,
    preferredZones,
    width: w,
    height: h
  };
}

function escapeAssText(value) {
  return cleanString(value, '')
    .replace(/[{}\r\n]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatAssTimestamp(seconds) {
  let totalCs = Math.max(0, Math.round(Number(seconds || 0) * 100));
  let cs = totalCs % 100;
  let totalSeconds = Math.floor(totalCs / 100);
  let sec = totalSeconds % 60;
  let totalMinutes = Math.floor(totalSeconds / 60);
  let min = totalMinutes % 60;
  let hour = Math.floor(totalMinutes / 60);
  return `${hour}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function cueText(cue = {}) {
  return Array.isArray(cue.words) ? cue.words.join(' ') : cleanString(cue.text, '');
}

export function captionCueHasWordTimings(cue = {}) {
  return Array.isArray(cue.wordTimings) && cue.wordTimings.length > 0;
}

function slotsEqual(s1, s2) {
  if (!s1 || !s2) return false;
  return s1.alignment === s2.alignment
    && s1.x === s2.x
    && s1.y === s2.y;
}

function captionContinuityEvidence(cue, label) {
  let evidence = {};
  for (let key of CAPTION_CONTINUITY_FLAGS) {
    if (cue?.[key] === undefined) continue;
    if (typeof cue[key] !== 'boolean') {
      throw new TypeError(`${label} has an invalid ${key} flag`);
    }
    evidence[key] = cue[key];
  }
  return evidence;
}

function resetsCaptionContinuity(cue) {
  return CAPTION_CONTINUITY_FLAGS.some((key) => cue?.[key] === true);
}

function explicitCaptionCueId(cue, index, label) {
  if (typeof cue?.cueId !== 'string' || !cleanString(cue.cueId, '')) {
    throw new TypeError(`${label} ${index} requires a nonempty explicit cueId`);
  }
  let cueId = cue.cueId;
  if (!/^[a-z][a-z0-9._:-]*$/.test(cueId)) {
    throw new TypeError(`${label} ${index} has unsafe cueId "${cueId}"; must match /^[a-z][a-z0-9._:-]*$/`);
  }
  return cueId;
}

export function buildCaptionPlacementTrack(cues = [], options = {}) {
  if (!Array.isArray(cues)) throw new TypeError('caption cues must be an array');
  if (options.discontinuity !== undefined) {
    throw new TypeError('caption discontinuity must be declared on the cue');
  }
  let continuityGapMs = options.continuityGapMs ?? 750;
  if (!Number.isInteger(continuityGapMs) || continuityGapMs <= 0) {
    throw new TypeError('continuityGapMs must be a positive integer');
  }
  let w = Number(options.width ?? options.outputWidth ?? options.videoWidth ?? options.playResX);
  let h = Number(options.height ?? options.outputHeight ?? options.videoHeight ?? options.playResY);
  let profile = resolveCaptionProfile(options.captionStyle || options.style || options, w, h);
  w = profile.width;
  h = profile.height;

  let insetValue = (value, fallback, path) => {
    let number = value === undefined ? fallback : Number(value);
    if (!Number.isFinite(number) || number < 0) {
      throw new TypeError(`${path} must be a non-negative finite number`);
    }
    return Math.round(number);
  };
  let safeInsets = {
    top: insetValue(options.safeInsets?.top, profile.margins.top, 'safeInsets.top'),
    bottom: insetValue(options.safeInsets?.bottom, profile.margins.bottom, 'safeInsets.bottom'),
    left: insetValue(options.safeInsets?.left, profile.margins.left, 'safeInsets.left'),
    right: insetValue(options.safeInsets?.right, profile.margins.right, 'safeInsets.right'),
  };
  if (safeInsets.left + safeInsets.right >= w || safeInsets.top + safeInsets.bottom >= h) {
    throw new TypeError('caption safe insets leave no readable output area');
  }
  let outputBounds = { x: 0, y: 0, width: w, height: h };
  let safeBounds = safeCaptionBounds(w, h, safeInsets);

  let avoidIds = new Set();
  let avoidRegions = (Array.isArray(options.avoidRegions) ? options.avoidRegions : []).map((region, index) => {
    let id = region?.id !== undefined ? cleanString(region.id, '') : '';
    if (!id) {
      throw new TypeError(`avoidRegions[${index}] has a missing or empty ID`);
    }
    if (avoidIds.has(id)) {
      throw new TypeError(`duplicate avoid-region ID "${id}"`);
    }
    avoidIds.add(id);

    let x = Number(region?.x ?? region?.left);
    let y = Number(region?.y ?? region?.top);
    let width = Number(region?.width);
    let height = Number(region?.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new TypeError(`avoidRegions[${index}] must contain a positive finite rectangle`);
    }
    let startSec = region?.startSec ?? region?.start;
    let endSec = region?.endSec ?? region?.end;
    if ((startSec === undefined) !== (endSec === undefined)) {
      throw new TypeError(`avoidRegions[${index}] must provide both startSec and endSec`);
    }
    if (startSec !== undefined) {
      startSec = Number(startSec);
      endSec = Number(endSec);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) {
        throw new TypeError(`avoidRegions[${index}] has invalid timing`);
      }
    }
    return {
      id,
      kind: cleanString(region?.kind, 'attention'),
      x,
      y,
      width,
      height,
      ...(startSec === undefined ? {} : { startSec, endSec }),
    };
  });
  let track = [];
  let cueIds = new Set();

  let activeSlot = null;
  let usedSlotsInSequence = [];

  let relocationCount = 0;
  let unforcedSwitchCount = 0;
  let hardCollisionCount = 0;
  let safeBoundsViolationCount = 0;
  let forcedCollisionRelocationCount = 0;
  let forcedSafeBoundsRelocationCount = 0;
  let typographyAdaptationCount = 0;

  for (let index = 0; index < cues.length; index++) {
    let cue = cues[index];
    let cueId = explicitCaptionCueId(cue, index, 'caption cue');
    if (cueIds.has(cueId)) throw new TypeError(`caption cue ID "${cueId}" is duplicated`);
    cueIds.add(cueId);
    let cueStartSec = Number(cue?.startSec ?? cue?.start);
    let cueEndSec = Number(cue?.endSec ?? cue?.end);
    if (!Number.isFinite(cueStartSec) || !Number.isFinite(cueEndSec)
      || cueStartSec < 0 || cueEndSec <= cueStartSec) {
      throw new TypeError(`caption cue "${cueId}" has invalid timing`);
    }
    let cueSpeaker = cleanString(cue.speaker, '');
    let continuityEvidence = captionContinuityEvidence(cue, `caption cue "${cueId}"`);

    let text = cueText(cue);
    if (!text) throw new TypeError(`caption cue "${cueId}" has no text`);
    let treatedText = applySpeakerTreatment(text, cueSpeaker, profile.speakerTreatment);

    let availableWidth = w - safeInsets.left - safeInsets.right;
    let maxPixelWidth = availableWidth * profile.maxLineWidthPct;

    let words = treatedText.split(/\s+/).filter(Boolean);
    let selectedZone = null;
    let selectedHorizontal = null;
    let selectedRect = null;
    let selectedAlignment = null;
    let selectedWrappedLines = null;
    let selectedWrapWidth = null;
    let selectedLineBudget = null;
    let selectedFontSize = null;
    let selectedLineHeight = null;
    let selectedCandidateY = null;
    let selectedIntersectsCompactFocus = false;
    let selectedIntersectsActiveCaption = false;
    let selectedCollidedRegions = [];
    let auditTrail = [];

    let activeAvoids = avoidRegions.filter(region => {
      let rStart = region.startSec ?? region.start ?? null;
      let rEnd = region.endSec ?? region.end ?? null;
      if (rStart === null || rEnd === null) return true;
      return timeRangesOverlap(cueStartSec, cueEndSec, rStart, rEnd);
    });
    let activeCaptionRegions = track
      .filter((item) => timeRangesOverlap(
        cueStartSec,
        cueEndSec,
        item.startSec,
        item.endSec,
      ))
      .map((item) => ({
        id: `caption-cue:${item.cueId}`,
        kind: 'caption',
        cueId: item.cueId,
        startSec: item.startSec,
        endSec: item.endSec,
        ...item.measuredRect,
      }));
    let collisionRegions = [...activeAvoids, ...activeCaptionRegions];

    let fullWrapWidth = Math.max(1, Math.min(Math.round(maxPixelWidth), Math.round(safeBounds.width)));
    let placementCandidates = profile.preferredZones.map((zone) => ({
      zone,
      horizontal: 'center',
      wrapWidth: fullWrapWidth,
    }));
    let candidateKeys = new Set(placementCandidates.map((candidate) => (
      `${candidate.zone}:${candidate.horizontal}:${candidate.wrapWidth}:full`
    )));
    let collisionGap = Math.max(4, Math.round(profile.fontSize * CAPTION_COLLISION_GAP_EM));
    let safeCenter = safeBounds.x + safeBounds.width / 2;
    let sideColumnLineBudget = Math.max(
      profile.maxLines,
      Math.min(
        CAPTION_SIDE_COLUMN_MAX_LINES,
        Math.floor(safeBounds.height / profile.lineHeight),
      ),
    );
    for (let zone of profile.preferredZones) {
      for (let lineCount = 1; lineCount <= sideColumnLineBudget; lineCount++) {
        let assumedHeight = lineCount * profile.lineHeight;
        for (let assumedY of freeVerticalAnchors(
          safeBounds,
          collisionRegions,
          zone,
          assumedHeight,
          collisionGap,
        )) {
          let spans = freeHorizontalSpans(
            safeBounds,
            collisionRegions,
            assumedY,
            assumedHeight,
            collisionGap,
          ).sort((left, right) => right.width - left.width || left.x - right.x);
          for (let span of spans) {
            let wrapWidth = Math.max(1, Math.min(fullWrapWidth, Math.floor(span.width)));
            let spanCenter = span.x + span.width / 2;
            let horizontal = Math.abs(spanCenter - safeCenter) < 1
              ? 'center'
              : spanCenter < safeCenter ? 'left' : 'right';
            let key = `${zone}:${horizontal}:${wrapWidth}:${Math.round(span.x)}:${Math.round(span.width)}:${assumedY}`;
            if (candidateKeys.has(key)) continue;
            candidateKeys.add(key);
            placementCandidates.push({
              zone,
              horizontal,
              wrapWidth,
              span,
              y: assumedY,
              lineBudget: wrapWidth < fullWrapWidth ? sideColumnLineBudget : profile.maxLines,
            });
          }
        }
      }
    }

    let evaluateCandidate = (candidate, fontSize, adaptiveTypography = false) => {
      let lineBudget = candidate.lineBudget || profile.maxLines;
      let lineHeight = Math.round(fontSize * 1.3);
      let wrappedLines = wrapText(words, candidate.wrapWidth, fontSize, profile.fontWeight);
      let estimatedWidths = wrappedLines.map((line) => (
        estimateLineWidth(line, fontSize, profile.fontWeight)
      ));
      let widestEstimatedLine = Math.max(1, ...estimatedWidths);
      let metricOverflow = widestEstimatedLine > candidate.wrapWidth;
      let measuredWidth = Math.min(
        candidate.wrapWidth,
        widestEstimatedLine + captionLineSafetyGutter(fontSize),
      );
      let measuredHeight = Math.round(wrappedLines.length * lineHeight);
      let horizontalBounds = candidate.span || safeBounds;
      let horizontalRight = horizontalBounds.x + horizontalBounds.width;
      let x = candidate.horizontal === 'left'
        ? horizontalBounds.x
        : candidate.horizontal === 'right'
          ? horizontalRight - measuredWidth
          : Math.min(
            horizontalRight - measuredWidth,
            Math.max(horizontalBounds.x, safeCenter - measuredWidth / 2),
          );
      let y = Number.isFinite(candidate.y)
        ? candidate.y
        : zoneAnchorY(safeBounds, candidate.zone, measuredHeight);
      let candidateRect = {
        x: Math.round(x),
        y: Math.round(y),
        width: measuredWidth,
        height: measuredHeight,
      };
      let compactCollided = activeAvoids.filter((region) => (region.kind === 'focus' || region.id === 'focus') && rectsOverlap(candidateRect, {
        x: (region.x ?? 0) - collisionGap,
        y: (region.y ?? 0) - collisionGap,
        width: (region.width ?? 0) + collisionGap * 2,
        height: (region.height ?? 0) + collisionGap * 2,
      }));
      let activeCaptionsCollided = activeCaptionRegions.filter((region) => rectsOverlap(candidateRect, region));
      let otherCollided = activeAvoids.filter((region) => !(region.kind === 'focus' || region.id === 'focus') && rectsOverlap(candidateRect, {
        x: (region.x ?? 0) - collisionGap,
        y: (region.y ?? 0) - collisionGap,
        width: (region.width ?? 0) + collisionGap * 2,
        height: (region.height ?? 0) + collisionGap * 2,
      }));

      let insideOutput = rectWithinBounds(candidateRect, outputBounds);
      let insideSafeBounds = rectWithinBounds(candidateRect, safeBounds);
      let isGeometricallyValid = insideOutput && insideSafeBounds;
      let intersectsCompactFocus = compactCollided.length > 0;
      let intersectsActiveCaption = activeCaptionsCollided.length > 0;
      let intersectsOtherAvoid = otherCollided.length > 0;

      let status = wrappedLines.length > lineBudget
        ? 'too-many-lines'
        : metricOverflow || !isGeometricallyValid
          ? 'out-of-bounds'
          : (intersectsCompactFocus || intersectsActiveCaption || intersectsOtherAvoid) ? 'collided' : 'clear';

      let collidedRegions = [
        ...compactCollided.map((r) => ({ id: r.id, kind: 'focus' })),
        ...activeCaptionsCollided.map((r) => ({ id: r.id, kind: 'caption' })),
        ...otherCollided.map((r) => ({ id: r.id, kind: r.kind || 'avoid' }))
      ];

      let alignment = captionAlignment(candidate.zone, candidate.horizontal);
      return {
        zone: candidate.zone,
        horizontal: candidate.horizontal,
        alignment,
        fontSize,
        lineHeight,
        adaptiveTypography,
        wrapWidth: candidate.wrapWidth,
        lineBudget,
        ...(Number.isFinite(candidate.y) ? { adaptiveY: candidate.y } : {}),
        ...(candidate.span ? { span: candidate.span } : {}),
        wrappedLines,
        rect: candidateRect,
        status,
        metricOverflow,
        collidedRegionIds: collidedRegions.map((region) => region.id),
        collidedRegions,
        insideOutput,
        insideSafeBounds,
        isGeometricallyValid,
        intersectsCompactFocus,
        intersectsActiveCaption
      };
    };

    let evaluateSlotAtFontSize = (slot, fontSize) => {
      let lineBudget = slot.lineBudget;
      let lineHeight = Math.round(fontSize * 1.3);
      let wrappedLines = wrapText(words, slot.wrapWidth, fontSize, profile.fontWeight);
      let estimatedWidths = wrappedLines.map((line) => (
        estimateLineWidth(line, fontSize, profile.fontWeight)
      ));
      let widestEstimatedLine = Math.max(1, ...estimatedWidths);
      let metricOverflow = widestEstimatedLine > slot.wrapWidth;
      let measuredWidth = Math.min(
        slot.wrapWidth,
        widestEstimatedLine + captionLineSafetyGutter(fontSize),
      );
      let measuredHeight = Math.round(wrappedLines.length * lineHeight);

      let horizontal = slot.alignment % 3;
      let x = horizontal === 1 ? slot.x
        : horizontal === 2 ? slot.x - Math.round(measuredWidth / 2)
          : slot.x - measuredWidth;
      let y = slot.alignment >= 7 ? slot.y
        : slot.alignment <= 3 ? slot.y - measuredHeight
          : slot.y - Math.round(measuredHeight / 2);

      let candidateRect = {
        x: Math.round(x),
        y: Math.round(y),
        width: measuredWidth,
        height: measuredHeight,
      };

      let compactCollided = activeAvoids.filter((region) => (region.kind === 'focus' || region.id === 'focus') && rectsOverlap(candidateRect, {
        x: (region.x ?? 0) - collisionGap,
        y: (region.y ?? 0) - collisionGap,
        width: (region.width ?? 0) + collisionGap * 2,
        height: (region.height ?? 0) + collisionGap * 2,
      }));
      let activeCaptionsCollided = activeCaptionRegions.filter((region) => rectsOverlap(candidateRect, region));
      let otherCollided = activeAvoids.filter((region) => !(region.kind === 'focus' || region.id === 'focus') && rectsOverlap(candidateRect, {
        x: (region.x ?? 0) - collisionGap,
        y: (region.y ?? 0) - collisionGap,
        width: (region.width ?? 0) + collisionGap * 2,
        height: (region.height ?? 0) + collisionGap * 2,
      }));

      let insideOutput = rectWithinBounds(candidateRect, outputBounds);
      let insideSafeBounds = rectWithinBounds(candidateRect, safeBounds);

      let isGeometricallyValid = insideOutput && insideSafeBounds;
      let intersectsCompactFocus = compactCollided.length > 0;
      let intersectsActiveCaption = activeCaptionsCollided.length > 0;
      let intersectsOtherAvoid = otherCollided.length > 0;
      let typographyFits = wrappedLines.length <= lineBudget && !metricOverflow;

      let status = wrappedLines.length > lineBudget
        ? 'too-many-lines'
        : metricOverflow || !isGeometricallyValid
          ? 'out-of-bounds'
          : (intersectsCompactFocus || intersectsActiveCaption || intersectsOtherAvoid) ? 'collided' : 'clear';

      let collidedRegions = [
        ...compactCollided.map((r) => ({ id: r.id, kind: 'focus' })),
        ...activeCaptionsCollided.map((r) => ({ id: r.id, kind: 'caption' })),
        ...otherCollided.map((r) => ({ id: r.id, kind: r.kind || 'avoid' }))
      ];

      return {
        zone: slot.zone,
        horizontal: slot.horizontal,
        alignment: slot.alignment,
        fontSize,
        lineHeight,
        wrapWidth: slot.wrapWidth,
        lineBudget,
        wrappedLines,
        rect: candidateRect,
        status,
        metricOverflow,
        collidedRegionIds: collidedRegions.map((region) => region.id),
        collidedRegions,
        insideOutput,
        insideSafeBounds,
        isGeometricallyValid,
        intersectsCompactFocus,
        intersectsActiveCaption,
        typographyFits
      };
    };

    let acceptCandidate = (candidate) => {
      selectedZone = candidate.zone;
      selectedHorizontal = candidate.horizontal;
      selectedRect = candidate.rect;
      selectedAlignment = candidate.alignment;
      selectedWrappedLines = candidate.wrappedLines;
      selectedWrapWidth = candidate.wrapWidth;
      selectedLineBudget = candidate.lineBudget;
      selectedFontSize = candidate.fontSize;
      selectedLineHeight = candidate.lineHeight;
      selectedCandidateY = Number.isFinite(candidate.adaptiveY) ? candidate.adaptiveY : null;
      selectedIntersectsCompactFocus = candidate.intersectsCompactFocus;
      selectedIntersectsActiveCaption = candidate.intersectsActiveCaption;
      selectedCollidedRegions = [
        ...selectedCollidedRegions,
        ...(candidate.collidedRegions || [])
      ];
    };

    let previousCue = index > 0 ? track[index - 1] : null;
    let isDiscontinuity = false;
    let switchReason = null;
    let decision = null;

    if (index === 0) {
      switchReason = 'initialization';
      decision = 'initialized';
      activeSlot = null;
      usedSlotsInSequence = [];
    } else {
      let gap = cueStartSec - previousCue.endSec;
      let continuityGapSec = continuityGapMs / 1000;
      let explicitDiscontinuity = resetsCaptionContinuity(cue);
      if (gap > continuityGapSec || explicitDiscontinuity) {
        isDiscontinuity = true;
        usedSlotsInSequence = [];
        activeSlot = previousCue.placement;
      } else {
        activeSlot = activeSlot || previousCue.placement;
      }
    }

    let minimumAdaptiveFontSize = Math.min(
      profile.fontSize,
      Math.max(18, Math.round(h * 0.028)),
    );

    let bestPrevEval = null;
    let hasGeometryValidVersion = false;
    let prevEvalDefault = null;

    if (activeSlot) {
      for (let fs = profile.fontSize; fs >= minimumAdaptiveFontSize; fs--) {
        let evaluated = evaluateSlotAtFontSize(activeSlot, fs);
        auditTrail.push(evaluated);

        if (fs === profile.fontSize) {
          prevEvalDefault = evaluated;
        }

        if (evaluated.isGeometricallyValid && !evaluated.intersectsCompactFocus && !evaluated.intersectsActiveCaption) {
          hasGeometryValidVersion = true;
          if (evaluated.typographyFits) {
            bestPrevEval = evaluated;
            break;
          }
        }
      }

      if (bestPrevEval) {
        acceptCandidate(bestPrevEval);
        switchReason = null;
        decision = 'retained';
        activeSlot = {
          zone: selectedZone,
          horizontal: selectedHorizontal,
          alignment: selectedAlignment,
          x: previousCue.placement.x,
          y: previousCue.placement.y,
          wrapWidth: selectedWrapWidth,
          lineBudget: selectedLineBudget,
          fontSize: selectedFontSize,
        };

        let isTypographyChange = selectedFontSize !== previousCue.placement.fontSize
          || selectedWrapWidth !== previousCue.placement.wrapWidth
          || selectedLineBudget !== previousCue.placement.lineBudget
          || selectedWrappedLines.join('\n') !== previousCue.wrappedLines.join('\n');

        if (isTypographyChange) {
          typographyAdaptationCount++;
        }
      } else if (hasGeometryValidVersion) {
        let err = new Error(`Typography cannot fit in the valid geometry of the previous slot for cue ID ${cueId}`);
        err.diagnostics = {
          cueId,
          text,
          wrappedLines: auditTrail[0]?.wrappedLines || [],
          auditTrail,
          profile,
          safeInsets,
          activeAvoids,
          activeCaptionRegions,
        };
        throw err;
      } else {
        if (prevEvalDefault.intersectsCompactFocus || prevEvalDefault.intersectsActiveCaption) {
          switchReason = 'collision';
          selectedCollidedRegions = prevEvalDefault.collidedRegions || [];
        } else {
          switchReason = 'safe-bounds';
        }
        decision = 'moved';
        usedSlotsInSequence.push(activeSlot);
        activeSlot = null;
      }
    }

    if (!selectedZone) {
      for (let candidate of placementCandidates) {
        let evaluated = evaluateCandidate(candidate, profile.fontSize);
        auditTrail.push(evaluated);

        if (evaluated.status === 'clear') {
          let candidateAnchor = captionPlacementAnchor(evaluated.rect, evaluated.alignment);
          let candidateSlot = {
            zone: evaluated.zone,
            horizontal: evaluated.horizontal,
            alignment: evaluated.alignment,
            x: candidateAnchor.x,
            y: candidateAnchor.y,
            wrapWidth: evaluated.wrapWidth,
            lineBudget: evaluated.lineBudget,
            fontSize: evaluated.fontSize
          };

          let isPingPong = usedSlotsInSequence.some((s) => slotsEqual(s, candidateSlot));
          if (isPingPong) {
            continue;
          }

          acceptCandidate(evaluated);
          if (!switchReason) {
            switchReason = 'initialization';
            decision = 'initialized';
          } else if (!decision) {
            decision = 'moved';
          }
          break;
        }
      }
    }

    if (!selectedZone) {
      for (let fontSize = profile.fontSize - 1; !selectedZone && fontSize >= minimumAdaptiveFontSize; fontSize -= 1) {
        for (let candidate of placementCandidates) {
          let evaluated = evaluateCandidate(candidate, fontSize, true);
          auditTrail.push(evaluated);

          if (evaluated.status === 'clear') {
            let candidateAnchor = captionPlacementAnchor(evaluated.rect, evaluated.alignment);
            let candidateSlot = {
              zone: evaluated.zone,
              horizontal: evaluated.horizontal,
              alignment: evaluated.alignment,
              x: candidateAnchor.x,
              y: candidateAnchor.y,
              wrapWidth: evaluated.wrapWidth,
              lineBudget: evaluated.lineBudget,
              fontSize: evaluated.fontSize
            };

            let isPingPong = usedSlotsInSequence.some((s) => slotsEqual(s, candidateSlot));
            if (isPingPong) {
              continue;
            }

            acceptCandidate(evaluated);
            if (!switchReason) {
              switchReason = 'initialization';
              decision = 'initialized';
            } else if (!decision) {
              decision = 'moved';
            }
            break;
          }
        }
      }
    }

    if (!selectedZone) {
      let fewestLines = Math.min(...auditTrail.map((candidate) => candidate.wrappedLines.length));
      let largestLineBudget = Math.max(...auditTrail.map((candidate) => candidate.lineBudget));
      let reason = auditTrail.every((candidate) => candidate.status === 'too-many-lines')
        ? `wrapped lines (${fewestLines}) exceeded available line budget (${largestLineBudget})`
        : auditTrail.some((candidate) => candidate.status === 'out-of-bounds')
          ? 'measured rectangle was outside caption safe bounds'
          : `collisions in all preferred zones: ${profile.preferredZones.join(', ')}`;
      let err = new Error(`No readable placement zone available for cue ID ${cueId}: ${reason}`);
      err.diagnostics = {
        cueId,
        text,
        wrappedLines: auditTrail[0]?.wrappedLines || [],
        auditTrail,
        profile,
        safeInsets,
        activeAvoids,
        activeCaptionRegions,
      };
      throw err;
    }

    let wordTimings = (Array.isArray(cue.wordTimings) ? cue.wordTimings : []).map((word, wordIndex) => {
      let wordText = cleanString(word?.text ?? word?.word, '');
      let startSec = Number(word?.startSec ?? word?.start);
      let endSec = Number(word?.endSec ?? word?.end);
      if (!wordText || !Number.isFinite(startSec) || !Number.isFinite(endSec)
        || startSec < cueStartSec || endSec <= startSec || endSec > cueEndSec + 0.001) {
        throw new TypeError(`caption cue "${cueId}" wordTimings[${wordIndex}] is invalid`);
      }
      return { text: wordText, startSec, endSec };
    });

    let placementAnchor = captionPlacementAnchor(selectedRect, selectedAlignment);

    if (decision === 'moved') {
      relocationCount++;
      if (switchReason === 'collision') {
        forcedCollisionRelocationCount++;
      } else if (switchReason === 'safe-bounds') {
        forcedSafeBoundsRelocationCount++;
      }
    }

    activeSlot = {
      zone: selectedZone,
      horizontal: selectedHorizontal,
      alignment: selectedAlignment,
      x: placementAnchor.x,
      y: placementAnchor.y,
      wrapWidth: selectedWrapWidth,
      lineBudget: selectedLineBudget,
      fontSize: selectedFontSize,
    };

    let acceptedHasCollision = activeAvoids.some((region) => rectsOverlap(selectedRect, region))
      || activeCaptionRegions.some((region) => rectsOverlap(selectedRect, region));

    let acceptedHasSafeBoundsViolation = !rectWithinBounds(selectedRect, outputBounds)
      || !rectWithinBounds(selectedRect, safeBounds)
      || selectedWrappedLines.length > selectedLineBudget
      || selectedWrappedLines.some((line) => (
        estimateLineWidth(line, selectedFontSize, profile.fontWeight) > selectedWrapWidth
      ));

    if (acceptedHasCollision) {
      hardCollisionCount++;
    }
    if (acceptedHasSafeBoundsViolation) {
      safeBoundsViolationCount++;
    }

    let intersectsCompactFocus = activeAvoids.some((region) => (region.kind === 'focus' || region.id === 'focus') && rectsOverlap(selectedRect, {
      x: (region.x ?? 0) - collisionGap,
      y: (region.y ?? 0) - collisionGap,
      width: (region.width ?? 0) + collisionGap * 2,
      height: (region.height ?? 0) + collisionGap * 2,
    }));
    let intersectsActiveCaption = activeCaptionRegions.some((region) => rectsOverlap(selectedRect, region));

    track.push({
      cueId,
      cueIndex: Number.isInteger(Number(cue.cueIndex ?? cue.index))
        ? Number(cue.cueIndex ?? cue.index)
        : index,
      startSec: cueStartSec,
      endSec: cueEndSec,
      speaker: cueSpeaker,
      text,
      wordTimings,
      wrappedLines: selectedWrappedLines,
      measuredRect: selectedRect,
      fontSize: selectedFontSize,
      lineHeight: selectedLineHeight,
      ...continuityEvidence,
      placement: {
        zone: selectedZone,
        horizontal: selectedHorizontal,
        alignment: selectedAlignment,
        x: placementAnchor.x,
        y: placementAnchor.y,
        wrapWidth: selectedWrapWidth,
        lineBudget: selectedLineBudget,
        fontSize: selectedFontSize,
        margins: safeInsets,
        ...(Number.isFinite(selectedCandidateY) ? { candidateY: selectedCandidateY } : {}),
      },
      decisionEvidence: {
        activeAvoidRegionIds: activeAvoids.map((region) => region.id),
        activeCaptionCueIds: activeCaptionRegions.map((region) => region.cueId),
        adaptiveTypography: selectedFontSize < profile.fontSize,
        baseFontSize: profile.fontSize,
        selectedFontSize,
        intersectsCompactFocus,
        intersectsActiveCaption,
        collidedRegions: selectedCollidedRegions,
        auditTrail,
        switchReason,
        decision,
        discontinuity: isDiscontinuity,
      },
    });
  }

  let pingPongCount = 0;
  for (let i = 2; i < track.length; i++) {
    if (slotsEqual(track[i - 2].placement, track[i].placement) && !slotsEqual(track[i - 2].placement, track[i - 1].placement)) {
      let hasDiscontinuity = false;
      let continuityGapSec = continuityGapMs / 1000;
      for (let j = i - 1; j <= i; j++) {
        let prev = track[j - 1];
        let curr = track[j];
        let gap = curr.startSec - prev.endSec;
        let explicitDiscontinuity = resetsCaptionContinuity(curr);
        if (gap > continuityGapSec || explicitDiscontinuity) {
          hasDiscontinuity = true;
          break;
        }
      }
      if (!hasDiscontinuity) {
        pingPongCount++;
      }
    }
  }

  let trackData = {
    schemaVersion: CAPTION_PRESENTATION_TRACK_VERSION,
    profile,
    safeInsets,
    avoidRegions,
    cues: track,
    continuityGapMs,
    relocationCount,
    unforcedSwitchCount,
    pingPongCount,
    hardCollisionCount,
    safeBoundsViolationCount,
    forcedCollisionRelocationCount,
    forcedSafeBoundsRelocationCount,
    typographyAdaptationCount,
  };
  trackData.trackHash = computeTrackHash(trackData);
  return trackData;
}

function canonicalStringify(val) {
  if (val === null || val === undefined) return 'null';
  if (Array.isArray(val)) {
    return '[' + val.map(canonicalStringify).join(',') + ']';
  }
  if (typeof val === 'object') {
    let keys = Object.keys(val).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalStringify(val[k])).join(',') + '}';
  }
  return JSON.stringify(val);
}

function computeTrackHash(trackData) {
  let { trackHash, ...dataToHash } = trackData;
  let str = canonicalStringify(dataToHash);
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.codePointAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function evaluatePreviousSlotForAssertion(slot, fontSize, words, activeAvoids, profile, safeBounds, outputBounds, collisionGap, activeCaptionRegions = []) {
  let lineBudget = slot.lineBudget;
  let lineHeight = Math.round(fontSize * 1.3);
  let wrappedLines = wrapText(words, slot.wrapWidth, fontSize, profile.fontWeight);
  let estimatedWidths = wrappedLines.map((line) => (
    estimateLineWidth(line, fontSize, profile.fontWeight)
  ));
  let widestEstimatedLine = Math.max(1, ...estimatedWidths);
  let metricOverflow = widestEstimatedLine > slot.wrapWidth;
  let measuredWidth = Math.min(
    slot.wrapWidth,
    widestEstimatedLine + captionLineSafetyGutter(fontSize),
  );
  let measuredHeight = Math.round(wrappedLines.length * lineHeight);

  let horizontal = slot.alignment % 3;
  let x = horizontal === 1 ? slot.x
    : horizontal === 2 ? slot.x - Math.round(measuredWidth / 2)
      : slot.x - measuredWidth;
  let y = slot.alignment >= 7 ? slot.y
    : slot.alignment <= 3 ? slot.y - measuredHeight
      : slot.y - Math.round(measuredHeight / 2);

  let candidateRect = {
    x: Math.round(x),
    y: Math.round(y),
    width: measuredWidth,
    height: measuredHeight,
  };

  let compactCollided = activeAvoids.filter((region) => (region.kind === 'focus' || region.id === 'focus') && rectsOverlap(candidateRect, {
    x: (region.x ?? 0) - collisionGap,
    y: (region.y ?? 0) - collisionGap,
    width: (region.width ?? 0) + collisionGap * 2,
    height: (region.height ?? 0) + collisionGap * 2,
  }));
  let activeCaptionsCollided = activeCaptionRegions.filter((region) => rectsOverlap(candidateRect, region));

  let insideOutput = rectWithinBounds(candidateRect, outputBounds);
  let insideSafeBounds = rectWithinBounds(candidateRect, safeBounds);

  let isGeometricallyValid = insideOutput && insideSafeBounds;
  let intersectsCompactFocus = compactCollided.length > 0;
  let intersectsActiveCaption = activeCaptionsCollided.length > 0;

  return {
    isGeometricallyValid,
    intersectsCompactFocus,
    intersectsActiveCaption
  };
}

export function assertCaptionPlacementTrack(value = {}) {
  if (!value || value.schemaVersion !== CAPTION_PRESENTATION_TRACK_VERSION) {
    throw new TypeError(`caption placement track must use ${CAPTION_PRESENTATION_TRACK_VERSION}`);
  }
  let profile = value.profile;
  if (!profile || profile.schemaVersion !== 'caption-presentation-profile-v1'
    || !Number.isInteger(profile.width) || profile.width <= 0
    || !Number.isInteger(profile.height) || profile.height <= 0
    || ![400, 700].includes(profile.fontWeight)) {
    throw new TypeError('caption placement track has an invalid resolved profile');
  }
  let safeInsets = value.safeInsets;
  if (!safeInsets || !['top', 'bottom', 'left', 'right'].every((key) => (
    Number.isFinite(safeInsets[key]) && safeInsets[key] >= 0
  ))) {
    throw new TypeError('caption placement track has invalid safe insets');
  }
  let outputBounds = { x: 0, y: 0, width: profile.width, height: profile.height };
  let safeBounds = safeCaptionBounds(profile.width, profile.height, safeInsets);
  if (!positiveFiniteRect(safeBounds)) {
    throw new TypeError('caption placement track safe insets leave no readable output area');
  }
  if (!Array.isArray(value.cues)) throw new TypeError('caption placement track cues must be an array');

  if (!Number.isInteger(value.relocationCount) || value.relocationCount < 0) {
    throw new TypeError('caption placement track has an invalid relocationCount');
  }
  if (!Number.isInteger(value.unforcedSwitchCount) || value.unforcedSwitchCount < 0) {
    throw new TypeError('caption placement track has an invalid unforcedSwitchCount');
  }
  if (!Number.isInteger(value.pingPongCount) || value.pingPongCount < 0) {
    throw new TypeError('caption placement track has an invalid pingPongCount');
  }
  if (!Number.isInteger(value.hardCollisionCount) || value.hardCollisionCount < 0) {
    throw new TypeError('caption placement track has an invalid hardCollisionCount');
  }
  if (!Number.isInteger(value.safeBoundsViolationCount) || value.safeBoundsViolationCount < 0) {
    throw new TypeError('caption placement track has an invalid safeBoundsViolationCount');
  }
  if (!Number.isInteger(value.forcedCollisionRelocationCount) || value.forcedCollisionRelocationCount < 0) {
    throw new TypeError('caption placement track has an invalid forcedCollisionRelocationCount');
  }
  if (!Number.isInteger(value.forcedSafeBoundsRelocationCount) || value.forcedSafeBoundsRelocationCount < 0) {
    throw new TypeError('caption placement track has an invalid forcedSafeBoundsRelocationCount');
  }
  if (!Number.isInteger(value.typographyAdaptationCount) || value.typographyAdaptationCount < 0) {
    throw new TypeError('caption placement track has an invalid typographyAdaptationCount');
  }
  if (!Number.isInteger(value.continuityGapMs) || value.continuityGapMs <= 0) {
    throw new TypeError('caption placement track has an invalid continuityGapMs');
  }


  let ids = new Set();
  let acceptedCues = [];

  let expectedRelocationCount = 0;
  let expectedForcedCollisionCount = 0;
  let expectedForcedSafeBoundsCount = 0;
  let expectedTypographyAdaptationCount = 0;

  for (let [index, cue] of value.cues.entries()) {
    let cueId = explicitCaptionCueId(cue, index, 'caption placement track cue');
    if (ids.has(cueId)) {
      throw new TypeError(`caption placement track cue ${index} has a duplicate cueId`);
    }
    ids.add(cueId);
    if (!Number.isFinite(cue.startSec) || !Number.isFinite(cue.endSec)
      || cue.startSec < 0 || cue.endSec <= cue.startSec) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has invalid timing`);
    }
    if (!cleanString(cue.text, '') || !Array.isArray(cue.wrappedLines) || !cue.wrappedLines.length) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has invalid text lines`);
    }
    if (!Number.isInteger(cue.fontSize) || cue.fontSize < 18 || cue.fontSize > profile.fontSize
      || !Number.isInteger(cue.lineHeight) || cue.lineHeight !== Math.round(cue.fontSize * 1.3)) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has invalid typography`);
    }
    if (!cue.placement || !Number.isInteger(cue.placement.alignment)
      || cue.placement.alignment < 1 || cue.placement.alignment > 9
      || !Number.isFinite(cue.placement.x) || !Number.isFinite(cue.placement.y)
      || !Number.isInteger(cue.placement.fontSize)) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has invalid placement`);
    }
    if (!Number.isInteger(cue.placement.lineBudget)
      || cue.placement.lineBudget < cue.wrappedLines.length
      || cue.placement.lineBudget > 10) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has an invalid line budget`);
    }
    let horizontal = cue.placement.alignment % 3 === 1 ? 'left'
      : cue.placement.alignment % 3 === 0 ? 'right' : 'center';
    if (cue.placement.horizontal !== undefined && cue.placement.horizontal !== horizontal) {
      throw new TypeError(
        `caption placement track cue "${cue.cueId}" has an inconsistent horizontal placement`,
      );
    }
    if (!positiveFiniteRect(cue.measuredRect)) {
      throw new TypeError(
        `caption placement track cue "${cue.cueId}" has an invalid measured rectangle`,
      );
    }
    if (!rectWithinBounds(cue.measuredRect, outputBounds)) {
      throw new TypeError(
        `caption placement track cue "${cue.cueId}" measured rectangle is outside output bounds`,
      );
    }
    if (!rectWithinBounds(cue.measuredRect, safeBounds)) {
      throw new TypeError(
        `caption placement track cue "${cue.cueId}" measured rectangle is outside caption safe bounds`,
      );
    }
    let expectedAnchor = captionPlacementAnchor(cue.measuredRect, cue.placement.alignment);
    if (cue.placement.x !== expectedAnchor.x || cue.placement.y !== expectedAnchor.y) {
      throw new TypeError(
        `caption placement track cue "${cue.cueId}" placement does not match its measured rectangle`,
      );
    }
    let overlappingCue = acceptedCues.find((item) => (
      timeRangesOverlap(cue.startSec, cue.endSec, item.startSec, item.endSec)
      && rectsOverlap(cue.measuredRect, item.measuredRect)
    ));
    if (overlappingCue) {
      throw new TypeError(
        `caption placement track cues "${overlappingCue.cueId}" and "${cue.cueId}" overlap`,
      );
    }

    let validReasons = ['initialization', 'collision', 'safe-bounds', null];
    let validDecisions = ['initialized', 'retained', 'moved'];
    let decision = cue.decisionEvidence?.decision;
    if (!validDecisions.includes(decision)) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has an invalid or missing decision`);
    }
    let reason = cue.decisionEvidence?.switchReason ?? null;
    if (!validReasons.includes(reason)) {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has an invalid switchReason`);
    }
    if (decision === 'retained' && reason !== null) {
      throw new TypeError(`caption placement track cue "${cue.cueId}": decision is "retained" but switchReason is not null`);
    }
    if (decision === 'initialized' && reason !== 'initialization') {
      throw new TypeError(`caption placement track cue "${cue.cueId}": decision is "initialized" but switchReason is not "initialization"`);
    }
    if (decision === 'moved' && reason !== 'collision' && reason !== 'safe-bounds') {
      throw new TypeError(`caption placement track cue "${cue.cueId}": decision is "moved" but switchReason is not "collision" or "safe-bounds"`);
    }
    if (typeof cue.decisionEvidence?.discontinuity !== 'boolean') {
      throw new TypeError(`caption placement track cue "${cue.cueId}" has an invalid or missing discontinuity flag in decisionEvidence`);
    }
    captionContinuityEvidence(cue, `caption placement track cue "${cue.cueId}"`);

    // Counter validation mapping
    if (reason === 'collision') {
      expectedRelocationCount++;
      expectedForcedCollisionCount++;
    } else if (reason === 'safe-bounds') {
      expectedRelocationCount++;
      expectedForcedSafeBoundsCount++;
    }

    if (index > 0) {
      let prevCue = value.cues[index - 1];
      if (decision === 'retained') {
        let isTypographyChange = cue.placement.fontSize !== prevCue.placement.fontSize
          || cue.placement.wrapWidth !== prevCue.placement.wrapWidth
          || cue.placement.lineBudget !== prevCue.placement.lineBudget
          || cue.wrappedLines.join('\n') !== prevCue.wrappedLines.join('\n');
        if (isTypographyChange) {
          expectedTypographyAdaptationCount++;
        }
      }

      // Geometry / Reason Contradiction Validation
      let prevSlot = {
        zone: prevCue.placement.zone,
        horizontal: prevCue.placement.horizontal,
        alignment: prevCue.placement.alignment,
        x: prevCue.placement.x,
        y: prevCue.placement.y,
        wrapWidth: prevCue.placement.wrapWidth,
        lineBudget: prevCue.placement.lineBudget,
      };

      let minimumAdaptiveFontSize = Math.min(
        profile.fontSize,
        Math.max(18, Math.round(profile.height * 0.028)),
      );

      let hasGeometryValidVersion = false;
      let prevEvalDefault = null;

      let words = cue.text.split(/\s+/).filter(Boolean);
      let collisionGap = Math.max(4, Math.round(profile.fontSize * 0.06));

      let activeAvoids = value.avoidRegions.filter(region => {
        let rStart = region.startSec ?? region.start ?? null;
        let rEnd = region.endSec ?? region.end ?? null;
        if (rStart === null || rEnd === null) return true;
        return timeRangesOverlap(cue.startSec, cue.endSec, rStart, rEnd);
      });
      let activeCaptionRegions = acceptedCues
        .filter((item) => timeRangesOverlap(
          cue.startSec,
          cue.endSec,
          item.startSec,
          item.endSec,
        ))
        .map((item) => ({
          id: `caption-cue:${item.cueId}`,
          kind: 'caption',
          cueId: item.cueId,
          startSec: item.startSec,
          endSec: item.endSec,
          ...item.measuredRect,
        }));

      for (let fs = profile.fontSize; fs >= minimumAdaptiveFontSize; fs--) {
        let evalResult = evaluatePreviousSlotForAssertion(prevSlot, fs, words, activeAvoids, profile, safeBounds, outputBounds, collisionGap, activeCaptionRegions);
        if (fs === profile.fontSize) {
          prevEvalDefault = evalResult;
        }
        if (evalResult.isGeometricallyValid && !evalResult.intersectsCompactFocus && !evalResult.intersectsActiveCaption) {
          hasGeometryValidVersion = true;
        }
      }

      if (hasGeometryValidVersion) {
        if (decision === 'moved') {
          throw new TypeError(`Contradiction at cue "${cue.cueId}": moved with reason "${reason}" but the previous slot's geometry was valid`);
        }
      } else {
        if (decision === 'retained') {
          throw new TypeError(`Contradiction at cue "${cue.cueId}": retained slot but the previous slot's geometry was invalid`);
        }
        let expectedReason = (prevEvalDefault.intersectsCompactFocus || prevEvalDefault.intersectsActiveCaption) ? 'collision' : 'safe-bounds';
        if (reason !== expectedReason) {
          throw new TypeError(`Contradiction at cue "${cue.cueId}": expected move reason "${expectedReason}" but got "${reason}"`);
        }
      }
    }

    acceptedCues.push(cue);
  }

  if (value.relocationCount !== expectedRelocationCount) {
    throw new TypeError(`caption placement track has an incorrect relocationCount: got ${value.relocationCount}, expected ${expectedRelocationCount}`);
  }
  if (value.forcedCollisionRelocationCount !== expectedForcedCollisionCount) {
    throw new TypeError(`caption placement track has an incorrect forcedCollisionRelocationCount: got ${value.forcedCollisionRelocationCount}, expected ${expectedForcedCollisionCount}`);
  }
  if (value.forcedSafeBoundsRelocationCount !== expectedForcedSafeBoundsCount) {
    throw new TypeError(`caption placement track has an incorrect forcedSafeBoundsRelocationCount: got ${value.forcedSafeBoundsRelocationCount}, expected ${expectedForcedSafeBoundsCount}`);
  }
  if (value.typographyAdaptationCount !== expectedTypographyAdaptationCount) {
    throw new TypeError(`caption placement track has an incorrect typographyAdaptationCount: got ${value.typographyAdaptationCount}, expected ${expectedTypographyAdaptationCount}`);
  }

  if (!Array.isArray(value.avoidRegions)) {
    throw new TypeError('caption placement track avoid regions must be an array');
  }

  let avoidIds = new Set();
  for (let [index, region] of value.avoidRegions.entries()) {
    let id = region?.id !== undefined ? cleanString(region.id, '') : '';
    if (!id) {
      throw new TypeError(`avoidRegions[${index}] has a missing or empty ID`);
    }
    if (avoidIds.has(id)) {
      throw new TypeError(`duplicate avoid-region ID "${id}"`);
    }
    avoidIds.add(id);

    let x = Number(region?.x ?? region?.left);
    let y = Number(region?.y ?? region?.top);
    let width = Number(region?.width);
    let height = Number(region?.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      throw new TypeError(`avoidRegions[${index}] must contain a positive finite rectangle`);
    }
    let startSec = region?.startSec ?? region?.start;
    let endSec = region?.endSec ?? region?.end;
    if ((startSec === undefined) !== (endSec === undefined)) {
      throw new TypeError(`avoidRegions[${index}] must provide both startSec and endSec`);
    }
    if (startSec !== undefined) {
      startSec = Number(startSec);
      endSec = Number(endSec);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec) || startSec < 0 || endSec <= startSec) {
        throw new TypeError(`avoidRegions[${index}] has invalid timing`);
      }
    }
  }

  let canonical;
  try {
    canonical = buildCaptionPlacementTrack(value.cues.map((cue) => ({
      cueId: cue.cueId,
      cueIndex: cue.cueIndex,
      startSec: cue.startSec,
      endSec: cue.endSec,
      speaker: cue.speaker,
      text: cue.text,
      wordTimings: cue.wordTimings,
      ...captionContinuityEvidence(cue, `caption placement track cue "${cue.cueId}"`),
    })), {
      width: profile.width,
      height: profile.height,
      captionStyle: profile,
      safeInsets,
      avoidRegions: value.avoidRegions,
      continuityGapMs: value.continuityGapMs,
    });
  } catch (cause) {
    throw new TypeError(`caption placement track cannot be reproduced from its evidence: ${cause.message}`);
  }
  if (!sameValue(profile, canonical.profile)
    || !sameValue(safeInsets, canonical.safeInsets)
    || !sameValue(value.avoidRegions, canonical.avoidRegions)
    || !sameValue(value.cues, canonical.cues)
    || value.continuityGapMs !== canonical.continuityGapMs
    || value.relocationCount !== canonical.relocationCount
    || value.unforcedSwitchCount !== canonical.unforcedSwitchCount
    || value.pingPongCount !== canonical.pingPongCount
    || value.hardCollisionCount !== canonical.hardCollisionCount
    || value.safeBoundsViolationCount !== canonical.safeBoundsViolationCount
    || value.forcedCollisionRelocationCount !== canonical.forcedCollisionRelocationCount
    || value.forcedSafeBoundsRelocationCount !== canonical.forcedSafeBoundsRelocationCount
    || value.typographyAdaptationCount !== canonical.typographyAdaptationCount) {
    throw new TypeError('caption placement track does not match its resolved presentation evidence');
  }

  // Validate track hash signature
  if (typeof value.trackHash !== 'string' || !value.trackHash) {
    throw new TypeError('caption placement track must have a trackHash');
  }
  let expectedTrackHash = computeTrackHash(value);
  if (value.trackHash !== expectedTrackHash) {
    throw new TypeError(`caption placement trackHash does not match its contents (signature is invalid or mutated). Got: ${value.trackHash}, Expected: ${expectedTrackHash}`);
  }

  return value;
}

export function renderAss(input = {}) {
  let placementResult = assertCaptionPlacementTrack(input);
  let profile = placementResult.profile;
  let track = placementResult.cues;
  if (!track.length) return '';
  let styleName = getStyleName(profile.preset);

  let header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${profile.width}`,
    `PlayResY: ${profile.height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: ${styleName},${profile.fontName},${profile.fontSize},${profile.primaryColorAss},${profile.highlightColorAss},${profile.outlineColorAss},${profile.backColorAss},${profile.fontWeight >= 600 ? -1 : 0},0,0,0,100,100,0,0,3,1,1,2,0,0,0,1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ];

  let events = [];
  for (let i = 0; i < track.length; i++) {
    let item = track[i];

    let alignment = item.placement.alignment;
    let posX = item.placement.x;
    let posY = item.placement.y;

    let textWithKaraoke = assFormattedText(item);
    let fontSizeOverride = item.fontSize === profile.fontSize ? '' : `\\fs${item.fontSize}`;
    let formattedLine = `{\\an${alignment}\\pos(${posX},${posY})${fontSizeOverride}}${textWithKaraoke}`;

    events.push([
      'Dialogue: 0',
      formatAssTimestamp(item.startSec),
      formatAssTimestamp(item.endSec),
      styleName,
      escapeAssText(item.speaker || ''),
      '0000',
      '0000',
      '0000',
      item.cueId,
      formattedLine,
    ].join(','));
  }

  return `${header.concat(events).join('\n')}\n`;
}

function assFormattedText(cue) {
  let wrappedLines = cue.wrappedLines;
  let timings = Array.isArray(cue.wordTimings) ? cue.wordTimings : [];
  if (!timings.length) {
    return wrappedLines.map(line => escapeAssText(line)).join('\\N');
  }

  let cursorSec = Math.max(0, Number(cue.startSec || 0));
  let resultParts = [];
  let timingIndex = 0;

  for (let l = 0; l < wrappedLines.length; l++) {
    let line = wrappedLines[l];
    let lineWords = line.split(/\s+/).filter(Boolean);
    let lineParts = [];

    for (let w = 0; w < lineWords.length; w++) {
      let displayWord = lineWords[w];
      let wordObj = timings[timingIndex];
      let matchesTiming = wordObj
        && normalizedCaptionWord(wordObj.text) === normalizedCaptionWord(displayWord);
      if (!matchesTiming) {
        lineParts.push(escapeAssText(displayWord));
        continue;
      }
      timingIndex++;

      let startSec = Math.max(cursorSec, Number(wordObj.startSec || cursorSec));
      let endSec = Math.max(startSec + 0.01, Number(wordObj.endSec || startSec + 0.35));
      let durationCs = Math.max(1, Math.round((endSec - cursorSec) * 100));

      lineParts.push(`{\\k${durationCs}}${escapeAssText(displayWord)}`);
      cursorSec = endSec;
    }

    resultParts.push(lineParts.join(' '));
  }

  let tailCs = Math.max(0, Math.round((Number(cue.endSec || cursorSec) - cursorSec) * 100));
  if (tailCs > 0) {
    resultParts[resultParts.length - 1] += ` {\\k${tailCs}}`;
  }

  return resultParts.join('\\N');
}

export function captionTranscriptDurationSec(transcript = {}) {
  let explicit = Number(transcript.durationSec ?? transcript.duration ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  let words = Array.isArray(transcript.words) ? transcript.words : [];
  return words.reduce((max, word) => Math.max(max, captionWordTimeSeconds(word, 'end', 0)), 0);
}

export function captionCuesFromTranscript(transcript = {}, cues = []) {
  let words = Array.isArray(transcript.words) ? transcript.words : [];
  let captionCues = [];
  let current = null;
  for (let word of words) {
    let text = cleanString(word?.word || word?.text, '');
    if (!text) continue;
    let startSec = captionWordTimeSeconds(word, 'start', current?.endSec || 0);
    let endSec = Math.max(startSec + 0.05, captionWordTimeSeconds(word, 'end', startSec + 0.35));
    let attribution = captionAttributionForRange(startSec, endSec, cues);
    let gapSec = current ? startSec - current.endSec : 0;
    let shouldBreak = !current
      || current.speaker !== attribution.speaker
      || current.cueId !== attribution.cueId
      || current.words.length >= CAPTION_MAX_WORDS
      || captionRenderedCharacterCount([...current.words, text], current.speaker) > CAPTION_MAX_CHARACTERS
      || gapSec > 0.75
      || /[.!?]$/.test(current.words[current.words.length - 1] || '');
    if (shouldBreak) {
      current = {
        startSec,
        endSec,
        words: [],
        wordTimings: [],
        speaker: attribution.speaker,
        attributionSource: attribution.source,
        cueIndex: attribution.cueIndex,
        cueId: attribution.cueId,
        unmappedWordCount: 0,
      };
      captionCues.push(current);
    }
    current.words.push(text);
    current.wordTimings.push({ text, startSec, endSec });
    current.endSec = Math.max(current.endSec, endSec);
    if (attribution.source === 'unmapped') current.unmappedWordCount += 1;
  }
  if (!captionCues.length && transcript.text) {
    let durationSec = Number(transcript.durationSec || transcript.duration || 0);
    let safeDuration = Number.isFinite(durationSec) && durationSec > 0 ? durationSec : 1;
    let attribution = captionAttributionForRange(0, safeDuration, cues);
    captionCues.push({
      startSec: 0,
      endSec: safeDuration,
      words: [cleanString(transcript.text, '')],
      wordTimings: [],
      speaker: attribution.speaker,
      attributionSource: attribution.source,
      cueIndex: attribution.cueIndex,
      cueId: attribution.cueId,
      unmappedWordCount: attribution.source === 'unmapped' ? 1 : 0,
    });
  }
  return captionCues.filter((cue) => cue.words.join(' ').trim());
}

function authoredCaptionTokens(value) {
  return cleanString(value, '').split(/\s+/).filter(Boolean);
}

function timedCaptionWords(words = []) {
  return (Array.isArray(words) ? words : [])
    .map((word, inputIndex) => {
      let text = cleanString(word?.word || word?.text, '');
      let startSec = captionWordTimeSeconds(word, 'start', 0);
      let endSec = Math.max(startSec + 0.05, captionWordTimeSeconds(word, 'end', startSec + 0.35));
      return { text, startSec, endSec, inputIndex };
    })
    .filter((word) => word.text)
    .sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.inputIndex - b.inputIndex)
    .map(({ inputIndex, ...word }) => word);
}

function distributeCount(total, weights = []) {
  if (!weights.length || total < weights.length) return null;
  let counts = weights.map(() => 1);
  let remaining = total - weights.length;
  if (!remaining) return counts;
  let safeWeights = weights.map((weight) => {
    let number = Number(weight);
    return Number.isFinite(number) && number > 0 ? number : 1;
  });
  let weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);
  let shares = safeWeights.map((weight, index) => ({
    index,
    exact: (remaining * weight) / weightTotal,
  }));
  let assigned = 0;
  for (let share of shares) {
    let whole = Math.floor(share.exact);
    counts[share.index] += whole;
    assigned += whole;
  }
  shares
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.index - b.index)
    .slice(0, remaining - assigned)
    .forEach((share) => {
      counts[share.index] += 1;
    });
  return counts;
}

function captionSpeechSegments(words = []) {
  let segments = [];
  for (let word of words) {
    let current = segments[segments.length - 1];
    if (!current || word.startSec - current[current.length - 1].endSec > CAPTION_LONG_PAUSE_SEC) {
      current = [];
      segments.push(current);
    }
    current.push(word);
  }
  return segments;
}

function alignTokensWithinSpeech(tokens = [], words = []) {
  if (tokens.length === words.length) {
    return tokens.map((text, index) => ({
      text,
      startSec: words[index].startSec,
      endSec: words[index].endSec,
    }));
  }
  if (tokens.length > words.length) {
    let tokenCounts = distributeCount(tokens.length, words.map((word) => word.endSec - word.startSec));
    let cursor = 0;
    let aligned = [];
    words.forEach((word, wordIndex) => {
      let count = tokenCounts[wordIndex];
      let durationSec = Math.max(0.05, word.endSec - word.startSec);
      for (let offset = 0; offset < count; offset += 1) {
        let startSec = word.startSec + (durationSec * offset) / count;
        let endSec = word.startSec + (durationSec * (offset + 1)) / count;
        aligned.push({ text: tokens[cursor], startSec, endSec });
        cursor += 1;
      }
    });
    return aligned;
  }
  let wordCounts = distributeCount(words.length, tokens.map((token) => token.replace(/[^\p{L}\p{N}]/gu, '').length || 1));
  let cursor = 0;
  return tokens.map((text, tokenIndex) => {
    let assigned = words.slice(cursor, cursor + wordCounts[tokenIndex]);
    cursor += wordCounts[tokenIndex];
    return {
      text,
      startSec: assigned[0].startSec,
      endSec: assigned[assigned.length - 1].endSec,
    };
  });
}

export function alignAuthoredCaptionWords(authoredText = '', timedWords = []) {
  let tokens = authoredCaptionTokens(authoredText);
  let sourceWords = timedCaptionWords(timedWords);
  let authoredTokenCount = tokens.length;
  let whisperWordCount = sourceWords.length;
  let mismatchRatio = Math.abs(authoredTokenCount - whisperWordCount) / Math.max(1, authoredTokenCount, whisperWordCount);
  if (!tokens.length || !sourceWords.length) {
    return {
      words: sourceWords,
      authoredTokenCount,
      whisperWordCount,
      mismatchRatio,
      mode: tokens.length ? 'authored-without-timing' : 'whisper-fallback',
      warning: tokens.length > 0 && !sourceWords.length,
      warningReason: tokens.length > 0 && !sourceWords.length ? 'missing-whisper-word-timings' : '',
    };
  }
  if (tokens.length === sourceWords.length) {
    return {
      words: alignTokensWithinSpeech(tokens, sourceWords),
      authoredTokenCount,
      whisperWordCount,
      mismatchRatio,
      mode: 'authored-identity',
      warning: false,
      warningReason: '',
    };
  }

  let segments = captionSpeechSegments(sourceWords);
  let segmentTokenCounts = distributeCount(tokens.length, segments.map((segment) => segment.length));
  let warningReason = mismatchRatio > CAPTION_ALIGNMENT_WARNING_RATIO ? 'large-token-count-mismatch' : '';
  let aligned = [];
  if (segmentTokenCounts) {
    let cursor = 0;
    segments.forEach((segment, index) => {
      let segmentTokens = tokens.slice(cursor, cursor + segmentTokenCounts[index]);
      aligned.push(...alignTokensWithinSpeech(segmentTokens, segment));
      cursor += segmentTokenCounts[index];
    });
  } else {
    aligned = alignTokensWithinSpeech(tokens, sourceWords);
    warningReason = 'authored-token-count-below-speech-segment-count';
  }
  return {
    words: aligned,
    authoredTokenCount,
    whisperWordCount,
    mismatchRatio,
    mode: segmentTokenCounts ? 'authored-resampled' : 'authored-resampled-degraded',
    warning: Boolean(warningReason),
    warningReason,
  };
}

function clipCaptionAlignment(clip = {}) {
  return alignAuthoredCaptionWords(clip.authoredText, clip.words);
}

export function captionCuesFromTimedWords(timedWords = [], options = {}) {
  if (!Array.isArray(timedWords)) throw new TypeError('caption timed words must be an array');
  let maxWords = options.maxWords === undefined ? CAPTION_MAX_WORDS : Number(options.maxWords);
  let maxCharacters = options.maxCharacters === undefined
    ? CAPTION_MAX_CHARACTERS
    : Number(options.maxCharacters);
  if (!Number.isInteger(maxWords) || maxWords <= 0) {
    throw new TypeError('caption maxWords must be a positive integer');
  }
  if (!Number.isInteger(maxCharacters) || maxCharacters <= 0) {
    throw new TypeError('caption maxCharacters must be a positive integer');
  }
  let words = timedWords.map((word, index) => {
    let text = cleanString(word?.text ?? word?.word, '');
    let startSec = Number(word?.startSec ?? word?.start);
    let endSec = Number(word?.endSec ?? word?.end);
    if (!text || !Number.isFinite(startSec) || !Number.isFinite(endSec)
      || startSec < 0 || endSec <= startSec) {
      throw new TypeError(`caption timed words[${index}] is invalid`);
    }
    return {
      text,
      startSec,
      endSec,
      speaker: cleanString(word?.speaker, ''),
      cueIndex: Number.isFinite(Number(word?.cueIndex)) ? Number(word.cueIndex) : null,
      cueId: typeof word?.cueId === 'string' ? cleanString(word.cueId, '') : '',
      timingSource: cleanString(word?.timingSource ?? word?.attributionSource, 'timed-word'),
    };
  });
  words.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec || a.speaker.localeCompare(b.speaker));
  let captionCues = [];
  let current = null;
  for (let word of words) {
    let gapSec = current ? word.startSec - current.endSec : 0;
    let shouldBreak = !current
      || current.speaker !== word.speaker
      || current.cueIndex !== word.cueIndex
      || current.cueId !== word.cueId
      || current.attributionSource !== word.timingSource
      || current.words.length >= maxWords
      || captionRenderedCharacterCount([...current.words, word.text], current.speaker) > maxCharacters
      || gapSec > CAPTION_LONG_PAUSE_SEC
      || /[.!?]$/.test(current.words[current.words.length - 1] || '');
    if (shouldBreak) {
      current = {
        startSec: word.startSec,
        endSec: word.endSec,
        words: [],
        wordTimings: [],
        speaker: word.speaker,
        attributionSource: word.timingSource,
        cueIndex: word.cueIndex,
        cueId: word.cueId,
        unmappedWordCount: 0,
      };
      captionCues.push(current);
    }
    current.words.push(word.text);
    current.wordTimings.push({ text: word.text, startSec: word.startSec, endSec: word.endSec });
    current.endSec = Math.max(current.endSec, word.endSec);
  }
  return captionCues.filter((cue) => cue.words.join(' ').trim());
}

export function captionCuesFromClipTranscripts(clipTranscripts = []) {
  let words = [];
  for (let clip of Array.isArray(clipTranscripts) ? clipTranscripts : []) {
    let alignment = clipCaptionAlignment(clip);
    let timingSource = alignment.mode.startsWith('authored-') ? 'authored-clip-timing' : 'clip-transcript';
    for (let word of alignment.words) {
      words.push({
        text: word.text,
        startSec: word.startSec,
        endSec: word.endSec,
        speaker: cleanString(clip.speaker, ''),
        cueIndex: Number.isFinite(Number(clip.cueIndex)) ? Number(clip.cueIndex) : null,
        cueId: typeof clip?.cueId === 'string' ? cleanString(clip.cueId, '') : '',
        timingSource,
      });
    }
  }
  return captionCuesFromTimedWords(words);
}

function hasTimedClipTranscriptWords(clipTranscripts = []) {
  return (Array.isArray(clipTranscripts) ? clipTranscripts : []).some((clip) => (
    Array.isArray(clip?.words)
    && clip.words.some((word) => cleanString(word?.word || word?.text, ''))
  ));
}

function assignCanonicalCaptionCueIds(cues = []) {
  let identities = new Set();
  for (let i = 0; i < cues.length; i++) {
    let cue = cues[i];
    let cueId = typeof cue?.cueId === 'string' ? cleanString(cue.cueId, '') : '';
    if (!cueId) {
      throw new TypeError(`caption cue ${i} is missing cueId`);
    }
    if (!/^[a-z][a-z0-9._:-]*$/.test(cueId)) {
      throw new TypeError(`caption cue ${i} has unsafe cueId "${cueId}"; must match /^[a-z][a-z0-9._:-]*$/`);
    }
    if (identities.has(cueId)) {
      throw new TypeError(`caption cue identity "${cueId}" is ambiguous`);
    }
    identities.add(cueId);
  }
  return cues.map((cue) => ({
    ...cue,
    cueId: cleanString(cue.cueId, '')
  }));
}

function captionAlignmentSummary(clipTranscripts = []) {
  let clips = (Array.isArray(clipTranscripts) ? clipTranscripts : [])
    .map((clip) => ({
      itemIndex: Number.isFinite(Number(clip.itemIndex)) ? Number(clip.itemIndex) : null,
      cueIndex: Number.isFinite(Number(clip.cueIndex)) ? Number(clip.cueIndex) : null,
      speaker: cleanString(clip.speaker, ''),
      ...clipCaptionAlignment(clip),
    }))
    .map(({ words, ...alignment }) => alignment);
  let timedClips = clips.filter((clip) => clip.whisperWordCount > 0);
  let authoredClipCount = timedClips.filter((clip) => clip.mode.startsWith('authored-')).length;
  return {
    clips,
    timedClipCount: timedClips.length,
    authoredClipCount,
    fallbackClipCount: timedClips.length - authoredClipCount,
    warningCount: clips.filter((clip) => clip.warning).length,
  };
}

export function renderVtt(cues = []) {
  let includeSpeaker = new Set(cues.map((cue) => cleanString(cue.speaker, '')).filter(Boolean)).size > 1;
  let lines = ['WEBVTT', ''];
  let cueIds = new Set();
  cues.forEach((cue, index) => {
    let rawCueId = String(cue?.cueId ?? '');
    let cueId = cleanString(rawCueId, '');
    if (!cueId || !/^[a-z][a-z0-9._:-]*$/.test(cueId)) {
      throw new TypeError(`caption cue ${index} has unsafe or missing cueId "${cueId}"; must match /^[a-z][a-z0-9._:-]*$/`);
    }
    if (cueIds.has(cueId)) {
      throw new TypeError(`duplicate cue ID "${cueId}"`);
    }
    cueIds.add(cueId);
    lines.push(cueId);
    lines.push(`${formatVttTimestamp(cue.startSec)} --> ${formatVttTimestamp(cue.endSec)}`);
    let text = cue.words.join(' ');
    if (includeSpeaker && cue.speaker) text = `${cue.speaker.toUpperCase()}: ${text}`;
    lines.push(escapeVttText(text));
    lines.push('');
  });
  return `${lines.join('\n')}\n`;
}

export function buildCaptionCues({
  transcript = {},
  cues: sourceCues = [],
  clipTranscripts = [],
  sequenceMode = '',
  presentation = null,
} = {}) {
  let useClipTranscripts = hasTimedClipTranscriptWords(clipTranscripts);
  let alignment = captionAlignmentSummary(clipTranscripts);
  let rawCues = useClipTranscripts
    ? captionCuesFromClipTranscripts(clipTranscripts)
    : captionCuesFromTranscript(transcript, sourceCues);
  let cues = assignCanonicalCaptionCueIds(rawCues);
  let source = 'whisper+range-map';
  if (useClipTranscripts && alignment.authoredClipCount === alignment.timedClipCount) {
    source = 'authored+whisper-clip-range-map';
  } else if (useClipTranscripts && alignment.authoredClipCount > 0) {
    source = 'mixed-authored-whisper+clip-range-map';
  } else if (useClipTranscripts) {
    source = 'whisper+clip-range-map';
  }
  let placementTrack = presentation && cues.length
    ? buildCaptionPlacementTrack(cues, presentation)
    : null;
  return {
    cues,
    vtt: renderVtt(cues),
    placementTrack,
    ass: placementTrack ? renderAss(placementTrack) : '',
    source,
    alignment,
  };
}

function parseAssDialogueLine(line) {
  if (!line.startsWith('Dialogue:')) return null;
  let content = line.substring('Dialogue:'.length).trim();
  let parts = [];
  let current = '';
  let commas = 0;
  for (let i = 0; i < content.length; i++) {
    let char = content[i];
    if (char === ',' && commas < 9) {
      parts.push(current);
      current = '';
      commas++;
    } else {
      current += char;
    }
  }
  parts.push(current);
  if (parts.length < 10) {
    throw new TypeError(`Dialogue line has fewer than 10 fields: "${line}"`);
  }
  return {
    layer: parts[0].trim(),
    start: parts[1].trim(),
    end: parts[2].trim(),
    style: parts[3].trim(),
    name: parts[4].trim(),
    marginL: parts[5].trim(),
    marginR: parts[6].trim(),
    marginV: parts[7].trim(),
    effect: parts[8].trim(),
    text: parts[9]
  };
}

function parseAssTimestamp(str) {
  let parts = str.split(':');
  if (parts.length !== 3) {
    throw new TypeError(`invalid ASS timestamp format: "${str}"`);
  }
  let hours = Number(parts[0]);
  let minutes = Number(parts[1]);
  let seconds = Number(parts[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)
    || hours < 0 || minutes < 0 || seconds < 0) {
    throw new TypeError(`invalid ASS timestamp values: "${str}"`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

function parseAssTextFormatting(text) {
  let match = text.match(/^\{([^}]+)\}/);
  if (!match) return null;
  let tagContent = match[1];
  let alignmentMatch = tagContent.match(/\\an([0-9]+)/);
  let posMatch = tagContent.match(/\\pos\(([^,]+),([^)]+)\)/);
  let fsMatch = tagContent.match(/\\fs([0-9]+)/);

  return {
    alignment: alignmentMatch ? parseInt(alignmentMatch[1], 10) : null,
    x: posMatch ? Math.round(Number(posMatch[1])) : null,
    y: posMatch ? Math.round(Number(posMatch[2])) : null,
    fontSize: fsMatch ? parseInt(fsMatch[1], 10) : null
  };
}

function stripAssTags(text) {
  return text.replace(/\{[^}]+\}/g, '').replace(/\\N/g, ' ').replace(/\s+/g, ' ').trim();
}

export function parseAss(assContent) {
  if (typeof assContent !== 'string') {
    throw new TypeError('ASS content must be a string');
  }
  let lines = assContent.split(/\r?\n/);
  let cues = [];
  let playResX = null;
  let playResY = null;
  let seenCueIds = new Set();

  for (let line of lines) {
    line = line.trim();
    if (line.startsWith('PlayResX:')) {
      playResX = parseInt(line.substring('PlayResX:'.length).trim(), 10);
    } else if (line.startsWith('PlayResY:')) {
      playResY = parseInt(line.substring('PlayResY:'.length).trim(), 10);
    } else if (line.startsWith('Dialogue:')) {
      let parsed = parseAssDialogueLine(line);
      if (parsed) {
        let fmt = null;
        let text = parsed.text;
        if (text.startsWith('{')) {
          fmt = parseAssTextFormatting(text);
          if (!fmt) {
            throw new TypeError(`ASS dialogue line has malformed tags: "${text}"`);
          }
          if (fmt.alignment === null || fmt.alignment < 1 || fmt.alignment > 9) {
            throw new TypeError(`ASS dialogue line has invalid alignment tag: "${text}"`);
          }
          if (fmt.x === null || !Number.isFinite(fmt.x) || fmt.y === null || !Number.isFinite(fmt.y)) {
            throw new TypeError(`ASS dialogue line has invalid position tag: "${text}"`);
          }
          if (fmt.fontSize !== null && (!Number.isInteger(fmt.fontSize) || fmt.fontSize <= 0)) {
            throw new TypeError(`ASS dialogue line has invalid fontSize tag: "${text}"`);
          }
        }
        let cleanText = stripAssTags(text);

        let cueId = parsed.effect;
        if (!cueId) {
          throw new TypeError('ASS dialogue line is missing Effect (cueId)');
        }
        if (!/^[a-z][a-z0-9._:-]*$/.test(cueId)) {
          throw new TypeError(`ASS dialogue line has unsafe cueId "${cueId}"; must match /^[a-z][a-z0-9._:-]*$/`);
        }
        if (seenCueIds.has(cueId)) {
          throw new TypeError(`duplicate ASS cue ID "${cueId}"`);
        }
        seenCueIds.add(cueId);

        let startSec = parseAssTimestamp(parsed.start);
        let endSec = parseAssTimestamp(parsed.end);
        if (endSec <= startSec) {
          throw new TypeError(`ASS dialogue line has end timestamp not after start: ${parsed.start} -> ${parsed.end}`);
        }

        cues.push({
          cueId,
          speaker: parsed.name,
          startSec,
          endSec,
          text: cleanText,
          placement: fmt ? {
            alignment: fmt.alignment,
            x: fmt.x,
            y: fmt.y,
            fontSize: fmt.fontSize
          } : null
        });
      }
    }
  }

  if (playResX === null || !Number.isInteger(playResX) || playResX <= 0
    || playResY === null || !Number.isInteger(playResY) || playResY <= 0) {
    throw new TypeError(`ASS file is missing or has invalid PlayResX/PlayResY format: PlayResX=${playResX}, PlayResY=${playResY}`);
  }

  return {
    width: playResX,
    height: playResY,
    cues
  };
}

export function joinCaptionArtifacts(artifactA, artifactB) {
  if (!Array.isArray(artifactA) || !Array.isArray(artifactB)) {
    throw new TypeError('Artifacts must be arrays');
  }
  let mapA = new Map();
  for (let item of artifactA) {
    let cueId = item.cueId;
    if (!cueId || typeof cueId !== 'string') {
      throw new TypeError('caption artifact has missing or invalid cueId');
    }
    if (!/^[a-z][a-z0-9._:-]*$/.test(cueId)) {
      throw new TypeError(`caption artifact has unsafe cueId "${cueId}"; must match /^[a-z][a-z0-9._:-]*$/`);
    }
    if (mapA.has(cueId)) {
      throw new TypeError(`duplicate cue ID "${cueId}" in artifact A`);
    }
    mapA.set(cueId, item);
  }

  let mapB = new Map();
  for (let item of artifactB) {
    let cueId = item.cueId;
    if (!cueId || typeof cueId !== 'string') {
      throw new TypeError('caption artifact has missing or invalid cueId');
    }
    if (!/^[a-z][a-z0-9._:-]*$/.test(cueId)) {
      throw new TypeError(`caption artifact has unsafe cueId "${cueId}"; must match /^[a-z][a-z0-9._:-]*$/`);
    }
    if (mapB.has(cueId)) {
      throw new TypeError(`duplicate cue ID "${cueId}" in artifact B`);
    }
    mapB.set(cueId, item);
  }

  let joined = [];
  for (let [cueId, itemA] of mapA.entries()) {
    let itemB = mapB.get(cueId);
    if (!itemB) {
      throw new TypeError(`missing cue ID "${cueId}" in artifact B (mismatched join)`);
    }
    joined.push({
      ...itemA,
      ...itemB
    });
  }

  for (let cueId of mapB.keys()) {
    if (!mapA.has(cueId)) {
      throw new TypeError(`missing cue ID "${cueId}" in artifact A (mismatched join)`);
    }
  }

  return joined;
}
