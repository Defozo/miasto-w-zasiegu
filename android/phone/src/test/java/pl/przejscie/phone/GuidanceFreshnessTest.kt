package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test
import pl.przejscie.shared.GuidanceFrame

class GuidanceFreshnessTest {
    @Test fun delayedSnapshotExpiresRatherThanContinuingToGuide() {
        val frame = GuidanceFrame(sentAt = 100_000, mode = "live")
        assertTrue(frame.isFresh(129_999)); assertFalse(frame.isFresh(130_001))
    }
    @Test fun missingTimestampAndUntrustedFutureTimestampAreNotFresh() {
        assertFalse(GuidanceFrame().isFresh(100_000))
        assertFalse(GuidanceFrame(sentAt = 200_000).isFresh(100_000))
    }
}
