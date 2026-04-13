const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Core = require('@alicloud/pop-core');
const OSS = require('ali-oss');
const dotenv = require('dotenv');

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
const OSS_REGION = process.env.OSS_REGION;
const OSS_BUCKET_NAME = process.env.OSS_BUCKET_NAME;
const PORT = Number(process.env.PORT || 9000);
const HISTORY_DIR = path.resolve(__dirname, 'data');
const HISTORY_FILE = path.join(HISTORY_DIR, 'analysis_history.json');
const HISTORY_LIMIT = 30;

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

// 2. Định nghĩa System Prompt hướng dẫn Qwen giải mã file Xét nghiệm y khoa
const QWEN_SYSTEM_PROMPT = `
Bạn là Trợ lý phân tích Xét nghiệm y khoa.
Nhiệm vụ của bạn là đọc tài liệu xét nghiệm và bóc tách các chỉ số quan trọng.
TUYỆT ĐỐI CHỈ TRẢ VỀ JSON hợp lệ theo schema sau:
{
  "status": "success",
  "analysis_date": "YYYY-MM-DD",
  "results": [
    {
      "indicator_name": "Tên chỉ số",
      "value": "Giá trị",
      "unit": "Đơn vị",
      "reference_range": "Khoảng tham chiếu",
      "organ_id": "kidneys|liver|heart|lungs|blood|other",
      "severity": "normal|abnormal_low|abnormal_high|critical",
      "patient_advice": "Lời khuyên ngắn gọn bằng tiếng Việt"
    }
  ]
}
Không thêm markdown, không thêm lời giải thích ngoài JSON.
`;

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

function normalizeAnalysisPayload(payload) {
  const rawResults = Array.isArray(payload?.results) ? payload.results : [];

  return {
    status: payload?.status?.toString() || 'success',
    analysis_date: payload?.analysis_date?.toString() || new Date().toISOString().slice(0, 10),
    ...(payload?.patient_name ? { patient_name: payload.patient_name.toString() } : {}),
    results: rawResults.map((result) => ({
      indicator_name: result?.indicator_name?.toString() || '',
      value: result?.value?.toString() || '',
      unit: result?.unit?.toString() || '',
      reference_range: result?.reference_range?.toString() || '',
      organ_id: result?.organ_id?.toString() || 'other',
      severity: result?.severity?.toString() || 'normal',
      patient_advice: result?.patient_advice?.toString() || ''
    }))
  };
}

function persistAnalysisHistory({ analysis, objectKey, fileUrl }) {
  const normalized = normalizeAnalysisPayload(analysis);
  const entry = {
    id: `analysis_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    object_key: objectKey || null,
    file_url: fileUrl || null,
    analysis: normalized
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
  const { file_url, object_key } = req.body;

  if (!file_url && !object_key) {
    return res.status(400).json({ error: 'Thiếu file_url hoặc object_key để phân tích' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const abortController = new AbortController();

  req.on('close', () => {
    abortController.abort();
  });

  writeSseEvent(res, 'ready', { message: 'connected' });

  try {
    let analysisUrl = typeof file_url === 'string' ? file_url.trim() : '';
    let finalized = false;

    if (!analysisUrl && typeof object_key === 'string') {
      const sanitizedObjectKey = object_key.trim().replace(/^\/+/, '');
      if (!sanitizedObjectKey) {
        writeSseEvent(res, 'error', { message: 'object_key không hợp lệ' });
        return res.end();
      }
      analysisUrl = signObjectKey(sanitizedObjectKey, 600);
      writeSseEvent(res, 'signed_url_ready', {
        object_key: sanitizedObjectKey,
        expires_in: 600
      });
    }

    let streamBuffer = '';
    let aggregatedText = '';

    const finalizeStructuredResult = ({ emitError = false } = {}) => {
      if (finalized || !aggregatedText.trim()) {
        return;
      }

      try {
        const parsed = JSON.parse(aggregatedText);
        const entry = persistAnalysisHistory({
          analysis: parsed,
          objectKey: typeof object_key === 'string' ? object_key.trim() : '',
          fileUrl: typeof file_url === 'string' ? file_url.trim() : ''
        });

        finalized = true;
        writeSseEvent(res, 'result', {
          ...entry.analysis,
          history_id: entry.id,
          created_at: entry.created_at
        });
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
          writeSseEvent(res, 'done', { message: 'completed' });
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

          if (choice.finish_reason) {
            finalizeStructuredResult();
          }
        } catch (parseError) {
          writeSseEvent(res, 'raw', { chunk: data });
        }

        newlineIndex = streamBuffer.indexOf('\n');
      }
    });

    qwenResponse.data.on('end', () => {
      finalizeStructuredResult({ emitError: true });
      res.end();
    });

    qwenResponse.data.on('error', (streamError) => {
      console.error('Qwen stream error:', streamError.message);
      writeSseEvent(res, 'error', { message: 'Lỗi stream từ DashScope Singapore' });
      res.end();
    });
  } catch (error) {
    console.error('Qwen API Error:', error.response?.data || error.message);
    writeSseEvent(res, 'error', { message: 'Internal Server Lỗi khi gọi Qwen' });
    res.end();
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'qwen-labs-analyzer-backend',
    env_loaded_from: envPath || 'process.env'
  });
});

app.listen(PORT, () => {
  console.log(`Qwen Labs Analyzer Backend running on port ${PORT}`);
  if (envPath) {
    console.log(`Loaded environment from ${envPath}`);
  }
});
