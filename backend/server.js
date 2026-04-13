const express = require('express');
const cors = require('cors');
const axios = require('axios');
const Core = require('@alicloud/pop-core');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// 1. Cấu hình STS Token (Alibaba Cloud)
const stsClient = new Core({
  accessKeyId: process.env.ALI_ACCESS_KEY,
  accessKeySecret: process.env.ALI_SECRET_KEY,
  endpoint: 'https://sts.aliyuncs.com',
  apiVersion: '2015-04-01'
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
 * API 2: Analyze Document by Qwen3.6-Plus (SSE Streaming)
 * Mobile App gửi URL của file (sau khi đã upload OSS thành công).
 * Server dùng Event-Stream trả trực tiếp Text từ Qwen về Client realtime.
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
      url: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      headers: {
        'Authorization': `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-SSE': 'enable' // Bật streaming
      },
      data: {
        "model": "qwen3.6-plus", 
        "input": {
          "messages": [
            { "role": "system", "content": QWEN_SYSTEM_PROMPT },
            { "role": "user", "content": `Dưới đây là link file tài liệu xét nghiệm của tôi: ${file_url}` }
          ]
        },
        "parameters": {
          "result_format": "message",
          "incremental_output": true // Bắn stream từng khối text nhỏ
        }
      },
      responseType: 'stream' // Xử lý stream buffer
    });

    // Ép luồng dữ liệu proxy thẳng tới Client
    qwenResponse.data.on('data', (chunk) => {
      // Dữ liệu từ DashScope thường về dạng sự kiện: id, event, data
      res.write(chunk);
    });

    qwenResponse.data.on('end', () => {
      res.end();
    });

  } catch (error) {
    console.error('Qwen API Error:', error.message);
    res.write('event: error\ndata: {"message": "Internal Server Lỗi khi gọi Qwen"}\n\n');
    res.end();
  }
});

const PORT = process.env.PORT || 9000;
app.listen(PORT, () => {
  console.log(\`Qwen Labs Analyzer Backend running on port \${PORT}\`);
});
