import { View } from 'react-native';

import { AppButton } from '../components/ui';
import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import HeardTokenDisplay from '../components/voice/HeardTokenDisplay';
import CorrectionPanel from '../components/voice/CorrectionPanel';

export default function VoiceIntentScreen({
  feedback,
  heard,
  onMicToggle,
  isListening,
  onIntent,
  suggestions,
  onSuggestion,
  onRetry,
}) {
  return (
    <VoiceStepScreen
      stepLabel="Step 1/6"
      promptBn="কি করতে চান?"
      promptEn={null}
      feedback={feedback}
    >
      <AppButton title={isListening ? 'থামুন' : 'মাইক শুরু'} onPress={onMicToggle} />
      <HeardTokenDisplay heardText={heard?.text} acceptedToken={heard?.acceptedToken} confidence={heard?.confidence} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <AppButton title="বাকি" onPress={() => onIntent('baki')} />
        <AppButton title="জমা" onPress={() => onIntent('joma')} />
        <AppButton title="বিক্রি" onPress={() => onIntent('becha')} />
      </View>
      <CorrectionPanel
        title="ভুল হলে দ্রুত ঠিক করুন"
        suggestions={suggestions}
        onSuggestionPress={onSuggestion}
        onRetryVoice={onRetry}
      />
    </VoiceStepScreen>
  );
}
