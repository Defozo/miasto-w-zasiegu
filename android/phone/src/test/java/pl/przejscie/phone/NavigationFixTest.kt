package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test

class NavigationFixTest {
    private val fix = NavigationFix(Point(19.94, 50.06), 8f, 1_000)

    @Test fun stationaryFixExpiresWithoutAnotherLocationCallback() {
        assertTrue(fix.isUsable(21_000))
        assertFalse(fix.isUsable(21_001))
    }
    @Test fun futureOrUnmeasuredFixCannotBeShownAsCurrent() {
        assertFalse(fix.isUsable(999))
        assertFalse(fix.copy(observedAt = 0).isUsable(1_000))
        assertFalse(fix.copy(accuracyM = Float.POSITIVE_INFINITY).isUsable(1_000))
        assertFalse(fix.copy(accuracyM = Float.NaN).isUsable(1_000))
    }
    @Test fun inaccurateOrInvalidPositionIsHidden() {
        assertTrue(fix.copy(accuracyM = 30f).isUsable(1_000))
        assertFalse(fix.copy(accuracyM = 30.1f).isUsable(1_000))
        assertFalse(fix.copy(point = Point(Double.NaN, 50.0)).isUsable(1_000))
        assertFalse(fix.copy(point = Point(19.0, 91.0)).isUsable(1_000))
    }
}
