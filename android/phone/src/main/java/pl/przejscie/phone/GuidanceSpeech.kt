package pl.przejscie.phone

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

internal data class SpeechUi(val session: String? = null, val ready: Boolean = false,
    val available: Boolean = false, val enabled: Boolean = false, val speaking: Boolean = false,
    val canRepeat: Boolean = false, val message: String = "Głos jest wyłączony.")

/** Owned by the foreground guidance session. UI invalidation also stops it immediately. */
internal object GuidanceSpeech {
    const val ENABLE = "pl.przejscie.SPEECH_ENABLE"
    const val REPEAT = "pl.przejscie.SPEECH_REPEAT"
    const val MUTE = "pl.przejscie.SPEECH_MUTE"
    const val REFRESH = "pl.przejscie.SPEECH_REFRESH"
    val commands = setOf(ENABLE, REPEAT, MUTE, REFRESH)
    private val mutable = MutableStateFlow(SpeechUi())
    val state = mutable.asStateFlow()
    private val policy = SpeechPolicy()
    private val main = Handler(Looper.getMainLooper())
    private var engine: TextToSpeech? = null
    private var audio: AudioManager? = null
    private var focus: AudioFocusRequest? = null
    private var generation = 0L
    private var utteranceNumber = 0L
    private var currentUtterance: String? = null
    private var probe: SpeechAudioProbe? = null
    private var waitingForPosition = false

    fun begin(context: Context, session: String, enableImmediately: Boolean = false) {
        end()
        policy.begin(session, enableImmediately)
        mutable.value = SpeechUi(session = session, enabled = enableImmediately, message = "Sprawdzam dostępność polskiego głosu…")
        val ticket = generation
        audio = context.getSystemService(AudioManager::class.java)
        probe = SpeechAudioProbe(context.applicationContext)
        engine = TextToSpeech(context.applicationContext) { result -> main.post {
            if (ticket != generation || policy.session != session) return@post
            val tts = engine ?: return@post
            if (result != TextToSpeech.SUCCESS) {
                mutable.value = mutable.value.copy(ready = true, message = "Nie udało się uruchomić głosu. Sprawdź ustawienia mowy.")
                event("engine_error"); return@post
            }
            tts.setAudioAttributes(attributes())
            tts.setOnUtteranceProgressListener(listener(ticket))
            selectLocalVoice(tts)
        } }
    }

    fun update(cue: SpeechCue?) {
        if (policy.session == null) return
        val planned = policy.update(cue, now())
        if (policy.validCue(now()) == null) {
            waitingForPosition = true
            if (currentUtterance != null) stopAudio("Mowa wstrzymana. Potrzebna jest aktualna, dokładna pozycja.")
            else if (policy.enabled) mutable.value = mutable.value.copy(message = "Mowa wstrzymana. Potrzebna jest aktualna, dokładna pozycja.")
        } else {
            if (waitingForPosition && policy.enabled && planned == null) mutable.value = mutable.value.copy(
                message = "Pozycja odzyskana. Możesz powtórzyć bieżącą instrukcję.")
            waitingForPosition = false
        }
        publishControls()
        planned?.let(::speak)
    }

    fun command(action: String, session: String?) {
        if (session == null || session != policy.session) return
        when (action) {
            ENABLE -> if (mutable.value.ready && mutable.value.available) {
                val cue = policy.enable(now()); publishControls()
                if (cue != null) speak(cue) else mutable.value = mutable.value.copy(message = "Głos włączony. Czekam na aktualną, dokładną pozycję.")
            }
            REPEAT -> policy.repeat(now())?.let(::speak)
            MUTE -> { policy.mute(); stopAudio("Głos wyciszony."); publishControls(); event("muted") }
            REFRESH -> if (!policy.enabled && mutable.value.ready) engine?.let(::selectLocalVoice)
        }
    }

    private fun selectLocalVoice(tts: TextToSpeech) {
        // Do not use setLanguage to discover support: it can trigger a download.
        val voice = tts.voices.orEmpty().filter {
            it.locale.language == "pl" && !it.isNetworkConnectionRequired &&
                TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED !in it.features.orEmpty()
        }.sortedBy { it.name }.firstOrNull()
        val available = voice != null && tts.setVoice(voice) == TextToSpeech.SUCCESS
        if (!available) policy.mute()
        mutable.value = mutable.value.copy(ready = true, available = available, message = if (available)
            "Polski głos jest gotowy. Włącz go, gdy chcesz słuchać instrukcji."
            else "Brak polskiego głosu offline na tym urządzeniu. Możesz pobrać go w ustawieniach mowy.")
        publishControls(); event(if (available) "local_polish_ready" else "local_polish_missing")
        // A late TTS initialization must respect a mute pressed while it was loading.
        if (available && policy.enabled) {
            val cue = policy.repeat(now())
            if (cue != null) speak(cue) else mutable.value = mutable.value.copy(message = "Głos włączony. Czekam na aktualną, dokładną pozycję.")
        }
    }

    fun end(expectedSession: String? = null) {
        if (expectedSession != null && expectedSession != policy.session) return
        generation++
        policy.end()
        waitingForPosition = false
        currentUtterance = null
        engine?.stop(); releaseFocus(); engine?.shutdown(); engine = null
        probe?.clear(); probe = null; audio = null
        mutable.value = SpeechUi()
        event("ended")
    }

    private fun speak(cue: SpeechCue) {
        if (!policy.enabled || cue.session != policy.session || !cue.isFresh(now()) || !mutable.value.available) return
        val tts = engine ?: return
        stopAudio(null)
        val ticket = generation
        val id = "${cue.session}:${cue.step}:${++utteranceNumber}"
        val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
            .setAudioAttributes(attributes()).setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener({ change ->
                if (ticket == generation && currentUtterance == id && change != AudioManager.AUDIOFOCUS_GAIN) {
                    policy.mute(); stopAudio("Głos wyciszony, aby nie przerywać innego dźwięku. Możesz włączyć go ponownie.")
                    publishControls(); event("focus_lost", id)
                }
            }, main).build()
        focus = request
        if (audio?.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            policy.mute(); stopAudio("Nie można teraz odtworzyć instrukcji. Spróbuj włączyć głos ponownie.")
            publishControls(); event("focus_denied", id); return
        }
        currentUtterance = id
        mutable.value = mutable.value.copy(speaking = false, message = "Instrukcja przekazana do odtworzenia.")
        if (tts.speak(cue.spokenText(), TextToSpeech.QUEUE_FLUSH, null, id) == TextToSpeech.SUCCESS) event("queued", id)
        else { stopAudio("Nie udało się odtworzyć instrukcji. Użyj przycisku Powtórz instrukcję."); event("queue_error", id) }
    }

    private fun listener(ticket: Long) = object : UtteranceProgressListener() {
        override fun onStart(id: String?) = post(ticket, id) {
            mutable.value = mutable.value.copy(speaking = true, message = "Odtwarzam instrukcję."); event("onStart", id)
        }
        override fun onDone(id: String?) {
            probe?.finish(id)
            post(ticket, id) { currentUtterance = null; releaseFocus()
                mutable.value = mutable.value.copy(speaking = false, message = "Instrukcja odtworzona. Możesz ją powtórzyć."); event("onDone", id) }
        }
        @Deprecated("Required abstract callback")
        override fun onError(id: String?) = onError(id, TextToSpeech.ERROR)
        override fun onError(id: String?, errorCode: Int) {
            probe?.discard(id)
            post(ticket, id) { stopAudio("Nie udało się odtworzyć instrukcji. Sprawdź ustawienia mowy i spróbuj ponownie."); event("onError:$errorCode", id) }
        }
        override fun onStop(id: String?, interrupted: Boolean) {
            probe?.discard(id)
            // Report cancelled old utterances too, but never mutate a newer session.
            event("onStop:$interrupted", id)
            post(ticket, id) { currentUtterance = null; releaseFocus(); mutable.value = mutable.value.copy(speaking = false) }
        }
        override fun onBeginSynthesis(id: String?, sampleRateInHz: Int, audioFormat: Int, channelCount: Int) {
            if (ticket == generation) probe?.begin(id, sampleRateInHz, audioFormat, channelCount)
        }
        override fun onAudioAvailable(id: String?, bytes: ByteArray?) { if (ticket == generation && bytes != null) probe?.append(id, bytes) }
    }

    private fun post(ticket: Long, id: String?, action: () -> Unit) { main.post {
        if (ticket == generation && id != null && id == currentUtterance && policy.session != null) action()
    } }
    private fun stopAudio(message: String?) {
        currentUtterance = null; engine?.stop(); releaseFocus()
        mutable.value = mutable.value.copy(speaking = false, message = message ?: mutable.value.message)
    }
    private fun releaseFocus() { focus?.let { audio?.abandonAudioFocusRequest(it) }; focus = null }
    private fun publishControls() { mutable.value = mutable.value.copy(enabled = policy.enabled,
        canRepeat = policy.enabled && mutable.value.available && policy.validCue(now()) != null) }
    private fun attributes() = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
    private fun now() = SystemClock.elapsedRealtime()
    private fun event(name: String, id: String? = null) { Log.i("PrzejscieSpeech", "$name utterance=${id ?: "none"}") }
}
