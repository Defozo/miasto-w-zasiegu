package pl.przejscie.phone

internal data class SpeechCue(val session: String, val step: Int, val instruction: String,
    val distanceM: Int, val observedAt: Long, val arrived: Boolean = false) {
    val key get() = Triple(session, step, arrived)
    fun isFresh(now: Long) = observedAt > 0 && now >= observedAt && now - observedAt <= 20_000
    fun spokenText(): String = if (arrived) "Cel w pobliżu. Sprawdź właściwe wejście."
        else if (distanceM < 10) instruction else "Za około ${((distanceM + 5) / 10) * 10} metrów. $instruction"
}

/** Session state, independent of Compose and the platform speech engine. */
internal class SpeechPolicy {
    var session: String? = null; private set
    var enabled = false; private set
    private var current: SpeechCue? = null
    private var lastAutomatic: Triple<String, Int, Boolean>? = null

    fun begin(id: String, enableImmediately: Boolean = false) { session = id; enabled = enableImmediately; current = null; lastAutomatic = null }
    fun end() { session = null; enabled = false; current = null; lastAutomatic = null }
    fun mute() { enabled = false }
    fun validCue(now: Long) = current?.takeIf { it.session == session && it.isFresh(now) }
    fun update(cue: SpeechCue?, now: Long): SpeechCue? {
        current = cue?.takeIf { it.session == session && it.isFresh(now) }
        return if (enabled) takeCue(now, force = false) else null
    }
    fun enable(now: Long): SpeechCue? { if (session == null) return null; enabled = true; return takeCue(now, force = true) }
    fun repeat(now: Long) = if (enabled) takeCue(now, force = true) else null
    private fun takeCue(now: Long, force: Boolean): SpeechCue? {
        val cue = validCue(now) ?: return null
        if (!force && lastAutomatic == cue.key) return null
        // Deduplicate attempts too: focus/engine failures require explicit repeat,
        // rather than attempting to interrupt other audio every GPS update.
        lastAutomatic = cue.key
        return cue
    }
}
