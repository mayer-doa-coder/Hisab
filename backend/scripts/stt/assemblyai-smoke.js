const axios = require('axios');
const fs = require('fs-extra');
require('dotenv').config();

const baseUrl = 'https://api.assemblyai.com';
const apiKey = String(process.env.STT_ASSEMBLYAI_API_KEY || '').trim();

if (!apiKey) {
  console.error('STT_ASSEMBLYAI_API_KEY is missing in environment.');
  process.exit(1);
}

const headers = {
  authorization: apiKey,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function uploadLocalFile(path) {
  const audioData = await fs.readFile(path);
  const uploadResponse = await axios.post(`${baseUrl}/v2/upload`, audioData, {
    headers,
  });
  return uploadResponse.data.upload_url;
}

async function main() {
  const localPath = process.argv[2] || '';
  const audioUrl = localPath ? await uploadLocalFile(localPath) : 'https://assembly.ai/wildfires.mp3';

  const data = {
    audio_url: audioUrl,
    language_detection: true,
    speech_models: ['universal-3-pro', 'universal-2'],
  };

  const response = await axios.post(`${baseUrl}/v2/transcript`, data, { headers });
  const transcriptId = response.data.id;
  const pollingEndpoint = `${baseUrl}/v2/transcript/${transcriptId}`;

  while (true) {
    const pollingResponse = await axios.get(pollingEndpoint, { headers });
    const transcriptionResult = pollingResponse.data;

    if (transcriptionResult.status === 'completed') {
      console.log(JSON.stringify({
        ok: true,
        transcriptId,
        textPreview: String(transcriptionResult.text || '').slice(0, 240),
      }, null, 2));
      break;
    }

    if (transcriptionResult.status === 'error') {
      throw new Error(`Transcription failed: ${transcriptionResult.error}`);
    }

    await sleep(3000);
  }
}

main().catch((error) => {
  const status = error?.response?.status || null;
  const message = error?.response?.data?.error || error?.message || 'Unknown error';
  console.error(JSON.stringify({ ok: false, status, message }, null, 2));
  process.exit(1);
});
