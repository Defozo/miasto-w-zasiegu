package pl.przejscie.phone

import java.util.UUID

data class ChosenLocation(val id: String, val label: String, val point: Point, val kind: String, val precision: String, val source: String,
    val sourceUrl: String = "", val coordinateKind: String = "", val disambiguationHint: String = "")
data class LocationEntry(val key: String = UUID.randomUUID().toString(), val text: String = "", val chosen: ChosenLocation? = null) {
    val confirmed get() = chosen != null && text == chosen.label
    fun edit(value: String) = copy(text = value, chosen = null)
    fun choose(value: ChosenLocation) = copy(text = value.label, chosen = value)
}
fun canPlan(start: LocationEntry, end: LocationEntry, stops: List<LocationEntry>) =
    start.confirmed && end.confirmed && stops.size <= 5 && stops.all { it.confirmed }
