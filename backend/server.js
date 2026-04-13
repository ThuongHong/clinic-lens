const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Core = require('@alicloud/pop-core');
const OSS = require('ali-oss');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const DASHSCOPE_SG_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const DASHSCOPE_MODEL = process.env.DASHSCOPE_MODEL || 'qwen-plus';
const OSS_REGION = process.env.OSS_REGION;
const OSS_BUCKET_NAME = process.env.OSS_BUCKET_NAME;

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
Bạn là Trợ lý phân tích Xét nghiệm y khoa. Nhiệm vụ của bạn là nhận đường dẫn file (ảnh chụp bảng kết quả xét nghiệm) và bóc tách các chỉ số.
Hãy lấy ra thông tin và TUYỆT ĐỐI CHỈ TRẢ VỀ JSON theo định dạng chuẩn này (để máy quét render 3D):
{
  "results": [
    {
      "indicator_name": "Tên chất",
      "value": "Chỉ số xét nghiệm",
      "organ_id": "kidneys" (hoặc liver, heart, ... để nối màu bộ phận),
      "severity": "abnormal_high" (hoặc abnormal_low, normal),
      "patient_advice": "(Tiếng Việt) Lời khuyên ngắn gọn cho bệnh nhân."
    }
  ]
}
`;

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
      DurationSeconds: 900 // 15 phút
    };

    const result = await stsClient.request('AssumeRole', params, { method: 'POST' });
    
    // Gửi token tạm cho client
    res.json({
      AccessKeyId: result.Credentials.AccessKeyId,
      AccessKeySecret: result.Credentials.AccessKeySecret,
      SecurityToken: result.Credentials.SecurityToken,
      Expiration: result.Credentials.Expiration
    });
  } catch (error) {
    console.error('STS Error:', error);
    res.status(500).json({ error: 'Không thể cấp quyền STS' });
  }
});

/**
 * API 2: Generate a short-lived signed GET URL for a private OSS object.
 * Member 2/AI flow dùng URL này để đọc file private mà không cần public bucket.
 */
app.get('/api/sign-url', async (req, res) => {
  const { object_key } = req.query;

  if (!object_key) {
    return res.status(400).json({ error: 'Thiếu object_key' });
  }

  try {
    const expiresInSeconds = Number(req.query.expires_in || 300);
    const signedUrl = ossClient.signatureUrl(object_key, {
      method: 'GET',
      expires: expiresInSeconds
    });

    res.json({
      bucket: OSS_BUCKET_NAME,
      region: OSS_REGION,
      object_key,
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
  const { file_url } = req.body; // URL file PDF/Ảnh trên OSS

  if (!file_url) {
    return res.status(400).json({ error: 'Thiếu đường dẫn file xét nghiệm (file_url)' });
  }

  // Khởi tạo Server-Sent Events (SSE) Header
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const qwenResponse = await axios({
      method: 'post',
      url: DASHSCOPE_SG_URL,
      headers: {
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json'
      },
      data: {
        model: DASHSCOPE_MODEL,
        messages: [
          { role: 'system', content: QWEN_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Dưới đây là link file tài liệu xét nghiệm của tôi: ${file_url}. Hãy phân tích dữ liệu xét nghiệm trong tài liệu này và chỉ trả về JSON đúng schema đã yêu cầu.`
          }
        ],
        stream: true
      },
      responseType: 'stream'
    });

    qwenResponse.data.on('data', (chunk) => {
      res.write(chunk);
    });

    qwenResponse.data.on('end', () => {
      res.end();
    });

    qwenResponse.data.on('error', (streamError) => {
      console.error('Qwen stream error:', streamError.message);
      res.write('event: error\ndata: {"message": "Lỗi stream từ DashScope Singapore"}\n\n');
      res.end();
    });

  } catch (error) {
    console.error('Qwen API Error:', error.response?.data || error.message);
    res.write('event: error\ndata: {"message": "Internal Server Lỗi khi gọi Qwen"}\n\n');
    res.end();
  }
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(`Qwen Labs Analyzer Backend running on port ${PORT}`);
});
