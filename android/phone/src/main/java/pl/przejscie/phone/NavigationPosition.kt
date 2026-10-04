package pl.przejscie.phone

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Ephemeral phone-only position. Never stored in the web UI or sent to the watch. */
internal data class NavigationFix(val point: Point, val accuracyM: Float, val observedAt: Long) {
    fun isUsable(now: Long) = observedAt > 0 && now >= observedAt && now - observedAt <= 20_000 &&
        accuracyM.isFinite() && accuracyM in 0f..30f &&
        point.lat.isFinite() && point.lat in -90.0..90.0 && point.lon.isFinite() && point.lon in -180.0..180.0
}

internal object NavigationPosition {
    private val mutable = MutableStateFlow<NavigationFix?>(null)
    val state = mutable.asStateFlow()
    fun update(value: NavigationFix?) { mutable.value = value }
}
