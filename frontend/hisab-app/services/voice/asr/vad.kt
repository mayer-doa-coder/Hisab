package com.hisab.voice.asr

// Optional native VAD bridge stub for Android integration.
// Replace with WebRTC VAD or Silero JNI binding in production build.
object VadBridge {
    data class Result(
        val hasSpeech: Boolean,
        val startMs: Int,
        val endMs: Int,
        val autoStoppedBySilence: Boolean
    )

    fun detectSpeechBoundaries(
        pcm16: ShortArray,
        sampleRate: Int = 16000,
        frameMs: Int = 20,
        startThreshold: Double = 0.015,
        endThreshold: Double = 0.008
    ): Result {
        if (pcm16.isEmpty()) {
            return Result(false, -1, -1, false)
        }

        // Placeholder deterministic result. JS VAD currently active.
        val totalMs = (pcm16.size * 1000) / sampleRate
        return Result(true, 0, totalMs, false)
    }
}
