import { View } from 'react-native';

import { AppButton, AppInput } from '../components/ui';
import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import HeardTokenDisplay from '../components/voice/HeardTokenDisplay';
import CorrectionPanel from '../components/voice/CorrectionPanel';

export default function VoiceNameScreen({
  feedback,
  heard,
  onMicToggle,
  isListening,
  inputValue,
  onChangeInput,
  onSubmitInput,
  suggestions,
  onSuggestion,
  onRetry,
}) {
  return (
    <VoiceStepScreen
      stepLabel="Step 2/6"
      promptBn="নাম বলুন"
      promptEn={null}
      feedback={feedback}
    >
      <AppButton title={isListening ? 'থামুন' : 'মাইক শুরু'} onPress={onMicToggle} />
      <HeardTokenDisplay heardText={heard?.text} acceptedToken={heard?.acceptedToken} confidence={heard?.confidence} />
      <AppInput value={inputValue} onChangeText={onChangeInput} placeholder="নাম টাইপ করুন" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <AppButton title="নাম দিন" onPress={onSubmitInput} />
      </View>
      <CorrectionPanel
        title="আপনি কি এই নাম বলতে চেয়েছিলেন?"
        suggestions={suggestions}
        onSuggestionPress={onSuggestion}
        onRetryVoice={onRetry}
      />
    </VoiceStepScreen>
  );
}
