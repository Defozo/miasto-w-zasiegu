package pl.przejscie.phone

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.*
import org.json.JSONObject
import pl.przejscie.shared.GuidanceFrame
import pl.przejscie.shared.publishGuidance
import java.util.UUID

class GuidanceService : Service(), LocationListener {
    private var route: Route? = null
    private var step = 0
    private var session = ""
    private var lastLocation: Location? = null
    private var trip: TripAccumulator? = null
    private var tripProfile = JSONObject()
    private var finishRequested = false
    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() { update(); handler.postDelayed(this, 5_000) }
    }
    private val manager get() = getSystemService(LocationManager::class.java)
    override fun onBind(intent: Intent?) = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == "STOP") { finishRequested = true; GuidanceSpeech.end(session); stopSelf(); return START_NOT_STICKY }
        if (intent?.action in GuidanceSpeech.commands) {
            if (route == null || session.isBlank()) stopSelf()
            else GuidanceSpeech.command(intent!!.action!!, intent.getStringExtra("speechSession"))
            return START_NOT_STICKY
        }
        if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) { stopSelf(); return START_NOT_STICKY }
        val saved = getSharedPreferences("route", MODE_PRIVATE).getString("json", null)
        route = runCatching { Api.parseRoute(JSONObject(saved ?: "")) }.getOrNull()
        if (route == null) { stopSelf(); return START_NOT_STICKY }
        session = UUID.randomUUID().toString(); step = 0; lastLocation = null
        NavigationPosition.update(null)
        trip = TripAccumulator(SystemClock.elapsedRealtime())
        tripProfile = runCatching { JSONObject(getSharedPreferences("route", MODE_PRIVATE).getString("profile", "{}") ?: "{}") }.getOrDefault(JSONObject())
        finishRequested = false
        getSharedPreferences("route", MODE_PRIVATE).edit().putBoolean("finishRequested", false).apply()
        getSystemService(NotificationManager::class.java).createNotificationChannel(NotificationChannel("guidance", "Prowadzenie z GPS", NotificationManager.IMPORTANCE_LOW))
        startForeground(1, notification("Oczekiwanie na aktualną lokalizację"))
        val screenReader = getSystemService(android.view.accessibility.AccessibilityManager::class.java).isTouchExplorationEnabled
        GuidanceSpeech.begin(this, session, intent?.getBooleanExtra("voiceEnabled", false) == true && !screenReader)
        try {
            listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { manager.isProviderEnabled(it) }.forEach {
                // A fresh stationary fix still matters. A distance filter would
                // otherwise make a person waiting at a crossing look disconnected.
                manager.requestLocationUpdates(it, 2_000L, 0f, this, Looper.getMainLooper())
            }
        } catch (_: SecurityException) { stopSelf() }
        handler.removeCallbacks(ticker); handler.post(ticker)
        return START_NOT_STICKY
    }
    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, GuidanceService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        val mute = PendingIntent.getService(this, 2, Intent(this, GuidanceService::class.java).setAction(GuidanceSpeech.MUTE)
            .putExtra("speechSession", session), PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        return Notification.Builder(this, "guidance").setSmallIcon(android.R.drawable.ic_dialog_map)
            .setContentTitle("Miasto w zasięgu · prowadzenie GPS").setContentText(text).setContentIntent(open).setOngoing(true)
            .addAction(Notification.Action.Builder(null, "Wycisz głos", mute).build())
            .addAction(Notification.Action.Builder(null, "Zakończ", stop).build()).build()
    }
    override fun onLocationChanged(location: Location) {
        lastLocation = location
        NavigationPosition.update(NavigationFix(Point(location.longitude, location.latitude),
            if (location.hasAccuracy()) location.accuracy else Float.POSITIVE_INFINITY, location.elapsedRealtimeNanos / 1_000_000))
        @Suppress("DEPRECATION")
        val mock = if (Build.VERSION.SDK_INT >= 31) location.isMock else location.isFromMockProvider
        trip?.add(Point(location.longitude, location.latitude), location.elapsedRealtimeNanos / 1_000_000,
            if (location.hasAccuracy()) location.accuracy else Float.POSITIVE_INFINITY, mock)
        update()
    }
    private fun update() {
        val r = route ?: return
        val now = System.currentTimeMillis()
        val loc = lastLocation
        val age = loc?.let { (SystemClock.elapsedRealtimeNanos() - it.elapsedRealtimeNanos) / 1_000_000 } ?: Long.MAX_VALUE
        val progress = loc?.let { RouteProgress.calculate(r.geometry, r.steps, Point(it.longitude, it.latitude), step) }
        val note = when {
            loc == null || age > 20_000 -> "Brak świeżego GPS. Sprawdź pozycję na telefonie."
            !loc.hasAccuracy() || loc.accuracy > 30 -> "GPS jest niedokładny. Zatrzymaj się i sprawdź pozycję."
            progress == null || progress.distanceFromRouteM > 40 -> "Poza trasą. Zaplanuj nową trasę na telefonie."
            else -> "Prowadzenie próbne. Obserwuj otoczenie; brak automatycznego przeliczania."
        }
        val good = loc != null && age <= 20_000 && loc.hasAccuracy() && loc.accuracy <= 30 && progress != null && progress.distanceFromRouteM <= 40
        if (good) step = progress!!.step
        val arrived = good && RouteProgress.distance(Point(loc!!.longitude, loc.latitude), r.geometry.last()) < 10 && step >= r.steps.lastIndex - 1
        // ORS step distance is the length AFTER its instruction. Guidance announces the
        // next instruction, with the remaining distance on the current segment.
        val nextStep = (step + 1).coerceAtMost(r.steps.lastIndex)
        val instruction = when { arrived -> "Cel w pobliżu"; good -> r.steps[nextStep].instruction; else -> "Sprawdź pozycję" }
        val frame = GuidanceFrame(session, instruction, if (good) progress!!.remainingM.toInt() else 0, nextStep + 1, r.steps.size, now,
            if (good) "live" else "paused", if (arrived) "GPS wskazuje okolice celu. Potwierdź właściwe wejście." else note)
        publishGuidance(this, frame)
        GuidanceSpeech.update(if (good) SpeechCue(session, nextStep + 1, instruction, progress!!.remainingM.toInt(),
            loc!!.elapsedRealtimeNanos / 1_000_000, arrived) else null)
        getSystemService(NotificationManager::class.java).notify(1, notification(instruction))
    }
    override fun onDestroy() {
        NavigationPosition.update(null)
        GuidanceSpeech.end(session)
        handler.removeCallbacks(ticker); manager.removeUpdates(this)
        if (finishRequested || getSharedPreferences("route", MODE_PRIVATE).getBoolean("finishRequested", false)) {
            trip?.let { measured ->
                val emulator = Build.FINGERPRINT.contains("generic", true) || Build.MODEL.contains("sdk", true) || Build.MODEL.contains("emulator", true) || Build.HARDWARE in listOf("ranchu", "goldfish")
                val candidate = JSONObject().put("session", session).put("distanceM", measured.distanceM)
                    .put("durationS", measured.durationS(SystemClock.elapsedRealtime())).put("eligible", measured.eligible(emulator))
                    .put("profile", tripProfile).put("simulated", emulator || measured.simulated)
                route?.let { candidate.put("routeId", JSONObject(it.raw).optString("routeId")) }
                getSharedPreferences("trip", MODE_PRIVATE).edit().putString("pending", candidate.toString()).apply()
            }
        }
        publishGuidance(this, GuidanceFrame(session = session, sentAt = System.currentTimeMillis(), note = "Prowadzenie zakończone"))
        super.onDestroy()
    }
}
