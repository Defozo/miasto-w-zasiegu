package pl.przejscie.phone

import android.content.Context

/** Production variants never collect synthesized audio. */
@Suppress("UNUSED_PARAMETER")
internal class SpeechAudioProbe(context: Context) {
    fun begin(id: String?, rate: Int, format: Int, channels: Int) = Unit
    fun append(id: String?, bytes: ByteArray) = Unit
    fun finish(id: String?) = Unit
    fun discard(id: String?) = Unit
    fun clear() = Unit
}
