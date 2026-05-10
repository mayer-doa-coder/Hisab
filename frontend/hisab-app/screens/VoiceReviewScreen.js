import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import ReviewScreen from '../components/voice/ReviewScreen';

export default function VoiceReviewScreen({
  feedback,
  summary,
  onEditName,
  onEditAmount,
  onEditDate,
  onRetryVoice,
  onNext,
}) {
  return (
    <VoiceStepScreen
      stepLabel="Step 5/6"
      promptBn="সারাংশ দেখুন"
      promptEn={null}
      feedback={feedback}
    >
      <ReviewScreen
        summary={summary}
        onEditName={onEditName}
        onEditAmount={onEditAmount}
        onEditDate={onEditDate}
        onRetryVoice={onRetryVoice}
        onNext={onNext}
      />
    </VoiceStepScreen>
  );
}
