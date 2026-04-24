import { transcribeAudio } from '../../sttClient';

export const transcribeRecordedAudio = async ({
  audioUri,
  accessToken = null,
  locale = 'bn-BD',
  hints = [],
  fsmState = '',
  timeoutMs = 12000,
} = {}) => {
  return transcribeAudio(audioUri, {
    accessToken,
    locale,
    hints,
    fsmState,
    timeoutMs,
  });
};

export default {
  transcribeRecordedAudio,
};
