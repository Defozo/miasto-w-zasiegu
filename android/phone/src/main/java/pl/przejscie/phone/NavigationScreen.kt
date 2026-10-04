package pl.przejscie.phone

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Paint
import android.os.SystemClock
import android.view.View
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.delay
import org.maplibre.android.MapLibre
import org.maplibre.android.annotations.IconFactory
import org.maplibre.android.annotations.Marker
import org.maplibre.android.annotations.MarkerOptions
import org.maplibre.android.annotations.PolylineOptions
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapLibreMapOptions
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import pl.przejscie.shared.GuidanceFrame
import pl.przejscie.shared.ManeuverGlyph
import java.util.Locale

private fun routeDistance(meters: Double) = if (meters < 1_000) "${meters.toInt()} m"
    else String.format(Locale.forLanguageTag("pl"), "%.1f km", meters / 1_000)

@OptIn(ExperimentalMaterial3Api::class)
@Composable internal fun NavigationScreen(route: Route?, frame: GuidanceFrame, now: Long, prepared: Boolean,
    error: String?, onBack: () -> Unit, onStart: () -> Unit, onStop: () -> Unit) {
    val speech by GuidanceSpeech.state.collectAsState()
    val fix by NavigationPosition.state.collectAsState()
    // The parent ticks even without fixes, so an old dot cannot masquerade as live GPS.
    val position = fix?.takeIf { !prepared && it.isUsable(SystemClock.elapsedRealtime()) }?.point
    val active = !prepared && frame.isFresh(now) && frame.mode == "live"
    var details by remember { mutableStateOf(false) }
    var following by remember(route) { mutableStateOf(true) }
    var cameraRequest by remember { mutableIntStateOf(0) }
    Surface(Modifier.fillMaxSize(), color = Cream) {
        BoxWithConstraints {
            val maxCardHeight = maxHeight * .31f
            Column(Modifier.fillMaxSize()) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    TextButton(onClick = onBack, modifier = Modifier.heightIn(min = 48.dp)) { Text("← Plan trasy") }
                    Spacer(Modifier.weight(1f))
                    Text(if (prepared) "PODGLĄD" else "PROWADZENIE", style = MaterialTheme.typography.labelSmall)
                    CompactSpeechControl(prepared)
                }
                Surface(color = Ink, shape = RoundedCornerShape(24.dp), modifier = Modifier.padding(horizontal = 12.dp).padding(bottom = 8.dp).fillMaxWidth()) {
                    Row(Modifier.heightIn(max = maxCardHeight).verticalScroll(rememberScrollState()).padding(18.dp), horizontalArrangement = Arrangement.spacedBy(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        if (active) ManeuverGlyph(frame.instruction, Lime, Modifier.size(48.dp))
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(if (prepared) "GOTOWI DO DROGI?" else if (active) "NASTĘPNY MANEWR" else "SPRAWDŹ POZYCJĘ", color = Lime, style = MaterialTheme.typography.labelSmall)
                            Text(if (prepared) route?.let { "${routeDistance(it.distanceM)} · ${(it.durationS / 60).toInt().coerceAtLeast(1)} min" } ?: "Plan niedostępny"
                                else if (active) "${frame.distanceM} m" else "GPS", color = Lime, fontSize = 30.sp, fontWeight = FontWeight.Bold)
                            Text(if (prepared) "Sprawdź trasę i ruszaj we własnym tempie." else if (active) frame.instruction
                                else if (frame.isFresh(now)) frame.note else "Czekamy na aktualną lokalizację.",
                                color = Cream, style = MaterialTheme.typography.titleMedium,
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite; heading() })
                        }
                    }
                }
                Box(Modifier.fillMaxWidth().weight(1f)) {
                    if (route != null) GuidanceMap(route, position, following, cameraRequest, onPan = { following = false }, modifier = Modifier.fillMaxSize())
                    else Text("Wróć do planu i otwórz trasę ponownie.", Modifier.align(Alignment.Center).padding(24.dp))
                    Column(Modifier.align(Alignment.BottomEnd).padding(end = 12.dp, bottom = 54.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        SmallMapButton("Pokaż całą trasę", "overview", { following = false; cameraRequest++ })
                        if (!prepared) SmallMapButton(if (following) "Mapa śledzi pozycję" else "Wróć do mojej pozycji", "locate",
                            { following = true; cameraRequest++ }, selected = following, enabled = position != null)
                    }
                }
                Surface(shadowElevation = 6.dp, color = Cream) {
                    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp).padding(bottom = 12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall,
                            modifier = Modifier.heightIn(max = 88.dp).verticalScroll(rememberScrollState()).semantics { liveRegion = LiveRegionMode.Polite }) }
                        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            Text(if (prepared) "Trasa nie potwierdza przejezdności." else if (position == null) "Brak dokładnej, aktualnej pozycji."
                                else route?.let { "Cała trasa: ${routeDistance(it.distanceM)}" } ?: "Prowadzenie GPS",
                                Modifier.weight(1f), style = MaterialTheme.typography.bodySmall)
                            TextButton(onClick = { details = true }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Plan i warunki") }
                        }
                        if (prepared) Button(onClick = onStart, enabled = route != null, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Włącz prowadzenie GPS") }
                        else OutlinedButton(onClick = onStop, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Zakończ prowadzenie") }
                    }
                }
            }
        }
    }
    if (details) ModalBottomSheet(onDismissRequest = { details = false }, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        LazyColumn(Modifier.fillMaxWidth().padding(horizontal = 24.dp), contentPadding = PaddingValues(bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { Text("Plan i warunki", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.semantics { heading() }) }
            item { Text("Obserwuj otoczenie i sprawdź właściwe wejście. Obliczona trasa nie jest potwierdzeniem przejezdności. Brak danych nie oznacza braku bariery.") }
            route?.let { r ->
                itemsIndexed(r.warnings) { _, warning -> Notice(warning) }
                item { Text("Prowadzenie próbne, bez automatycznego przeliczania po zejściu z trasy. Mapa podkładowa wymaga internetu. GPS i instrukcje wyznaczonej trasy działają także przy zablokowanym ekranie.") }
                if (speech.session != null) item {
                    Text(speech.message)
                    if (speech.canRepeat) TextButton(onClick = { GuidanceSpeech.command(GuidanceSpeech.REPEAT, speech.session) }) { Text("Powtórz instrukcję") }
                }
                item { Text("Manewry trasy", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() }) }
                itemsIndexed(r.steps) { index, step ->
                    Column { Text("${index + 1}. ${step.instruction}", fontWeight = FontWeight.SemiBold); Text("Odcinek: ${routeDistance(step.distanceM)}", style = MaterialTheme.typography.bodySmall) }
                }
                item { Text("Sparowany Wear OS pokazuje manewr i dystans. Po utracie połączenia lub wygaśnięciu danych poprosi o sprawdzenie telefonu.") }
            }
            item { TextButton(onClick = { details = false }) { Text("Zamknij plan i warunki") } }
        }
    }
}

@Composable private fun CompactSpeechControl(prepared: Boolean) {
    val context = LocalContext.current
    val prefs = remember { context.getSharedPreferences("guidance-voice", 0) }
    var muted by remember { mutableStateOf(prefs.getBoolean("muted", false)) }
    val speech by GuidanceSpeech.state.collectAsState()
    var settings by remember { mutableStateOf(false) }
    var settingsError by remember { mutableStateOf(false) }
    val enabled = if (prepared) !muted else speech.enabled
    val unavailable = !prepared && speech.ready && !speech.available
    val label = if (unavailable) "Głos niedostępny. Ustawienia mowy" else if (enabled) "Wycisz głos" else "Włącz głos"
    IconButton(onClick = {
        if (unavailable) settings = true
        else {
            muted = enabled; prefs.edit().putBoolean("muted", muted).apply()
            if (!prepared) GuidanceSpeech.command(if (muted) GuidanceSpeech.MUTE else GuidanceSpeech.ENABLE, speech.session)
        }
    }, enabled = prepared || speech.session != null, modifier = Modifier.size(48.dp).semantics {
        contentDescription = label
        stateDescription = if (unavailable) "Brak polskiego głosu offline" else if (enabled) "Głos włączony" else "Głos wyciszony"
    }) { NavigationIcon(if (enabled && !unavailable) "volume" else "muted", Ink) }
    if (settings) AlertDialog(onDismissRequest = { settings = false }, title = { Text("Instrukcje głosowe") }, text = {
        Column { Text(speech.message); if (settingsError) Text("Otwórz ustawienia telefonu i wyszukaj zamianę tekstu na mowę.") }
    }, confirmButton = { TextButton(onClick = {
        runCatching { context.startActivity(Intent("com.android.settings.TTS_SETTINGS")) }.onFailure { settingsError = true }
    }) { Text("Ustawienia mowy") } }, dismissButton = {
        Row { TextButton(onClick = { GuidanceSpeech.command(GuidanceSpeech.REFRESH, speech.session); settings = false }) { Text("Sprawdź ponownie") }
            TextButton(onClick = { settings = false }) { Text("Zamknij") } }
    })
}

@Composable private fun SmallMapButton(label: String, icon: String, onClick: () -> Unit, selected: Boolean = false, enabled: Boolean = true) {
    Surface(color = if (selected) Ink else Cream, shape = CircleShape, shadowElevation = 3.dp) {
        IconButton(onClick = onClick, enabled = enabled, modifier = Modifier.size(48.dp).semantics {
            contentDescription = label
            if (icon == "locate") stateDescription = if (selected) "Śledzenie pozycji włączone" else "Mapa przesunięta"
        }) { NavigationIcon(icon, (if (selected) Lime else Ink).copy(alpha = if (enabled) 1f else .4f)) }
    }
}

@Composable private fun NavigationIcon(kind: String, color: Color) {
    Canvas(Modifier.size(24.dp).clearAndSetSemantics {}) {
        val u = size.width / 24f
        fun line(x: Float, y: Float, x2: Float, y2: Float) = drawLine(color, Offset(x * u, y * u), Offset(x2 * u, y2 * u), 2f * u, StrokeCap.Round)
        when (kind) {
            "volume", "muted" -> {
                val speaker = Path().apply { moveTo(3*u, 9*u); lineTo(7*u, 9*u); lineTo(12*u, 5*u); lineTo(12*u, 19*u); lineTo(7*u, 15*u); lineTo(3*u, 15*u); close() }
                drawPath(speaker, color, style = Stroke(1.8f*u))
                if (kind == "muted") { line(16f, 9f, 22f, 15f); line(22f, 9f, 16f, 15f) }
                else { drawArc(color, -55f, 110f, false, Offset(9*u, 7*u), Size(9*u, 10*u), style = Stroke(1.8f*u)); drawArc(color, -55f, 110f, false, Offset(6*u, 3*u), Size(16*u, 18*u), style = Stroke(1.8f*u)) }
            }
            "locate" -> { drawCircle(color, 7*u, style = Stroke(2*u)); drawCircle(color, 2*u); line(12f, 1f, 12f, 4f); line(12f, 20f, 12f, 23f); line(1f, 12f, 4f, 12f); line(20f, 12f, 23f, 12f) }
            else -> { line(3f, 9f, 3f, 3f); line(3f, 3f, 9f, 3f); line(15f, 3f, 21f, 3f); line(21f, 3f, 21f, 9f); line(3f, 15f, 3f, 21f); line(3f, 21f, 9f, 21f); line(15f, 21f, 21f, 21f); line(21f, 21f, 21f, 15f) }
        }
    }
}

@Suppress("DEPRECATION")
@Composable private fun GuidanceMap(route: Route, position: Point?, following: Boolean, cameraRequest: Int, onPan: () -> Unit, modifier: Modifier) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val density = LocalDensity.current.density
    val uri = LocalUriHandler.current
    // SurfaceView blocks the main thread while resizing its renderer after screen
    // unlock. TextureView participates in the Compose/WebView view hierarchy.
    val mapView = remember { MapLibre.getInstance(context); MapView(context, MapLibreMapOptions.createFromAttributes(context).textureMode(true)).apply {
        onCreate(null); setMaximumFps(30)
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    } }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var failed by remember { mutableStateOf(false) }
    var ready by remember { mutableStateOf(false) }
    var marker by remember { mutableStateOf<Marker?>(null) }
    var attribution by remember { mutableStateOf(false) }
    var retryNumber by remember { mutableIntStateOf(0) }
    var reloadStyle by remember { mutableStateOf<(() -> Unit)?>(null) }
    val currentPan by rememberUpdatedState(onPan)
    val points = remember(route) { route.geometry.map { LatLng(it.lat, it.lon) } }
    fun icon(label: String, fill: Int) = IconFactory.getInstance(context).fromBitmap(
        Bitmap.createBitmap((40*density).toInt(), (40*density).toInt(), Bitmap.Config.ARGB_8888).also { bitmap ->
            val canvas = android.graphics.Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
            val center = bitmap.width / 2f
            paint.color = android.graphics.Color.WHITE; canvas.drawCircle(center, center, 17*density, paint)
            paint.color = fill; canvas.drawCircle(center, center, 13*density, paint)
            if (label.isNotEmpty()) {
                paint.color = android.graphics.Color.WHITE; paint.textSize = 15*density; paint.typeface = android.graphics.Typeface.DEFAULT_BOLD; paint.textAlign = Paint.Align.CENTER
                canvas.drawText(label, center, center + 5*density, paint)
            }
        })
    val locationIcon = remember(density) { icon("", android.graphics.Color.rgb(30, 100, 218)) }
    DisposableEffect(owner, mapView) {
        val observer = LifecycleEventObserver { _, event -> when (event) {
            Lifecycle.Event.ON_START -> mapView.onStart(); Lifecycle.Event.ON_RESUME -> mapView.onResume()
            Lifecycle.Event.ON_PAUSE -> mapView.onPause(); Lifecycle.Event.ON_STOP -> mapView.onStop(); else -> Unit
        } }
        owner.lifecycle.addObserver(observer); mapView.onStart()
        if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onResume()
        onDispose { owner.lifecycle.removeObserver(observer); mapView.onPause(); mapView.onStop(); mapView.onDestroy() }
    }
    Box(modifier) {
        AndroidView(factory = { mapView.also { view ->
            view.addOnDidFailLoadingMapListener { failed = true }
            view.getMapAsync { m ->
                m.cameraPosition = CameraPosition.Builder().target(points.first()).zoom(15.0).build()
                m.uiSettings.isLogoEnabled = false; m.uiSettings.isAttributionEnabled = false
                m.uiSettings.isCompassEnabled = false; m.uiSettings.isRotateGesturesEnabled = false; m.uiSettings.isTiltGesturesEnabled = false
                m.addOnCameraMoveStartedListener { reason -> if (reason == MapLibreMap.OnCameraMoveStartedListener.REASON_API_GESTURE) currentPan() }
                reloadStyle = {
                    m.setStyle(Style.Builder().fromUri("https://tiles.openfreemap.org/styles/positron"))
                    // The setter's callback is discarded on a transient load error.
                    // An asynchronous getter also runs when the SDK's retry recovers.
                    m.getStyle { map = m; ready = true; failed = false }
                }
                reloadStyle?.invoke()
            }
        } }, modifier = Modifier.fillMaxSize())
        if (failed || !ready) Surface(Modifier.align(Alignment.TopCenter).padding(12.dp), shape = RoundedCornerShape(12.dp), color = Cream) {
            Column(Modifier.padding(12.dp)) {
                Text(if (failed) "Mapa niedostępna. Plan i manewry znajdziesz poniżej." else "Wczytuję mapę…", style = MaterialTheme.typography.bodySmall)
                if (failed) TextButton(onClick = { failed = false; ready = false; map = null; retryNumber++; reloadStyle?.invoke() }) { Text("Wczytaj mapę ponownie") }
            }
        }
        TextButton(onClick = { attribution = true }, modifier = Modifier.align(Alignment.BottomStart).heightIn(min = 48.dp),
            colors = ButtonDefaults.textButtonColors(containerColor = Cream.copy(alpha = .95f), contentColor = Ink)) {
            Text("© OpenStreetMap · OpenFreeMap", fontSize = 10.sp)
        }
    }
    LaunchedEffect(ready, retryNumber) { if (!ready) { delay(25_000); if (!ready) failed = true } }
    LaunchedEffect(map, route) {
        map?.let { m ->
            m.clear(); marker = null
            m.addPolyline(PolylineOptions().addAll(points).color(android.graphics.Color.WHITE).width(10f))
            m.addPolyline(PolylineOptions().addAll(points).color(android.graphics.Color.rgb(23, 60, 50)).width(6f))
            m.addMarker(MarkerOptions().position(points.first()).icon(icon("A", android.graphics.Color.rgb(23, 60, 50))).title("Początek trasy"))
            m.addMarker(MarkerOptions().position(points.last()).icon(icon("B", android.graphics.Color.rgb(23, 60, 50))).title("Cel trasy"))
            m.moveCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(points).build(), (48*density).toInt()))
        }
    }
    LaunchedEffect(map, route, position) {
        map?.let { m ->
            if (position == null) { marker?.let(m::removeMarker); marker = null }
            else {
                val target = LatLng(position.lat, position.lon)
                if (marker == null) marker = m.addMarker(MarkerOptions().position(target).icon(locationIcon).title("Aktualna pozycja GPS"))
                else marker!!.position = target
            }
        }
    }
    LaunchedEffect(map, route, position, following, cameraRequest) {
        map?.let { m ->
            if (following && position != null) m.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder()
                .target(LatLng(position.lat, position.lon)).zoom(17.5).bearing(0.0).tilt(0.0).build()), 650)
        }
    }
    LaunchedEffect(cameraRequest) {
        // Only the explicit overview button fits bounds. Panning and new GPS
        // frames leave an explored camera alone until the user selects follow.
        if (!following) map?.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(points).build(), (48*density).toInt()))
    }
    if (attribution) AlertDialog(onDismissRequest = { attribution = false }, title = { Text("Źródła mapy") }, text = {
        Column {
            Text("Mapa: OpenFreeMap, OpenMapTiles. Dane: © współtwórcy OpenStreetMap. Podkład mapy nie potwierdza dostępności trasy.")
            TextButton(onClick = { uri.openUri("https://www.openstreetmap.org/copyright") }) { Text("OpenStreetMap: autorzy i licencja") }
            TextButton(onClick = { uri.openUri("https://openfreemap.org/") }) { Text("OpenFreeMap") }
            TextButton(onClick = { uri.openUri("https://openmaptiles.org/") }) { Text("OpenMapTiles") }
        }
    }, confirmButton = { TextButton(onClick = { attribution = false }) { Text("Zamknij") } })
}
