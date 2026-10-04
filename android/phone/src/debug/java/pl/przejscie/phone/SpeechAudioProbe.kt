package pl.przejscie.phone

import android.content.Context
import android.media.AudioFormat
import android.os.Build
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Explicit test opt-in on a debug emulator only. Never records device/host audio. */
internal class SpeechAudioProbe(context: Context) {
    private val cache = context.cacheDir
    private data class Sample(val rate: Int, val channels: Int, val bytes: ByteArrayOutputStream = ByteArrayOutputStream())
    private val samples = mutableMapOf<String, Sample>()
    private fun allowed() = BuildConfig.DEBUG && Build.HARDWARE in listOf("ranchu", "goldfish") && File(cache, "tts-probe-enabled").isFile
    @Synchronized fun begin(id: String?, rate: Int, format: Int, channels: Int) {
        if (id == null || !allowed() || format != AudioFormat.ENCODING_PCM_16BIT || channels !in 1..2 || rate !in 8_000..48_000) return
        if (samples.size >= 2) samples.clear()
        samples[id] = Sample(rate, channels)
    }
    @Synchronized fun append(id: String?, bytes: ByteArray) {
        val sample = samples[id] ?: return
        if (sample.bytes.size() + bytes.size > 2_000_000) { samples.remove(id); return }
        sample.bytes.write(bytes)
    }
    @Synchronized fun discard(id: String?) { samples.remove(id) }
    @Synchronized fun clear() { samples.clear() }
    @Synchronized fun finish(id: String?) {
        val sample = samples.remove(id) ?: return
        if (!allowed()) return
        val pcm = sample.bytes.toByteArray()
        if (pcm.isEmpty()) return
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN)
            .put("RIFF".toByteArray()).putInt(pcm.size + 36).put("WAVEfmt ".toByteArray()).putInt(16)
            .putShort(1).putShort(sample.channels.toShort()).putInt(sample.rate).putInt(sample.rate * sample.channels * 2)
            .putShort((sample.channels * 2).toShort()).putShort(16).put("data".toByteArray()).putInt(pcm.size).array()
        File(cache, "tts-probe.wav").outputStream().use { it.write(header); it.write(pcm) }
        File(cache, "tts-probe.json").writeText(JSONObject().put("utteranceId", id).put("sampleRate", sample.rate)
            .put("channels", sample.channels).put("pcmBytes", pcm.size).put("origin", "TTS synthesis callback; not speaker capture").toString())
    }
}
