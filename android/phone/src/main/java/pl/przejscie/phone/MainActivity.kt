package pl.przejscie.phone

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.location.LocationListener
import android.location.LocationManager
import android.os.Bundle
import android.os.Looper
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.*
import org.json.JSONObject
import org.json.JSONArray
import pl.przejscie.shared.GuidanceFrame
import pl.przejscie.shared.publishGuidance
import java.util.UUID
import kotlin.coroutines.resume

internal val Ink = Color(0xff173c32)
internal val Cream = Color(0xfff5f4ed)
internal val Lime = Color(0xffd7f36b)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = Ink, onPrimary = Cream, background = Cream, surface = Cream, secondaryContainer = Lime, onSecondaryContainer = Ink)) { if (BuildConfig.HYBRID_UI) HybridApp() else App() } }
        window.decorView.post { if (android.os.Build.VERSION.SDK_INT >= 30) window.insetsController?.setSystemBarsAppearance(android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS, android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS) }
    }
}

@Composable private fun App() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs = remember { context.getSharedPreferences("needs", 0) }
    val accountStore = remember { AccountStore(context).also { it.clear() } }
    var needs by rememberSaveable(stateSaver = NeedsSaver) { mutableStateOf(Needs(prefs.getString("width", "") ?: "", prefs.getString("incline", "6") ?: "6", prefs.getString("kerb", "2") ?: "2", prefs.getBoolean("unpaved", false), prefs.getString("mobility", "walking") ?: "walking")) }
    var account by remember { mutableStateOf<Account?>(null) }
    val clerkConnection by ClerkAccounts.connection.collectAsState()
    var authRetry by remember { mutableIntStateOf(0) }
    var profileVersion by remember { mutableIntStateOf(prefs.getInt("profileVersion", 0)) }
    var status by remember { mutableStateOf<String?>(null) }
    var tab by rememberSaveable { mutableIntStateOf(0) }
    var start by rememberSaveable(account?.id, stateSaver = locationEntrySaver(account?.id)) { mutableStateOf(LocationEntry(key = "start")) }
    var end by rememberSaveable(account?.id, stateSaver = locationEntrySaver(account?.id)) { mutableStateOf(LocationEntry(key = "end")) }
    var stops by rememberSaveable(account?.id, stateSaver = stopsSaver(account?.id)) { mutableStateOf(emptyList<LocationEntry>()) }
    var route by remember { mutableStateOf<Route?>(null) }
    var busy by remember { mutableStateOf(false) }
    var planning by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var avoidReports by rememberSaveable { mutableStateOf(true) }
    var frame by remember { mutableStateOf(GuidanceFrame.load(context)) }
    var preview by remember { mutableStateOf(false) }
    var previewStep by remember { mutableIntStateOf(0) }
    var previewSession by remember { mutableStateOf("") }
    val browse = remember { BrowseState() }
    var mapLocation by remember { mutableStateOf<Point?>(null) }
    val mobility = remember(account?.id) { MobilityState(context, account) }
    val journey = remember(account?.id) { JourneyState(context, account?.id) }
    val research = remember(account?.id) { EquipmentResearch(context, account, scope) }
    var editing by remember(account?.id) { mutableStateOf<Pair<MobilityPreset, Boolean>?>(null) }
    var restoredJourney by remember(account?.id) { mutableStateOf(false) }
    var onboard by remember { mutableStateOf(!prefs.getBoolean("onboardingDone", false)) }
    var reloadConfirm by remember { mutableStateOf(false) }
    var pendingTrip by remember { mutableStateOf<JSONObject?>(null) }
    val scroll = rememberSaveable(tab, saver = ScrollState.Saver) { ScrollState(0) }
    val snackbars = remember { SnackbarHostState() }
    val planFocus = remember { FocusRequester() }
    BackHandler(enabled = tab != 0 && !onboard) { tab = 0 }
    fun saveLocal(value: Needs) {
        prefs.edit().putString("width", value.width).putString("incline", value.incline).putString("kerb", value.kerb)
            .putBoolean("unpaved", value.unpaved).putString("mobility", value.mobility).putInt("profileVersion", profileVersion).apply()
    }
    fun invalidateRoute() {
        GuidanceSpeech.end()
        route = null; preview = false; journey.invalidate()
        context.getSharedPreferences("route", 0).edit().putBoolean("finishRequested", false).apply()
        context.stopService(Intent(context, GuidanceService::class.java))
        publishGuidance(context, GuidanceFrame(sentAt = System.currentTimeMillis(), note = "Trasa została zmieniona. Zaplanuj ją ponownie."))
    }
    fun run(block: suspend () -> Unit) { scope.launch {
        busy = true; error = null; status = null
        try { block() } catch (e: Exception) {
            if (e is CancellationException) throw e
            error = when ((e as? ApiException)?.code) {
                "AUTH_REQUIRED" -> {
                    invalidateRoute(); accountStore.clear(); account = null; profileVersion = 0
                    prefs.edit().putInt("profileVersion", 0).apply()
                    "Sesja wygasła. Zaloguj się ponownie."
                }
                "PROFILE_CONFLICT" -> "Profil zmienił się na innym urządzeniu. Twoje zmiany pozostały tutaj. Możesz pobrać nowszą wersję profilu z konta."
                "NO_ROUTE" -> "Nie znaleziono przejazdu dla tych punktów i potrzeb. Sprawdź adresy lub zmień ustawienia świadomie."
                null -> "Nie udało się połączyć. Sprawdź połączenie i spróbuj ponownie."
                else -> e.message
            }
        } finally { busy = false }
    } }
    fun acceptProfile(response: JSONObject) {
        if (response.isNull("user")) {
            invalidateRoute()
            accountStore.clear(); account = null; profileVersion = 0
            throw ApiException("AUTH_REQUIRED", "Sesja wygasła. Zaloguj się ponownie.")
        }
        profileVersion = response.optInt("profileVersion", 0)
        response.optJSONObject("profile")?.let { needs = Needs.fromProfile(it); saveLocal(needs); invalidateRoute() }
        prefs.edit().putInt("profileVersion", profileVersion).apply()
    }
    fun applyClerkAccount(response: JSONObject?) {
        val user = response?.optJSONObject("user")
        val previousId = account?.id ?: prefs.getString("profileOwnerId", null)
        if (previousId != user?.optString("id")) {
            invalidateRoute()
            context.getSharedPreferences("trip", 0).edit().remove("pending").apply(); pendingTrip = null
            if (previousId != null) {
                needs = Needs(mobility = "walking"); profileVersion = 0; saveLocal(needs)
                start = LocationEntry(key = "start"); end = LocationEntry(key = "end"); stops = emptyList()
            }
        }
        accountStore.clear()
        if (user == null) {
            account = null; profileVersion = 0
            prefs.edit().remove("profileOwnerId").putInt("profileVersion", 0).apply()
            return
        }
        // A marker binds each request to this user. The SDK obtains a fresh JWT.
        val id = user.getString("id")
        prefs.edit().putString("profileOwnerId", id).apply()
        account = Account(id, id, user.optString("email"), user.optString("displayName"))
        acceptProfile(response)
    }
    ObserveClerkAccount(context, authRetry, onSession = { applyClerkAccount(it) }, onError = { error = it })
    fun currentLocation(mapOnly: Boolean = false) { run {
        val location = withTimeoutOrNull(20_000) { freshLocation(context.getSystemService(LocationManager::class.java)) }
        if (location == null) error = "Nie otrzymaliśmy aktualnej lokalizacji. Wybierz adres z podpowiedzi."
        else if (mapOnly) {
            mapLocation = Point(location.longitude, location.latitude)
            status = "Pokazano lokalizację z dokładnością około ${location.accuracy.toInt()} m."
        } else {
            start = start.choose(ChosenLocation("gps", "Moja lokalizacja", Point(location.longitude, location.latitude), "address", "approximate", "Lokalizacja telefonu · dokładność około ${location.accuracy.toInt()} m"))
            invalidateRoute()
        }
    } }
    var pendingGuidance by remember { mutableStateOf(false) }
    var pendingMapLocation by remember { mutableStateOf(false) }
    fun launchGuidance() {
        val r = route ?: return
        preview = false
        context.getSharedPreferences("route", 0).edit().putString("json", r.raw).putString("profile", needs.profileJson().toString()).putBoolean("finishRequested", false).apply()
        context.startForegroundService(Intent(context, GuidanceService::class.java)); tab = 2
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        if (granted[Manifest.permission.ACCESS_FINE_LOCATION] == true || context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
            if (pendingGuidance) launchGuidance() else currentLocation(pendingMapLocation)
        } else error = "Nie udostępniono dokładnej lokalizacji. Nadal możesz wybrać adres początkowy."
        pendingGuidance = false
        pendingMapLocation = false
    }
    fun locationAction(guidance: Boolean, mapOnly: Boolean = false) {
        val missingNotification = guidance && android.os.Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED && !missingNotification) { if (guidance) launchGuidance() else currentLocation(mapOnly) }
        else {
            pendingGuidance = guidance
            pendingMapLocation = mapOnly
            val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
            if (missingNotification) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            permission.launch(permissions.toTypedArray())
        }
    }
    LaunchedEffect(Unit) { while (true) {
        frame = GuidanceFrame.load(context)
        if (pendingTrip == null) context.getSharedPreferences("trip", 0).getString("pending", null)?.let { pendingTrip = runCatching { JSONObject(it) }.getOrNull() }
        delay(1_000)
    } }
    LaunchedEffect(error) { error?.let { snackbars.showSnackbar(it, actionLabel = "OK", duration = SnackbarDuration.Long) } }
    LaunchedEffect(preview, previewStep) { if (preview) while (true) {
        route?.let { r -> val s = r.steps[previewStep]; publishGuidance(context, GuidanceFrame(previewSession, s.instruction, s.distanceM.toInt(), previewStep + 1, r.steps.size, System.currentTimeMillis(), "preview", "Podgląd ręczny, bez śledzenia pozycji")) }
        delay(5_000)
    } }
    DisposableEffect(Unit) { onDispose { if (preview) publishGuidance(context, GuidanceFrame(sentAt = System.currentTimeMillis(), note = "Podgląd zamknięty")) } }
    LaunchedEffect(account?.id) {
        mobility.load()
        if (mobility.error == null) {
            needs = mobility.active?.needs ?: Needs(mobility = "walking")
            profileVersion = mobility.version
            invalidateRoute()
        }
        research.resume()
    }
    DisposableEffect(research) { onDispose { research.stop() } }
    LaunchedEffect(onboard, mobility.loading) {
        if (onboard && !mobility.loading && mobility.error == null) {
            if (mobility.items.isEmpty()) editing = MobilityPreset() to true
            else { onboard = false; prefs.edit().putBoolean("onboardingDone", true).apply() }
        }
    }
    LaunchedEffect(mobility.loading, account?.id) {
        if (!mobility.loading && !restoredJourney && mobility.error == null) {
            restoredJourney = true
            journey.saved?.let { saved ->
                start = start.choose(savedPoint(saved.getJSONObject("start")))
                end = end.choose(savedPoint(saved.getJSONObject("end")))
                val via = saved.optJSONArray("via") ?: JSONArray()
                stops = (0 until via.length()).map { LocationEntry().choose(savedPoint(via.getJSONObject(it))) }
                journey.carMode = true; journey.departed = true
                if (Needs.fromProfile(saved.getJSONObject("profile")) == needs) {
                    journey.accept(saved.getJSONObject("result")); journey.selectedId = saved.optString("selection")
                    journey.selected?.let { route = Api.parseRoute(it.getJSONObject("onward")) }
                } else status = "Zapisana podróż używała innych potrzeb. Oblicz trasę ponownie."
            }
        }
    }
    editing?.let { (preset, first) -> key(account?.id, preset.id) {
        PresetSetup(preset, first, mobility, research, onSaved = {
            needs = mobility.active?.needs ?: Needs(mobility = "walking"); profileVersion = mobility.version
            invalidateRoute(); editing = null; onboard = false; prefs.edit().putBoolean("onboardingDone", true).apply()
            status = "Zapisano zestaw potrzeb."; tab = 0
        }, onClose = { editing = null; onboard = false; prefs.edit().putBoolean("onboardingDone", true).apply() })
    } }
    if (reloadConfirm) AlertDialog(onDismissRequest = { reloadConfirm = false }, title = { Text("Pobrać profil z konta?") },
        text = { Text("Ustawienia na tym telefonie zostaną zastąpione profilem zapisanym na koncie. Niezapisane zmiany zostaną utracone.") },
        confirmButton = { TextButton(onClick = { reloadConfirm = false; run { acceptProfile(Api.request("/api/auth/me", token = account?.token)); status = "Pobrano profil z konta." } }) { Text("Pobierz") } },
        dismissButton = { TextButton(onClick = { reloadConfirm = false }) { Text("Anuluj") } })
    pendingTrip?.let { candidate -> TripDialog(candidate, account != null, busy, error, onDismiss = {
        context.getSharedPreferences("trip", 0).edit().remove("pending").apply(); pendingTrip = null
    }, onSend = { completed, feedback -> run {
        val token = account?.token ?: throw IllegalStateException()
        check(candidate.optBoolean("eligible") && !candidate.optBoolean("simulated"))
        val summary = JSONObject().put("distanceM", candidate.getDouble("distanceM")).put("durationS", candidate.getLong("durationS"))
            .put("completed", completed).put("feedback", feedback).put("profile", candidate.getJSONObject("profile")).put("consent", true)
        candidate.optString("routeId").takeIf { it.isNotBlank() }?.let { summary.put("routeId", it) }
        Api.request("/api/trips", summary, token = token)
        context.getSharedPreferences("trip", 0).edit().remove("pending").apply(); pendingTrip = null; status = "Zapisano podsumowanie przejazdu."
    } }) }
    Scaffold(containerColor = Cream, snackbarHost = { SnackbarHost(snackbars) }, bottomBar = {
        NavigationBar(containerColor = Cream) { listOf(0 to "Mapa", 5 to "Zapisane", 1 to "Profil").forEach { (i, label) ->
            NavigationBarItem(selected = tab == i || (i == 0 && tab in listOf(2, 4)) || (i == 1 && tab == 3), onClick = { tab = i }, icon = { Text(if (i == 0) "◎" else if (i == 5) "☆" else "☷", fontSize = 22.sp, modifier = Modifier.clearAndSetSemantics { }) }, label = { Text(label) })
        } }
    }) { padding ->
        if (tab == 0) NativeMapScreen(browse, mobility, account, route, Modifier.padding(padding),
            current = mapLocation,
            onLocate = { locationAction(false, mapOnly = true) }, onProfile = { tab = 1 },
            onPreset = { id -> run { val currentMobility = mobility; currentMobility.select(id); if (account?.id == currentMobility.account?.id) { needs = currentMobility.active?.needs ?: Needs(mobility = "walking"); profileVersion = currentMobility.version; invalidateRoute() } } },
            onPlan = { place -> end = end.choose(place.chosen()); invalidateRoute(); tab = 4 },
            onResume = if (end.chosen != null) ({ tab = 4 }) else null,
            resumeLabel = if (journey.departed) "Kontynuuj od parkingu" else "Wróć do planu podróży",
            onResearch = if (research.result?.optString("status")?.let { it != "searching" } == true) ({
                val id = research.presetId
                val draft = context.getSharedPreferences("preset-drafts-${account?.id ?: "guest"}", 0).getString(id, null)
                val p = mobility.items.find { it.id == id } ?: runCatching { MobilityPreset.parse(JSONObject(draft!!)) }.getOrNull()
                if (p != null) editing = p to false
            }) else null)
        else Column(Modifier.fillMaxSize().padding(padding).verticalScroll(scroll).padding(22.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Column(Modifier.semantics(mergeDescendants = true) { heading() }) {
                    Text("miasto", color = Ink, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    Text("w zasięgu", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.SemiBold)
                }
                Text("KRAKÓW\nBEZ BARIER", color = Ink, fontSize = 11.sp, lineHeight = 14.sp)
            }
            if (busy) LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = "Trwa pobieranie danych" })
            if (tab != 0) error?.let { Notice(it, true) }
            status?.let { Notice(it) }
            when (tab) {
                4 -> {
                    Title("Zaplanuj podróż")
                    JourneyControls(journey, onChange = { invalidateRoute() }, onSelect = { route = it }, onDepart = {
                        try { journey.save(start.chosen!!, end.chosen!!, stops, needs); true } catch (e: Exception) { error = e.message; false }
                    }, onContinue = { point ->
                        start = start.choose(point); journey.carMode = false; journey.completeTransfer(); invalidateRoute()
                        status = "Potwierdzono początek. Wyznacz dalszą trasę."
                    }, onLocate = { locationAction(false) })
                    Text("Wybierz adres lub miejsce. Dodaj przystanki po drodze.")
                    LocationInput("Skąd", start, enabled = !busy, account = account, onChange = { start = it; invalidateRoute() })
                    OutlinedButton(onClick = { locationAction(false) }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Użyj mojej lokalizacji") }
                    stops.forEachIndexed { index, entry -> key(entry.key) {
                        LocationInput("Przystanek ${index + 1}", entry, enabled = !busy, account = account, onChange = { value -> stops = stops.map { if (it.key == entry.key) value else it }; invalidateRoute() })
                        TextButton(onClick = { stops = stops.filterNot { it.key == entry.key }; invalidateRoute() }, enabled = !busy, modifier = Modifier.heightIn(min = 48.dp)) { Text("Usuń przystanek ${index + 1}") }
                    } }
                    LocationInput("Dokąd", end, enabled = !busy, account = account, onChange = { end = it; invalidateRoute() })
                    OutlinedButton(onClick = { stops = stops + LocationEntry(); invalidateRoute() }, enabled = !busy && stops.size < 5, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (stops.size < 5) "+ Dodaj przystanek" else "Dodano 5 przystanków") }
                    Text("Wybierz podpowiedź dla każdego adresu. Samo wpisanie nazwy nie ustala punktu na trasie.", style = MaterialTheme.typography.bodySmall)
                    Row { Checkbox(avoidReports, { avoidReports = it; invalidateRoute() }, modifier = Modifier.semantics { contentDescription = "Omijaj zgłoszone przeszkody" }); Text("Omijaj zgłoszone przeszkody", Modifier.padding(top = 12.dp)) }
                    Button(onClick = { if (!busy) { planFocus.requestFocus(); needs.error()?.let { error = it; tab = 1 } ?: run {
                        planning = true
                        invalidateRoute()
                        try {
                            val ns = needs; val from = start; val to = end; val via = stops; val avoid = avoidReports; val owner = account?.token
                            val car = journey.carMode
                            val combined = if (car) Api.request("/api/journeys", JSONObject().put("mode", "car")
                                .put("start", JSONArray(listOf(from.chosen!!.point.lon, from.chosen!!.point.lat)))
                                .put("end", JSONArray(listOf(to.chosen!!.point.lon, to.chosen!!.point.lat)))
                                .put("waypoints", JSONArray(via.map { listOf(it.chosen!!.point.lon, it.chosen!!.point.lat) }))
                                .put("profile", ns.json()).put("avoidReports", avoid).put("needsRampSpace", journey.ramp), token = owner) else null
                            val result = if (combined != null) Api.parseRoute(combined.getJSONArray("alternatives").getJSONObject(0).getJSONObject("onward")) else Api.route(from.chosen!!.point, to.chosen!!.point, ns, avoid, via.map { it.chosen!!.point }, owner)
                            if (account?.token == owner && needs == ns && start == from && end == to && stops == via && avoidReports == avoid && car == journey.carMode) {
                                if (combined != null) journey.accept(combined)
                                route = result
                            }
                        } finally { planning = false }
                    } } }, enabled = (!busy || planning) && canPlan(start, end, stops), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).focusRequester(planFocus).semantics {
                        // The initiating control stays available to TalkBack while waiting.
                        // A polite state update reports completion without moving focus.
                        if (planning || route != null) {
                            liveRegion = LiveRegionMode.Polite
                            stateDescription = if (planning) "Trwa obliczanie trasy"
                                else "Trasa gotowa: ${route!!.distanceM.toInt()} m, około ${(route!!.durationS / 60).toInt().coerceAtLeast(1)} min. Wynik poniżej."
                        }
                    }) { Text(if (planning) "Obliczam trasę…" else "Wyznacz trasę") }
                    // Keep route feedback beside its control instead of shifting the
                    // whole form above the focused button when an error arrives.
                    error?.let { Notice(it, true) }
                    TextButton(onClick = { tab = 1 }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Zmień potrzeby przejazdu") }
                    route?.let { r ->
                        Surface(color = Ink, shape = RoundedCornerShape(22.dp)) { Column(Modifier.padding(20.dp).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("${r.distanceM.toInt()} m", fontSize = 38.sp, color = Lime, fontWeight = FontWeight.Bold)
                            Text("około ${(r.durationS / 60).toInt().coerceAtLeast(1)} min · orientacyjnie", color = Cream)
                            Text("Trasa wymaga oceny otoczenia", color = Cream)
                        } }
                        Notice("Warunki po drodze mogą się zmieniać. Sprawdź dostępne wejście i obserwuj otoczenie.")
                        if (needs.width.isBlank()) Notice("Nie podano szerokości. Wąskie przejścia mogą wymagać sprawdzenia.")
                        if (!journey.carMode) Button(onClick = { locationAction(true) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Rozpocznij prowadzenie") }
                        OutlinedButton(onClick = { GuidanceSpeech.end(); context.stopService(Intent(context, GuidanceService::class.java)); previewStep = 0; previewSession = UUID.randomUUID().toString(); preview = true; tab = 2 }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Przejrzyj manewry bez GPS") }
                        Details("Szczegóły trasy i źródeł") {
                            Text("OpenStreetMap / OpenRouteService. © OpenStreetMap contributors.")
                            r.warnings.forEach { Text(it) }
                            (listOf(start) + stops + end).forEach { Text("${it.text}: ${it.chosen?.source ?: ""}") }
                            r.steps.forEachIndexed { i, s -> Text("${i + 1}. ${s.instruction} · ${s.distanceM.toInt()} m") }
                        }
                    }
                }
                1 -> {
                    key(account?.id) { NativeProfile(mobility, onChange = { needs = mobility.active?.needs ?: Needs(mobility = "walking"); profileVersion = mobility.version; invalidateRoute() },
                        onEdit = { p, first -> editing = p to first }, onAccount = { tab = 3 }) }
                    research.result?.takeIf { it.optString("status") != "searching" }?.let {
                        Button(onClick = {
                            val id = research.presetId
                            val draft = context.getSharedPreferences("preset-drafts-${account?.id ?: "guest"}", 0).getString(id, null)
                            val p = mobility.items.find { it.id == id } ?: runCatching { MobilityPreset.parse(JSONObject(draft!!)) }.getOrNull()
                            if (p != null) editing = p to false
                        }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sprawdź wynik rozpoznawania sprzętu") }
                    }
                }
                5 -> NativeSaved(account) { point -> browse.selected = point.place(); tab = 0 }
                2 -> {
                    Title(if (preview) "Podgląd manewrów" else "Prowadzenie")
                    if (!preview) SpeechControls()
                    val fresh = frame.isFresh(System.currentTimeMillis()); val active = fresh && frame.mode in listOf("live", "preview")
                    Surface(color = Ink, shape = RoundedCornerShape(24.dp), modifier = Modifier.fillMaxWidth()) { Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                        if (active) Text(if (frame.mode == "preview") "DŁUGOŚĆ ODCINKA" else "NASTĘPNY MANEWR ZA OKOŁO", color = Lime, style = MaterialTheme.typography.labelMedium)
                        Text(if (active) "${frame.distanceM} m" else "◎", fontSize = 42.sp, fontWeight = FontWeight.Bold, color = Lime)
                        Text(if (active) frame.instruction else "Sprawdź telefon i pozycję", fontSize = 30.sp, lineHeight = 36.sp, color = Cream, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                        Text(if (fresh) frame.note else "Brak aktualnych instrukcji. Uruchom trasę ponownie.", color = Cream)
                        if (active) Text("Manewr ${frame.step} z ${frame.total}", color = Cream)
                    } }
                    if (preview) {
                        Notice("PODGLĄD RĘCZNY. Pozycja nie jest śledzona.")
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            OutlinedButton(onClick = { previewStep-- }, enabled = previewStep > 0, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Poprzedni") }
                            Button(onClick = { previewStep++ }, enabled = route != null && previewStep < route!!.steps.lastIndex, modifier = Modifier.weight(1f).heightIn(min = 52.dp)) { Text("Następny") }
                        }
                    } else Text("Po zejściu z trasy zaplanuj ją ponownie. Ta wersja nie przelicza jej automatycznie.")
                    OutlinedButton(onClick = {
                        GuidanceSpeech.end()
                        error = null
                        if (!preview) context.getSharedPreferences("route", 0).edit().putBoolean("finishRequested", true).apply()
                        preview = false; context.stopService(Intent(context, GuidanceService::class.java))
                        publishGuidance(context, GuidanceFrame(sentAt = System.currentTimeMillis(), note = "Prowadzenie zakończone")); tab = 0
                    }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Zakończ") }
                    Text("Zegarek jest opcjonalny. Telefon pokazuje wszystkie instrukcje.", style = MaterialTheme.typography.bodySmall)
                }
                3 -> AccountScreen(account, busy, authReady = clerkConnection == ClerkConnection.Ready,
                    onRetry = { authRetry++ }, onAuthenticate = { register -> run {
                        val result = ClerkAccounts.authenticate(register)
                        applyClerkAccount(result)
                        status = if (result?.optJSONObject("profile") == null) "Konto połączone. Zapisz swoje potrzeby w zakładce Profil." else "Konto połączone. Pobrano wspólny profil."
                    } }, onRefresh = { reloadConfirm = true }, onLogout = { run {
                        ClerkAccounts.signOut(account?.token)
                        applyClerkAccount(null)
                        status = "Wylogowano z tego telefonu. Potrzeby konta usunięto z widoku."
                    } }, onProfile = { tab = 1 })
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable internal fun Title(text: String) = Text(text, fontSize = 32.sp, lineHeight = 37.sp, fontWeight = FontWeight.SemiBold, color = Ink, modifier = Modifier.semantics { heading() })
@Composable internal fun Notice(text: String, error: Boolean = false) {
    Surface(color = if (error) Color(0xffffded5) else Color(0xffe9ecd9), shape = RoundedCornerShape(14.dp)) {
        Text(text, modifier = Modifier.fillMaxWidth().padding(16.dp).semantics { liveRegion = LiveRegionMode.Polite }, color = Ink, style = MaterialTheme.typography.bodyMedium)
    }
}
@Composable private fun NumberField(label: String, value: String, onChange: (String) -> Unit) = OutlinedTextField(value, onChange, label = { Text(label) }, singleLine = true, modifier = Modifier.fillMaxWidth(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal))

@Suppress("MissingPermission")
private suspend fun freshLocation(manager: LocationManager): android.location.Location? = suspendCancellableCoroutine { c ->
    val providers = listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER).filter { manager.isProviderEnabled(it) }
    if (providers.isEmpty()) { c.resume(null); return@suspendCancellableCoroutine }
    val listener = object : LocationListener {
        override fun onLocationChanged(location: android.location.Location) {
            val age = (android.os.SystemClock.elapsedRealtimeNanos() - location.elapsedRealtimeNanos) / 1_000_000
            if (age <= 20_000 && location.hasAccuracy() && location.accuracy <= 100 && c.isActive) { manager.removeUpdates(this); c.resume(location) }
        }
    }
    c.invokeOnCancellation { manager.removeUpdates(listener) }
    try { providers.forEach { manager.requestLocationUpdates(it, 0L, 0f, listener, Looper.getMainLooper()) } }
    catch (_: SecurityException) { manager.removeUpdates(listener); if (c.isActive) c.resume(null) }
}
