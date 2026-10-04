package pl.przejscie.phone

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.*
import org.json.JSONObject
import java.net.URLEncoder

@Composable internal fun Details(label: String, content: @Composable ColumnScope.() -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    TextButton(onClick = { expanded = !expanded }, modifier = Modifier.heightIn(min = 48.dp)) { Text(if (expanded) "Ukryj: $label" else label) }
    if (expanded) Column(verticalArrangement = Arrangement.spacedBy(10.dp), content = content)
}

@Composable internal fun LocationInput(label: String, entry: LocationEntry, enabled: Boolean, account: Account?, onChange: (LocationEntry) -> Unit) {
    var suggestions by remember(entry.key) { mutableStateOf(emptyList<ChosenLocation>()) }
    var loading by remember(entry.key) { mutableStateOf(false) }
    var failure by remember(entry.key) { mutableStateOf(false) }
    var completedQuery by remember(entry.key) { mutableStateOf<String?>(null) }
    var retry by remember(entry.key) { mutableIntStateOf(0) }
    val keyboard = LocalSoftwareKeyboardController.current
    fun choose(location: ChosenLocation) {
        onChange(entry.choose(location))
        suggestions = emptyList()
        keyboard?.hide()
    }
    LaunchedEffect(entry.text, entry.chosen, retry) {
        suggestions = emptyList(); failure = false; completedQuery = null
        if (!entry.confirmed && entry.text.trim().length >= 2) {
            loading = true
            try { delay(400); suggestions = Api.locations(entry.text.trim()); completedQuery = entry.text.trim() }
            catch (e: Exception) { if (e is CancellationException) throw e; failure = true }
            finally { loading = false }
        } else loading = false
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(entry.text, { onChange(entry.edit(it)) }, label = { Text(label) }, placeholder = { Text("Ulica i numer lub nazwa miejsca") },
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label }, enabled = enabled, singleLine = true)
        FavoritesControl(label, entry, account, enabled, ::choose)
        if (!entry.confirmed && loading) LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = "Szukam adresu: $label" })
        else if (!entry.confirmed && failure) {
            Text("Nie udało się pobrać podpowiedzi. Sprawdź połączenie i spróbuj ponownie.", modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            OutlinedButton(onClick = { retry++ }, enabled = enabled, modifier = Modifier.heightIn(min = 48.dp)) { Text("Spróbuj ponownie") }
        }
        else if (!entry.confirmed && completedQuery == entry.text.trim() && suggestions.isEmpty()) Text("Brak podpowiedzi. Dodaj numer budynku albo inną nazwę.", style = MaterialTheme.typography.bodySmall)
        // Keep the selected suggestion's semantics node alive. Removing the node under
        // TalkBack's focus makes Android recover focus at an unrelated earlier field.
        val visibleLocations = if (entry.confirmed) listOfNotNull(entry.chosen) else suggestions
        visibleLocations.forEach { location -> key(location.id) {
            val choiceFocus = remember { FocusRequester() }
            OutlinedCard(onClick = {
                // This user action leaves text editing and keeps input focus on the
                // same surviving card, rather than restoring the previous text field.
                choiceFocus.requestFocus()
                if (!entry.confirmed) choose(location)
            }, enabled = enabled, modifier = Modifier.fillMaxWidth().focusRequester(choiceFocus).semantics {
                selected = entry.confirmed
                role = Role.RadioButton
            }) {
                Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(location.label, fontWeight = FontWeight.SemiBold)
                    Text(when (location.kind) { "address" -> "Adres"; "street" -> "Ulica · położenie przybliżone"; else -> "Miejsce" }, style = MaterialTheme.typography.bodySmall)
                    if (location.disambiguationHint.isNotBlank()) Text(location.disambiguationHint, style = MaterialTheme.typography.bodySmall)
                    if (entry.confirmed) Text(if (location.precision == "approximate") "Wybrano przybliżone położenie. Sprawdź wejście." else "Adres wybrany", style = MaterialTheme.typography.bodySmall, color = Ink)
                }
            }
        } }
        if (entry.confirmed) {
            Details("Informacje o punkcie: $label") { Text(entry.chosen?.source ?: ""); Text("${entry.chosen?.point?.lat}, ${entry.chosen?.point?.lon}") }
        }
    }
}

@Composable internal fun AccountScreen(account: Account?, busy: Boolean,
    authReady: Boolean, onRetry: () -> Unit, onAuthenticate: (Boolean) -> Unit,
    onRefresh: () -> Unit, onLogout: () -> Unit, onProfile: () -> Unit) {
    Title("Twoje konto")
    if (account != null) {
        Text(account.name.ifBlank { account.email }, style = MaterialTheme.typography.titleLarge)
        Text(account.email)
        Text("To samo konto działa w aplikacji i przeglądarce. Profil pobierasz i zapisujesz wtedy, gdy tego potrzebujesz.")
        Button(onClick = onProfile, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Otwórz profil") }
        OutlinedButton(onClick = onRefresh, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Pobierz profil z konta") }
        OutlinedButton(onClick = onLogout, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Wyloguj z telefonu") }
    } else {
        Text("Zaloguj się, aby korzystać z tych samych potrzeb na telefonie i w przeglądarce. Po zalogowaniu pobierzemy profil z konta. Możesz też dalej korzystać bez konta.")
        if (authReady) {
            Button(onClick = { onAuthenticate(false) }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Zaloguj się") }
            OutlinedButton(onClick = { onAuthenticate(true) }, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Utwórz konto") }
            Text("Logowanie otworzy się w przeglądarce. Wybierz jedną z metod dostępnych w Clerk, a potem wróć do aplikacji.", style = MaterialTheme.typography.bodySmall)
        } else {
            Notice("Logowanie jest obecnie niedostępne. Możesz dalej planować trasy i zapisywać potrzeby na tym urządzeniu.")
            OutlinedButton(onClick = onRetry, enabled = !busy, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) { Text("Spróbuj ponownie") }
        }
    }
}

@Composable internal fun TripDialog(candidate: JSONObject, signedIn: Boolean, busy: Boolean, error: String?, onDismiss: () -> Unit, onSend: (Boolean, String) -> Unit) {
    var consent by remember(candidate) { mutableStateOf(false) }
    var completed by remember(candidate) { mutableStateOf(false) }
    var feedback by remember(candidate) { mutableStateOf<String?>(null) }
    val eligible = candidate.optBoolean("eligible") && !candidate.optBoolean("simulated")
    AlertDialog(onDismissRequest = { if (!busy) onDismiss() }, title = { Text("Zakończony przejazd") }, text = {
        Column(Modifier.verticalScroll(remember { ScrollState(0) }), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            Text("Zarejestrowano około ${candidate.optDouble("distanceM").toInt()} m w ${candidate.optLong("durationS")} s.")
            if (!eligible) Text(if (candidate.optBoolean("simulated")) "To była sesja pokazowa. Nie zapiszemy jej jako rzeczywistego przejazdu." else "Za mało dokładnych danych o ruchu. Nie zapiszemy tej sesji jako przejazdu.")
            else if (!signedIn) Text("Aby zapisywać podsumowania, zaloguj się przed następnym przejazdem. Ta sesja pozostaje tylko na telefonie do zamknięcia tego okna.")
            else {
                Text("Możesz dobrowolnie przekazać podsumowanie do konta. Obejmuje dystans, czas, profil potrzeb i Twoją ocenę. Nie wysyłamy śladu lokalizacji.")
                Row { Checkbox(completed, { completed = it }, modifier = Modifier.semantics { contentDescription = "Dotarłem do celu" }); Text("Dotarłem do celu", Modifier.padding(top = 12.dp)) }
                listOf("passable" to "Przejazd był możliwy", "difficult" to "Po drodze były trudności", "blocked" to "Nie udało się przejechać").forEach { (value, label) ->
                    Row { RadioButton(feedback == value, { feedback = value }, modifier = Modifier.semantics { contentDescription = label }); Text(label, Modifier.padding(top = 12.dp)) }
                }
                Row { Checkbox(consent, { consent = it }, modifier = Modifier.semantics { contentDescription = "Zgadzam się na zapis tego podsumowania na koncie" }); Text("Zgadzam się na zapis tego podsumowania na koncie", Modifier.padding(top = 12.dp)) }
            }
        }
    }, confirmButton = {
        if (eligible && signedIn) TextButton(onClick = { onSend(completed, feedback!!) }, enabled = consent && feedback != null && !busy) { Text("Zapisz podsumowanie") }
        else TextButton(onClick = onDismiss, enabled = !busy) { Text("Zamknij") }
    }, dismissButton = { if (eligible && signedIn) TextButton(onClick = onDismiss, enabled = !busy) { Text("Nie zapisuj") } })
}

@Composable internal fun WheelchairSearch() {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf(emptyList<JSONObject>()) }
    var status by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope(); val uri = LocalUriHandler.current
    fun search(web: Boolean) { scope.launch {
        loading = true; status = null
        try {
            if (web) {
                var job = Api.request("/api/wheelchairs/search", JSONObject().put("query", query.trim()))
                var remaining = 90
                while (job.optString("status") == "searching" && remaining-- > 0) {
                    status = "Sprawdzamy dokumentację modelu…"; delay(2_000)
                    job = Api.request("/api/wheelchairs/search/" + URLEncoder.encode(job.getString("id"), "UTF-8"))
                }
                status = when (job.optString("status")) { "complete" -> "Znaleziono informacje. Sprawdź wariant i własny pomiar."; "not_found" -> "Nie znaleziono potwierdzonych informacji o tym modelu."; "searching" -> "Wyszukiwanie trwa dłużej. Spróbuj później."; else -> "Nie udało się sprawdzić modelu. Spróbuj ponownie." }
                results = listOfNotNull(job.optJSONObject("wheelchair"))
            } else {
                val a = Api.request("/api/wheelchairs?q=" + URLEncoder.encode(query.trim(), "UTF-8")).getJSONArray("wheelchairs")
                results = (0 until a.length()).map { a.getJSONObject(it) }
                status = if (results.isEmpty()) "Brak modelu w katalogu. Możesz sprawdzić dokumentację w sieci." else null
            }
        } catch (e: Exception) { if (e is CancellationException) throw e; status = "Nie udało się pobrać informacji o modelu." }
        finally { loading = false }
    } }
    HorizontalDivider(); Text("Wymiary Twojego modelu", style = MaterialTheme.typography.titleLarge)
    Text("Sprawdź dokumentację pomocniczo. Wariant i wyposażenie mogą zmieniać szerokość. Wynik nie zastąpi własnego pomiaru.")
    OutlinedTextField(query, { query = it }, label = { Text("Model wózka") }, modifier = Modifier.fillMaxWidth(), enabled = !loading)
    OutlinedButton(onClick = { search(false) }, enabled = !loading && query.trim().length >= 2, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Szukaj w katalogu") }
    Text("Przy wyszukiwaniu w sieci przekazujemy tylko wpisaną nazwę modelu.", style = MaterialTheme.typography.bodySmall)
    OutlinedButton(onClick = { search(true) }, enabled = !loading && query.trim().length >= 2, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Sprawdź dokumentację w sieci") }
    if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
    status?.let { Text(it) }
    results.forEach { result ->
        Text(result.optString("name"), fontWeight = FontWeight.SemiBold)
        Text(result.optString("widthLabel", "Wymiar wymaga potwierdzenia"))
        Text("Sprawdź wariant i zmierz swój zestaw. Ustawienia profilu pozostają bez zmian.", style = MaterialTheme.typography.bodySmall)
        Details("Dokumentacja: ${result.optString("name")}") {
            Text(result.optString("variant")); Text(result.optString("notes"))
            val sources = result.optJSONArray("sources")
            if (sources != null) for (i in 0 until sources.length()) {
                val s = sources.getJSONObject(i); val url = s.optString("url")
                if (url.startsWith("https://")) TextButton(onClick = { uri.openUri(url) }) { Text(s.optString("title", "Źródło")) }
            }
            val url = result.optString("manufacturerSourceUrl", result.optString("sourceUrl"))
            if (url.startsWith("https://")) TextButton(onClick = { uri.openUri(url) }) { Text("Otwórz źródło wymiaru") }
        }
    }
}
