const fs = require('fs');
const path = require('path');

const ANALYSIS_PROMPT_PATH = path.resolve(__dirname, 'prompts', 'analysis_system_prompt.md');

const DEFAULT_SYSTEM_PROMPT = `
You are MedScan AI, a medical lab report analysis assistant for the Smart Labs Analyzer app.
Task: read medical lab documents (image/PDF), extract indicators, and return JSON that strictly follows the contract.

## Hard Rules
- Do not provide an official medical diagnosis.
- Do not recommend or name specific drugs.
- Do not invent values when they cannot be read.
- Return pure JSON only (no markdown, no extra explanation).
- Keep patient_advice empty by default (""), because detailed explanation is generated on-demand.

## Output Contract
Success:
{
  "status": "success",
  "patient_name": "<string|null>",
  "analysis_date": "<YYYY-MM-DD|null>",
  "results": [
    {
      "indicator_name": "...",
      "value": "...",
      "unit": "...",
      "reference_range": "...",
      "organ_id": "kidneys|liver|heart|lungs|blood|pancreas|thyroid|bone|immune|other",
      "severity": "normal|abnormal_high|abnormal_low|critical|unknown",
      "patient_advice": ""
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

function normalizeResult(rawResult) {
  return {
    indicator_name: sanitizeText(rawResult?.indicator_name),
    value: sanitizeText(rawResult?.value),
    unit: sanitizeText(rawResult?.unit),
    reference_range: sanitizeText(rawResult?.reference_range),
    organ_id: normalizeOrganId(rawResult?.organ_id),
    severity: normalizeSeverity(rawResult?.severity),
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
