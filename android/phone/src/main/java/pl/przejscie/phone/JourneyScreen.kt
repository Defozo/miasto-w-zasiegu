package pl.przejscie.phone

import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.unit.dp
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

internal class JourneyState(context: Context, owner: String?) {
    private val storage = context.getSharedPreferences("journey-${owner ?: "guest"}", 0)
    var saved: JSONObject? = runCatching { JSONObject(storage.getString("saved", null)!!) }.getOrNull()
    var result by mutableStateOf<JSONObject?>(null)
    var selectedId by mutableStateOf<String?>(null)
    var departed by mutableStateOf(false)
    var carMode by mutableStateOf(false)
    var ramp by mutableStateOf(false)
    val alternatives: List<JSONObject> get() { val a = result?.optJSONArray("alternatives") ?: JSONArray(); return (0 until a.length()).map { a.getJSONObject(it) } }
    val selected get() = alternatives.find { it.optString("id") == selectedId }
    fun invalidate() { result = null; selectedId = null }
    fun accept(j: JSONObject) { result = j; selectedId = alternatives.firstOrNull()?.optString("id") }
    fun save(start: ChosenLocation, end: ChosenLocation, via: List<LocationEntry>, needs: Needs) {
        val doc = JSONObject().put("result", result).put("selection", selectedId).put("start", start.favoriteJson()).put("end", end.favoriteJson()).put("via", JSONArray(via.mapNotNull { it.chosen?.favoriteJson() })).put("profile", needs.profileJson())
        check(storage.edit().putString("saved", doc.toString()).commit()) { "Brak miejsca na zapis podróży. Spróbuj ponownie." }
        saved = doc; departed = true
    }
    fun completeTransfer() { departed = false; saved = null; storage.edit().remove("saved").apply() }
}
internal fun savedPoint(p: JSONObject): ChosenLocation {
    val c = p.getJSONArray("coordinates")
    return ChosenLocation(p.getString("id"), p.getString("label"), Point(c.getDouble(0), c.getDouble(1)), p.optString("kind", "place"), p.optString("precision", "approximate"), p.optString("sourceLabel"), p.optString("sourceUrl"))
}
@Composable internal fun JourneyControls(state: JourneyState, onChange: () -> Unit, onSelect: (Route) -> Unit, onDepart: () -> Boolean, onContinue: (ChosenLocation) -> Unit, onLocate: () -> Unit) {
    val uri = LocalUriHandler.current; var confirm by remember { mutableStateOf(false) }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        FilterChip(selected = !state.carMode, onClick = { onChange(); state.carMode = false }, label = { Text("Bez auta") }, modifier = Modifier.heightIn(min = 48.dp))
        FilterChip(selected = state.carMode, onClick = { onChange(); state.carMode = true }, label = { Text("Auto + dalszy odcinek") }, modifier = Modifier.heightIn(min = 48.dp))
    }
    if (state.carMode) {
        Details("Warunki przesiadki") { Row { Checkbox(state.ramp, { state.ramp = it; onChange() }); Text("Potrzebuję miejsca na rampę lub wysiadanie", Modifier.padding(top = 12.dp)) } }
        state.result?.let { result ->
            Text("Wybierz parking", style = MaterialTheme.typography.titleLarge)
            Text("Obliczono: ${result.optString("calculatedAt").replace('T', ' ').take(16)}")
            state.alternatives.forEach { a ->
                val p = a.getJSONObject("parking"); val drive = a.getJSONObject("drive"); val onward = a.getJSONObject("onward")
                OutlinedButton(onClick = { state.selectedId = a.getString("id"); onSelect(Api.parseRoute(onward)) }, modifier = Modifier.fillMaxWidth().heightIn(min = 64.dp)) {
                    Text("${if (state.selectedId == a.optString("id")) "✓ " else ""}${p.optString("name")}\nAuto: ${(drive.optDouble("durationS") / 60).toInt().coerceAtLeast(1)} min · dalej ${(onward.optDouble("durationS") / 60).toInt().coerceAtLeast(1)} min, ${onward.optDouble("distanceM").toInt()} m")
                }
            }
            state.selected?.let { a ->
                val p = a.getJSONObject("parking"); val transfer = a.getJSONObject("transfer")
                Notice(transfer.optString("message"))
                val warnings = a.optJSONArray("warnings") ?: JSONArray()
                for (i in 0 until warnings.length()) Text(warnings.getString(i))
                Text("Miejsca specjalne: ${p.optJSONObject("parking")?.optString("disabledSpaces")?.takeUnless { it.isBlank() || it == "null" } ?: "brak danych"}")
                Text("Godziny: ${p.optString("openingHours").ifBlank { "brak danych" }}")
                Text("Zmiana rekordu: ${p.optString("osmUpdatedAt").ifBlank { "brak daty" }}. To nie jest data audytu.")
                p.optString("sourceUrl").takeIf { it.startsWith("https://") }?.let { url -> TextButton(onClick = { uri.openUri(url) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Źródło danych parkingu") } }
                Button(onClick = { if (onDepart()) {
                    val c = transfer.getJSONArray("vehicleEntrance")
                    uri.openUri("https://www.google.com/maps/dir/?api=1&travelmode=driving&dir_action=navigate&destination=" + URLEncoder.encode("${c.getDouble(1)},${c.getDouble(0)}", "UTF-8"))
                } }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Jedź do parkingu") }
                Text("Google Maps może wybrać inną drogę samochodową.")
                OutlinedButton(onClick = { confirm = true }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Kontynuuj od parkingu") }
            }
        }
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("Skąd zaczynasz dalszą drogę?") }, text = { Text("Punkt wyjścia z parkingu może być orientacyjny. Potwierdź go albo użyj aktualnej lokalizacji.") }, confirmButton = { TextButton(onClick = {
        state.selected?.let { a -> val c = a.getJSONObject("transfer").getJSONArray("mobilityExit"); val p = a.getJSONObject("parking")
            onContinue(ChosenLocation(a.getString("id") + "-exit", "Przy parkingu: ${p.optString("name")}", Point(c.getDouble(0), c.getDouble(1)), "place", "approximate", "OpenStreetMap"))
        }; confirm = false
    }) { Text("Potwierdzam start przy parkingu") } }, dismissButton = { TextButton(onClick = { state.carMode = false; state.completeTransfer(); onChange(); onLocate(); confirm = false }) { Text("Użyj mojej lokalizacji") } })
}
