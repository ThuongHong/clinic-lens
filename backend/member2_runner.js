const fs = require('fs');
const path = require('path');
const axios = require('axios');
const OSS = require('ali-oss');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'output');
const OUTPUT_PAYLOAD_DIR = path.join(OUTPUT_DIR, 'member2_outputs');
const CASES_PATH = path.join(__dirname, 'member2_cases.json');
const PROMPT_PATH = path.join(__dirname, 'prompts', 'member2_system_prompt.md');
const DASHSCOPE_URL = process.env.DASHSCOPE_URL || 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || 'qwen-vl-max';
const MAX_TOKENS = Number(process.env.MEMBER2_MAX_TOKENS || 4096);
const TEMPERATURE = Number(process.env.MEMBER2_TEMPERATURE || 0.05);
const RETRIES = Number(process.env.MEMBER2_RETRIES || 3);

const ALLOWED_ORGANS = new Set(['kidneys', 'liver', 'heart', 'pancreas', 'thyroid', 'blood', 'bone', 'immune']);
const ALLOWED_SEVERITY = new Set(['normal', 'abnormal_high', 'abnormal_low', 'unknown']);
const ALLOWED_ERRORS = new Set(['IMAGE_BLURRY', 'NOT_MEDICAL', 'UNSUPPORTED_FORMAT', 'PARTIAL_DATA']);
const SUCCESS_KEYS = ['status', 'patient_name', 'analysis_date', 'results'];
const ERROR_KEYS = ['status', 'error_code', 'error_message', 'results'];
const RESULT_KEYS = ['indicator_name', 'value', 'unit', 'reference_range', 'organ_id', 'severity', 'patient_advice'];

function hasExactKeys(obj, expectedKeys) {
  const keys = Object.keys(obj).sort();
  const expected = [...expectedKeys].sort();
  return JSON.stringify(keys) === JSON.stringify(expected);
}

function parseArgs(argv) {
  const args = { dryRun: false, caseId: null, transport: 'auto' };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--dry-run') args.dryRun = true;
    else if (cur === '--case') args.caseId = argv[i + 1], i += 1;
    else if (cur === '--transport') args.transport = argv[i + 1], i += 1;
  }
  if (!['auto', 'oss', 'base64'].includes(args.transport)) {
    throw new Error('transport chi nhan auto|oss|base64');
  }
  return args;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readPrompt() {
  return fs.readFileSync(PROMPT_PATH, 'utf8').trim();
}

function extractJson(rawText) {
  const text = String(rawText || '').trim();
  if (text.startsWith('{') || text.startsWith('[')) return JSON.parse(text);
  const m = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (m) return JSON.parse(m[1]);
  throw new Error('Khong tim thay JSON hop le trong output model');
}

function validateContract(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return ['payload khong phai object'];

  if (!['success', 'error'].includes(payload.status)) {
    errors.push('status phai la success hoac error');
    return errors;
  }

  if (!Array.isArray(payload.results)) errors.push('results phai la array');

  if (payload.status === 'error') {
    if (!hasExactKeys(payload, ERROR_KEYS)) {
      errors.push('status=error phai dung chinh xac cac field: status,error_code,error_message,results');
    }
    if (!ALLOWED_ERRORS.has(payload.error_code)) errors.push('error_code khong hop le');
    if (typeof payload.error_message !== 'string' || !payload.error_message.trim()) {
      errors.push('error_message phai la chuoi khong rong');
    }
    if (Array.isArray(payload.results) && payload.results.length !== 0) {
      errors.push('status=error thi results phai la mang rong');
    }
    return errors;
  }

  if (!hasExactKeys(payload, SUCCESS_KEYS)) {
    errors.push('status=success phai dung chinh xac cac field: status,patient_name,analysis_date,results');
  }

  if (!('patient_name' in payload)) errors.push('thieu patient_name');
  if (!('analysis_date' in payload)) errors.push('thieu analysis_date');
  if (!(payload.patient_name === null || typeof payload.patient_name === 'string')) {
    errors.push('patient_name phai la string hoac null');
  }
  if (!(payload.analysis_date === null || typeof payload.analysis_date === 'string')) {
    errors.push('analysis_date phai la string hoac null');
  }

  for (let i = 0; i < payload.results.length; i += 1) {
    const item = payload.results[i];
    if (!item || typeof item !== 'object') {
      errors.push(`results[${i}] khong phai object`);
      continue;
    }
    if (!hasExactKeys(item, RESULT_KEYS)) {
      errors.push(`results[${i}] phai dung chinh xac cac field contract`);
    }
    RESULT_KEYS.forEach((k) => {
      if (!(k in item)) errors.push(`results[${i}] thieu ${k}`);
    });
    ['indicator_name', 'value', 'unit', 'reference_range', 'patient_advice'].forEach((k) => {
      if (k in item && (typeof item[k] !== 'string' || !item[k].trim())) {
        errors.push(`results[${i}].${k} phai la chuoi khong rong`);
      }
    });
    if (!ALLOWED_ORGANS.has(item.organ_id)) errors.push(`results[${i}].organ_id khong hop le`);
    if (!ALLOWED_SEVERITY.has(item.severity)) errors.push(`results[${i}].severity khong hop le`);
  }

  return errors;
}

function inferMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'application/pdf';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function asDataUrl(filePath) {
  const mime = inferMime(filePath);
  const b64 = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

function buildOssClient() {
  const region = process.env.OSS_REGION || process.env.ALI_OSS_REGION;
  const bucket = process.env.OSS_BUCKET_NAME || process.env.ALI_OSS_BUCKET;
  const accessKeyId = process.env.ALI_ACCESS_KEY || process.env.ALI_ACCESS_KEY_ID;
  const accessKeySecret = process.env.ALI_SECRET_KEY || process.env.ALI_ACCESS_KEY_SECRET;

  if (!region || !bucket || !accessKeyId || !accessKeySecret) return null;

  return new OSS({ region, bucket, accessKeyId, accessKeySecret });
}

async function toFileRef(filePath, transport, ossClient) {
  if (transport === 'base64') return { ref: asDataUrl(filePath), used: 'base64' };

  if (transport === 'oss' || (transport === 'auto' && ossClient)) {
    if (!ossClient) throw new Error('Thieu OSS config de upload');
    const key = `member2/${path.basename(filePath, path.extname(filePath))}_${Date.now()}${path.extname(filePath)}`;
    await ossClient.put(key, filePath, { headers: { 'Content-Type': inferMime(filePath) } });
    const signed = ossClient.signatureUrl(key, { method: 'GET', expires: 1800 });
    return { ref: signed, used: 'oss_url' };
  }

  return { ref: asDataUrl(filePath), used: 'base64' };
}

function buildPayload(systemPrompt, fileRef) {
  return {
    model: DASHSCOPE_MODEL,
    input: {
      messages: [
        { role: 'system', content: [{ type: 'text', text: systemPrompt }] },
        {
          role: 'user',
          content: [
            { type: 'image', image: fileRef },
            { type: 'text', text: 'Phan tich tai lieu xet nghiem va tra ve JSON dung contract.' },
          ],
        },
      ],
    },
    parameters: {
      result_format: 'message',
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
    },
  };
}

async function postWithRetry(payload) {
  const headers = {
    Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
    'Content-Type': 'application/json',
  };

  let lastError = null;
  for (let i = 1; i <= RETRIES; i += 1) {
    try {
      const resp = await axios.post(DASHSCOPE_URL, payload, { headers, timeout: 180000 });
      return resp;
    } catch (err) {
      lastError = err;
      if (i === RETRIES) break;
      await new Promise((r) => setTimeout(r, 1000 * i));
    }
  }
  throw lastError;
}

function parseModelText(data) {
  const content = data?.output?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) return content.map((x) => x.text || '').join('');
  return String(content || '');
}

function resolveFile(p) {
  const abs = path.isAbsolute(p) ? p : path.join(ROOT, p);
  return abs;
}

async function runOneCase(testCase, options, systemPrompt, ossClient) {
  const startedAt = new Date().toISOString();
  const filePath = resolveFile(testCase.file_path || '');

  if (!testCase.file_path) {
    return { id: testCase.id, status: 'skipped', reason: 'case khong co file_path', startedAt };
  }

  if (!fs.existsSync(filePath)) {
    if (testCase.skip_if_missing) {
      return { id: testCase.id, status: 'skipped', reason: 'missing optional file', startedAt };
    }
    return { id: testCase.id, status: 'failed', reason: 'missing file', filePath, startedAt };
  }

  if (options.dryRun) {
    return { id: testCase.id, status: 'dry-run', filePath, startedAt };
  }

  try {
    const { ref, used } = await toFileRef(filePath, options.transport, ossClient);
    const payload = buildPayload(systemPrompt, ref);
    const resp = await postWithRetry(payload);
    const text = parseModelText(resp.data);
    const parsed = extractJson(text);
    const contractErrors = validateContract(parsed);
    ensureDir(OUTPUT_PAYLOAD_DIR);
    const outputPayloadPath = path.join(OUTPUT_PAYLOAD_DIR, `${testCase.id}.json`);
    fs.writeFileSync(outputPayloadPath, JSON.stringify(parsed, null, 2), 'utf8');

    let expectationErrors = [];
    if (testCase.expect?.status && parsed.status !== testCase.expect.status) {
      expectationErrors.push(`expect status=${testCase.expect.status} but got ${parsed.status}`);
    }
    if (testCase.expect?.error_code && parsed.error_code !== testCase.expect.error_code) {
      expectationErrors.push(`expect error_code=${testCase.expect.error_code} but got ${parsed.error_code}`);
    }

    const ok = contractErrors.length === 0 && expectationErrors.length === 0;
    return {
      id: testCase.id,
      kind: testCase.kind,
      status: ok ? 'passed' : 'failed',
      transport: used,
      contractErrors,
      expectationErrors,
      responseStatus: parsed.status,
      resultCount: Array.isArray(parsed.results) ? parsed.results.length : 0,
      outputPayloadPath,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  } catch (err) {
    return {
      id: testCase.id,
      kind: testCase.kind,
      status: 'failed',
      error: err?.response?.data || err.message,
      startedAt,
      finishedAt: new Date().toISOString(),
    };
  }
}

async function main() {
  const options = parseArgs(process.argv);
  ensureDir(OUTPUT_DIR);

  if (!process.env.DASHSCOPE_API_KEY && !options.dryRun) {
    throw new Error('Thieu DASHSCOPE_API_KEY trong env/.env');
  }

  const systemPrompt = readPrompt();
  const allCases = readJson(CASES_PATH);
  const cases = options.caseId ? allCases.filter((x) => x.id === options.caseId) : allCases;

  if (cases.length === 0) {
    throw new Error('Khong tim thay test case nao hop le');
  }

  const ossClient = buildOssClient();
  const items = [];
  for (const c of cases) {
    // Run sequentially to keep logs stable and avoid throttling.
    // eslint-disable-next-line no-await-in-loop
    const result = await runOneCase(c, options, systemPrompt, ossClient);
    items.push(result);
    console.log(`[${result.id}] ${result.status}`);
  }

  const summary = {
    total: items.length,
    passed: items.filter((x) => x.status === 'passed').length,
    failed: items.filter((x) => x.status === 'failed').length,
    skipped: items.filter((x) => x.status === 'skipped').length,
    dryRun: options.dryRun,
    transport: options.transport,
    model: DASHSCOPE_MODEL,
    endpoint: DASHSCOPE_URL,
    generatedAt: new Date().toISOString(),
  };

  const report = { summary, items };
  const reportPath = path.join(OUTPUT_DIR, 'member2_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('----------------------------------------');
  console.log(`Report: ${reportPath}`);
  console.log(`Passed: ${summary.passed} | Failed: ${summary.failed} | Skipped: ${summary.skipped}`);
}

main().catch((err) => {
  console.error('Member2 runner failed:', err.message || err);
  process.exit(1);
});
