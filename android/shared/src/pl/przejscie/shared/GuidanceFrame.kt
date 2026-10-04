package pl.przejscie.shared

import android.content.Context
import com.google.android.gms.wearable.DataMap
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/** DataItem is a replaceable snapshot, never a command queue. Expired data must not guide. */
data class GuidanceFrame(
    val session: String = "", val instruction: String = "Otwórz trasę na telefonie",
    val distanceM: Int = 0, val step: Int = 0, val total: Int = 0,
    val sentAt: Long = 0, val mode: String = "stopped", val note: String = "Brak aktywnej trasy"
) {
    fun isFresh(now: Long) = sentAt > 0 && now >= sentAt - 5_000 && now - sentAt <= 30_000
    fun map(): DataMap = DataMap().apply {
        putString("session", session); putString("instruction", instruction)
        putInt("distanceM", distanceM); putInt("step", step); putInt("total", total)
        putLong("sentAt", sentAt); putString("mode", mode); putString("note", note)
    }
    fun save(context: Context) {
        context.getSharedPreferences("guidance", Context.MODE_PRIVATE).edit()
            .putString("session", session).putString("instruction", instruction)
            .putInt("distanceM", distanceM).putInt("step", step).putInt("total", total)
            .putLong("sentAt", sentAt).putString("mode", mode).putString("note", note).apply()
    }
    companion object {
        fun from(m: DataMap) = GuidanceFrame(m.getString("session") ?: "", m.getString("instruction") ?: "",
            m.getInt("distanceM"), m.getInt("step"), m.getInt("total"), m.getLong("sentAt"),
            m.getString("mode") ?: "stopped", m.getString("note") ?: "")
        fun load(c: Context): GuidanceFrame {
            val p = c.getSharedPreferences("guidance", Context.MODE_PRIVATE)
            return GuidanceFrame(p.getString("session", "") ?: "", p.getString("instruction", "Otwórz trasę na telefonie") ?: "",
                p.getInt("distanceM", 0), p.getInt("step", 0), p.getInt("total", 0), p.getLong("sentAt", 0),
                p.getString("mode", "stopped") ?: "stopped", p.getString("note", "Brak aktywnej trasy") ?: "")
        }
    }
}

fun publishGuidance(context: Context, frame: GuidanceFrame, failure: (String) -> Unit = {}) {
    frame.save(context)
    val request = PutDataMapRequest.create("/guidance/current").apply { dataMap.putAll(frame.map()) }.asPutDataRequest().setUrgent()
    Wearable.getDataClient(context).putDataItem(request).addOnFailureListener { failure("Zegarek: brak synchronizacji") }
}
