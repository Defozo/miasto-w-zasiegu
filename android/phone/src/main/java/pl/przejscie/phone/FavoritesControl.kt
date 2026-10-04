package pl.przejscie.phone

import androidx.compose.foundation.ScrollState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.URLEncoder

@Composable internal fun FavoritesControl(field: String, entry: LocationEntry, account: Account?, enabled: Boolean,
    onChoose: (ChosenLocation) -> Unit) {
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val keyboard = LocalSoftwareKeyboardController.current
    val store = remember { FavoriteStore(context) }
    val scope = rememberCoroutineScope()
    val currentAccount by rememberUpdatedState(account)
    var picker by remember { mutableStateOf(false) }
    var savingPoint by remember { mutableStateOf<ChosenLocation?>(null) }
    var name by remember { mutableStateOf("") }
    var items by remember { mutableStateOf(emptyList<Favorite>()) }
    var loading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    var deleting by remember { mutableStateOf<Favorite?>(null) }
    var revision by remember { mutableIntStateOf(0) }
    // Run after the dialog leaves composition: Android can restore the old text-field focus on dismissal.
    LaunchedEffect(picker, savingPoint) {
        if (!picker && savingPoint == null) { focus.clearFocus(force = true); keyboard?.hide() }
    }
    // A changed session must never expose another account's list or complete its action in this UI.
    LaunchedEffect(account?.token) { picker = false; savingPoint = null; deleting = null; items = emptyList(); error = null; message = null }
    LaunchedEffect(picker, account?.token, revision) {
        if (!picker) return@LaunchedEffect
        val session = account; items = emptyList(); error = null; loading = true
        try {
            val result = if (session == null) store.list() else {
                val a = Api.request("/api/favorites", token = session.token).getJSONArray("favorites")
                (0 until a.length()).map { favoriteFromJson(a.getJSONObject(it)) }
            }
            if (currentAccount?.token == session?.token) items = result
        } catch (e: Exception) {
            if (e is CancellationException) throw e
            error = if (e is ApiException) e.message else "Nie udało się pobrać zapisanych miejsc. Spróbuj ponownie."
        } finally { loading = false }
    }
    fun mutate(action: suspend (Account?) -> Unit, done: () -> Unit) {
        val session = account
        scope.launch {
            loading = true; error = null
            try {
                action(session)
                if (currentAccount?.token == session?.token) done()
            } catch (e: Exception) {
                if (e is CancellationException) throw e
                if (currentAccount?.token == session?.token) error = when (e) {
                    is ApiException -> e.message
                    is IllegalArgumentException -> e.message
                    else -> "Nie udało się zapisać zmiany. Spróbuj ponownie."
                }
            } finally { loading = false }
        }
    }
    Column {
        TextButton(onClick = { focus.clearFocus(force = true); keyboard?.hide(); picker = true; message = null }, enabled = enabled,
            modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Wybierz zapisane miejsce: $field" }) { Text("Wybierz zapisane miejsce") }
        if (entry.confirmed) TextButton(onClick = { focus.clearFocus(force = true); keyboard?.hide(); savingPoint = entry.chosen; name = ""; error = null; message = null }, enabled = enabled,
            modifier = Modifier.heightIn(min = 48.dp).semantics { contentDescription = "Zapisz miejsce: $field" }) { Text("Zapisz to miejsce") }
        message?.let { Text(it, style = MaterialTheme.typography.bodySmall, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
    }
    savingPoint?.let { point -> AlertDialog(onDismissRequest = { if (!loading) savingPoint = null },
        title = { Text("Zapisz miejsce") }, text = {
            Column(Modifier.verticalScroll(remember { ScrollState(0) }), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(point.label)
                Text(if (account == null) "Zapis tylko na tym telefonie. Po zalogowaniu zobaczysz osobną listę konta." else "Zapis na wspólnym koncie. Adres będzie dostępny także w przeglądarce.", style = MaterialTheme.typography.bodySmall)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf("Dom", "Praca").forEach { value -> SuggestionChip(onClick = { name = value }, label = { Text(value) }, enabled = !loading) }
                }
                OutlinedTextField(name, { name = it.take(80) }, label = { Text("Nazwa miejsca") }, placeholder = { Text("np. Dom, Praca, ulubiona kawiarnia") },
                    enabled = !loading, singleLine = true, modifier = Modifier.fillMaxWidth())
                if (point.precision == "approximate") Text("Położenie przybliżone. Zapis nie potwierdza dostępnego wejścia.", style = MaterialTheme.typography.bodySmall)
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            }
        }, confirmButton = { TextButton(onClick = {
            val label = FavoriteRules.label(name)
            mutate({ session ->
                if (session == null) store.add(label, point)
                else Api.request("/api/favorites", JSONObject().put("label", label).put("point", point.favoriteJson()).put("expectedUserId", session.id), token = session.token)
            }) { savingPoint = null; message = "Miejsce zapisane: $label." }
        }, enabled = !loading && FavoriteRules.validLabel(name)) { Text("Zapisz miejsce") } },
        dismissButton = { TextButton(onClick = { savingPoint = null }, enabled = !loading) { Text("Anuluj") } }) }
    if (picker) AlertDialog(onDismissRequest = { if (!loading) { picker = false; deleting = null } },
        title = { Text("Zapisane miejsca: $field") }, text = {
            Column(Modifier.verticalScroll(remember { ScrollState(0) }), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(if (account == null) "Miejsca zapisane na tym telefonie. Po zalogowaniu korzystasz z osobnej listy konta." else "Miejsca z Twojego konta. Wybierz adres dla pola „$field”.", style = MaterialTheme.typography.bodySmall)
                if (loading) LinearProgressIndicator(Modifier.fillMaxWidth())
                error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
                if (!loading && error == null && items.isEmpty()) Text("Nie masz jeszcze zapisanych miejsc. Najpierw wybierz adres z podpowiedzi, a potem „Zapisz to miejsce”.")
                items.forEach { item ->
                    OutlinedCard(onClick = { onChoose(item.point); picker = false; deleting = null }, enabled = !loading,
                        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).semantics { contentDescription = "Wybierz ${item.label}: ${item.point.label}" }) {
                        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Text(item.label, fontWeight = FontWeight.SemiBold); Text(item.point.label, style = MaterialTheme.typography.bodySmall)
                            if (item.point.precision == "approximate") Text("Położenie przybliżone", style = MaterialTheme.typography.bodySmall)
                        }
                    }
                    if (deleting?.id == item.id) {
                        Text("Usunąć „${item.label}” z ${if (account == null) "tego telefonu" else "konta"}?")
                        Row {
                            TextButton(onClick = { mutate({ session ->
                                if (session == null) store.remove(item.id)
                                else Api.request("/api/favorites/" + URLEncoder.encode(item.id, "UTF-8"), JSONObject().put("expectedUserId", session.id), method = "DELETE", token = session.token)
                            }) { deleting = null; revision++ } }, enabled = !loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Usuń miejsce") }
                            TextButton(onClick = { deleting = null }, enabled = !loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Anuluj usuwanie") }
                        }
                    } else TextButton(onClick = { deleting = item }, enabled = !loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Usuń: ${item.label}") }
                }
                OutlinedButton(onClick = { deleting = null; revision++ }, enabled = !loading, modifier = Modifier.heightIn(min = 48.dp)) { Text("Odśwież miejsca") }
            }
        }, confirmButton = { TextButton(onClick = { picker = false; deleting = null }, enabled = !loading) { Text("Zamknij") } })
}
