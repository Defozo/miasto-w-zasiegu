package pl.przejscie.phone

import java.net.URI
import org.json.JSONObject

/** All privileged messages are limited to a bundled main document on this origin. */
internal class HybridPolicy(endpoint: String) {
    val origin: String
    init {
        val uri = URI(endpoint)
        require(uri.scheme == "https" || (uri.scheme == "http" && uri.host in setOf("127.0.0.1", "localhost", "10.0.2.2")))
        require(uri.host != null && uri.userInfo == null && uri.query == null && uri.fragment == null && uri.path in listOf("", "/"))
        origin = endpoint.trimEnd('/')
    }
    fun owns(url: String): Boolean = runCatching {
        val a = URI(origin); val b = URI(url)
        fun port(u: URI) = if (u.port == -1) { if (u.scheme == "https") 443 else 80 } else u.port
        a.scheme == b.scheme && a.host == b.host && port(a) == port(b) && b.userInfo == null
    }.getOrDefault(false)
    fun page(url: String): Boolean = owns(url) && runCatching {
        URI(url).path in setOf("/", "/app", "/app/", "/gra", "/gra/", "/sign-in", "/sign-up", "/cennik", "/pricing")
    }.getOrDefault(false)
    fun asset(url: String): String? {
        if (!owns(url)) return null
        if (page(url)) return "index.html"
        val path = runCatching { URI(url).path.removePrefix("/") }.getOrNull() ?: return null
        if (path.split('/').any { it == ".." || it == "." } || path.contains('\\') || path.contains('\u0000')) return null
        return path.takeIf { it.startsWith("assets/") || it.startsWith("brand/") || it in setOf("manifest.webmanifest", "iskry.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "iskry-icon.svg", "iskry-icon-192.png", "iskry-icon-512.png") }
    }
    fun external(url: String): Boolean = runCatching { URI(url).scheme in setOf("https", "http", "tel", "mailto", "geo") }.getOrDefault(false)
    // Checkout returns asynchronously from our API, after the original tap.
    fun systemCheckout(url: String): Boolean = runCatching {
        val target = URI(url)
        target.scheme == "https" && target.host in setOf("checkout.stripe.com", "billing.stripe.com") && target.userInfo == null && target.port in setOf(-1, 443)
    }.getOrDefault(false)
}

internal fun validateHybridRoute(payload: JSONObject): Pair<Route, Needs> {
    val route = Api.parseRoute(payload.getJSONObject("route"))
    require(route.geometry.size <= 50_000 && route.steps.size <= 2_000) { "Trasa jest zbyt duża. Zaplanuj krótszy odcinek." }
    require(route.distanceM.isFinite() && route.distanceM > 0 && route.durationS.isFinite() && route.durationS >= 0) { "Trasa ma nieprawidłowy dystans lub czas." }
    require(route.geometry.all { it.lon.isFinite() && it.lat.isFinite() && it.lon in -180.0..180.0 && it.lat in -90.0..90.0 }) { "Trasa ma nieprawidłowe współrzędne." }
    require(route.steps.all { it.start >= 0 && it.end >= it.start && it.end < route.geometry.size && it.distanceM.isFinite() && it.distanceM >= 0 && it.instruction.length <= 2_000 }) { "Trasa ma nieprawidłowe instrukcje." }
    val needs = Needs.fromProfile(payload.getJSONObject("profile"))
    require(needs.mobility in setOf("manual", "power", "stroller", "walking")) { "Sprawdź wybrany sposób poruszania się." }
    require(needs.error() == null) { needs.error() ?: "Sprawdź potrzeby." }
    return route to needs
}
