const fs = require('fs');
const path = require('path');
const os = require('os');
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

if (missingEnv.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnv.join(', ')}`);
}

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: '10mb' }));

const DASHSCOPE_SG_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || 'qwen-plus';
const DASHSCOPE_ADVICE_MODEL = process.env.DASHSCOPE_ADVICE_MODEL || DASHSCOPE_MODEL;
const OSS_REGION = process.env.OSS_REGION;
const OSS_BUCKET_NAME = process.env.OSS_BUCKET_NAME;
const PORT = Number(process.env.PORT || 9000);
const HISTORY_DIR = path.resolve(__dirname, 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'analysis_history.json');
const HISTORY_LIMIT = 30;
const QWEN_SYSTEM_PROMPT = loadAnalysisSystemPrompt();

// 1. Cấu hình STS Token (Alibaba Cloud)
const stsClient = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY,
  accessKeySecret: process.env.ALI_SECRET_KEY,
  endpoint: 'https://sts.aliyuncs.com',
  apiVersion: '2015-04-01'
});

const ossClient = new OSS({
  region: OSS_REGION,
  bucket: OSS_BUCKET_NAME,
  accessKeyId: process.env.ALI_ACCESS_KEY,
  accessKeySecret: process.env.ALI_SECRET_KEY
});

function writeSseEvent(res, eventName, payload) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
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

function signObjectKey(objectKey, expiresInSeconds = 300) {
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
    'Hãy phân tích tài liệu xét nghiệm y khoa bên dưới.',
    'Chỉ trả về JSON hợp lệ theo schema đã yêu cầu.',
    'Nếu tài liệu không phải xét nghiệm y khoa hoặc quá mờ, hãy trả về JSON error theo contract.',
    'Nếu thiếu dữ liệu, hãy dùng chuỗi rỗng thay vì suy đoán.',
    `Tài liệu cần phân tích: ${fileUrl}`
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
  const qwenResponse = await axios({
    method: 'post',
    url: DASHSCOPE_SG_URL,
    headers: {
      Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
      'Content-Type': 'application/json'
    },
    data: {
      model: DASHSCOPE_ADVICE_MODEL,
      messages: buildAdviceMessages({
        status: analysis.status,
        patient_name: analysis.patient_name || null,
        analysis_date: analysis.analysis_date || null,
        results: analysis.results,
        summary
      }),
      stream: false
    },
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

    const qwenResponse = await axios({
      method: 'post',
      url: DASHSCOPE_SG_URL,
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: DASHSCOPE_MODEL,
        messages: buildQwenMessages(analysisUrl),
        stream: true
      },
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

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'qwen-labs-analyzer-backend',
    env_loaded_from: envPath || 'process.env',
    analysis_prompt_loaded: Boolean(QWEN_SYSTEM_PROMPT)
  });
});

app.listen(PORT, () => {
  console.log(`Qwen Labs Analyzer Backend running on port ${PORT}`);
  if (envPath) {
    console.log(`Loaded environment from ${envPath}`);
  }
});
