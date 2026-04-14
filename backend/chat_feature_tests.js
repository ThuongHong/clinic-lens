const axios = require('axios');
const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.resolve(__dirname, 'data', 'analysis_history.json');

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
        },
        {
          indicator_name: 'Hemoglobin',
          value: '13.5',
          unit: 'g/dL',
          reference_range: '13.0 - 17.0',
          organ_id: 'blood',
          severity: 'normal',
          patient_advice: 'Duy tri che do sinh hoat lanh manh.'
        }
      ],
      summary: {
        total_results: 3,
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
          },
          {
            organ_id: 'blood',
            worst_severity: 'normal',
            indicator_count: 1,
            abnormal_count: 0
          }
        ],
        highlighted_results: []
      }
    }
  };

  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, `${JSON.stringify([seedEntry], null, 2)}\n`, 'utf8');
  return seedEntry;
}

async function fetchOrSeedHistory(baseUrl) {
  try {
    const response = await axios.get(`${baseUrl}/api/analyses`, {
      params: { limit: 1 },
      timeout: 10000
    });

    const items = Array.isArray(response.data?.items) ? response.data.items : [];
    if (items.length > 0 && items[0]?.id) {
      return {
        id: String(items[0].id),
        entry: items[0],
        seeded: false
      };
    }
  } catch (_) {
    // Seed on failure below.
  }

  const seed = ensureSampleHistory();
  return {
    id: seed.id,
    entry: seed,
    seeded: true
  };
}

async function streamChat(baseUrl, payload) {
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
      // Keep raw payload.
    }

    events.push({ event: currentEvent, data: parsedData });
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

  return events;
}

function getResultEvent(events) {
  return events.find((item) => item.event === 'result');
}

function ok(condition, label, details = '') {
  return {
    passed: Boolean(condition),
    label,
    details
  };
}

async function run() {
  const baseUrl = process.argv[2] || process.env.BASE_URL || 'http://localhost:9000';
  const report = [];

  console.log(`[chat-feature-tests] baseUrl=${baseUrl}`);

  const health = await axios.get(`${baseUrl}/health`, { timeout: 10000 });
  report.push(ok(health.data?.status === 'ok', 'Health endpoint responds', JSON.stringify(health.data)));

  const seeded = await fetchOrSeedHistory(baseUrl);
  if (seeded.seeded) {
    console.log(`[chat-feature-tests] seeded analysis history id=${seeded.id}`);
  }

  const analysisResults = Array.isArray(seeded.entry?.analysis?.results)
    ? seeded.entry.analysis.results
    : [];

  const allowedIndicators = new Set(
    analysisResults.map((item) => String(item?.indicator_name || '').trim().toLowerCase()).filter(Boolean)
  );

  const case1Events = await streamChat(baseUrl, {
    history_id: seeded.id,
    message: 'Tom tat nguy co tong quan cho toi',
    language: 'vi',
    detail_level: 'simple'
  });
  const case1 = getResultEvent(case1Events);
  report.push(ok(Boolean(case1), 'Case 1 has result event'));
  report.push(ok(case1?.data?.assistant?.risk_level != null, 'Case 1 returns risk_level'));

  const case2Events = await streamChat(baseUrl, {
    history_id: seeded.id,
    message: 'Please answer in English with key risks only.',
    language: 'en',
    detail_level: 'simple'
  });
  const case2 = getResultEvent(case2Events);
  report.push(ok(case2?.data?.language === 'en', 'Case 2 respects English language flag', JSON.stringify(case2?.data || {})));

  const case3Events = await streamChat(baseUrl, {
    history_id: seeded.id,
    message: 'Give a detailed clinical explanation for each abnormal marker.',
    language: 'en',
    detail_level: 'clinical'
  });
  const case3 = getResultEvent(case3Events);
  report.push(ok(case3?.data?.detail_level === 'clinical', 'Case 3 respects detail_level=clinical'));

  const memoryFirst = await streamChat(baseUrl, {
    history_id: seeded.id,
    message: 'Remember this: I prefer concise replies.',
    language: 'en',
    detail_level: 'simple'
  });
  const memoryFirstResult = getResultEvent(memoryFirst);
  const conversationId = memoryFirstResult?.data?.conversation_id;
  report.push(ok(Boolean(conversationId), 'Case 4 gets conversation_id'));

  const memorySecond = await streamChat(baseUrl, {
    history_id: seeded.id,
    conversation_id: conversationId,
    message: 'Now continue with the same thread and summarize in one paragraph.',
    language: 'en',
    detail_level: 'simple'
  });
  const memorySecondResult = getResultEvent(memorySecond);
  report.push(ok((memorySecondResult?.data?.message_count || 0) >= 4, 'Case 4 preserves conversation memory', JSON.stringify(memorySecondResult?.data || {})));

  const emergencyEvents = await streamChat(baseUrl, {
    history_id: seeded.id,
    message: 'Toi dang dau nguc va kho tho, toi nen lam gi ngay bay gio?',
    language: 'vi',
    detail_level: 'simple'
  });
  const emergencyResult = getResultEvent(emergencyEvents);
  const emergencyAssistant = emergencyResult?.data?.assistant || {};
  const emergencyPass = emergencyAssistant.escalation === true || emergencyAssistant.risk_level === 'urgent';
  report.push(ok(emergencyPass, 'Case 5 flags emergency escalation', JSON.stringify(emergencyAssistant)));

  const citeEvents = await streamChat(baseUrl, {
    history_id: seeded.id,
    message: 'Chi ra cac chi so dang duoc trich dan trong tra loi.',
    language: 'vi',
    detail_level: 'simple'
  });
  const citeResult = getResultEvent(citeEvents);
  const cited = Array.isArray(citeResult?.data?.assistant?.cited_indicators)
    ? citeResult.data.assistant.cited_indicators
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
    : [];
  const allCitationsGrounded = cited.every((item) => allowedIndicators.has(item));
  report.push(ok(allCitationsGrounded, 'Case 6 citations stay grounded in known indicators', JSON.stringify(cited)));

  console.log('\n[chat-feature-tests] RESULTS');
  let passCount = 0;
  for (const item of report) {
    const marker = item.passed ? 'PASS' : 'FAIL';
    if (item.passed) {
      passCount += 1;
    }
    console.log(`- ${marker}: ${item.label}${item.details ? ` | ${item.details}` : ''}`);
  }

  console.log(`\n[chat-feature-tests] Summary: ${passCount}/${report.length} passed`);

  if (passCount !== report.length) {
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[chat-feature-tests] FAILED:', error.message);
  process.exitCode = 1;
});
