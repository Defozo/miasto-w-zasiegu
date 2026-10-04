package pl.przejscie.shared

import androidx.compose.foundation.Canvas
import androidx.compose.ui.Modifier
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke

/** Decorative vector: the full instruction remains accessible as text beside it. */
@Composable fun ManeuverGlyph(instruction: String, color: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val text = instruction.lowercase()
        val w = size.width; val h = size.height
        val stroke = Stroke(width = w * .085f, cap = StrokeCap.Round, join = StrokeJoin.Round)
        val path = Path()
        when {
            "cel" in text -> {
                drawCircle(color, radius = w * .29f, style = stroke)
                drawCircle(color, radius = w * .065f)
            }
            "prawo" in text || "lewo" in text -> {
                val flip = if ("lewo" in text) -1 else 1
                fun x(v: Float) = w * (.5f + (v - .5f) * flip)
                path.moveTo(x(.3f), h * .84f); path.lineTo(x(.3f), h * .43f)
                path.quadraticTo(x(.3f), h * .3f, x(.44f), h * .3f); path.lineTo(x(.83f), h * .3f)
                path.moveTo(x(.63f), h * .1f); path.lineTo(x(.83f), h * .3f); path.lineTo(x(.63f), h * .5f)
                drawPath(path, color, style = stroke)
            }
            else -> {
                path.moveTo(w * .5f, h * .85f); path.lineTo(w * .5f, h * .16f)
                path.moveTo(w * .25f, h * .4f); path.lineTo(w * .5f, h * .15f); path.lineTo(w * .75f, h * .4f)
                drawPath(path, color, style = stroke)
            }
        }
    }
}
