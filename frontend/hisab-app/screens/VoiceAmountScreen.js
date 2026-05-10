import { View } from 'react-native';

import { AppButton, AppInput } from '../components/ui';
import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import HeardTokenDisplay from '../components/voice/HeardTokenDisplay';
import CorrectionPanel from '../components/voice/CorrectionPanel';

export default function VoiceAmountScreen({
  feedback,
  heard,
  onMicToggle,
  isListening,
  inputValue,
  onChangeInput,
  onSubmitInput,
  onRetry,
}) {
  return (
    <VoiceStepScreen
      stepLabel="Step 3/6"
      promptBn="কত টাকা?"
      promptEn={null}
      feedback={feedback}
    >
      <AppButton title={isListening ? 'থামুন' : 'মাইক শুরু'} onPress={onMicToggle} />
      <HeardTokenDisplay heardText={heard?.text} acceptedToken={heard?.acceptedToken} confidence={heard?.confidence} />
      <AppInput value={inputValue} onChangeText={onChangeInput} placeholder="শুধু সংখ্যা" keyboardType="numeric" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <AppButton title="পরিমাণ দিন" onPress={onSubmitInput} />
        <AppButton variant="secondary" title="50" onPress={() => onChangeInput('50')} />
        <AppButton variant="secondary" title="100" onPress={() => onChangeInput('100')} />
        <AppButton variant="secondary" title="500" onPress={() => onChangeInput('500')} />
      </View>
      <CorrectionPanel title="সংখ্যা ঠিক করুন" onRetryVoice={onRetry} />
    </VoiceStepScreen>
  );
}
