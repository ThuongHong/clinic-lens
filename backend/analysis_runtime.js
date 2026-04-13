const fs = require('fs');
const path = require('path');

const ANALYSIS_PROMPT_PATH = path.resolve(__dirname, 'prompts', 'analysis_system_prompt.md');

const DEFAULT_SYSTEM_PROMPT = `
Ban la MedScan AI - tro ly phan tich ket qua xet nghiem y khoa cho ung dung Smart Labs Analyzer.
Nhiem vu: nhan tai lieu xet nghiem (anh/PDF), boc tach chi so va tra ve JSON dung contract.

## Hard Rules
- Khong chan doan benh chinh thuc.
- Khong ke ten thuoc biet duoc.
- Khong tu bo sung so lieu khi khong doc duoc.
- Chi tra ve JSON thuan (khong markdown, khong giai thich them).
- patient_advice phai bang tieng Viet, ro rang, thuc te.

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
      "patient_advice": "Tieng Viet, 1-3 cau"
    }
  ]
}

Error:
{
  "status": "error",
  "error_code": "IMAGE_BLURRY|NOT_MEDICAL|UNSUPPORTED_FORMAT|PARTIAL_DATA",
  "error_message": "Tieng Viet",
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

function normalizeResult(rawResult) {
  return {
    indicator_name: sanitizeText(rawResult?.indicator_name),
    value: sanitizeText(rawResult?.value),
    unit: sanitizeText(rawResult?.unit),
    reference_range: sanitizeText(rawResult?.reference_range),
    organ_id: normalizeOrganId(rawResult?.organ_id),
    severity: normalizeSeverity(rawResult?.severity),
    patient_advice: sanitizeText(rawResult?.patient_advice)
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
      error_message: sanitizeText(payload?.error_message || 'Khong the doc day du du lieu xet nghiem.', 'Khong the doc day du du lieu xet nghiem.'),
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
    'Ban la tro ly giai thich ket qua xet nghiem cho benh nhan.',
    'Dua tren du lieu summary co san, hay tao ra JSON THUAN dung schema.',
    'Khong chan doan benh chinh thuc. Khong de xuat thuoc cu the.',
    'Noi dung phai bang tieng Viet, thuc te, de hieu.'
  ].join(' ');

  const userPrompt = [
    'Hay tra ve JSON voi schema sau:',
    '{',
    '  "status": "success|error",',
    '  "patient_name": "<string|null>",',
    '  "analysis_date": "<YYYY-MM-DD|null>",',
    '  "overall_assessment": "<2-4 cau>",',
    '  "priority_level": "low|medium|high",',
    '  "organ_advice": [',
    '    {',
    '      "organ_id": "kidneys|liver|heart|lungs|blood|pancreas|thyroid|bone|immune|other",',
    '      "risk": "normal|watch|alert",',
    '      "summary": "<1-2 cau>",',
    '      "advice": "<1-3 cau>"',
    '    }',
    '  ],',
    '  "general_recommendations": ["..."],',
    '  "disclaimer": "..."',
    '}',
    'Neu summary khong hop le, tra ve {"status":"error","error_message":"..."}',
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
    const message = sanitizeText(payload?.error_message || 'Khong tao duoc loi khuyen tong quat.', 'Khong tao duoc loi khuyen tong quat.');
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
        summary: sanitizeText(item.summary),
        advice: sanitizeText(item.advice)
      }))
    : [];

  const generalRecommendations = Array.isArray(payload.general_recommendations)
    ? payload.general_recommendations.map((item) => sanitizeText(item)).filter(Boolean)
    : [];

  const fallbackPriority = summary.abnormal_results > 2 ? 'high' : summary.abnormal_results > 0 ? 'medium' : 'low';

  return {
    status: 'success',
    patient_name: sanitizeText(payload.patient_name || analysis.patient_name || '', '') || null,
    analysis_date: sanitizeText(payload.analysis_date || analysis.analysis_date || '', '') || null,
    overall_assessment: sanitizeText(
      payload.overall_assessment || `Phat hien ${summary.abnormal_results} chi so can theo doi tren ${summary.total_results} chi so da trich xuat.`,
      `Phat hien ${summary.abnormal_results} chi so can theo doi tren ${summary.total_results} chi so da trich xuat.`
    ),
    priority_level: ['low', 'medium', 'high'].includes(String(payload.priority_level || '').trim().toLowerCase())
      ? String(payload.priority_level).trim().toLowerCase()
      : fallbackPriority,
    organ_advice: organAdvice,
    general_recommendations: generalRecommendations,
    disclaimer: sanitizeText(payload.disclaimer || 'Thong tin chi co tinh chat tham khao, khong thay the kham bac si.', 'Thong tin chi co tinh chat tham khao, khong thay the kham bac si.')
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
