import { View } from 'react-native';

import { AppButton, AppInput } from '../components/ui';
import VoiceStepScreen from '../components/voice/VoiceStepScreen';
import HeardTokenDisplay from '../components/voice/HeardTokenDisplay';
import CorrectionPanel from '../components/voice/CorrectionPanel';

export default function VoiceDateScreen({
  feedback,
  heard,
  onMicToggle,
  isListening,
  inputValue,
  onChangeInput,
  onSubmitInput,
  onSkip,
  onRetry,
}) {
  return (
    <VoiceStepScreen
      stepLabel="Step 4/6"
      promptBn="তারিখ বলুন (ঐচ্ছিক)"
      promptEn={null}
      feedback={feedback}
    >
      <AppButton title={isListening ? 'থামুন' : 'মাইক শুরু'} onPress={onMicToggle} />
      <HeardTokenDisplay heardText={heard?.text} acceptedToken={heard?.acceptedToken} confidence={heard?.confidence} />
      <AppInput value={inputValue} onChangeText={onChangeInput} placeholder="আজ / কাল / তারিখ" />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <AppButton title="তারিখ দিন" onPress={onSubmitInput} />
        <AppButton variant="secondary" title="আজ" onPress={() => onChangeInput('aj')} />
        <AppButton variant="secondary" title="কাল" onPress={() => onChangeInput('kal')} />
        <AppButton variant="secondary" title="বাদ দিন" onPress={onSkip} />
      </View>
      <CorrectionPanel title="তারিখ ভুল হলে আবার বলুন" onRetryVoice={onRetry} />
    </VoiceStepScreen>
  );
}
