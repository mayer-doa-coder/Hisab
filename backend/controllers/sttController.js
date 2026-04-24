const { transcribe } = require('../stt/sttService');

const parseHints = (rawHints) => {
  if (Array.isArray(rawHints)) {
    return rawHints.map((item) => String(item || '').trim()).filter(Boolean);
  }

  if (typeof rawHints === 'string') {
    const value = rawHints.trim();
    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean);
      }
    } catch {
      // Fall back to comma-delimited hints when JSON parse fails.
    }

    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  return [];
};

const transcribeAudio = async (req, res) => {
  const actorUserId = String(req.auth?.user_id || req.user_id || '').trim();
  if (!actorUserId) {
    return res.status(401).json({
      error: {
        code: 'AUTH_REQUIRED',
        message: 'Authentication is required.',
      },
    });
  }

  const file = req.file;
  if (!file || !file.buffer || !file.buffer.length) {
    return res.status(400).json({
      error: {
        code: 'AUDIO_FILE_REQUIRED',
        message: 'Multipart field "audio" is required.',
      },
    });
  }

  const locale = String(req.body?.locale || 'bn-BD').trim() || 'bn-BD';
  const hints = parseHints(req.body?.hints);
  const fsmState = String(req.body?.fsmState || '').trim().toUpperCase();

  console.info('[stt.transcribe.request]', {
    user_id: actorUserId,
    request_id: String(req.requestId || ''),
    locale,
    fsm_state: fsmState || null,
    hints_count: hints.length,
    audio_bytes: Number(file.size || file.buffer?.length || 0),
  });

  try {
    const response = await transcribe({
      audio: file,
      locale,
      hints,
      fsmState,
      requestId: req.requestId,
    });

    console.info('[stt.transcribe.response]', {
      user_id: actorUserId,
      request_id: String(response?.request_id || req.requestId || ''),
      provider: String(response?.provider || ''),
      latency_ms: Number(response?.latency_ms || 0),
      confidence: Number(response?.confidence || 0),
    });

    return res.status(200).json(response);
  } catch (error) {
    console.error('[stt.transcribe.failure]', {
      user_id: actorUserId,
      request_id: String(error?.request_id || req.requestId || ''),
      code: String(error?.code || 'STT_PROVIDER_FAILURE'),
      message: error?.message || 'STT provider failed.',
    });

    return res.status(500).json({
      error: {
        code: String(error?.code || 'STT_PROVIDER_FAILURE'),
        message: error?.message || 'STT provider failed.',
      },
      request_id: String(error?.request_id || req.requestId || ''),
    });
  }
};

module.exports = {
  transcribeAudio,
};
