package pl.przejscie.phone

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.MapLibre
import org.maplibre.android.annotations.IconFactory
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.annotations.PolylineOptions
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import java.net.URLEncoder

internal class BrowseState {
    var query by mutableStateOf("")
    var category by mutableStateOf("")
    var type by mutableStateOf("")
    var hideUnknown by mutableStateOf(false)
    var stepFree by mutableStateOf(false)
    var showMarkers by mutableStateOf(true)
    var items by mutableStateOf(emptyList<Place>())
    var addresses by mutableStateOf(emptyList<ChosenLocation>())
    var selected by mutableStateOf<Place?>(null)
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var area by mutableStateOf("")
    var movedArea by mutableStateOf("")
    var camera: CameraPosition = CameraPosition.Builder().target(LatLng(50.0614, 19.9372)).zoom(13.0).build()
    var revision by mutableIntStateOf(0)
}
internal fun parsePlace(p: JSONObject): Place? {
    val c = p.optJSONArray("coordinates") ?: return null
    return Place(p.optString("id"), p.optString("name", "Miejsce"), p.optString("category"), p.optString("address"), Point(c.getDouble(0), c.getDouble(1)), p)
}
internal fun Place.chosen() = ChosenLocation(id, name + if (address.isBlank()) "" else ", $address", point, "place", "approximate", raw.optJSONObject("provenance")?.optString("publisher") ?: "OpenStreetMap", raw.optString("sourceUrl"))
internal fun ChosenLocation.place(): Place = Place(id, label, "outdoors", "", point, JSONObject().put("id", id).put("name", label).put("coordinates", JSONArray(listOf(point.lon, point.lat))).put("sourceUrl", sourceUrl))

@Composable internal fun NativeMapScreen(state: BrowseState, mobility: MobilityState, account: Account?, route: Route?, modifier: Modifier = Modifier,
    current: Point?, onLocate: () -> Unit, onProfile: () -> Unit, onPreset: (String) -> Unit, onPlan: (Place) -> Unit, onResume: (() -> Unit)?, resumeLabel: String, onResearch: (() -> Unit)?) {
    val scope = rememberCoroutineScope(); val context = LocalContext.current; val uri = LocalUriHandler.current
    var list by remember { mutableStateOf(false) }; var filters by remember { mutableStateOf(false) }
    var presetMenu by remember { mutableStateOf(false) }
    var saved by remember { mutableStateOf("") }; var report by remember { mutableStateOf(false) }
    BackHandler(enabled = state.selected != null || list) { if (state.selected != null) state.selected = null else list = false }
    LaunchedEffect(state.query, state.category, state.type, state.area, state.hideUnknown, state.stepFree, state.revision) {
        state.loading = true; state.error = null
        try {
            delay(280)
            val q = URLEncoder.encode(state.query, "UTF-8")
            val data = Api.request("/api/places?limit=60&q=$q" + (if (state.category.isBlank()) "" else "&category=${state.category}") + (if (state.type.isBlank()) "" else "&placeType=${state.type}") + (if (state.area.isBlank()) "" else "&bbox=${state.area}") + (if (state.hideUnknown) "&hideUnknown=true" else "") + (if (state.stepFree) "&stepFree=true" else ""))
            val a = data.optJSONArray("places") ?: JSONArray()
            state.items = (0 until a.length()).mapNotNull { parsePlace(a.getJSONObject(it)) }
            state.addresses = if (state.query.length >= 3) Api.locations(state.query).filter { p -> state.items.none { it.id == p.id } } else emptyList()
        } catch (e: Exception) { if (e is CancellationException) throw e; state.error = e.message ?: "Nie udało się pobrać miejsc." }
        finally { state.loading = false }
    }
    Column(modifier.fillMaxSize()) {
        Surface(shadowElevation = 3.dp) { Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
            OutlinedTextField(state.query, { state.query = it; state.selected = null }, label = { Text("Miejsce lub adres") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("Jedzenie" to "food", "Toalety" to "toilet", "Odpoczynek" to "bench", "Parkingi" to "parking").forEach { (label, value) ->
                    FilterChip(selected = state.category == value || state.type == value, onClick = { state.selected = null; state.query = ""; state.category = if (value in listOf("food", "toilet") && state.category != value) value else ""; state.type = if (value in listOf("bench", "parking") && state.type != value) value else "" }, label = { Text(label) }, modifier = Modifier.heightIn(min = 48.dp))
                }
                AssistChip(onClick = { filters = true }, label = { Text("Więcej") }, modifier = Modifier.heightIn(min = 48.dp))
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextButton(onClick = { filters = true }, Modifier.heightIn(min = 48.dp)) { Text("Filtry (${listOf(state.hideUnknown, state.stepFree, !state.showMarkers, state.type.isNotBlank(), state.category.isNotBlank()).count { it }})") }
                Box(Modifier.weight(1f)) {
                    TextButton(onClick = { presetMenu = true }, Modifier.heightIn(min = 48.dp).fillMaxWidth()) { Text(mobility.active?.name ?: "Dostosuj potrzeby", maxLines = 2) }
                    DropdownMenu(expanded = presetMenu, onDismissRequest = { presetMenu = false }) {
                        mobility.items.forEach { preset -> DropdownMenuItem(text = { Text(preset.name) }, onClick = { presetMenu = false; onPreset(preset.id) }, modifier = Modifier.heightIn(min = 48.dp)) }
                        DropdownMenuItem(text = { Text("Zarządzaj zestawami") }, onClick = { presetMenu = false; onProfile() }, modifier = Modifier.heightIn(min = 48.dp))
                    }
                }
            }
        } }
        Box(Modifier.weight(1f).fillMaxWidth()) {
            NativeCityMap(state, route, current, Modifier.fillMaxSize())
            Row(Modifier.align(Alignment.TopCenter).padding(6.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (state.movedArea.isNotBlank() && state.movedArea != state.area) Button(onClick = { state.area = state.movedArea }, Modifier.heightIn(min = 48.dp)) { Text("Szukaj w tym obszarze") }
                else OutlinedButton(onClick = onLocate, Modifier.heightIn(min = 48.dp), colors = ButtonDefaults.outlinedButtonColors(containerColor = Cream)) { Text("Moja lokalizacja") }
            }
            Surface(Modifier.align(Alignment.BottomCenter).fillMaxWidth().fillMaxHeight(if (list) 0.95f else if (state.selected == null) 0.44f else 0.7f), tonalElevation = 3.dp, shadowElevation = 6.dp) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = { list = !list }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(if (list) "Zwiń listę i pokaż mapę" else "Pokaż listę") }
                    state.error?.let { Notice(it, true); TextButton(onClick = { state.revision++ }) { Text("Spróbuj ponownie") } }
                    if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = "Wczytywanie miejsc" })
                    onResume?.let { callback -> OutlinedButton(onClick = callback, Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text(resumeLabel) } }
                    onResearch?.let { callback -> OutlinedButton(onClick = callback, Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sprawdź wynik rozpoznawania sprzętu") } }
                    if (state.selected == null) {
                        Text("Miejsca i warunki", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
                        if (!state.loading && state.items.isEmpty() && state.addresses.isEmpty()) Text("Brak wyników. Zmień obszar lub filtry. Braki danych nie oznaczają braku bariery.")
                        state.items.forEach { p -> OutlinedCard(onClick = { state.selected = p; saved = "" }, modifier = Modifier.fillMaxWidth()) {
                            Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) { Text(p.name, style = MaterialTheme.typography.titleMedium); Text(p.address); Text(placeFacts(p).take(2).joinToString(" · "), style = MaterialTheme.typography.bodySmall) }
                        } }
                        state.addresses.forEach { p -> OutlinedButton(onClick = { state.selected = p.place() }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("${p.label} · ${p.source}") } }
                    } else state.selected?.let { p ->
                        TextButton(onClick = { state.selected = null }, Modifier.heightIn(min = 48.dp)) { Text("Wróć do wyników") }
                        Text(p.name, style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() }); Text(p.address)
                        placeFacts(p).forEach { Text(it) }
                        Text("Brak danych wymaga sprawdzenia. Dane źródłowe nie zastępują oceny miejsca.", style = MaterialTheme.typography.bodySmall)
                        Button(onClick = { onPlan(p) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("Nawiguj") }
                        OutlinedButton(onClick = { scope.launch {
                            try { if (account == null) FavoriteStore(context).add(p.name, p.chosen()) else Api.request("/api/favorites", JSONObject().put("label", p.name.take(80)).put("point", p.chosen().favoriteJson()).put("expectedUserId", account.id), token = account.token); saved = "Zapisano miejsce." }
                            catch (e: Exception) { if (e is CancellationException) throw e; saved = e.message ?: "Nie udało się zapisać." }
                        } }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Zapisz") }
                        if (saved.isNotBlank()) Notice(saved)
                        Details("Źródło i aktualność") {
                            Text(p.raw.optString("sourceLabel").ifBlank { p.raw.optJSONObject("provenance")?.optString("publisher") ?: "OpenStreetMap" })
                            if (p.raw.optInt("passportRevision") > 0) NativePassportEvidence(p)
                            else Text("Zmiana rekordu: ${p.raw.optString("osmUpdatedAt").ifBlank { "brak daty" }}. To nie jest data audytu terenowego.")
                            p.raw.optString("sourceUrl").takeIf { it.startsWith("https://") }?.let { url -> TextButton(onClick = { uri.openUri(url) }, Modifier.heightIn(min = 48.dp)) { Text("Otwórz źródło") } }
                        }
                        TextButton(onClick = { report = true }, Modifier.heightIn(min = 48.dp)) { Text("Zgłoś błąd lub przeszkodę") }
                    }
                    Text("© OpenStreetMap contributors · OpenFreeMap", style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
    if (filters) AlertDialog(onDismissRequest = { filters = false }, title = { Text("Filtry") }, text = {
        Column(Modifier.verticalScroll(rememberScrollState())) {
            Text("Warunki dostępu")
            FilterCheck("Wejście bez stopni według źródła", state.stepFree) { state.stepFree = it }
            FilterCheck("Ukryj miejsca z brakującymi danymi", state.hideUnknown) { state.hideUnknown = it }
            Text("Warstwy mapy")
            FilterCheck("Znaczniki miejsc", state.showMarkers) { state.showMarkers = it }
            Text("Kategorie")
            listOf("Wszystkie" to "", "Kultura" to "culture", "Na zewnątrz" to "outdoors", "Transport" to "transport").forEach { (label, value) -> TextButton(onClick = { state.category = value; state.type = "" }) { Text(label) } }
        }
    }, confirmButton = { TextButton(onClick = { filters = false }) { Text("Pokaż wyniki") } })
    if (report && state.selected != null) NativeReportDialog(state.selected!!, account, onClose = { report = false })
}
@Composable private fun FilterCheck(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row { Checkbox(checked, onChange, Modifier.semantics { contentDescription = label }); Text(label, Modifier.padding(top = 12.dp)) }
}
internal fun placeFacts(p: Place): List<String> {
    val a = p.raw.optJSONObject("access") ?: JSONObject()
    fun value(key: String, suffix: String = "") = if (!a.has(key) || a.isNull(key) || a.optString(key).isBlank()) "brak danych" else a.optString(key) + suffix
    return listOf("Wejście: ${value("widthCm", " cm")}", "Próg: ${value("thresholdCm", " cm")}", "Toaleta: ${when (a.optString("toilet")) { "yes" -> "dostosowana według źródła"; "no" -> "niedostosowana według źródła"; "limited" -> "ograniczona dostępność"; else -> "brak danych" }}") +
        listOf("Dostęp na wózku: ${when (a.optString("wheelchair")) { "yes" -> "zadeklarowany w źródle"; "no" -> "źródło wskazuje brak dostępu"; "limited" -> "ograniczony"; else -> "brak danych" }}",
            "Stopnie: ${if (a.isNull("stepFree")) "brak danych" else if (a.optBoolean("stepFree")) "brak według źródła" else "występują według źródła"}")
}
@Composable private fun NativePassportEvidence(place: Place) {
    var passport by remember(place.id) { mutableStateOf<JSONObject?>(null) }
    var error by remember(place.id) { mutableStateOf<String?>(null) }
    val uri = LocalUriHandler.current
    LaunchedEffect(place.id) {
        try { passport = Api.request("/api/place-passports/" + URLEncoder.encode(place.id, "UTF-8")) }
        catch (e: Exception) { if (e is CancellationException) throw e; error = "Nie udało się pobrać źródeł. Dane wymagają sprawdzenia." }
    }
    error?.let { Notice(it, true) }
    if (passport == null && error == null) Text("Wczytywanie źródeł parametrów…")
    val fields = passport?.optJSONObject("fields")
    listOf("widthCm" to "Szerokość wejścia", "thresholdCm" to "Próg", "toilet" to "Toaleta", "wheelchair" to "Dostęp na wózku", "steps" to "Stopnie").forEach { (key, label) ->
        fields?.optJSONObject(key)?.let { field -> Details(label) {
            Text(when (field.optString("status")) { "conflict" -> "Sprzeczne informacje"; "unknown" -> "Brak danych"; "unverified" -> "Zgłoszenie użytkownika, bez niezależnego potwierdzenia"; else -> "Informacja źródłowa" })
            val evidence = field.optJSONArray("evidence") ?: JSONArray()
            for (i in 0 until evidence.length()) {
                val item = evidence.getJSONObject(i); val source = item.optJSONObject("source")
                Text("${item.optString("value")} · ${source?.optString("label") ?: "Źródło"}")
                Text("Data obserwacji: ${item.optString("observedAt").takeUnless { it.isBlank() || it == "null" } ?: "brak danych"}")
                source?.optString("url")?.takeIf { it.startsWith("https://") }?.let { url -> TextButton(onClick = { uri.openUri(url) }) { Text("Otwórz dokument źródłowy") } }
            }
        } }
    }
}
@Suppress("DEPRECATION")
@Composable private fun NativeCityMap(state: BrowseState, route: Route?, current: Point?, modifier: Modifier) {
    val context = LocalContext.current; val owner = LocalLifecycleOwner.current
    val mapView = remember { MapLibre.getInstance(context); MapView(context).apply { onCreate(null); importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS } }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    val currentRoute by rememberUpdatedState(route)
    fun redraw(m: MapLibreMap) {
        m.clear()
        val places = if (state.showMarkers) (state.items + listOfNotNull(state.selected)).distinctBy { it.id } else emptyList()
        val groups = places.groupBy { val xy = m.projection.toScreenLocation(LatLng(it.point.lat, it.point.lon)); Pair((xy.x / 64).toInt(), (xy.y / 64).toInt()) }
        val ids = mutableMapOf<Long, List<Place>>()
        groups.values.forEach { group ->
            val p = group.first(); val bitmap = Bitmap.createBitmap(72, 72, Bitmap.Config.ARGB_8888); val canvas = Canvas(bitmap)
            val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.rgb(23, 60, 50) }; canvas.drawCircle(36f, 36f, 32f, paint)
            paint.color = android.graphics.Color.WHITE; paint.textSize = 28f; paint.textAlign = Paint.Align.CENTER
            canvas.drawText(if (group.size > 1) group.size.toString() else "•", 36f, 46f, paint)
            val marker = m.addMarker(MarkerOptions().position(LatLng(p.point.lat, p.point.lon)).title(p.name).icon(IconFactory.getInstance(context).fromBitmap(bitmap)))
            ids[marker.id] = group
        }
        m.setOnMarkerClickListener { marker -> val group = ids[marker.id]; if (group != null) { if (group.size == 1) state.selected = group.first() else m.animateCamera(CameraUpdateFactory.newLatLngZoom(marker.position, m.cameraPosition.zoom + 2)); true } else false }
        currentRoute?.let { r -> m.addPolyline(PolylineOptions().addAll(r.geometry.map { LatLng(it.lat, it.lon) }).color(android.graphics.Color.rgb(23, 60, 50)).width(6f)) }
        current?.let { m.addMarker(MarkerOptions().position(LatLng(it.lat, it.lon)).title("Moja lokalizacja")) }
    }
    DisposableEffect(owner, mapView) {
        val observer = LifecycleEventObserver { _, event -> when (event) {
            Lifecycle.Event.ON_START -> mapView.onStart(); Lifecycle.Event.ON_RESUME -> mapView.onResume()
            Lifecycle.Event.ON_PAUSE -> mapView.onPause(); Lifecycle.Event.ON_STOP -> mapView.onStop(); else -> Unit
        } }
        owner.lifecycle.addObserver(observer); mapView.onStart(); if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose { owner.lifecycle.removeObserver(observer); mapView.onPause(); mapView.onStop(); mapView.onDestroy() }
    }
    AndroidView(factory = { mapView.also { view -> view.getMapAsync { m ->
        m.cameraPosition = state.camera
        m.uiSettings.isLogoEnabled = false; m.uiSettings.isAttributionEnabled = false
        m.setStyle(Style.Builder().fromUri("https://tiles.openfreemap.org/styles/positron")) { map = m; redraw(m) }
        var moved = false
        m.addOnCameraMoveStartedListener { reason -> if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) moved = true }
        m.addOnCameraIdleListener { state.camera = m.cameraPosition; if (moved) {
            val b = m.projection.visibleRegion.latLngBounds
            state.movedArea = "${b.longitudeWest},${b.latitudeSouth},${b.longitudeEast},${b.latitudeNorth}"; moved = false
        }; redraw(m) }
    } } }, modifier = modifier)
    LaunchedEffect(map, state.items, state.selected, state.showMarkers, route, current) { map?.let { redraw(it) } }
    LaunchedEffect(state.selected?.id) { state.selected?.let { map?.animateCamera(CameraUpdateFactory.newLatLng(LatLng(it.point.lat, it.point.lon))) } }
    LaunchedEffect(current) { current?.let { map?.animateCamera(CameraUpdateFactory.newLatLng(LatLng(it.lat, it.lon))) } }
}

@Composable internal fun NativeSaved(account: Account?, onChoose: (ChosenLocation) -> Unit) {
    val context = LocalContext.current; var values by remember(account?.id) { mutableStateOf(emptyList<Favorite>()) }; var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(account?.id) { try {
        values = if (account == null) FavoriteStore(context).list() else { val a = Api.request("/api/favorites", token = account.token).getJSONArray("favorites"); (0 until a.length()).map { favoriteFromJson(a.getJSONObject(it)) } }
    } catch (e: Exception) { if (e is CancellationException) throw e; error = e.message } }
    Title("Zapisane"); error?.let { Notice(it, true) }
    if (values.isEmpty()) Text("Zapisuj miejsca z mapy, żeby łatwo do nich wrócić.")
    values.forEach { p -> OutlinedButton(onClick = { onChoose(p.point) }, modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) { Text("${p.label}\n${p.point.label}") } }
}

@Composable private fun NativeReportDialog(place: Place, account: Account?, onClose: () -> Unit) {
    val scope = rememberCoroutineScope(); var description by remember { mutableStateOf("") }; var type by remember { mutableStateOf("obstacle") }; var error by remember { mutableStateOf<String?>(null) }; var busy by remember { mutableStateOf(false) }
    AlertDialog(onDismissRequest = onClose, title = { Text("Zgłoś przeszkodę przy miejscu") }, text = { Column(Modifier.verticalScroll(rememberScrollState())) {
        Text(place.name); Text("Zapis dotyczy punktu na mapie. Opisz tylko zaobserwowane warunki.")
        listOf("obstacle" to "Przeszkoda", "kerb" to "Krawężnik", "surface" to "Nawierzchnia", "lift" to "Winda").forEach { (id, label) -> FilterChip(selected = type == id, onClick = { type = id }, label = { Text(label) }) }
        OutlinedTextField(description, { description = it.take(500) }, label = { Text("Opis i miejsce przeszkody") })
        error?.let { Notice(it, true) }
    } }, confirmButton = { TextButton(onClick = { scope.launch { busy = true; try {
        Api.request("/api/reports", JSONObject().put("kind", type).put("description", description).put("coordinates", JSONArray(listOf(place.point.lon, place.point.lat))).put("expectedUserId", account?.id ?: JSONObject.NULL), token = account?.token); onClose()
    } catch (e: Exception) { if (e is CancellationException) throw e; error = e.message } finally { busy = false } } }, enabled = !busy && description.trim().length >= 8) { Text("Wyślij zgłoszenie") } }, dismissButton = { TextButton(onClick = onClose) { Text("Anuluj") } })
}
