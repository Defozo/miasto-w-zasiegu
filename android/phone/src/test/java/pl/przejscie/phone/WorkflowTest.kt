package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test

class WorkflowTest {
    private val location = ChosenLocation("1", "Floriańska 1", Point(19.94, 50.06), "address", "address", "test")
    private fun chosen() = LocationEntry().choose(location)
    @Test fun typingInvalidatesPreviouslyChosenCoordinatesEvenWhenTextMatches() {
        val before = chosen(); assertTrue(before.confirmed)
        assertFalse(before.edit("Inna ulica").confirmed)
        assertNull(before.edit(location.label).chosen)
    }
    @Test fun allIntermediateStopsMustBeConfirmed() {
        assertTrue(canPlan(chosen(), chosen(), List(3) { chosen() }))
        assertFalse(canPlan(chosen(), chosen(), listOf(chosen(), LocationEntry(text = "Floriańska"), chosen())))
        assertFalse(canPlan(chosen(), chosen(), List(6) { chosen() }))
        assertTrue(canPlan(chosen(), chosen(), List(5) { chosen() }))
    }
    @Test fun emptyOrUnconfirmedEndpointsCannotBeRouted() {
        assertFalse(canPlan(LocationEntry(), chosen(), emptyList()))
        assertFalse(canPlan(chosen(), chosen().edit("adres"), emptyList()))
    }
    @Test fun mockAndEmulatorSessionsNeverBecomeUploadEligible() {
        val actual = TripAccumulator(0)
        actual.add(Point(19.94, 50.06), 1000, 5f, false)
        actual.add(Point(19.9402, 50.06), 5000, 5f, false)
        assertTrue(actual.eligible(false)); assertFalse(actual.eligible(true))
        actual.add(Point(19.9403, 50.06), 9000, 5f, true)
        assertFalse(actual.eligible(false))
    }
    @Test fun inaccurateFixesAndJumpsDoNotCreateTravelDistance() {
        val t = TripAccumulator(1000)
        t.add(Point(19.94, 50.06), 2000, 100f, false)
        t.add(Point(19.94, 50.06), 3000, 5f, false)
        t.add(Point(20.5, 50.5), 4000, 5f, false)
        assertEquals(0.0, t.distanceM, .001); assertFalse(t.eligible(false))
        assertEquals(8L, t.durationS(9000))
    }
    @Test fun sharedProfileRequiresWholePercentIncline() {
        assertNotNull(Needs(incline = "6.5").error())
        assertNull(Needs(incline = "6").error())
    }
}
