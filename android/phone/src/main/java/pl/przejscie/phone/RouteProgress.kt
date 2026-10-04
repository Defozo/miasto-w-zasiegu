package pl.przejscie.phone

import kotlin.math.*

data class Progress(val step: Int, val remainingM: Double, val distanceFromRouteM: Double)

/** Conservative local projection. No map matching, rerouting or promise of obstacle clearance. */
object RouteProgress {
    fun calculate(points: List<Point>, steps: List<Step>, position: Point, previousStep: Int = 0): Progress {
        require(points.size >= 2 && steps.isNotEmpty())
        val xScale = 111_320.0 * cos(Math.toRadians(position.lat))
        var nearest = Double.MAX_VALUE
        var nearestSegment = 0
        var nearestFraction = 0.0
        // Do not silently jump far ahead at a self-intersection.
        val first = steps[previousStep.coerceIn(steps.indices)].start.coerceIn(0, points.lastIndex - 1)
        val last = steps[(previousStep + 1).coerceIn(steps.indices)].end.coerceIn(first + 1, points.lastIndex)
        for (i in first until last) {
            val a = points[i]; val b = points[i + 1]
            val ax = (a.lon - position.lon) * xScale; val ay = (a.lat - position.lat) * 111_320.0
            val dx = (b.lon - a.lon) * xScale; val dy = (b.lat - a.lat) * 111_320.0
            val t = if (dx * dx + dy * dy == 0.0) 0.0 else (-(ax * dx + ay * dy) / (dx * dx + dy * dy)).coerceIn(0.0, 1.0)
            val d = hypot(ax + t * dx, ay + t * dy)
            if (d < nearest) { nearest = d; nearestSegment = i; nearestFraction = t }
        }
        val stepIndex = steps.indexOfFirst { nearestSegment >= it.start && nearestSegment < it.end }.let { if (it < 0) previousStep else it }
            .coerceIn(previousStep.coerceIn(steps.indices), (previousStep + 1).coerceIn(steps.indices))
        val end = steps[stepIndex].end.coerceIn(nearestSegment + 1, points.lastIndex)
        var remaining = distance(points[nearestSegment], points[nearestSegment + 1]) * (1 - nearestFraction)
        for (i in nearestSegment + 1 until end) remaining += distance(points[i], points[i + 1])
        return Progress(stepIndex, remaining, nearest)
    }
    fun distance(a: Point, b: Point): Double {
        val x = (a.lon - b.lon) * cos(Math.toRadians((a.lat + b.lat) / 2))
        return hypot(x, a.lat - b.lat) * 111_320.0
    }
}
