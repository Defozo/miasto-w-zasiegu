package pl.przejscie.phone

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

data class Point(val lon: Double, val lat: Double)
data class Place(val id: String, val name: String, val category: String, val address: String, val point: Point, val raw: JSONObject)
data class Step(val instruction: String, val distanceM: Double, val start: Int, val end: Int)
data class Route(val geometry: List<Point>, val steps: List<Step>, val distanceM: Double, val durationS: Double, val warnings: List<String>, val raw: String)
data class Needs(val width: String = "", val incline: String = "6", val kerb: String = "2", val unpaved: Boolean = false, val mobility: String = "manual") {
    private fun number(s: String) = s.replace(',', '.').toDoubleOrNull()
    fun error(): String? = when {
        width.isNotBlank() && (number(width) == null || number(width)!! !in 30.0..200.0) -> "Podaj zmierzoną szerokość od 30 do 200 cm albo pozostaw puste pole."
        number(incline) == null || number(incline)!! !in 0.0..15.0 -> "Podaj nachylenie od 0 do 15 procent."
        number(incline)!! % 1.0 != 0.0 -> "Nachylenie podaj w całych procentach."
        number(kerb) == null || number(kerb)!! !in 0.0..20.0 -> "Podaj wysokość krawężnika od 0 do 20 cm."
        else -> null
    }
    fun json() = JSONObject().apply {
        if (width.isNotBlank()) put("widthCm", number(width))
        put("maxIncline", number(incline)); put("maxKerbCm", number(kerb)); put("avoidUnpaved", unpaved); put("mobility", mobility)
    }
    fun profileJson() = JSONObject().put("mobility", mobility).put("widthCm", width.replace(',', '.'))
        .put("maxIncline", incline.replace(',', '.')).put("maxKerbCm", kerb.replace(',', '.')).put("avoidUnpaved", unpaved)
    companion object {
        fun fromProfile(p: JSONObject) = Needs(p.optString("widthCm", ""), p.optString("maxIncline", "6"),
            p.optString("maxKerbCm", "2"), p.optBoolean("avoidUnpaved", false), p.optString("mobility", "manual"))
    }
}

class ApiException(val code: String, override val message: String, val details: JSONObject? = null) : Exception(message)

object Api {
    suspend fun request(path: String, body: JSONObject? = null, method: String = if (body == null) "GET" else "POST", token: String? = null): JSONObject = withContext(Dispatchers.IO) {
        val c = URI(BuildConfig.BACKEND_URL + path).toURL().openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 12_000; c.readTimeout = 45_000
            c.setRequestProperty("Accept", "application/json")
            c.requestMethod = method
            if (!token.isNullOrBlank()) c.setRequestProperty("Authorization", "Bearer ${ClerkAccounts.accessToken(token)}")
            if (body != null) {
                c.doOutput = true; c.setRequestProperty("Content-Type", "application/json")
                c.outputStream.bufferedWriter().use { it.write(body.toString()) }
            }
            val status = c.responseCode
            val value = (if (status in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: "{}"
            val json = JSONObject(value)
            if (status !in 200..299) {
                val e = json.optJSONObject("error")
                throw ApiException(e?.optString("code") ?: "HTTP_$status", e?.optString("message") ?: "Nie udało się wykonać operacji.", e?.optJSONObject("details"))
            }
            json
        } finally { c.disconnect() }
    }
    suspend fun places(q: String): Pair<List<Place>, String> {
        val json = request("/api/places?limit=30&q=" + URLEncoder.encode(q, "UTF-8"))
        val a = json.optJSONArray("places") ?: JSONArray()
        val places = (0 until a.length()).mapNotNull { i ->
            val p = a.getJSONObject(i)
            val coords = p.optJSONArray("coordinates") ?: p.optJSONObject("geometry")?.optJSONArray("coordinates")
            if (coords == null || coords.length() < 2) null else Place(
                p.optString("id"), p.optString("name", "Bez nazwy"), p.optString("category"), p.optString("address"),
                Point(coords.getDouble(0), coords.getDouble(1)), p)
        }
        val source = json.optJSONObject("source")
        return places to listOfNotNull(source?.optString("label"), source?.optString("snapshotDate"), source?.optString("attribution")).filter { it.isNotBlank() }.joinToString(" · ")
    }
    fun parseRoute(json: JSONObject): Route {
        val points = json.getJSONObject("geometry").getJSONArray("coordinates")
        val geometry = (0 until points.length()).map { Point(points.getJSONArray(it).getDouble(0), points.getJSONArray(it).getDouble(1)) }
        val a = json.optJSONArray("steps") ?: JSONArray()
        val steps = (0 until a.length()).map {
            val s = a.getJSONObject(it); val w = s.optJSONArray("wayPoints")
            Step(s.optString("instruction", "Kontynuuj trasę"), s.optDouble("distanceM", 0.0), w?.optInt(0) ?: 0, w?.optInt(1) ?: 0)
        }
        require(geometry.size >= 2 && steps.isNotEmpty()) { "Serwer nie zwrócił pełnej geometrii i instrukcji trasy." }
        val warnings = json.optJSONArray("warnings") ?: JSONArray()
        return Route(geometry, steps, json.optDouble("distanceM"), json.optDouble("durationS"), (0 until warnings.length()).map { warnings.getString(it) }, json.toString())
    }
    suspend fun locations(query: String): List<ChosenLocation> {
        val a = request("/api/locations?limit=8&q=" + URLEncoder.encode(query, "UTF-8")).optJSONArray("locations") ?: JSONArray()
        return (0 until a.length()).mapNotNull { i ->
            val p = a.getJSONObject(i); val c = p.optJSONArray("coordinates")
            if (c == null || c.length() < 2) null else ChosenLocation(p.optString("id"), p.optString("label"),
                Point(c.getDouble(0), c.getDouble(1)), p.optString("kind"), p.optString("precision"), p.optString("sourceLabel"), p.optString("sourceUrl"), p.optString("coordinateKind"), p.optString("disambiguationHint"))
        }
    }
    suspend fun route(start: Point, end: Point, needs: Needs, avoidReports: Boolean, waypoints: List<Point> = emptyList(), token: String? = null): Route = parseRoute(request("/api/route", JSONObject()
        .put("start", JSONArray(listOf(start.lon, start.lat))).put("end", JSONArray(listOf(end.lon, end.lat)))
        .put("waypoints", JSONArray(waypoints.map { listOf(it.lon, it.lat) }))
        .put("profile", needs.json()).put("avoidReports", avoidReports), token = token))
}
