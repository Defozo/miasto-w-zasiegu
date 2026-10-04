package pl.przejscie.phone

import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.listSaver

// Only the small input draft enters Android's saved instance state. Route geometry,
// credentials and location history are deliberately excluded from this Bundle.
internal fun LocationEntry.savedFields(): List<String> = listOf(key, text) + (chosen?.let {
    listOf(it.id, it.label, it.point.lon.toString(), it.point.lat.toString(), it.kind, it.precision,
        it.source, it.sourceUrl, it.coordinateKind, it.disambiguationHint)
} ?: emptyList())

internal fun restoreLocation(fields: List<String>): LocationEntry? {
    if (fields.size != 2 && fields.size != 12) return null
    if (fields.size == 2) return LocationEntry(fields[0], fields[1])
    val lon = fields[4].toDoubleOrNull()?.takeIf { it.isFinite() && it in -180.0..180.0 } ?: return null
    val lat = fields[5].toDoubleOrNull()?.takeIf { it.isFinite() && it in -90.0..90.0 } ?: return null
    val location = ChosenLocation(fields[2], fields[3], Point(lon, lat), fields[6], fields[7], fields[8], fields[9], fields[10], fields[11])
    return LocationEntry(fields[0], fields[1], location.takeIf { fields[1] == it.label })
}

internal fun restoreOwnedLocation(owner: String?, fields: List<String>): LocationEntry? =
    if (fields.firstOrNull() == owner.orEmpty()) restoreLocation(fields.drop(1)) else null

internal fun locationEntrySaver(owner: String?) = listSaver<LocationEntry, String>(
    save = { listOf(owner.orEmpty()) + it.savedFields() }, restore = { restoreOwnedLocation(owner, it) })

internal fun restoreOwnedStops(owner: String?, rows: List<List<String>>): List<LocationEntry>? {
    if (rows.isEmpty() || rows.size > 6 || rows.first() != listOf(owner.orEmpty())) return null
    return rows.drop(1).map { restoreLocation(it) }.let { entries ->
        if (entries.any { it == null }) null else entries.filterNotNull()
    }
}

internal fun stopsSaver(owner: String?) = Saver<List<LocationEntry>, ArrayList<ArrayList<String>>>(
    save = { ArrayList(listOf(arrayListOf(owner.orEmpty())) + it.map { entry -> ArrayList(entry.savedFields()) }) },
    restore = { restoreOwnedStops(owner, it) })

internal val NeedsSaver = listSaver<Needs, String>(
    save = { listOf(it.width, it.incline, it.kerb, it.unpaved.toString(), it.mobility) },
    restore = { if (it.size == 5) Needs(it[0], it[1], it[2], it[3].toBoolean(), it[4]) else null })
