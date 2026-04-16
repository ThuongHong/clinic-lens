const fs = require('fs');
const path = require('path');

const ANALYSIS_PROMPT_PATH = path.resolve(__dirname, 'prompts', 'analysis_system_prompt.md');

const DEFAULT_SYSTEM_PROMPT = `
You are MedScan AI, a medical lab report analysis assistant for the Smart Labs Analyzer app.
Task: read medical lab documents (image/PDF), perform cross-lingual extraction, and return JSON that strictly follows the contract.

## Hard Rules
- Do not provide an official medical diagnosis.
- Do not recommend or name specific drugs.
- Do not invent values when they cannot be read.
- Return pure JSON only (no markdown, no extra explanation).
- All output structural values, keys, and patient_advice must be in standard English.

## Output Contract
Success:
{
  "status": "success",
  "patient_name": "<string|null>",
  "analysis_date": "<YYYY-MM-DD|null>",
  "results": [
    {
      "indicator_name_en": "...",
      "indicator_name_original": "...",
      "value": 25.0,
      "unit": "...",
      "organ_id": "kidneys|liver|heart|lungs|blood|pancreas|thyroid|bone|immune|other",
      "severity": "normal|abnormal_high|abnormal_low|critical|unknown",
      "patient_advice": "English, 1-3 sentences",
      "reference_range": {
        "type": "numeric|threshold|qualitative",
        "numeric_min": 30.0,
        "numeric_max": 100.0,
        "raw_string_original": "...",
        "raw_string_en": "...",
        "optimal_text_en": "...",
        "patient_category_text_en": "..."
      },
    }
  ]
}

Error:
{
  "status": "error",
  "error_code": "IMAGE_BLURRY|NOT_MEDICAL|UNSUPPORTED_FORMAT|PARTIAL_DATA",
  "error_message": "English",
  "results": []
}
`;

const ALLOWED_ORGANS = new Set([
  'kidneys',
  'liver',
  'heart',
  'lungs',
  'blood',
  'pancreas',
  'thyroid',
  'bone',
  'immune',
  'other'
]);

const ORGAN_ALIASES = new Map([
  ['renal', 'kidneys'],
  ['kidney', 'kidneys'],
  ['hepatic', 'liver'],
  ['cardiac', 'heart'],
  ['cardio', 'heart'],
  ['pulmonary', 'lungs'],
  ['hematology', 'blood'],
  ['haematology', 'blood'],
  ['glucose', 'pancreas']
]);

const ALLOWED_SEVERITIES = new Set([
  'normal',
  'abnormal_high',
  'abnormal_low',
  'critical',
  'unknown'
]);

const SEVERITY_ALIASES = new Map([
  ['high', 'abnormal_high'],
  ['low', 'abnormal_low'],
  ['elevated', 'abnormal_high'],
  ['decreased', 'abnormal_low'],
  ['alert', 'critical'],
  ['severe', 'critical']
]);

const NON_ENGLISH_HINTS = [
  'toi ',
  'khong',
  'nguy co',
  'xet nghiem',
  'bacs',
  'bac si',
  'nen lam gi',
  'bonjour',
  'resultat',
  'analyse'
];

function loadAnalysisSystemPrompt() {
  try {
    const prompt = fs.readFileSync(ANALYSIS_PROMPT_PATH, 'utf8').trim();
    return prompt || DEFAULT_SYSTEM_PROMPT.trim();
  } catch (error) {
    return DEFAULT_SYSTEM_PROMPT.trim();
  }
}

function extractTopLevelJson(text) {
  const input = String(text || '').trim();
  const fenced = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1].trim() : input;

  if (!candidate) {
    throw new Error('Empty model output');
  }

  if (candidate.startsWith('{') || candidate.startsWith('[')) {
    return candidate;
  }

  let start = -1;
  let opening = '';
  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (char === '{' || char === '[') {
      start = index;
      opening = char;
      break;
    }
  }

  if (start < 0) {
    throw new Error('No JSON found in model output');
  }

  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === opening) {
      depth += 1;
    } else if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  throw new Error('Incomplete JSON payload');
}

function parseJsonFromModelOutput(rawText) {
  return JSON.parse(extractTopLevelJson(rawText));
}

function normalizeOrganId(rawValue) {
  const source = String(rawValue || '').trim().toLowerCase();
  if (!source) {
    return 'other';
  }

  if (ALLOWED_ORGANS.has(source)) {
    return source;
  }

  return ORGAN_ALIASES.get(source) || 'other';
}

function normalizeSeverity(rawValue) {
  const source = String(rawValue || '').trim().toLowerCase();
  if (!source) {
    return 'unknown';
  }

  if (ALLOWED_SEVERITIES.has(source)) {
    return source;
  }

  return SEVERITY_ALIASES.get(source) || 'unknown';
}

function sanitizeText(value, fallback = '') {
  return value == null ? fallback : String(value).trim();
}

function looksNonEnglishText(value) {
  const source = String(value || '').trim();
  if (!source) {
    return false;
  }

  if (/[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/.test(source)) {
    return true;
  }

  const lowered = source.toLowerCase();
  return NON_ENGLISH_HINTS.some((hint) => lowered.includes(hint));
}

function sanitizeEnglishText(value, fallback = '') {
  const normalized = sanitizeText(value, fallback);
  if (!normalized) {
    return fallback;
  }

  if (looksNonEnglishText(normalized)) {
    return sanitizeText(fallback);
  }

  return normalized;
}

function sanitizeIndicatorNameEn(value) {
  const normalized = sanitizeEnglishText(value, '').trim();
  if (!normalized) {
    return 'Unknown Indicator';
  }

  if (!/[A-Za-z]/.test(normalized)) {
    return 'Unknown Indicator';
  }

  return normalized;
}

function parseOptionalNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }

  const compact = raw.replace(/\s+/g, '');
  const hasDot = compact.includes('.');
  const normalized = hasDot
    ? compact.replace(/,/g, '')
    : compact.replace(',', '.');

  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const parsed = Number.parseFloat(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }
  return fallback;
}

function normalizeStructuredReferenceRange(rawStructured, normalizedTextEn, sourceTextOriginal) {
  const base = {
    type: 'unknown',
    normalized_text_en: sanitizeEnglishText(normalizedTextEn, sanitizeText(normalizedTextEn || sourceTextOriginal)),
    numeric: null,
    threshold: null,
    qualitative: null
  };

  if (!rawStructured || typeof rawStructured !== 'object') {
    return base;
  }

  const source = rawStructured;
  const requestedType = String(source.type || '').trim().toLowerCase();
  const type = ['numeric', 'threshold', 'qualitative', 'unknown'].includes(requestedType)
    ? requestedType
    : 'unknown';

  const normalizedText = sanitizeEnglishText(
    source.normalized_text_en,
    base.normalized_text_en
  );

  const numericSource = source.numeric && typeof source.numeric === 'object' ? source.numeric : {};
  const thresholdSource = source.threshold && typeof source.threshold === 'object' ? source.threshold : {};
  const qualitativeSource = source.qualitative && typeof source.qualitative === 'object' ? source.qualitative : {};

  const numeric = {
    min: parseOptionalNumber(numericSource.min),
    max: parseOptionalNumber(numericSource.max),
    inclusive_min: parseOptionalBoolean(numericSource.inclusive_min, true),
    inclusive_max: parseOptionalBoolean(numericSource.inclusive_max, true)
  };

  const thresholdOperator = String(thresholdSource.operator || '').trim();
  const threshold = {
    operator: ['<', '<=', '>', '>=', '='].includes(thresholdOperator) ? thresholdOperator : null,
    value: parseOptionalNumber(thresholdSource.value)
  };

  const bands = Array.isArray(qualitativeSource.bands)
    ? qualitativeSource.bands
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        label_en: sanitizeEnglishText(item.label_en, 'Unspecified band'),
        label_original: sanitizeText(item.label_original),
        rule_text: sanitizeText(item.rule_text)
      }))
      .slice(0, 8)
    : [];

  const qualitative = {
    matched_label_en: sanitizeEnglishText(qualitativeSource.matched_label_en, ''),
    matched_label_original: sanitizeText(qualitativeSource.matched_label_original),
    bands
  };

  if (type === 'numeric' && numeric.min == null && numeric.max == null) {
    return { ...base, normalized_text_en: normalizedText };
  }

  if (type === 'threshold' && (threshold.operator == null || threshold.value == null)) {
    return { ...base, normalized_text_en: normalizedText };
  }

  if (type === 'qualitative' && !qualitative.matched_label_en && bands.length === 0) {
    return { ...base, normalized_text_en: normalizedText };
  }

  return {
    type,
    normalized_text_en: normalizedText,
    numeric: type === 'numeric' ? numeric : null,
    threshold: type === 'threshold' ? threshold : null,
    qualitative: type === 'qualitative' ? qualitative : null
  };
}

function parseThresholdFromText(text) {
  const source = String(text || '').replace(/,/g, '').trim();
  if (!source) {
    return null;
  }

  const match = source.match(/(<=|>=|<|>|=)\s*(-?\d+(?:\.\d+)?)/);
  if (!match) {
    return null;
  }

  const value = Number.parseFloat(match[2]);
  if (!Number.isFinite(value)) {
    return null;
  }

  return {
    operator: match[1],
    value
  };
}

function inferSeverityFromStructuredRange(valueNumber, structuredRange) {
  if (!structuredRange || typeof structuredRange !== 'object') {
    return null;
  }

  if (structuredRange.type === 'numeric' && structuredRange.numeric && typeof structuredRange.numeric === 'object') {
    const min = parseOptionalNumber(structuredRange.numeric.min);
    const max = parseOptionalNumber(structuredRange.numeric.max);

    if (min != null && valueNumber < min) {
      return 'abnormal_low';
    }
    if (max != null && valueNumber > max) {
      return 'abnormal_high';
    }
    if (min != null || max != null) {
      return 'normal';
    }
  }

  if (structuredRange.type === 'threshold' && structuredRange.threshold && typeof structuredRange.threshold === 'object') {
    const operator = String(structuredRange.threshold.operator || '').trim();
    const thresholdValue = parseOptionalNumber(structuredRange.threshold.value);
    if (!operator || thresholdValue == null) {
      return null;
    }

    if (operator === '<' || operator === '<=') {
      return valueNumber <= thresholdValue ? 'normal' : 'abnormal_high';
    }

    if (operator === '>' || operator === '>=') {
      return valueNumber >= thresholdValue ? 'normal' : 'abnormal_low';
    }

    if (operator === '=') {
      const epsilon = 1e-9;
      if (Math.abs(valueNumber - thresholdValue) <= epsilon) {
        return 'normal';
      }
      return valueNumber > thresholdValue ? 'abnormal_high' : 'abnormal_low';
    }
  }

  return null;
}

function inferSeverityFromRangeText(valueNumber, referenceRangeText) {
  const source = String(referenceRangeText || '').replace(/,/g, '').trim();
  if (!source) {
    return null;
  }

  const betweenMatch = source.match(/(-?\d+(?:\.\d+)?)\s*(?:-|–|to|~)\s*(-?\d+(?:\.\d+)?)/i);
  if (betweenMatch) {
    const low = Number.parseFloat(betweenMatch[1]);
    const high = Number.parseFloat(betweenMatch[2]);
    if (Number.isFinite(low) && Number.isFinite(high)) {
      const min = Math.min(low, high);
      const max = Math.max(low, high);
      if (valueNumber < min) {
        return 'abnormal_low';
      }
      if (valueNumber > max) {
        return 'abnormal_high';
      }
      return 'normal';
    }
  }

  const threshold = parseThresholdFromText(source);
  if (threshold) {
    if (threshold.operator === '<' || threshold.operator === '<=') {
      return valueNumber <= threshold.value ? 'normal' : 'abnormal_high';
    }

    if (threshold.operator === '>' || threshold.operator === '>=') {
      return valueNumber >= threshold.value ? 'normal' : 'abnormal_low';
    }

    if (threshold.operator === '=') {
      const epsilon = 1e-9;
      if (Math.abs(valueNumber - threshold.value) <= epsilon) {
        return 'normal';
      }
      return valueNumber > threshold.value ? 'abnormal_high' : 'abnormal_low';
    }
  }

  return null;
}

function deriveSeverityFromValueAndRange({
  reportedSeverity,
  value,
  referenceRange,
  referenceRangeStructured
}) {
  const normalizedReported = normalizeSeverity(reportedSeverity);
  if (normalizedReported === 'critical') {
    return 'critical';
  }

  const valueNumber = parseOptionalNumber(value);
  if (valueNumber == null) {
    return normalizedReported;
  }

  const inferredFromStructured = inferSeverityFromStructuredRange(valueNumber, referenceRangeStructured);
  if (inferredFromStructured) {
    return inferredFromStructured;
  }

  const inferredFromText = inferSeverityFromRangeText(valueNumber, referenceRange);
  if (inferredFromText) {
    return inferredFromText;
  }

  return normalizedReported;
}

function normalizeReferenceRangeFromObject(rawReferenceRange) {
  const typeSource = String(rawReferenceRange?.type || '').trim().toLowerCase();
  const type = ['numeric', 'threshold', 'qualitative'].includes(typeSource) ? typeSource : 'unknown';

  const rawStringOriginal = sanitizeText(rawReferenceRange?.raw_string_original);
  const rawStringEn = sanitizeEnglishText(rawReferenceRange?.raw_string_en, '');
  const optimalTextEn = sanitizeEnglishText(rawReferenceRange?.optimal_text_en, rawStringEn);
  const patientCategoryTextEn = sanitizeEnglishText(rawReferenceRange?.patient_category_text_en, '');

  const numericMin = parseOptionalNumber(rawReferenceRange?.numeric_min);
  const numericMax = parseOptionalNumber(rawReferenceRange?.numeric_max);

  const fallbackText = optimalTextEn || rawStringEn || sanitizeText(rawStringOriginal);
  const thresholdParsed = parseThresholdFromText(optimalTextEn || rawStringEn || rawStringOriginal);

  const numeric = type === 'numeric'
    ? {
      min: numericMin,
      max: numericMax,
      inclusive_min: true,
      inclusive_max: true
    }
    : null;

  const threshold = type === 'threshold'
    ? thresholdParsed || (() => {
      if (numericMin != null && numericMax == null) {
        return { operator: '>=', value: numericMin };
      }
      if (numericMax != null && numericMin == null) {
        return { operator: '<=', value: numericMax };
      }
      return null;
    })()
    : null;

  const qualitative = type === 'qualitative'
    ? {
      matched_label_en: patientCategoryTextEn,
      matched_label_original: '',
      bands: []
    }
    : null;

  return {
    reference_range: fallbackText,
    reference_range_original: rawStringOriginal,
    reference_range_structured: {
      type: type === 'unknown' ? 'unknown' : type,
      normalized_text_en: fallbackText,
      numeric,
      threshold,
      qualitative
    }
  };
}

function normalizeResult(rawResult) {
  const indicatorNameOriginal = sanitizeText(
    rawResult?.indicator_name_original || rawResult?.indicator_name || ''
  );
  const indicatorNameEn = sanitizeIndicatorNameEn(
    rawResult?.indicator_name_en || rawResult?.indicator_name
  );

  const value = sanitizeText(rawResult?.value);
  const valueOriginal = sanitizeText(rawResult?.value_original || rawResult?.value || '');
  const unit = sanitizeText(rawResult?.unit);
  const unitOriginal = sanitizeText(rawResult?.unit_original || rawResult?.unit || '');

  let referenceRangeOriginal = '';
  let referenceRange = '';
  let referenceRangeStructured = null;

  if (rawResult?.reference_range && typeof rawResult.reference_range === 'object' && !Array.isArray(rawResult.reference_range)) {
    const normalizedFromObject = normalizeReferenceRangeFromObject(rawResult.reference_range);
    referenceRange = normalizedFromObject.reference_range;
    referenceRangeOriginal = normalizedFromObject.reference_range_original;
    referenceRangeStructured = normalizedFromObject.reference_range_structured;
  } else {
    referenceRangeOriginal = sanitizeText(
      rawResult?.reference_range_original || rawResult?.reference_range || ''
    );
    referenceRange = sanitizeEnglishText(
      rawResult?.reference_range,
      sanitizeText(rawResult?.reference_range || referenceRangeOriginal)
    );
    referenceRangeStructured = normalizeStructuredReferenceRange(
      rawResult?.reference_range_structured,
      referenceRange,
      referenceRangeOriginal
    );
  }

  const normalizedSeverity = deriveSeverityFromValueAndRange({
    reportedSeverity: rawResult?.severity,
    value,
    referenceRange,
    referenceRangeStructured
  });

  return {
    indicator_name: indicatorNameEn,
    indicator_name_en: indicatorNameEn,
    indicator_name_original: indicatorNameOriginal,
    value,
    value_original: valueOriginal,
    unit,
    unit_original: unitOriginal,
    reference_range: referenceRange,
    reference_range_original: referenceRangeOriginal,
    reference_range_structured: referenceRangeStructured,
    organ_id: normalizeOrganId(rawResult?.organ_id),
    severity: normalizedSeverity,
    patient_advice: sanitizeEnglishText(rawResult?.patient_advice, '')
  };
}

function normalizeAnalysisPayload(payload) {
  const rawResults = Array.isArray(payload?.results) ? payload.results : [];
  const results = rawResults.map(normalizeResult);
  const status = payload?.status?.toString().trim().toLowerCase() === 'error' ? 'error' : 'success';

  if (status === 'error') {
    return {
      status,
      error_code: sanitizeText(payload?.error_code || 'PARTIAL_DATA', 'PARTIAL_DATA'),
      error_message: sanitizeEnglishText(
        payload?.error_message,
        'Unable to read complete lab data from the document.'
      ),
      results: []
    };
  }

  return {
    status,
    analysis_date: sanitizeText(payload?.analysis_date || new Date().toISOString().slice(0, 10), new Date().toISOString().slice(0, 10)),
    ...(sanitizeText(payload?.patient_name) ? { patient_name: sanitizeText(payload?.patient_name) } : {}),
    results
  };
}

function severityRank(severity) {
  switch (severity) {
    case 'critical':
      return 4;
    case 'abnormal_high':
    case 'abnormal_low':
      return 3;
    case 'unknown':
      return 2;
    case 'normal':
    default:
      return 1;
  }
}

function buildAnalysisSummary(analysis) {
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  const organMap = new Map();
  const highlightedResults = [];

  for (const result of results) {
    const organId = normalizeOrganId(result.organ_id);
    const severity = normalizeSeverity(result.severity);

    if (!organMap.has(organId)) {
      organMap.set(organId, {
        organ_id: organId,
        worst_severity: severity,
        indicator_count: 0,
        abnormal_count: 0
      });
    }

    const bucket = organMap.get(organId);
    bucket.indicator_count += 1;
    if (severity !== 'normal') {
      bucket.abnormal_count += 1;
    }
    if (severityRank(severity) > severityRank(bucket.worst_severity)) {
      bucket.worst_severity = severity;
    }

    if (severity === 'critical' || severity === 'abnormal_high' || severity === 'abnormal_low') {
      highlightedResults.push({
        indicator_name: sanitizeText(result.indicator_name),
        value: sanitizeText(result.value),
        unit: sanitizeText(result.unit),
        organ_id: organId,
        severity
      });
    }
  }

  return {
    total_results: results.length,
    abnormal_results: results.filter((result) => normalizeSeverity(result.severity) !== 'normal').length,
    organ_summary: Array.from(organMap.values()).sort((left, right) => {
      const severityDelta = severityRank(right.worst_severity) - severityRank(left.worst_severity);
      if (severityDelta !== 0) {
        return severityDelta;
      }

      return right.abnormal_count - left.abnormal_count;
    }),
    highlighted_results: highlightedResults.slice(0, 6)
  };
}

function buildAdviceMessages(summaryPayload) {
  const systemPrompt = [
    'You are a medical lab explanation assistant for patients.',
    'Based on the available summary data, return pure JSON that follows the schema.',
    'Do not provide an official diagnosis. Do not recommend specific drugs.',
    'All text content must be in clear, practical English.'
  ].join(' ');

  const userPrompt = [
    'Return JSON with this exact schema:',
    '{',
    '  "status": "success|error",',
    '  "patient_name": "<string|null>",',
    '  "analysis_date": "<YYYY-MM-DD|null>",',
    '  "overall_assessment": "<2-4 sentences>",',
    '  "priority_level": "low|medium|high",',
    '  "organ_advice": [',
    '    {',
    '      "organ_id": "kidneys|liver|heart|lungs|blood|pancreas|thyroid|bone|immune|other",',
    '      "risk": "normal|watch|alert",',
    '      "summary": "<1-2 sentences>",',
    '      "advice": "<1-3 sentences>"',
    '    }',
    '  ],',
    '  "general_recommendations": ["..."],',
    '  "disclaimer": "..."',
    '}',
    'If the summary is invalid, return {"status":"error","error_message":"..."}',
    '',
    `SUMMARY_JSON: ${JSON.stringify(summaryPayload)}`
  ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ];
}

function normalizeAdvicePayload(payload, analysis, summary) {
  if (!payload || payload.status === 'error') {
    const message = sanitizeEnglishText(
      payload?.error_message,
      'Unable to generate overall recommendations.'
    );
    return {
      status: 'error',
      error_message: message
    };
  }

  const organAdvice = Array.isArray(payload.organ_advice)
    ? payload.organ_advice
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        organ_id: normalizeOrganId(item.organ_id),
        risk: ['normal', 'watch', 'alert'].includes(String(item.risk || '').trim().toLowerCase())
          ? String(item.risk).trim().toLowerCase()
          : 'watch',
        summary: sanitizeEnglishText(item.summary, 'Review this organ risk with your clinician.'),
        advice: sanitizeEnglishText(item.advice, 'Follow clinician guidance and monitor symptoms.')
      }))
    : [];

  const generalRecommendations = Array.isArray(payload.general_recommendations)
    ? payload.general_recommendations
      .map((item) => sanitizeEnglishText(item))
      .filter(Boolean)
    : [];

  const fallbackPriority = summary.abnormal_results > 2 ? 'high' : summary.abnormal_results > 0 ? 'medium' : 'low';

  return {
    status: 'success',
    patient_name: sanitizeText(payload.patient_name || analysis.patient_name || '', '') || null,
    analysis_date: sanitizeText(payload.analysis_date || analysis.analysis_date || '', '') || null,
    overall_assessment: sanitizeEnglishText(
      payload.overall_assessment || `Detected ${summary.abnormal_results} indicators requiring follow-up out of ${summary.total_results} extracted indicators.`,
      `Detected ${summary.abnormal_results} indicators requiring follow-up out of ${summary.total_results} extracted indicators.`
    ),
    priority_level: ['low', 'medium', 'high'].includes(String(payload.priority_level || '').trim().toLowerCase())
      ? String(payload.priority_level).trim().toLowerCase()
      : fallbackPriority,
    organ_advice: organAdvice,
    general_recommendations: generalRecommendations,
    disclaimer: sanitizeEnglishText(
      payload.disclaimer,
      'This information is for reference only and does not replace medical consultation.'
    )
  };
}

module.exports = {
  buildAdviceMessages,
  buildAnalysisSummary,
  loadAnalysisSystemPrompt,
  normalizeAdvicePayload,
  normalizeAnalysisPayload,
  parseJsonFromModelOutput
};
