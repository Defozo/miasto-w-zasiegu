package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test

class SpeechPolicyTest {
    private fun cue(step: Int = 1, time: Long = 1_000, session: String = "one", arrived: Boolean = false) =
        SpeechCue(session, step, "Skręć w prawo", 53, time, arrived)

    @Test fun explicitNavigationStartCanEnableVoiceAndStillWaitsForFreshGps() {
        val p = SpeechPolicy(); p.begin("one", enableImmediately = true)
        assertTrue(p.enabled); assertNull(p.repeat(1_000)); assertNull(p.update(null, 1_000))
        assertNotNull(p.update(cue(), 1_000))
        assertNull(p.update(cue(time = 2_000), 2_000))
    }
    @Test fun muteBeforeEngineReadySurvivesLateVoiceAndGpsCallbacks() {
        val p = SpeechPolicy(); p.begin("one", enableImmediately = true); p.mute()
        assertNull(p.update(cue(), 1_000)); assertNull(p.repeat(1_000)); assertFalse(p.enabled)
        assertNotNull(p.enable(1_000))
    }

    @Test fun newSessionIsAlwaysSilentUntilUserEnablesSpeech() {
        val p = SpeechPolicy(); p.begin("one")
        assertNull(p.update(cue(), 1_000)); assertFalse(p.enabled)
        assertNotNull(p.enable(1_000))
        p.begin("two"); assertFalse(p.enabled)
        assertNull(p.update(cue(session = "two"), 1_000))
    }
    @Test fun repeatedGpsFramesAndChangingDistanceDoNotRepeatManeuver() {
        val p = SpeechPolicy(); p.begin("one"); p.update(cue(), 1_000); p.enable(1_000)
        assertNull(p.update(cue(time = 2_000).copy(distanceM = 42), 2_000))
        assertNull(p.update(cue(time = 6_000).copy(distanceM = 12), 6_000))
        assertNotNull(p.update(cue(step = 2, time = 7_000), 7_000))
    }
    @Test fun explicitRepeatUsesLatestDistanceWithoutReEnablingMutedSpeech() {
        val p = SpeechPolicy(); p.begin("one"); p.update(cue(), 1_000); p.enable(1_000)
        p.update(cue(time = 2_000).copy(distanceM = 21), 2_000)
        assertEquals(21, p.repeat(2_000)!!.distanceM)
        p.mute(); assertNull(p.repeat(2_000)); assertNull(p.update(cue(step = 2), 2_000))
    }
    @Test fun stalePausedAndForeignSessionsCannotSpeak() {
        val p = SpeechPolicy(); p.begin("one"); p.update(cue(), 1_000)
        assertNull(p.enable(21_001)); assertNull(p.repeat(21_001))
        p.update(null, 22_000); assertNull(p.repeat(22_000))
        assertNull(p.update(cue(time = 23_000, session = "old"), 23_000))
        assertNull(p.update(cue(time = 30_000), 29_000))
    }
    @Test fun stopInvalidatesQueuedAndLateCuesAndArrivalIsDistinct() {
        val p = SpeechPolicy(); p.begin("one"); p.update(cue(), 1_000); p.enable(1_000)
        assertNotNull(p.update(cue(time = 2_000, arrived = true), 2_000))
        assertNull(p.update(cue(time = 3_000, arrived = true), 3_000))
        p.end(); assertNull(p.update(cue(step = 2), 3_000)); assertNull(p.enable(3_000)); assertNull(p.repeat(3_000))
    }
    @Test fun recoveredGpsDoesNotAutomaticallyRepeatSameManeuver() {
        val p = SpeechPolicy(); p.begin("one"); p.update(cue(), 1_000); p.enable(1_000)
        p.update(null, 2_000)
        assertNull(p.update(cue(time = 3_000), 3_000))
        assertNotNull(p.repeat(3_000))
    }
}
