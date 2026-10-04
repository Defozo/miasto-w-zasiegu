package pl.przejscie.phone

import kotlin.math.max

/** Local aggregation only. Raw fixes never go into an uploaded summary. */
class TripAccumulator(private val startedAtMs: Long) {
    var distanceM = 0.0; private set
    var fixCount = 0; private set
    var simulated = false; private set
    private var previous: Point? = null
    private var previousAt = 0L
    fun add(point: Point, atMs: Long, accuracyM: Float, mock: Boolean) {
        simulated = simulated || mock
        if (!accuracyM.isFinite() || accuracyM > 30 || accuracyM < 0 || atMs < startedAtMs) return
        val before = previous
        if (before != null) {
            val elapsed = (atMs - previousAt) / 1000.0
            val distance = RouteProgress.distance(before, point)
            // Ignore gaps and jumps; do not turn a reconnection into recorded travel.
            if (elapsed in 0.5..30.0 && distance / elapsed <= 6.0 && distance >= 2.0) distanceM += distance
        }
        previous = point; previousAt = atMs; fixCount++
    }
    fun durationS(now: Long) = max(0L, now - startedAtMs) / 1000
    fun eligible(emulator: Boolean) = !emulator && !simulated && fixCount >= 2 && distanceM >= 5.0
}
