const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.resolve(__dirname, 'data', 'analysis_history.json');

function containsNonEnglishText(value) {
  const text = String(value || '').trim();
  if (!text) {
    return false;
  }

  if (/[\u0600-\u06FF\u4E00-\u9FFF\u3040-\u30FF\u0400-\u04FF]/.test(text)) {
    return true;
  }

  const lowered = text.toLowerCase();
  const hints = ['toi ', 'khong', 'nguy co', 'xet nghiem', 'bonjour', 'resultat', 'analyse'];
  return hints.some((hint) => lowered.includes(hint));
}

function ensureSampleHistory() {
  const seedEntry = {
    id: `analysis_seed_${Date.now()}`,
    created_at: new Date().toISOString(),
    object_key: null,
    file_url: null,
    analysis: {
      status: 'success',
      patient_name: 'Seed User',
      analysis_date: new Date().toISOString().slice(0, 10),
      results: [
        {
          indicator_name: 'Creatinine',
          value: '1.8',
          unit: 'mg/dL',
          reference_range: '0.7 - 1.2',
          organ_id: 'kidneys',
          severity: 'abnormal_high',
          patient_advice: 'Theo doi them va tai kham theo huong dan bac si.'
        },
        {
          indicator_name: 'AST (SGOT)',
          value: '55',
          unit: 'U/L',
          reference_range: '< 40',
          organ_id: 'liver',
          severity: 'abnormal_high',
          patient_advice: 'Han che ruou bia, theo doi men gan dinh ky.'
        }
      ],
      summary: {
        total_results: 2,
        abnormal_results: 2,
        organ_summary: [
          {
            organ_id: 'kidneys',
            worst_severity: 'abnormal_high',
            indicator_count: 1,
            abnormal_count: 1
          },
          {
            organ_id: 'liver',
            worst_severity: 'abnormal_high',
            indicator_count: 1,
            abnormal_count: 1
          }
        ],
        highlighted_results: []
      }
    }
  };

  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, `${JSON.stringify([seedEntry], null, 2)}\n`, 'utf8');
  return seedEntry.id;
}

async function fetchLatestHistoryId(baseUrl) {
  const response = await axios.get(`${baseUrl}/api/analyses`, {
    params: { limit: 1 },
    timeout: 10000
  });

  const items = Array.isArray(response.data?.items) ? response.data.items : [];
  if (items.length === 0) {
    const seeded = ensureSampleHistory();
    console.log(`[chat-smoke-test] seeded analysis history with id=${seeded}`);
    return seeded;
  }

  const latestId = String(items[0]?.id || '').trim();
  if (!latestId) {
    throw new Error('Latest analysis entry has an invalid id.');
  }

  return latestId;
}

async function runChatSmokeTest() {
  const baseUrl = process.argv[2] || process.env.BASE_URL || 'http://localhost:9000';
  const manualHistoryId = process.argv[3] || process.env.HISTORY_ID || '';
  const historyId = manualHistoryId || await fetchLatestHistoryId(baseUrl);

  const payload = {
    history_id: historyId,
    message: 'Tom tat nguy co chinh cua ket qua nay va de xuat ke hoach 7 ngay ngan gon bang tieng Viet.',
    language: 'vi',
    detail_level: 'simple'
  };

  console.log(`[chat-smoke-test] baseUrl=${baseUrl}`);
  console.log(`[chat-smoke-test] history_id=${historyId}`);

  const response = await axios({
    method: 'post',
    url: `${baseUrl}/api/chat`,
    data: payload,
    responseType: 'stream',
    timeout: 0,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json'
    }
  });

  const events = [];
  let currentEvent = 'message';
  let dataBuffer = '';

  const flushEvent = () => {
    if (!dataBuffer) {
      return;
    }

    let parsedData = dataBuffer;
    try {
      parsedData = JSON.parse(dataBuffer);
    } catch (_) {
      // Keep raw text if JSON parse fails.
    }

    events.push({
      event: currentEvent,
      data: parsedData
    });

    if (currentEvent === 'stream' && typeof parsedData?.text === 'string') {
      process.stdout.write(parsedData.text);
    }

    if (currentEvent !== 'stream') {
      console.log(`\n[${currentEvent}]`, parsedData);
    }

    currentEvent = 'message';
    dataBuffer = '';
  };

  await new Promise((resolve, reject) => {
    response.data.on('data', (chunk) => {
      const lines = chunk.toString('utf8').split(/\r?\n/);
      for (const line of lines) {
        if (!line) {
          flushEvent();
          continue;
        }

        if (line.startsWith('event:')) {
          currentEvent = line.slice(6).trim();
          continue;
        }

        if (line.startsWith('data:')) {
          const piece = line.slice(5).trimLeft();
          dataBuffer = dataBuffer ? `${dataBuffer}\n${piece}` : piece;
        }
      }
    });

    response.data.on('end', () => {
      flushEvent();
      resolve();
    });

    response.data.on('error', reject);
  });

  const resultEvent = events.find((item) => item.event === 'result');
  if (!resultEvent) {
    throw new Error('No result event received from /api/chat');
  }

  const assistant = resultEvent?.data?.assistant || {};
  const englishOnly = [
    assistant.answer_text,
    ...(Array.isArray(assistant.recommended_actions) ? assistant.recommended_actions : []),
    ...(Array.isArray(assistant.follow_up_questions) ? assistant.follow_up_questions : []),
    ...(Array.isArray(assistant.seven_day_plan) ? assistant.seven_day_plan : []),
    assistant.disclaimer
  ].every((item) => !containsNonEnglishText(item));

  if (!englishOnly) {
    throw new Error('Chat result contains non-English assistant text.');
  }

  console.log('\n[chat-smoke-test] SUCCESS: received result event from /api/chat');
}

runChatSmokeTest().catch((error) => {
  console.error('[chat-smoke-test] FAILED:', error.message);
  process.exitCode = 1;
});
