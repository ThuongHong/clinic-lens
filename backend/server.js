const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { execFile } = require('child_process');
const { promisify } = require('util');
const Core = require('@alicloud/pop-core');
const OSS = require('ali-oss');
const dotenv = require('dotenv');
const {
  buildAdviceMessages,
  buildAnalysisSummary,
  loadAnalysisSystemPrompt,
  normalizeAdvicePayload,
  normalizeAnalysisPayload,
  parseJsonFromModelOutput
} = require('./analysis_runtime');

const execFileAsync = promisify(execFile);

const envCandidates = [
  path.resolve(__dirname, '..', '.env'),
  path.resolve(__dirname, '.env')
];
const envPath = envCandidates.find((candidate) => fs.existsSync(candidate));

if (envPath) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config();
}

const requiredEnv = [
  'ALI_ACCESS_KEY',
  'ALI_SECRET_KEY',
  'ALI_ROLE_ARN',
  'OSS_REGION',
  'OSS_BUCKET_NAME',
  'DASHSCOPE_API_KEY'
];

const missingEnv = requiredEnv.filter((name) => !process.env[name]);
const CHAT_LOCAL_MOCK = String(process.env.CHAT_LOCAL_MOCK || '').trim() === '1';

if (missingEnv.length > 0) {
  console.warn(`Warning: missing environment variables: ${missingEnv.join(', ')}`);
  console.warn('Cloud-dependent endpoints may fail until environment variables are configured.');
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

const DASHSCOPE_SG_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const DASHSCOPE_EXTRACT_MODEL = process.env.DASHSCOPE_EXTRACT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-vl-plus';
const DASHSCOPE_SUMMARY_MODEL = process.env.DASHSCOPE_SUMMARY_MODEL || process.env.DASHSCOPE_ADVICE_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-max';
const DASHSCOPE_CHAT_MODEL = process.env.DASHSCOPE_CHAT_MODEL || process.env.DASHSCOPE_MODEL || 'qwen-plus';
const DASHSCOPE_RESPONSE_FORMAT_MODE = String(process.env.DASHSCOPE_RESPONSE_FORMAT || '').trim().toLowerCase();
const DASHSCOPE_RESPONSE_SCHEMA_JSON = process.env.DASHSCOPE_RESPONSE_SCHEMA_JSON;
const OSS_REGION = process.env.OSS_REGION;
const OSS_BUCKET_NAME = process.env.OSS_BUCKET_NAME;
const PORT = Number(process.env.PORT || 9000);
const HISTORY_DIR = path.resolve(__dirname, 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'analysis_history.json');
const CHAT_HISTORY_FILE = path.join(HISTORY_DIR, 'chat_history.json');
const CHAT_METRICS_FILE = path.join(HISTORY_DIR, 'chat_metrics.json');
const HISTORY_LIMIT = 30;
const CHAT_TURN_LIMIT = 200;
const QWEN_SYSTEM_PROMPT = loadAnalysisSystemPrompt();

// 1. Cấu hình STS Token (Alibaba Cloud)
const stsClient = process.env.ALI_ACCESS_KEY && process.env.ALI_SECRET_KEY
  ? new Core({
    accessKeyId: process.env.ALI_ACCESS_KEY,
    accessKeySecret: process.env.ALI_SECRET_KEY,
    endpoint: 'https://sts.aliyuncs.com',
    apiVersion: '2015-04-01'
  })
  : null;

const ossClient = process.env.ALI_ACCESS_KEY && process.env.ALI_SECRET_KEY && OSS_REGION && OSS_BUCKET_NAME
  ? new OSS({
    region: OSS_REGION,
    bucket: OSS_BUCKET_NAME,
    accessKeyId: process.env.ALI_ACCESS_KEY,
    accessKeySecret: process.env.ALI_SECRET_KEY
  })
  : null;

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildDashScopeResponseFormat() {
  if (!DASHSCOPE_RESPONSE_FORMAT_MODE) {
    return null;
  }

  if (DASHSCOPE_RESPONSE_FORMAT_MODE === 'json_object') {
    return { type: 'json_object' };
  }

  if (DASHSCOPE_RESPONSE_FORMAT_MODE === 'json_schema') {
    if (!DASHSCOPE_RESPONSE_SCHEMA_JSON) {
      console.warn('DASHSCOPE_RESPONSE_SCHEMA_JSON is missing, skip response_format=json_schema.');
      return null;
    }

    try {
      const parsedSchema = JSON.parse(DASHSCOPE_RESPONSE_SCHEMA_JSON);
      return {
        type: 'json_schema',
        json_schema: parsedSchema
      };
    } catch (error) {
      console.warn(`Invalid DASHSCOPE_RESPONSE_SCHEMA_JSON: ${error.message}`);
      return null;
    }
  }

  console.warn(`Unsupported DASHSCOPE_RESPONSE_FORMAT value: ${DASHSCOPE_RESPONSE_FORMAT_MODE}`);
  return null;
}

function shouldFallbackWithoutResponseFormat(error) {
  const status = error?.response?.status;
  const responseData = error?.response?.data;
  const detail = `${JSON.stringify(responseData || '')} ${String(error?.message || '')}`.toLowerCase();

  if (status !== 400 && status !== 422) {
    return false;
  }

  return detail.includes('response_format')
    || detail.includes('json_schema')
    || detail.includes('json_object')
    || detail.includes('unsupported')
    || detail.includes('invalid parameter');
}

async function callDashScopeChatCompletion({
  model,
  messages,
  stream,
  signal,
  timeout,
  responseType
}) {
  const responseFormat = buildDashScopeResponseFormat();
  const requestConfig = {
    method: 'post',
    url: DASHSCOPE_SG_URL,
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    data: {
      model,
      messages,
      stream
    },
    timeout
  };

  if (signal) {
    requestConfig.signal = signal;
  }

  if (responseType) {
    requestConfig.responseType = responseType;
  }

  if (responseFormat) {
    requestConfig.data.response_format = responseFormat;
  }

  try {
    return await axios(requestConfig);
  } catch (error) {
    if (responseFormat && shouldFallbackWithoutResponseFormat(error)) {
      console.warn('DashScope rejected response_format, retrying without response_format.');
      delete requestConfig.data.response_format;
      return axios(requestConfig);
    }

    throw error;
  }
}

function ensureHistoryStore() {
  if (!fs.existsSync(HISTORY_DIR)) {
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
  }

  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, '[]\n', 'utf8');
  }
}

function readAnalysisHistory() {
  ensureHistoryStore();

  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('History Read Error:', error.message);
    return [];
  }
}

function writeAnalysisHistory(items) {
  ensureHistoryStore();
  fs.writeFileSync(HISTORY_FILE, `${JSON.stringify(items, null, 2)}\n`, 'utf8');
}

function ensureChatStores() {
  ensureHistoryStore();

  if (!fs.existsSync(CHAT_HISTORY_FILE)) {
    fs.writeFileSync(CHAT_HISTORY_FILE, '{}\n', 'utf8');
  }

  if (!fs.existsSync(CHAT_METRICS_FILE)) {
    fs.writeFileSync(CHAT_METRICS_FILE, `${JSON.stringify({
      total_requests: 0,
      total_tokens_streamed: 0,
      total_response_chars: 0,
      total_latency_ms: 0,
      average_latency_ms: 0,
      updated_at: new Date().toISOString()
    }, null, 2)}\n`, 'utf8');
  }
}

function readChatHistoryStore() {
  ensureChatStores();

  try {
    const raw = fs.readFileSync(CHAT_HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed;
  } catch (_) {
    return {};
  }
}

function writeChatHistoryStore(store) {
  ensureChatStores();
  fs.writeFileSync(CHAT_HISTORY_FILE, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function updateChatMetrics({ latencyMs, streamedTokenCount, responseCharCount }) {
  ensureChatStores();

  let metrics = {
    total_requests: 0,
    total_tokens_streamed: 0,
    total_response_chars: 0,
    total_latency_ms: 0,
    average_latency_ms: 0,
    updated_at: new Date().toISOString()
  };

  try {
    const raw = fs.readFileSync(CHAT_METRICS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      metrics = {
        ...metrics,
        ...parsed
      };
    }
  } catch (_) {
    // Keep defaults when metrics file is unreadable.
  }

  const safeLatency = Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : 0;
  const safeStreamedTokenCount = Number.isFinite(streamedTokenCount)
    ? Math.max(0, Math.round(streamedTokenCount))
    : 0;
  const safeResponseCharCount = Number.isFinite(responseCharCount)
    ? Math.max(0, Math.round(responseCharCount))
    : 0;

  const totalRequests = Math.max(0, Number(metrics.total_requests) || 0) + 1;
  const totalLatency = Math.max(0, Number(metrics.total_latency_ms) || 0) + safeLatency;

  const updated = {
    total_requests: totalRequests,
    total_tokens_streamed: Math.max(0, Number(metrics.total_tokens_streamed) || 0) + safeStreamedTokenCount,
    total_response_chars: Math.max(0, Number(metrics.total_response_chars) || 0) + safeResponseCharCount,
    total_latency_ms: totalLatency,
    average_latency_ms: Math.round(totalLatency / totalRequests),
    updated_at: new Date().toISOString()
  };

  fs.writeFileSync(CHAT_METRICS_FILE, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
}

function createConversationId() {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `conv_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeLanguagePreference({ requestedLanguage, message }) {
  const explicit = String(requestedLanguage || '').trim().toLowerCase();
  if (explicit === 'vi' || explicit === 'vn' || explicit === 'vietnamese') {
    return 'vi';
  }
  if (explicit === 'en' || explicit === 'english') {
    return 'en';
  }

  const source = String(message || '').toLowerCase();
  const vietnameseHints = ['khong', 'khẩn', 'bao', 'xet nghiem', 'gan', 'than', 'toi', 'mình', 'tôi'];
  const matched = vietnameseHints.some((hint) => source.includes(hint));
  return matched ? 'vi' : 'en';
}

function normalizeDetailLevel(rawDetailLevel) {
  const value = String(rawDetailLevel || '').trim().toLowerCase();
  if (value === 'clinical' || value === 'detailed') {
    return 'clinical';
  }
  return 'simple';
}

function severityRankForChat(severity) {
  switch (String(severity || '').toLowerCase()) {
    case 'critical':
      return 4;
    case 'abnormal_high':
    case 'abnormal_low':
      return 3;
    case 'unknown':
      return 2;
    default:
      return 1;
  }
}

function computeRiskLevelFromAnalysis(analysis) {
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  let maxRank = 1;

  for (const item of results) {
    maxRank = Math.max(maxRank, severityRankForChat(item?.severity));
  }

  if (maxRank >= 4) {
    return 'urgent';
  }
  if (maxRank >= 3) {
    return 'high';
  }
  if (maxRank >= 2) {
    return 'medium';
  }
  return 'low';
}

function detectEmergencySignal({ message, analysis }) {
  const source = String(message || '').toLowerCase();
  const emergencyKeywords = [
    'chest pain',
    'shortness of breath',
    'fainting',
    'co giat',
    'ngat',
    'dau nguc',
    'kho tho',
    'cấp cứu',
    'emergency',
    'khẩn cấp'
  ];

  const hasEmergencyKeyword = emergencyKeywords.some((keyword) => source.includes(keyword));
  const hasCriticalResult = (Array.isArray(analysis?.results) ? analysis.results : [])
    .some((item) => String(item?.severity || '').toLowerCase() === 'critical');

  return hasEmergencyKeyword || hasCriticalResult;
}

function extractTrendSnapshot({ historyEntries, currentEntry }) {
  if (!currentEntry || !currentEntry.analysis) {
    return [];
  }

  const samePatientEntries = historyEntries
    .filter((entry) => entry && entry.id !== currentEntry.id)
    .filter((entry) => {
      const currentName = String(currentEntry.analysis?.patient_name || '').trim().toLowerCase();
      const candidateName = String(entry.analysis?.patient_name || '').trim().toLowerCase();
      if (!currentName || !candidateName) {
        return false;
      }
      return currentName === candidateName;
    })
    .slice(0, 3);

  if (samePatientEntries.length === 0) {
    return [];
  }

  const latestPrevious = samePatientEntries[0];
  const previousResults = Array.isArray(latestPrevious.analysis?.results)
    ? latestPrevious.analysis.results
    : [];
  const previousMap = new Map(
    previousResults.map((item) => [String(item?.indicator_name || '').trim().toLowerCase(), item])
  );

  return (Array.isArray(currentEntry.analysis?.results) ? currentEntry.analysis.results : [])
    .map((item) => {
      const key = String(item?.indicator_name || '').trim().toLowerCase();
      const prev = previousMap.get(key);
      if (!prev) {
        return null;
      }
      const currentSeverity = String(item?.severity || 'unknown');
      const previousSeverity = String(prev?.severity || 'unknown');
      if (currentSeverity === previousSeverity) {
        return null;
      }
      return {
        indicator_name: item.indicator_name,
        from: previousSeverity,
        to: currentSeverity
      };
    })
    .filter(Boolean)
    .slice(0, 10);
}

function buildAnalysisContextForChat({ analysis, trendSnapshot }) {
  const results = Array.isArray(analysis?.results) ? analysis.results : [];
  const abnormalResults = results
    .filter((item) => String(item?.severity || '').toLowerCase() !== 'normal')
    .slice(0, 12)
    .map((item) => ({
      indicator_name: item.indicator_name,
      value: item.value,
      unit: item.unit,
      reference_range: item.reference_range,
      organ_id: item.organ_id,
      severity: item.severity,
      patient_advice: item.patient_advice
    }));

  const organSummary = Array.isArray(analysis?.summary?.organ_summary)
    ? analysis.summary.organ_summary
    : [];

  return {
    status: analysis?.status || 'unknown',
    patient_name: analysis?.patient_name || null,
    analysis_date: analysis?.analysis_date || null,
    risk_level: computeRiskLevelFromAnalysis(analysis),
    abnormal_results: abnormalResults,
    organ_summary: organSummary,
    general_recommendations: Array.isArray(analysis?.advice?.general_recommendations)
      ? analysis.advice.general_recommendations.slice(0, 8)
      : [],
    trend_snapshot: trendSnapshot
  };
}

function buildDefaultDisclaimer(language) {
  if (language === 'vi') {
    return 'Thong tin nay chi de tham khao, khong thay the chan doan va chi dinh dieu tri tu bac si.';
  }
  return 'This information is for reference only and does not replace diagnosis or treatment from a licensed clinician.';
}

function sanitizeChatResult(raw, { allowedIndicators, allowedOrgans, language, emergencySignal, analysisRiskLevel }) {
  const fallbackRisk = emergencySignal ? 'urgent' : analysisRiskLevel;
  const normalizedRisk = (() => {
    const value = String(raw?.risk_level || '').trim().toLowerCase();
    if (['low', 'medium', 'high', 'urgent'].includes(value)) {
      return value;
    }
    return fallbackRisk;
  })();

  const citedIndicators = Array.isArray(raw?.cited_indicators)
    ? raw.cited_indicators
      .map((item) => String(item || '').trim())
      .filter((item) => allowedIndicators.has(item.toLowerCase()))
      .slice(0, 8)
    : [];

  const citedOrgans = Array.isArray(raw?.cited_organs)
    ? raw.cited_organs
      .map((item) => String(item || '').trim().toLowerCase())
      .filter((item) => allowedOrgans.has(item))
      .slice(0, 8)
    : [];

  const recommendedActions = Array.isArray(raw?.recommended_actions)
    ? raw.recommended_actions
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 8)
    : [];

  const followUpQuestions = Array.isArray(raw?.follow_up_questions)
    ? raw.follow_up_questions
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 5)
    : [];

  const sevenDayPlan = Array.isArray(raw?.seven_day_plan)
    ? raw.seven_day_plan
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 7)
    : [];

  const answerText = String(raw?.answer_text || '').trim();
  const fallbackText = language === 'vi'
    ? 'Da nhan cau hoi. Vui long tham khao ket qua xet nghiem va trao doi bac si neu co trieu chung bat thuong.'
    : 'I received your question. Please review your lab results and contact a clinician if symptoms worsen.';

  const escalation = Boolean(raw?.escalation) || normalizedRisk === 'urgent';

  return {
    answer_text: answerText || fallbackText,
    risk_level: normalizedRisk,
    cited_indicators: citedIndicators,
    cited_organs: citedOrgans,
    recommended_actions: recommendedActions,
    follow_up_questions: followUpQuestions,
    seven_day_plan: sevenDayPlan,
    disclaimer: String(raw?.disclaimer || '').trim() || buildDefaultDisclaimer(language),
    escalation
  };
}

function buildChatSystemPrompt({ language, detailLevel, emergencySignal }) {
  const outputLanguage = language === 'vi' ? 'Vietnamese' : 'English';
  const detailInstruction = detailLevel === 'clinical'
    ? 'Use clinically detailed wording while staying understandable for non-experts.'
    : 'Use simple, concise wording for everyday users.';

  return [
    'You are Smart Labs Chat, a medical lab result assistant.',
    'You must only use provided analysis context and prior conversation turns.',
    'Never invent biomarkers, values, organs, dates, or trends that are not present in context.',
    'Do not provide final diagnosis or prescribe specific drugs.',
    detailInstruction,
    emergencySignal
      ? 'Emergency signal is detected. Prioritize urgent safety guidance and escalation.'
      : 'If risk appears low or medium, provide calm practical guidance.',
    `Respond in ${outputLanguage}.`,
    'Return JSON only with schema:',
    '{',
    '  "answer_text": "string",',
    '  "risk_level": "low|medium|high|urgent",',
    '  "cited_indicators": ["string"],',
    '  "cited_organs": ["string"],',
    '  "recommended_actions": ["string"],',
    '  "follow_up_questions": ["string"],',
    '  "seven_day_plan": ["string"],',
    '  "disclaimer": "string",',
    '  "escalation": true',
    '}'
  ].join(' ');
}

function upsertChatConversation({ historyId, conversationId, userMessage, assistantPayload, language, detailLevel }) {
  const store = readChatHistoryStore();
  const key = String(historyId);

  if (!store[key]) {
    store[key] = {
      conversations: {}
    };
  }

  if (!store[key].conversations || typeof store[key].conversations !== 'object') {
    store[key].conversations = {};
  }

  const existingConversation = store[key].conversations[conversationId];
  const conversation = existingConversation && typeof existingConversation === 'object'
    ? existingConversation
    : {
      conversation_id: conversationId,
      language,
      detail_level: detailLevel,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      turns: []
    };

  if (!Array.isArray(conversation.turns)) {
    conversation.turns = [];
  }

  conversation.language = language;
  conversation.detail_level = detailLevel;
  conversation.updated_at = new Date().toISOString();

  const userTurn = {
    role: 'user',
    message: String(userMessage || '').trim(),
    created_at: new Date().toISOString()
  };

  const assistantTurn = {
    role: 'assistant',
    message: String(assistantPayload?.answer_text || '').trim(),
    payload: assistantPayload,
    created_at: new Date().toISOString()
  };

  conversation.turns.push(userTurn, assistantTurn);
  if (conversation.turns.length > CHAT_TURN_LIMIT) {
    conversation.turns = conversation.turns.slice(conversation.turns.length - CHAT_TURN_LIMIT);
  }

  store[key].conversations[conversationId] = conversation;
  writeChatHistoryStore(store);

  return conversation;
}

function getConversationTurns({ historyId, conversationId, maxTurns = 12 }) {
  const store = readChatHistoryStore();
  const historyScope = store[String(historyId)];
  if (!historyScope || typeof historyScope !== 'object') {
    return [];
  }

  const conv = historyScope.conversations?.[conversationId];
  if (!conv || !Array.isArray(conv.turns)) {
    return [];
  }

  return conv.turns.slice(-Math.max(2, maxTurns));
}

function persistAnalysisHistory({ analysis, objectKey, fileUrl }) {
  const entry = {
    id: `analysis_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    object_key: objectKey || null,
    file_url: fileUrl || null,
    analysis
  };

  const history = readAnalysisHistory();
  history.unshift(entry);
  writeAnalysisHistory(history.slice(0, HISTORY_LIMIT));

  return entry;
}

function findAnalysisHistoryEntryById(historyId) {
  const targetId = String(historyId || '').trim();
  if (!targetId) {
    return null;
  }

  const history = readAnalysisHistory();
  return history.find((item) => String(item?.id || '') === targetId) || null;
}

function signObjectKey(objectKey, expiresInSeconds = 300) {
  if (!ossClient) {
    throw new Error('OSS client is not configured');
  }

  return ossClient.signatureUrl(objectKey, {
    method: 'GET',
    expires: expiresInSeconds
  });
}

function isImageUrl(fileUrl) {
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)(\?|$)/i.test(fileUrl);
}

function buildQwenMessages(fileUrl) {
  const userInstruction = [
    'Please analyze the medical lab report below.',
    'Return valid JSON only, following the required schema.',
    'If the document is not a medical lab report or is too blurry, return an error JSON based on the contract.',
    'If data is missing, use empty strings instead of guessing.',
    'Default output language is English unless explicitly requested otherwise.',
    `Document to analyze: ${fileUrl}`
  ].join(' ');

  if (isImageUrl(fileUrl)) {
    return [
      { role: 'system', content: QWEN_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: userInstruction },
          { type: 'image_url', image_url: { url: fileUrl } }
        ]
      }
    ];
  }

  return [
    { role: 'system', content: QWEN_SYSTEM_PROMPT },
    { role: 'user', content: userInstruction }
  ];
}

function isPdfReference({ fileUrl, objectKey }) {
  const objectKeyValue = typeof objectKey === 'string' ? objectKey.trim().toLowerCase() : '';
  if (objectKeyValue.endsWith('.pdf')) {
    return true;
  }

  const fileUrlValue = typeof fileUrl === 'string' ? fileUrl.trim() : '';
  if (!fileUrlValue) {
    return false;
  }

  try {
    const parsedUrl = new URL(fileUrlValue);
    return parsedUrl.pathname.toLowerCase().endsWith('.pdf');
  } catch (_) {
    return /\.pdf(\?|$)/i.test(fileUrlValue);
  }
}

async function downloadRemoteFile(sourceUrl, destinationPath, signal) {
  const response = await axios({
    method: 'get',
    url: sourceUrl,
    responseType: 'arraybuffer',
    signal,
    timeout: 0
  });

  await fs.promises.writeFile(destinationPath, Buffer.from(response.data));
}

async function runAnalysisPdfPipeline({ pdfUrl, pdfPath, signal }) {
  const workspaceDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analysis-pdf-'));
  const workingPdfPath = pdfPath || path.join(workspaceDir, 'input.pdf');
  const imagesDir = path.join(workspaceDir, 'images');
  const pageOutputDir = path.join(workspaceDir, 'page_outputs');
  const summaryPath = path.join(workspaceDir, 'summary.json');
  const pythonBin = process.env.PYTHON_BIN || 'python';
  const timeoutMs = Number(process.env.ANALYSIS_PDF_TIMEOUT_MS || 420000);

  try {
    if (!workingPdfPath) {
      throw new Error('Missing pdfPath or pdfUrl for analysis PDF pipeline');
    }

    if (!pdfPath) {
      await downloadRemoteFile(pdfUrl, workingPdfPath, signal);
    }

    const { stdout, stderr } = await execFileAsync(
      pythonBin,
      [
        path.resolve(__dirname, 'analysis_pdf_pipeline.py'),
        '--pdf',
        workingPdfPath,
        '--images-dir',
        imagesDir,
        '--page-output-dir',
        pageOutputDir,
        '--summary-out',
        summaryPath,
        '--stdout-json'
      ],
      {
        cwd: path.resolve(__dirname, '..'),
        env: {
          ...process.env,
          DASHSCOPE_EXTRACT_MODEL,
          DASHSCOPE_SUMMARY_MODEL,
          DASHSCOPE_MODEL: DASHSCOPE_EXTRACT_MODEL,
          PYTHONIOENCODING: 'utf-8'
        },
        maxBuffer: 20 * 1024 * 1024,
        timeout: timeoutMs,
        signal
      }
    );

    return {
      payload: parseJsonFromModelOutput(stdout),
      logs: stderr
    };
  } finally {
    await fs.promises.rm(workspaceDir, { recursive: true, force: true });
  }
}

function mergePipelineSummary(baseSummary, pipelineSummary) {
  if (!pipelineSummary || typeof pipelineSummary !== 'object') {
    return baseSummary;
  }

  const merged = { ...baseSummary };
  const numericKeys = [
    'total_pages',
    'selected_pages',
    'skipped_pages',
    'total_results_raw',
    'total_results_unique'
  ];

  for (const key of numericKeys) {
    const value = pipelineSummary[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      merged[key] = value;
    }
  }

  return merged;
}

async function generateAdviceFromAnalysis(analysis, summary) {
  const qwenResponse = await callDashScopeChatCompletion({
    model: DASHSCOPE_SUMMARY_MODEL,
    messages: buildAdviceMessages({
      status: analysis.status,
      patient_name: analysis.patient_name || null,
      analysis_date: analysis.analysis_date || null,
      results: analysis.results,
      summary
    }),
    stream: false,
    timeout: 60000
  });

  const rawContent = qwenResponse.data?.choices?.[0]?.message?.content || '';
  const parsed = parseJsonFromModelOutput(rawContent);
  return normalizeAdvicePayload(parsed, analysis, summary);
}

async function persistAndEmitAnalysis({
  rawPayload,
  objectKey,
  fileUrl,
  res
}) {
  const normalizedAnalysis = normalizeAnalysisPayload(rawPayload);
  let summary = buildAnalysisSummary(normalizedAnalysis);
  let advice = null;

  summary = mergePipelineSummary(summary, rawPayload?.summary);

  writeSseEvent(res, 'post_process', {
    stage: 'summary',
    message: 'Da trich xuat xong chi so, dang tong hop ket qua.'
  });

  if (normalizedAnalysis.status === 'success') {
    try {
      writeSseEvent(res, 'post_process', {
        stage: 'advice',
        message: 'Dang tao loi khuyen ca nhan hoa tu analysis pipeline.'
      });
      advice = await generateAdviceFromAnalysis(normalizedAnalysis, summary);
    } catch (adviceError) {
      console.error('Advice Generation Error:', adviceError.response?.data || adviceError.message);
      writeSseEvent(res, 'warning', {
        message: 'Khong tao duoc loi khuyen tong quat, se tra ket qua xet nghiem co ban.'
      });
    }
  }

  const persistedAnalysis = {
    ...normalizedAnalysis,
    summary,
    ...(Array.isArray(rawPayload?.pages) ? { pages: rawPayload.pages } : {}),
    ...(advice ? { advice } : {})
  };

  const entry = persistAnalysisHistory({
    analysis: persistedAnalysis,
    objectKey,
    fileUrl
  });

  writeSseEvent(res, 'result', {
    ...entry.analysis,
    history_id: entry.id,
    created_at: entry.created_at
  });

  return entry;
}

app.get('/api/analyses', (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 12), 1), 100);
    const items = readAnalysisHistory().slice(0, limit);

    res.json({
      items,
      count: items.length
    });
  } catch (error) {
    console.error('Analysis History Error:', error.message);
    res.status(500).json({ error: 'Không thể đọc lịch sử xét nghiệm' });
  }
});

/**
 * API 1: Generate STS Token
 * Mobile App gọi API này để xin quyền tạm thời đẩy file PDF/Ảnh thẳng lên Alibaba OSS
 * mà không qua proxy làm tốn RAM server.
 */
app.get('/api/sts-token', async (req, res) => {
  if (!stsClient || !process.env.ALI_ROLE_ARN || !OSS_BUCKET_NAME || !OSS_REGION) {
    return res.status(503).json({
      error: 'STS is not configured. Please set ALI_ACCESS_KEY, ALI_SECRET_KEY, ALI_ROLE_ARN, OSS_REGION, OSS_BUCKET_NAME.'
    });
  }

  try {
    const params = {
      RoleArn: process.env.ALI_ROLE_ARN,
      RoleSessionName: 'qwen-mobile-app-upload',
      DurationSeconds: 900
    };

    const result = await stsClient.request('AssumeRole', params, { method: 'POST' });

    res.json({
      AccessKeyId: result.Credentials.AccessKeyId,
      AccessKeySecret: result.Credentials.AccessKeySecret,
      SecurityToken: result.Credentials.SecurityToken,
      Expiration: result.Credentials.Expiration,
      Bucket: OSS_BUCKET_NAME,
      Region: OSS_REGION
    });
  } catch (error) {
    console.error('STS Error:', error);
    res.status(500).json({ error: 'Không thể cấp quyền STS' });
  }
});

/**
 * API 2: Generate a short-lived signed GET URL for a private OSS object.
 * Mobile flow dùng URL này để đọc file private mà không cần public bucket.
 */
app.get('/api/sign-url', async (req, res) => {
  const { object_key } = req.query;

  if (!object_key) {
    return res.status(400).json({ error: 'Thiếu object_key' });
  }

  try {
    const sanitizedObjectKey = String(object_key).trim().replace(/^\/+/, '');

    if (!sanitizedObjectKey) {
      return res.status(400).json({ error: 'object_key không hợp lệ' });
    }

    const expiresInSeconds = Number(req.query.expires_in || 300);
    const signedUrl = signObjectKey(sanitizedObjectKey, expiresInSeconds);

    res.json({
      bucket: OSS_BUCKET_NAME,
      region: OSS_REGION,
      object_key: sanitizedObjectKey,
      expires_in: expiresInSeconds,
      signed_url: signedUrl
    });
  } catch (error) {
    console.error('OSS Sign URL Error:', error);
    res.status(500).json({ error: 'Không thể tạo signed URL cho OSS object' });
  }
});

/**
 * API 3: Analyze Document via DashScope Singapore (SSE Streaming)
 * Mobile App gửi URL của file (sau khi đã upload OSS thành công).
 * Server proxy luồng stream từ DashScope về Client theo thời gian thực.
 */
app.post('/api/analyze', async (req, res) => {
  const { file_url, object_key, local_file_path } = req.body;

  if (!file_url && !object_key && !local_file_path) {
    return res.status(400).json({ error: 'Thiếu file_url, object_key hoặc local_file_path để phân tích' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('aborted', () => {
    clientDisconnected = true;
    abortController.abort();
  });

  res.on('close', () => {
    if (res.writableEnded) {
      return;
    }

    clientDisconnected = true;
    abortController.abort();
  });

  writeSseEvent(res, 'ready', { message: 'connected' });

  if (!process.env.DASHSCOPE_API_KEY) {
    writeSseEvent(res, 'error', {
      message: 'DashScope API key is missing. Set DASHSCOPE_API_KEY before running analysis.'
    });
    return res.end();
  }

  try {
    let analysisUrl = typeof file_url === 'string' ? file_url.trim() : '';
    let finalized = false;
    const normalizedObjectKey = typeof object_key === 'string' ? object_key.trim().replace(/^\/+/, '') : '';
    const originalFileUrl = typeof file_url === 'string' ? file_url.trim() : '';
    const localFilePath = typeof local_file_path === 'string' ? local_file_path.trim() : '';

    if (!analysisUrl && typeof object_key === 'string') {
      if (!normalizedObjectKey) {
        writeSseEvent(res, 'error', { message: 'object_key không hợp lệ' });
        return res.end();
      }
      analysisUrl = signObjectKey(normalizedObjectKey, 600);
      writeSseEvent(res, 'signed_url_ready', {
        object_key: normalizedObjectKey,
        expires_in: 600
      });
    }

    const shouldUseLocalPdfPipeline = Boolean(localFilePath) && localFilePath.toLowerCase().endsWith('.pdf');

    if (shouldUseLocalPdfPipeline) {
      try {
        await fs.promises.access(localFilePath, fs.constants.R_OK);
      } catch (_) {
        writeSseEvent(res, 'error', {
          message: 'Khong the doc file PDF cuc bo duoc chon tren may nay.'
        });
        return res.end();
      }
    }

    if (shouldUseLocalPdfPipeline || isPdfReference({ fileUrl: analysisUrl, objectKey: normalizedObjectKey })) {
      try {
        writeSseEvent(res, 'post_process', {
          stage: 'pdf_pipeline',
          message: shouldUseLocalPdfPipeline
            ? 'Dang chay pipeline PDF cuc bo cua analysis tren may demo.'
            : 'Da nhan PDF, dang chay pipeline tach trang cua analysis.'
        });

        const pipelineResult = await runAnalysisPdfPipeline({
          pdfUrl: shouldUseLocalPdfPipeline ? '' : analysisUrl,
          pdfPath: shouldUseLocalPdfPipeline ? localFilePath : '',
          signal: abortController.signal
        });

        if (pipelineResult.logs?.trim()) {
          console.log(`Analysis PDF Pipeline Logs:\n${pipelineResult.logs.trim()}`);
        }

        await persistAndEmitAnalysis({
          rawPayload: pipelineResult.payload,
          objectKey: normalizedObjectKey,
          fileUrl: shouldUseLocalPdfPipeline ? localFilePath : originalFileUrl,
          res
        });

        writeSseEvent(res, 'done', {
          message: 'completed',
          mode: 'analysis_pdf'
        });
        return res.end();
      } catch (pdfPipelineError) {
        if (clientDisconnected || abortController.signal.aborted) {
          return res.end();
        }
        console.error('Analysis PDF Pipeline Error:', pdfPipelineError.stderr || pdfPipelineError.message);
        writeSseEvent(res, 'warning', {
          message: shouldUseLocalPdfPipeline
            ? 'PDF pipeline cuc bo cua analysis gap loi.'
            : 'PDF pipeline analysis khong kha dung, dang fallback ve luong phan tich mac dinh.'
        });

        if (shouldUseLocalPdfPipeline) {
          writeSseEvent(res, 'error', {
            message: 'Khong the phan tich PDF cuc bo tren may demo. Thu lai voi anh chup hoac kiem tra pipeline PDF.'
          });
          return res.end();
        }
      }
    }

    let streamBuffer = '';
    let aggregatedText = '';
    let streamCompleted = false;

    const finalizeStructuredResult = async ({ emitError = false } = {}) => {
      if (finalized || !aggregatedText.trim()) {
        return;
      }

      try {
        const parsed = parseJsonFromModelOutput(aggregatedText);
        const entry = await persistAndEmitAnalysis({
          rawPayload: parsed,
          objectKey: normalizedObjectKey,
          fileUrl: originalFileUrl,
          res
        });

        finalized = true;
      } catch (parseError) {
        if (emitError) {
          writeSseEvent(res, 'error', {
            message: 'Không thể parse JSON cuối từ luồng Qwen',
            raw_output: aggregatedText
          });
        }
      }
    };

    const qwenResponse = await callDashScopeChatCompletion({
      model: DASHSCOPE_EXTRACT_MODEL,
      messages: buildQwenMessages(analysisUrl),
      stream: true,
      signal: abortController.signal,
      timeout: 0,
      responseType: 'stream'
    });

    qwenResponse.data.on('data', (chunk) => {
      streamBuffer += chunk.toString('utf8');

      let newlineIndex = streamBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const rawLine = streamBuffer.slice(0, newlineIndex);
        streamBuffer = streamBuffer.slice(newlineIndex + 1);
        const line = rawLine.trim();

        if (!line.startsWith('data:')) {
          newlineIndex = streamBuffer.indexOf('\n');
          continue;
        }

        const data = line.slice(5).trim();

        if (!data) {
          newlineIndex = streamBuffer.indexOf('\n');
          continue;
        }

        if (data === '[DONE]') {
          streamCompleted = true;
          newlineIndex = streamBuffer.indexOf('\n');
          continue;
        }

        try {
          const payload = JSON.parse(data);
          const choice = payload.choices?.[0] || {};
          const delta = choice.delta || {};
          const content = typeof delta.content === 'string'
            ? delta.content
            : typeof choice.message?.content === 'string'
              ? choice.message.content
              : '';

          if (content) {
            aggregatedText += content;
            writeSseEvent(res, 'token', {
              text: content,
              snapshot: aggregatedText
            });
          }
        } catch (parseError) {
          writeSseEvent(res, 'raw', { chunk: data });
        }

        newlineIndex = streamBuffer.indexOf('\n');
      }
    });

    qwenResponse.data.on('end', async () => {
      if (clientDisconnected || abortController.signal.aborted) {
        return res.end();
      }
      await finalizeStructuredResult({ emitError: true });
      if (streamCompleted) {
        writeSseEvent(res, 'done', { message: 'completed' });
      }
      res.end();
    });

    qwenResponse.data.on('error', (streamError) => {
      if (clientDisconnected || abortController.signal.aborted) {
        return res.end();
      }
      console.error('Qwen stream error:', streamError.message);
      writeSseEvent(res, 'error', { message: 'Lỗi stream từ DashScope Singapore' });
      res.end();
    });
  } catch (error) {
    if (clientDisconnected || abortController.signal.aborted) {
      return res.end();
    }
    console.error('Qwen API Error:', error.response?.data || error.message);
    writeSseEvent(res, 'error', { message: 'Internal Server Lỗi khi gọi Qwen' });
    res.end();
  }
});

app.post('/api/chat', async (req, res) => {
  const startedAt = Date.now();
  const historyId = String(req.body?.history_id || '').trim();
  const message = String(req.body?.message || '').trim();
  const requestedConversationId = String(req.body?.conversation_id || '').trim();
  const requestedLanguage = req.body?.language;
  const detailLevel = normalizeDetailLevel(req.body?.detail_level);

  if (!historyId) {
    return res.status(400).json({ error: 'Thiếu history_id' });
  }

  if (!message) {
    return res.status(400).json({ error: 'Thiếu message' });
  }

  const historyEntry = findAnalysisHistoryEntryById(historyId);
  if (!historyEntry) {
    return res.status(404).json({ error: 'Không tìm thấy history_id tương ứng' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abortController = new AbortController();
  let clientDisconnected = false;

  req.on('aborted', () => {
    clientDisconnected = true;
    abortController.abort();
  });

  res.on('close', () => {
    if (res.writableEnded) {
      return;
    }
    clientDisconnected = true;
    abortController.abort();
  });

  const conversationId = requestedConversationId || createConversationId();
  const language = normalizeLanguagePreference({
    requestedLanguage,
    message
  });

  const analysis = historyEntry.analysis || {};
  const analysisRiskLevel = computeRiskLevelFromAnalysis(analysis);
  const emergencySignal = detectEmergencySignal({ message, analysis });

  writeSseEvent(res, 'status', {
    stage: 'ready',
    history_id: historyId,
    conversation_id: conversationId,
    model: DASHSCOPE_CHAT_MODEL
  });

  try {
    const allHistoryEntries = readAnalysisHistory();
    const trendSnapshot = extractTrendSnapshot({
      historyEntries: allHistoryEntries,
      currentEntry: historyEntry
    });
    const contextPayload = buildAnalysisContextForChat({
      analysis,
      trendSnapshot
    });

    const previousTurns = getConversationTurns({
      historyId,
      conversationId,
      maxTurns: 12
    });

    writeSseEvent(res, 'post_process', {
      stage: 'context_ready',
      message: language === 'vi'
        ? 'Da nap bo nho hoi thoai va ket qua xet nghiem.'
        : 'Conversation memory and analysis context loaded.'
    });

    if (emergencySignal) {
      writeSseEvent(res, 'warning', {
        message: language === 'vi'
          ? 'Phat hien dau hieu nguy co cao. Chatbot se uu tien huong dan an toan va khuyen nghi di kham som.'
          : 'High-risk signal detected. Chatbot will prioritize safety guidance and escalation.'
      });
    }

    const messages = [
      {
        role: 'system',
        content: buildChatSystemPrompt({
          language,
          detailLevel,
          emergencySignal
        })
      },
      {
        role: 'user',
        content: JSON.stringify({
          task: 'Answer user question using only provided context.',
          context: contextPayload,
          previous_turns: previousTurns,
          current_question: message,
          constraints: {
            avoid_hallucination: true,
            no_formal_diagnosis: true,
            no_drug_prescription: true,
            include_disclaimer: true
          }
        })
      }
    ];

    let streamBuffer = '';
    let aggregatedText = '';
    let streamedTokenCount = 0;
    let streamCompleted = false;

    const finalizeChatResponse = () => {
      if (clientDisconnected || abortController.signal.aborted) {
        return res.end();
      }

      let parsed;
      try {
        parsed = parseJsonFromModelOutput(aggregatedText);
      } catch (_) {
        parsed = {
          answer_text: aggregatedText,
          risk_level: emergencySignal ? 'urgent' : analysisRiskLevel,
          cited_indicators: [],
          cited_organs: [],
          recommended_actions: [],
          follow_up_questions: [],
          seven_day_plan: [],
          disclaimer: buildDefaultDisclaimer(language),
          escalation: emergencySignal
        };
      }

      const allowedIndicators = new Set(
        (Array.isArray(analysis?.results) ? analysis.results : [])
          .map((item) => String(item?.indicator_name || '').trim().toLowerCase())
          .filter(Boolean)
      );

      const allowedOrgans = new Set(
        (Array.isArray(analysis?.results) ? analysis.results : [])
          .map((item) => String(item?.organ_id || '').trim().toLowerCase())
          .filter(Boolean)
      );

      const assistantPayload = sanitizeChatResult(parsed, {
        allowedIndicators,
        allowedOrgans,
        language,
        emergencySignal,
        analysisRiskLevel
      });

      const savedConversation = upsertChatConversation({
        historyId,
        conversationId,
        userMessage: message,
        assistantPayload,
        language,
        detailLevel
      });

      updateChatMetrics({
        latencyMs: Date.now() - startedAt,
        streamedTokenCount,
        responseCharCount: assistantPayload.answer_text.length
      });

      writeSseEvent(res, 'result', {
        history_id: historyId,
        conversation_id: conversationId,
        model: CHAT_LOCAL_MOCK ? 'local-mock' : DASHSCOPE_CHAT_MODEL,
        language,
        detail_level: detailLevel,
        stream_completed: streamCompleted,
        message_count: Array.isArray(savedConversation.turns) ? savedConversation.turns.length : 0,
        assistant: assistantPayload
      });

      writeSseEvent(res, 'status', {
        stage: 'completed',
        conversation_id: conversationId
      });

      res.end();
    };

    if (!process.env.DASHSCOPE_API_KEY && !CHAT_LOCAL_MOCK) {
      writeSseEvent(res, 'error', {
        message: language === 'vi'
          ? 'Thieu DASHSCOPE_API_KEY. Hay cau hinh key hoac bat CHAT_LOCAL_MOCK=1 de test local.'
          : 'Missing DASHSCOPE_API_KEY. Configure the key or set CHAT_LOCAL_MOCK=1 for local testing.'
      });
      return res.end();
    }

    if (CHAT_LOCAL_MOCK) {
      const mockPayload = {
        answer_text: language === 'vi'
          ? 'Day la phan hoi mock de test local. He thong da doc context tu analysis, xac dinh nguy co va de xuat cac buoc tiep theo ngan gon.'
          : 'This is a local mock response. The system grounded to analysis context, assessed risk, and proposed next actions.',
        risk_level: emergencySignal ? 'urgent' : analysisRiskLevel,
        cited_indicators: (Array.isArray(analysis?.results) ? analysis.results : [])
          .slice(0, 3)
          .map((item) => item.indicator_name)
          .filter(Boolean),
        cited_organs: (Array.isArray(analysis?.results) ? analysis.results : [])
          .slice(0, 3)
          .map((item) => String(item.organ_id || '').toLowerCase())
          .filter(Boolean),
        recommended_actions: language === 'vi'
          ? ['Theo doi trieu chung hang ngay', 'Uu tien tai kham neu co dau hieu bat thuong', 'Duy tri che do an it muoi, du nuoc']
          : ['Track symptoms daily', 'Schedule follow-up if symptoms worsen', 'Maintain low-sodium hydration-friendly habits'],
        follow_up_questions: language === 'vi'
          ? ['Chi so nao dang nguy co cao nhat?', 'Toi nen xet nghiem lai khi nao?', 'Can uu tien thay doi gi trong 7 ngay toi?']
          : ['Which indicator has the highest risk?', 'When should I retest?', 'What are top priorities for the next 7 days?'],
        seven_day_plan: language === 'vi'
          ? ['Ngay 1-2: Uong du nuoc va theo doi trieu chung.', 'Ngay 3-4: Ghi lai che do an va huyet ap neu co.', 'Ngay 5-7: Danh gia lai trieu chung va lap lich tai kham neu can.']
          : ['Day 1-2: Hydrate and monitor symptoms.', 'Day 3-4: Log diet and blood pressure if relevant.', 'Day 5-7: Reassess symptoms and book follow-up if needed.'],
        disclaimer: buildDefaultDisclaimer(language),
        escalation: emergencySignal
      };

      aggregatedText = JSON.stringify(mockPayload);
      for (const chunk of aggregatedText.match(/.{1,64}/g) || []) {
        streamedTokenCount += 1;
        writeSseEvent(res, 'stream', {
          text: chunk,
          snapshot: aggregatedText
        });
      }

      streamCompleted = true;
      return finalizeChatResponse();
    }

    const qwenResponse = await callDashScopeChatCompletion({
      model: DASHSCOPE_CHAT_MODEL,
      messages,
      stream: true,
      signal: abortController.signal,
      timeout: 0,
      responseType: 'stream'
    });

    qwenResponse.data.on('data', (chunk) => {
      streamBuffer += chunk.toString('utf8');

      let newlineIndex = streamBuffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const rawLine = streamBuffer.slice(0, newlineIndex);
        streamBuffer = streamBuffer.slice(newlineIndex + 1);
        const line = rawLine.trim();

        if (!line.startsWith('data:')) {
          newlineIndex = streamBuffer.indexOf('\n');
          continue;
        }

        const data = line.slice(5).trim();
        if (!data) {
          newlineIndex = streamBuffer.indexOf('\n');
          continue;
        }

        if (data === '[DONE]') {
          streamCompleted = true;
          newlineIndex = streamBuffer.indexOf('\n');
          continue;
        }

        try {
          const payload = JSON.parse(data);
          const choice = payload.choices?.[0] || {};
          const delta = choice.delta || {};
          const content = typeof delta.content === 'string'
            ? delta.content
            : typeof choice.message?.content === 'string'
              ? choice.message.content
              : '';

          if (content) {
            aggregatedText += content;
            streamedTokenCount += 1;
            writeSseEvent(res, 'stream', {
              text: content,
              snapshot: aggregatedText
            });
          }
        } catch (_) {
          writeSseEvent(res, 'warning', {
            message: language === 'vi'
              ? 'Nhan du lieu stream khong theo dinh dang JSON chunk. He thong bo qua chunk loi.'
              : 'Received malformed stream chunk. The chunk was skipped.'
          });
        }

        newlineIndex = streamBuffer.indexOf('\n');
      }
    });

    qwenResponse.data.on('end', finalizeChatResponse);

    qwenResponse.data.on('error', (streamError) => {
      if (clientDisconnected || abortController.signal.aborted) {
        return res.end();
      }
      console.error('Qwen chat stream error:', streamError.message);
      writeSseEvent(res, 'error', {
        message: language === 'vi'
          ? 'Loi stream tu DashScope khi chat.'
          : 'DashScope stream error during chat.'
      });
      res.end();
    });
  } catch (error) {
    if (clientDisconnected || abortController.signal.aborted) {
      return res.end();
    }
    console.error('Chat API Error:', error.response?.data || error.message);
    writeSseEvent(res, 'error', {
      message: language === 'vi'
        ? 'Khong the xu ly chat luc nay. Thu lai sau it phut.'
        : 'Unable to process chat right now. Please try again shortly.'
    });
    res.end();
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'qwen-labs-analyzer-backend',
    env_loaded_from: envPath || 'process.env',
    analysis_prompt_loaded: Boolean(QWEN_SYSTEM_PROMPT),
    chat_model: DASHSCOPE_CHAT_MODEL,
    chat_local_mock: CHAT_LOCAL_MOCK
  });
});

app.listen(PORT, () => {
  console.log(`Qwen Labs Analyzer Backend running on port ${PORT}`);
  if (envPath) {
    console.log(`Loaded environment from ${envPath}`);
  }
});
