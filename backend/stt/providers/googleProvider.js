const providerName = 'google';

const transcribe = async () => {
  const error = new Error('Google STT provider is not configured for this deployment.');
  error.code = 'GOOGLE_PROVIDER_NOT_CONFIGURED';
  throw error;
};

module.exports = {
  providerName,
  transcribe,
};
