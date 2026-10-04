package pl.przejscie.phone

import org.junit.Assert.*
import org.junit.Test

class RouteProgressTest {
    private val points = listOf(Point(19.94, 50.06), Point(19.941, 50.06), Point(19.942, 50.06), Point(19.943, 50.06))
    private val steps = listOf(Step("Prosto", 70.0, 0, 1), Step("Dalej", 70.0, 1, 2), Step("Cel", 70.0, 2, 3))
    @Test fun projectsOntoSegmentInsteadOfDistanceToVertex() {
        val p = RouteProgress.calculate(points, steps, Point(19.9405, 50.06))
        assertEquals(0, p.step); assertTrue(p.distanceFromRouteM < 0.01); assertTrue(p.remainingM in 34.0..38.0)
    }
    @Test fun movesToNextStep() { assertEquals(1, RouteProgress.calculate(points, steps, Point(19.9414, 50.06)).step) }
    @Test fun detectsPositionAwayFromRoute() { assertTrue(RouteProgress.calculate(points, steps, Point(19.9405, 50.061)).distanceFromRouteM > 100) }
    @Test fun doesNotJumpMultipleSteps() { assertTrue(RouteProgress.calculate(points, steps, Point(19.943, 50.06)).step <= 1) }
    @Test fun duplicatePointDoesNotDivideByZero() {
        val p = RouteProgress.calculate(listOf(points[0], points[0], points[1]), listOf(Step("Dalej", 70.0, 0, 2)), points[0])
        assertTrue(p.remainingM.isFinite()); assertTrue(p.distanceFromRouteM.isFinite())
    }
    @Test fun widthIsOptionalButInvalidNumbersAreRejected() {
        assertNull(Needs(width = "").error()); assertNull(Needs(width = "68,5").error())
        assertNotNull(Needs(width = "NaN").error()); assertNotNull(Needs(width = "999").error()); assertNotNull(Needs(incline = "-1").error())
    }
}
