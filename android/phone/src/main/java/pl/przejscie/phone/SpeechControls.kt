package pl.przejscie.phone

import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.unit.dp

@Composable internal fun SpeechControls() {
    val context = LocalContext.current
    val state by GuidanceSpeech.state.collectAsState()
    if (state.session == null) return
    fun command(action: String) {
        context.startService(Intent(context, GuidanceService::class.java).setAction(action).putExtra("speechSession", state.session))
    }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Instrukcje głosowe", style = MaterialTheme.typography.titleMedium, modifier = Modifier.semantics { heading() })
        Text(state.message, style = MaterialTheme.typography.bodyMedium)
        if (!state.ready) LinearProgressIndicator(Modifier.fillMaxWidth().semantics { contentDescription = "Sprawdzam polski głos" })
        if (state.available) {
            Button(onClick = { command(if (state.enabled) GuidanceSpeech.MUTE else GuidanceSpeech.ENABLE) }, modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                Text(if (state.enabled) "Wycisz głos" else "Włącz głos")
            }
            OutlinedButton(onClick = { command(GuidanceSpeech.REPEAT) }, enabled = state.canRepeat, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Powtórz instrukcję") }
            Text("Głos działa na urządzeniu. Nowe prowadzenie zaczyna się z wyłączonym głosem.", style = MaterialTheme.typography.bodySmall)
        } else if (state.ready) {
            OutlinedButton(onClick = {
                runCatching { context.startActivity(Intent("com.android.settings.TTS_SETTINGS")) }
                    .onFailure { Toast.makeText(context, "Otwórz ustawienia telefonu i wyszukaj zamianę tekstu na mowę.", Toast.LENGTH_LONG).show() }
            }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) { Text("Otwórz ustawienia mowy") }
            TextButton(onClick = { command(GuidanceSpeech.REFRESH) }, modifier = Modifier.heightIn(min = 48.dp)) { Text("Sprawdź polski głos ponownie") }
        }
    }
}
