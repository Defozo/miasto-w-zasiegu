package pl.przejscie.phone

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.util.Locale
import java.util.UUID
import java.text.Normalizer
import kotlin.math.round

data class Favorite(val id: String, val label: String, val point: ChosenLocation, val createdAt: String, val updatedAt: String)

object FavoriteRules {
    const val LIMIT = 30
    fun label(value: String) = Normalizer.normalize(value, Normalizer.Form.NFC).trim().replace(Regex("\\s+"), " ")
    fun validLabel(value: String) = label(value).length in 1..80 && value.none { it.code < 32 || it.code == 127 }
    fun same(a: Favorite, name: String, point: ChosenLocation) =
        label(a.label).lowercase(Locale.ROOT) == label(name).lowercase(Locale.ROOT) &&
            round(a.point.point.lon * 1e6) == round(point.point.lon * 1e6) && round(a.point.point.lat * 1e6) == round(point.point.lat * 1e6)
    fun add(current: List<Favorite>, item: Favorite): List<Favorite> {
        require(validLabel(item.label)) { "Nadaj nazwę od 1 do 80 znaków bez znaków sterujących." }
        if (current.any { same(it, item.label, item.point) }) return current
        require(current.size < LIMIT) { "Możesz zapisać do 30 miejsc. Usuń niepotrzebny wpis." }
        return current + item.copy(label = label(item.label))
    }
}

internal fun ChosenLocation.favoriteJson() = JSONObject().put("id", id).put("label", label)
    .put("coordinates", JSONArray(listOf(point.lon, point.lat))).put("kind", kind).put("precision", precision)
    .apply {
        if (source.isNotBlank()) put("sourceLabel", source)
        if (sourceUrl.isNotBlank()) put("sourceUrl", sourceUrl)
        if (coordinateKind.isNotBlank()) put("coordinateKind", coordinateKind)
    }

internal fun favoriteFromJson(j: JSONObject): Favorite {
    val p = j.getJSONObject("point"); val c = p.getJSONArray("coordinates")
    val point = Point(c.getDouble(0), c.getDouble(1))
    require(point.lon.isFinite() && point.lat.isFinite() && point.lon in -180.0..180.0 && point.lat in -90.0..90.0)
    return Favorite(j.getString("id"), j.getString("label"), ChosenLocation(p.getString("id"), p.getString("label"), point,
        p.getString("kind"), p.getString("precision"), p.optString("sourceLabel"), p.optString("sourceUrl"), p.optString("coordinateKind")),
        j.optString("createdAt"), j.optString("updatedAt"))
}

/** Guest locations stay on this device. Account data are never written into this store. */
class FavoriteStore(context: Context) {
    private val prefs = context.getSharedPreferences("guest-favorites", Context.MODE_PRIVATE)
    fun list(): List<Favorite> = runCatching {
        val a = JSONArray(prefs.getString("items", "[]"))
        (0 until a.length()).mapNotNull { runCatching { favoriteFromJson(a.getJSONObject(it)) }.getOrNull() }.take(FavoriteRules.LIMIT)
    }.getOrDefault(emptyList())
    private fun write(values: List<Favorite>) {
        val a = JSONArray(values.map { JSONObject().put("id", it.id).put("label", it.label).put("point", it.point.favoriteJson())
            .put("createdAt", it.createdAt).put("updatedAt", it.updatedAt) })
        prefs.edit().putString("items", a.toString()).apply()
    }
    fun add(label: String, point: ChosenLocation) {
        val now = Instant.now().toString()
        write(FavoriteRules.add(list(), Favorite(UUID.randomUUID().toString(), label, point, now, now)))
    }
    fun remove(id: String) { write(list().filterNot { it.id == id }) }
}
