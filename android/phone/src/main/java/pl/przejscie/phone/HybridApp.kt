package pl.przejscie.phone

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.view.View
import android.webkit.*
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.core.content.FileProvider
import com.clerk.api.Clerk
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.distinctUntilChangedBy
import org.json.JSONObject
import org.json.JSONArray
import pl.przejscie.shared.GuidanceFrame
import pl.przejscie.shared.publishGuidance
import java.io.ByteArrayInputStream
import java.io.File

@Composable internal fun HybridApp() {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val policy = remember { HybridPolicy(BuildConfig.BACKEND_URL) }
    val routePrefs = remember { context.getSharedPreferences("route", 0) }
    val tripPrefs = remember { context.getSharedPreferences("trip", 0) }
    var web by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var loadError by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var frame by remember { mutableStateOf(GuidanceFrame.load(context)) }
    var nativeVisible by remember { mutableStateOf(false) }
    var prepared by remember { mutableStateOf<Pair<Route, Needs>?>(null) }
    var navigationRoute by remember { mutableStateOf<Route?>(null) }
    var preparedAt by remember { mutableLongStateOf(0L) }
    var routeEpoch by remember { mutableLongStateOf(0L) }
    var preparedOwner by remember { mutableStateOf<String?>(null) }
    var authOwner by remember { mutableStateOf<String?>(null) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    var pendingTrip by remember { mutableStateOf<JSONObject?>(null) }
    var tripBusy by remember { mutableStateOf(false) }
    var tripError by remember { mutableStateOf<String?>(null) }
    var geoRequest by remember { mutableStateOf<Pair<String, GeolocationPermissions.Callback>?>(null) }
    var startAfterPermission by remember { mutableStateOf(false) }
    var fileRequest by remember { mutableStateOf<ValueCallback<Array<Uri>>?>(null) }
    val cameraFile = remember { File(File(context.cacheDir, "equipment").apply { mkdirs() }, "hybrid-photo.jpg") }
    val cameraUri = remember { FileProvider.getUriForFile(context, context.packageName + ".equipment-photos", cameraFile) }
    val clerkConnection by ClerkAccounts.connection.collectAsState()
    val liveSession = frame.session.isNotEmpty() && frame.isFresh(now) && frame.mode in setOf("live", "paused")

    fun stop(keepSummary: Boolean = false) {
        routeEpoch++
        routePrefs.edit().putBoolean("finishRequested", keepSummary).apply()
        GuidanceSpeech.end()
        context.stopService(Intent(context, GuidanceService::class.java))
        publishGuidance(context, GuidanceFrame(sentAt = System.currentTimeMillis(), note = "Prowadzenie zakończone"))
        frame = GuidanceFrame.load(context)
        prepared = null; navigationRoute = null; preparedAt = 0; nativeVisible = false; startAfterPermission = false
        // The service already holds the active route. Remove the persisted private copy.
        routePrefs.edit().remove("json").remove("profile").apply()
        if (!keepSummary) { tripPrefs.edit().remove("pending").apply(); pendingTrip = null }
    }
    fun start() {
        val value = prepared ?: return
        if (Clerk.user?.id != preparedOwner || System.currentTimeMillis() - preparedAt !in 0..300_000) {
            prepared = null; error = "Plan jest nieaktualny. Wróć do mapy i otwórz prowadzenie ponownie."; return
        }
        error = null
        routePrefs.edit().putString("json", value.first.raw).putString("profile", value.second.profileJson().toString())
            .putString("hybridOwner", preparedOwner).putBoolean("finishRequested", false).apply()
        try {
            context.startForegroundService(Intent(context, GuidanceService::class.java).putExtra("voiceEnabled",
                !context.getSharedPreferences("guidance-voice", 0).getBoolean("muted", false)))
            prepared = null
        } catch (_: Exception) { error = "Nie udało się rozpocząć prowadzenia. Sprawdź uprawnienia lokalizacji i spróbuj ponownie." }
    }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
        val allowed = context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        geoRequest?.let { (origin, callback) -> callback.invoke(origin, allowed, false) }; geoRequest = null
        if (startAfterPermission) {
            startAfterPermission = false
            if (allowed) start() else error = "Nie udostępniono dokładnej lokalizacji. Nadal możesz korzystać z mapy i planu."
        }
    }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        fileRequest?.onReceiveValue(uris.filter { it.scheme == "content" }.take(5).toTypedArray().takeIf { it.isNotEmpty() })
        fileRequest = null
    }
    val camera = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { taken ->
        fileRequest?.onReceiveValue(if (taken) arrayOf(cameraUri) else null); fileRequest = null
    }
    fun requestStart() {
        val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
        if (permissions.all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }) start()
        else { startAfterPermission = true; permission.launch(permissions.toTypedArray()) }
    }
    fun external(url: String) {
        if (policy.external(url)) runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)) }
            .onFailure { error = "Nie znaleziono aplikacji do otwarcia tego odnośnika." }
    }
    fun authChanged() { web?.evaluateJavascript("window.dispatchEvent(new Event('miasto-auth-changed'))", null) }
    suspend fun request(method: String, params: JSONObject): Any? = when (method) {
        "local.import" -> {
            // Import only explicitly guest-owned storage. Account caches never enter local web data.
            val result = JSONObject()
            val mobility = MobilityState(context, null); mobility.load()
            if (mobility.items.isNotEmpty()) result.put("przejscie-guest-presets-v1", JSONObject()
                .put("presets", JSONArray(mobility.items.map { it.json() })).put("activePresetId", mobility.activeId ?: JSONObject.NULL)
                .put("usesCar", mobility.usesCar).put("version", mobility.version))
            val favorites = FavoriteStore(context).list()
            if (favorites.isNotEmpty()) result.put("przejscie-guest-favorites", JSONArray(favorites.map {
                JSONObject().put("id", it.id).put("label", it.label).put("point", it.point.favoriteJson())
                    .put("createdAt", it.createdAt).put("updatedAt", it.updatedAt)
            }))
            if (context.getSharedPreferences("needs", 0).getBoolean("onboardingDone", false)) result.put("przejscie-onboarding", "skipped")
            result
        }
        "auth.status" -> {
            ClerkAccounts.initialize(context)
            JSONObject().put("ready", ClerkAccounts.connection.value == ClerkConnection.Ready).put("userId", Clerk.user?.id ?: JSONObject.NULL)
        }
        "auth.token" -> {
            val id = Clerk.user?.id
            val expected = if (params.isNull("userId")) null else params.optString("userId").takeIf { it.isNotEmpty() }
            require(id == expected) { "Konto zmieniło się. Otwórz ekran ponownie." }
            if (id == null) null else ClerkAccounts.accessToken("clerk:$id")
        }
        "auth.signIn" -> { ClerkAccounts.authenticate(params.optBoolean("register")); authChanged(); true }
        "auth.signOut" -> {
            stop()
            ClerkAccounts.signOut(Clerk.user?.id?.let { "clerk:$it" }); authChanged(); true
        }
        "guidance.prepare" -> {
            val owner = Clerk.user?.id
            val epoch = routeEpoch
            val parsed = withContext(Dispatchers.Default) { validateHybridRoute(params) }
            require(Clerk.user?.id == owner && epoch == routeEpoch) { "Plan lub konto zmieniły się. Otwórz plan ponownie." }
            stop()
            prepared = parsed; navigationRoute = parsed.first; preparedAt = System.currentTimeMillis(); preparedOwner = owner
            error = null; nativeVisible = true
            true
        }
        "guidance.invalidate" -> { stop(); true }
        "document.print" -> {
            val view = web ?: throw IllegalStateException("Otwórz plan ponownie.")
            context.getSystemService(android.print.PrintManager::class.java).print("Miasto w zasięgu - plan trasy", view.createPrintDocumentAdapter("Plan trasy"), null)
            true
        }
        else -> throw IllegalArgumentException("Nieobsługiwana funkcja aplikacji.")
    }
    LaunchedEffect(Unit) { ClerkAccounts.initialize(context) }
    // A network retry can initialize Clerk after the first launch failed.
    // Start observing that recovered session as well as the initial one.
    LaunchedEffect(clerkConnection) {
        if (clerkConnection == ClerkConnection.Ready) {
            var first = true
            Clerk.userFlow.distinctUntilChangedBy { it?.id }.collect { user ->
                val owner = user?.id
                if ((!first && authOwner != owner) || (routePrefs.contains("hybridOwner") && routePrefs.getString("hybridOwner", null) != owner)) stop()
                if (first && frame.isFresh(System.currentTimeMillis()) && frame.mode in setOf("live", "paused")) nativeVisible = true
                first = false; authOwner = owner; authChanged()
            }
        } else if (clerkConnection == ClerkConnection.Unavailable && routePrefs.getString("hybridOwner", null) != null) stop()
    }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis(); frame = GuidanceFrame.load(context)
            if (navigationRoute == null && frame.isFresh(now) && frame.mode in setOf("live", "paused") &&
                routePrefs.getString("hybridOwner", null) == Clerk.user?.id) {
                navigationRoute = routePrefs.getString("json", null)?.let { runCatching { Api.parseRoute(JSONObject(it)) }.getOrNull() }
            }
            if (pendingTrip == null && routePrefs.getString("hybridOwner", null) == Clerk.user?.id) {
                pendingTrip = tripPrefs.getString("pending", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
            }
            delay(1_000)
        }
    }
    DisposableEffect(Unit) {
        onDispose {
            geoRequest?.let { (origin, callback) -> callback.invoke(origin, false, false) }
            fileRequest?.onReceiveValue(null)
            cameraFile.delete()
            web?.stopLoading(); web?.destroy(); web = null
        }
    }
    BackHandler(nativeVisible || canGoBack) {
        if (nativeVisible) nativeVisible = false else web?.goBack()
    }
    Box(Modifier.fillMaxSize().safeDrawingPadding().imePadding()) {
      Column(Modifier.fillMaxSize()) {
        if (!nativeVisible && liveSession) Surface(color = MaterialTheme.colorScheme.surface) {
            FilledTonalButton(onClick = { nativeVisible = true }, modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp).heightIn(min = 48.dp)) {
                Text("Wróć do prowadzenia GPS")
            }
        }
        AndroidView(modifier = Modifier.fillMaxWidth().weight(1f), factory = { ctx ->
            WebView(ctx).apply {
                web = this
                // A wrap-content WebView reports a zero dynamic viewport for modal CSS.
                layoutParams = android.view.ViewGroup.LayoutParams(android.view.ViewGroup.LayoutParams.MATCH_PARENT, android.view.ViewGroup.LayoutParams.MATCH_PARENT)
                setBackgroundColor(0xfff5f4ed.toInt())
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                settings.useWideViewPort = true
                settings.loadWithOverviewMode = true
                settings.allowFileAccess = false
                settings.allowContentAccess = false
                settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                settings.mediaPlaybackRequiresUserGesture = true
                settings.setSupportMultipleWindows(true)
                settings.javaScriptCanOpenWindowsAutomatically = false
                settings.textZoom = (ctx.resources.configuration.fontScale * 100).toInt()
                CookieManager.getInstance().setAcceptThirdPartyCookies(this, false)
                // Debugging is limited to the separate validation package.
                WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG && BuildConfig.APPLICATION_ID.endsWith(".validation"))
                if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
                    WebViewCompat.addWebMessageListener(this, "MiastoNative", setOf(policy.origin)) { _, message, source, main, reply ->
                        if (!main || !policy.owns(source.toString())) return@addWebMessageListener
                        val data = message.data ?: return@addWebMessageListener
                        if (data.length > 2_000_000) return@addWebMessageListener
                        val body = runCatching { JSONObject(data) }.getOrNull() ?: return@addWebMessageListener
                        val id = body.optString("id").takeIf { it.length in 1..100 } ?: return@addWebMessageListener
                        scope.launch {
                            val response = JSONObject().put("id", id)
                            try {
                                require(body.optInt("version") == 1) { "Zaktualizuj aplikację." }
                                response.put("result", request(body.optString("method"), body.optJSONObject("params") ?: JSONObject()) ?: JSONObject.NULL)
                            } catch (e: Exception) {
                                if (e is CancellationException) throw e
                                response.put("error", e.message ?: "Nie udało się wykonać operacji. Spróbuj ponownie.")
                            }
                            reply.postMessage(response.toString())
                        }
                    }
                } else { loadError = "Zaktualizuj Android System WebView, aby otworzyć aplikację."; loading = false; return@apply }
                webViewClient = object : WebViewClient() {
                    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                        val asset = policy.asset(request.url.toString()) ?: return null
                        if (request.method != "GET") return null
                        val mime = when (asset.substringAfterLast('.')) {
                            "html" -> "text/html"; "js" -> "text/javascript"; "css" -> "text/css"; "svg" -> "image/svg+xml"
                            "json", "webmanifest" -> "application/json"; "woff2" -> "font/woff2"; "wasm" -> "application/wasm"
                            else -> MimeTypeMap.getSingleton().getMimeTypeFromExtension(asset.substringAfterLast('.')) ?: "application/octet-stream"
                        }
                        return try { WebResourceResponse(mime, "UTF-8", 200, "OK", mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff"), ctx.assets.open(asset)) }
                        catch (_: Exception) { WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream("Brak pliku aplikacji. Zainstaluj aktualną wersję.".toByteArray())) }
                    }
                    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                        if (!request.isForMainFrame) return false
                        val url = request.url.toString()
                        if (policy.page(url)) return false
                        if (request.hasGesture() || policy.systemCheckout(url)) external(url)
                        return true
                    }
                    override fun onPageStarted(view: WebView, url: String, icon: android.graphics.Bitmap?) { loading = true; loadError = null }
                    override fun onPageFinished(view: WebView, url: String) { loading = false; canGoBack = view.canGoBack() }
                    override fun doUpdateVisitedHistory(view: WebView, url: String, reload: Boolean) { canGoBack = view.canGoBack() }
                    override fun onReceivedError(view: WebView, request: WebResourceRequest, failure: WebResourceError) {
                        if (request.isForMainFrame) { loading = false; loadError = "Nie udało się otworzyć aplikacji. Spróbuj ponownie." }
                    }
                    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, sslError: android.net.http.SslError) { handler.cancel() }
                }
                webChromeClient = object : WebChromeClient() {
                    override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                        if (!policy.owns(origin)) { callback.invoke(origin, false, false); return }
                        if (context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) callback.invoke(origin, true, false)
                        else {
                            geoRequest?.let { (old, cb) -> cb.invoke(old, false, false) }
                            geoRequest = origin to callback
                            permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                        }
                    }
                    override fun onShowFileChooser(view: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                        fileRequest?.onReceiveValue(null); fileRequest = callback
                        try { if (params.isCaptureEnabled) camera.launch(cameraUri) else files.launch(arrayOf("image/*")) }
                        catch (_: Exception) { fileRequest?.onReceiveValue(null); fileRequest = null; error = "Nie udało się otworzyć aparatu lub zdjęć. Spróbuj wybrać plik z galerii." }
                        return true
                    }
                    override fun onCreateWindow(view: WebView, dialog: Boolean, gesture: Boolean, result: android.os.Message): Boolean {
                        if (!gesture) return false
                        val popup = WebView(context)
                        popup.webViewClient = object : WebViewClient() {
                            override fun shouldOverrideUrlLoading(v: WebView, request: WebResourceRequest): Boolean {
                                external(request.url.toString()); popup.destroy(); return true
                            }
                        }
                        (result.obj as WebView.WebViewTransport).webView = popup; result.sendToTarget()
                        return true
                    }
                }
                loadUrl("${policy.origin}/app")
            }
        }, update = { it.visibility = if (nativeVisible) View.INVISIBLE else View.VISIBLE })
      }
        if (loading && !nativeVisible) LinearProgressIndicator(Modifier.fillMaxWidth())
        if (!nativeVisible && (loadError != null || error != null)) Surface(modifier = Modifier.align(Alignment.Center).padding(24.dp), shape = RoundedCornerShape(24.dp), tonalElevation = 8.dp) {
            Column(Modifier.padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                Text(loadError ?: error.orEmpty(), modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
                Button(onClick = { if (loadError != null) web?.reload(); loadError = null; error = null }) { Text(if (loadError != null) "Spróbuj ponownie" else "Zamknij") }
            }
        }
        if (nativeVisible) NavigationScreen(navigationRoute, frame, now, prepared != null, error,
            onBack = { nativeVisible = false }, onStart = { requestStart() }, onStop = { stop(true) })
    }
    pendingTrip?.let { candidate ->
        TripDialog(candidate, authOwner != null && routePrefs.getString("hybridOwner", null) == authOwner, tripBusy, tripError,
            onDismiss = { pendingTrip = null; tripPrefs.edit().remove("pending").apply(); tripError = null },
            onSend = { completed, feedback -> scope.launch {
                tripBusy = true; tripError = null
                try {
                    val owner = authOwner ?: error("Zaloguj się ponownie.")
                    require(owner == routePrefs.getString("hybridOwner", null)) { "Konto zmieniło się." }
                    check(candidate.optBoolean("eligible") && !candidate.optBoolean("simulated"))
                    val summary = JSONObject().put("distanceM", candidate.getDouble("distanceM")).put("durationS", candidate.getLong("durationS"))
                        .put("profile", candidate.getJSONObject("profile")).put("consent", true).put("completed", completed).put("feedback", feedback)
                    candidate.optString("routeId").takeIf { it.isNotBlank() }?.let { summary.put("routeId", it) }
                    Api.request("/api/trips", summary, token = "clerk:$owner")
                    pendingTrip = null; tripPrefs.edit().remove("pending").apply()
                } catch (e: Exception) { if (e is CancellationException) throw e; tripError = e.message }
                finally { tripBusy = false }
            } })
    }
}
