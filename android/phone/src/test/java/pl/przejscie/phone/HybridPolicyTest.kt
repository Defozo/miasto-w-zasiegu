package pl.przejscie.phone

import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test

class HybridPolicyTest {
    private val policy = HybridPolicy("https://miastowzasiegu.pl")
    @Test fun originChecksSchemeHostAndPort() {
        assertTrue(policy.owns("https://miastowzasiegu.pl:443/app"))
        listOf("http://miastowzasiegu.pl", "https://miastowzasiegu.pl:444", "https://miastowzasiegu.pl.evil.test", "https://miastowzasiegu.pl@evil.test", "https://user@miastowzasiegu.pl").forEach { assertFalse(it, policy.owns(it)) }
    }
    @Test fun onlyBundledDocumentsCanNavigateInside() {
        assertTrue(policy.page("https://miastowzasiegu.pl/app?konto=1"))
        assertFalse(policy.page("https://miastowzasiegu.pl/api/auth/me"))
        assertFalse(policy.page("https://miastowzasiegu.pl/uploads/evil.html"))
        assertFalse(policy.page("https://evil.test/app"))
    }
    @Test fun localAssetsDoNotReplaceApiOrTraverseDirectories() {
        assertEquals("index.html", policy.asset("https://miastowzasiegu.pl/app"))
        assertEquals("assets/app.js", policy.asset("https://miastowzasiegu.pl/assets/app.js"))
        listOf("/api/route", "/assets/../private", "/assets/%2e%2e/private", "/assets/a%5cb", "/uploads/file").forEach { assertNull(policy.asset("https://miastowzasiegu.pl$it")) }
    }
    @Test fun cleartextIsLimitedToDevelopmentLoopback() {
        HybridPolicy("http://127.0.0.1:3082")
        assertThrows(IllegalArgumentException::class.java) { HybridPolicy("http://example.com") }
        assertThrows(IllegalArgumentException::class.java) { HybridPolicy("https://example.com/path") }
    }
    @Test fun arbitraryAndroidIntentsAndScriptUrlsStayBlocked() {
        assertTrue(policy.external("geo:50.0,19.9"))
        assertFalse(policy.external("intent://settings#Intent;end"))
        assertFalse(policy.external("javascript:alert(1)"))
        assertFalse(policy.external("file:///private"))
    }
    @Test fun delayedCheckoutCanOnlyOpenTheExistingStripeHosts() {
        assertTrue(policy.systemCheckout("https://checkout.stripe.com/c/pay/example"))
        assertTrue(policy.systemCheckout("https://billing.stripe.com/p/session/example"))
        listOf("http://checkout.stripe.com", "https://checkout.stripe.com.evil.test", "https://user@billing.stripe.com", "https://checkout.stripe.com:8443", "https://example.com").forEach { assertFalse(policy.systemCheckout(it)) }
    }
    private fun payload() = JSONObject("""{"route":{"geometry":{"coordinates":[[19.9,50.0],[19.91,50.01]]},"steps":[{"instruction":"Idź prosto","distanceM":100,"wayPoints":[0,1]}],"distanceM":100,"durationS":120},"profile":{"mobility":"walking","widthCm":"","maxIncline":"6","maxKerbCm":"2","avoidUnpaved":false}}""")
    @Test fun routeKeepsGeometryAndExplicitNeeds() {
        val (route, needs) = validateHybridRoute(payload())
        assertEquals(2, route.geometry.size); assertEquals("walking", needs.mobility); assertEquals("", needs.width)
    }
    @Test fun badStepCannotReachGpsService() {
        val body = payload(); body.getJSONObject("route").getJSONArray("steps").getJSONObject(0).getJSONArray("wayPoints").put(1, 100)
        assertThrows(IllegalArgumentException::class.java) { validateHybridRoute(body) }
    }
    @Test fun badCoordinatesAndNeedsCannotReachGpsService() {
        val body = payload(); body.getJSONObject("route").getJSONObject("geometry").getJSONArray("coordinates").getJSONArray(0).put(1, 1000)
        assertThrows(IllegalArgumentException::class.java) { validateHybridRoute(body) }
        val other = payload(); other.getJSONObject("profile").put("maxIncline", "-1")
        assertThrows(IllegalArgumentException::class.java) { validateHybridRoute(other) }
    }
}
