package pl.przejscie.wear

import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.CircleShape
import androidx.wear.compose.material.*
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.wearable.*
import kotlinx.coroutines.delay
import pl.przejscie.shared.GuidanceFrame
import pl.przejscie.shared.ManeuverGlyph

private fun accept(context: android.content.Context, events: DataEventBuffer) {
    for (event in events) if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == "/guidance/current") {
        val next = GuidanceFrame.from(DataMapItem.fromDataItem(event.dataItem).dataMap)
        val previous = GuidanceFrame.load(context)
        // Do not let delayed delivery replace a newer instruction from the phone.
        if (next.sentAt < previous.sentAt) continue
        next.save(context)
        if (next.mode == "live" && next.isFresh(System.currentTimeMillis()) && (next.step != previous.step || next.session != previous.session)) {
            context.getSystemService(Vibrator::class.java).vibrate(VibrationEffect.createOneShot(80, VibrationEffect.DEFAULT_AMPLITUDE))
        }
    }
}

class GuidanceListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) = accept(this, events)
}

class MainActivity : ComponentActivity(), DataClient.OnDataChangedListener {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { Watch() }
    }
    override fun onResume() {
        super.onResume()
        Wearable.getDataClient(this).addListener(this)
        Wearable.getDataClient(this).dataItems.addOnSuccessListener { items ->
            try { for (item in items) if (item.uri.path == "/guidance/current") {
                val frame = GuidanceFrame.from(DataMapItem.fromDataItem(item).dataMap)
                if (frame.sentAt >= GuidanceFrame.load(this).sentAt) frame.save(this)
            } } finally { items.release() }
        }
    }
    override fun onPause() { Wearable.getDataClient(this).removeListener(this); super.onPause() }
    override fun onDataChanged(events: DataEventBuffer) = accept(this, events)
}

@Composable private fun Watch() {
    val context = LocalContext.current
    var frame by remember { mutableStateOf(GuidanceFrame.load(context)) }
    var connected by remember { mutableStateOf(false) }
    var demo by remember { mutableStateOf(false) }
    var demoStep by remember { mutableIntStateOf(0) }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis(); frame = GuidanceFrame.load(context)
            Wearable.getNodeClient(context).connectedNodes.addOnSuccessListener { connected = it.isNotEmpty() }.addOnFailureListener { connected = false }
            delay(2_000)
        }
    }
    val fresh = frame.isFresh(now)
    val active = connected && fresh && frame.mode in listOf("live", "preview")
    LaunchedEffect(active) { if (active) demo = false }
    val instruction = if (demo) listOf("Skręć w prawo", "Jedź prosto", "Cel w pobliżu")[demoStep] else if (active) frame.instruction else "Sprawdź telefon"
    val lime = Color(0xffd7f36b)
    val ink = Color(0xff173c32)
    val scroll = rememberScalingLazyListState(initialCenterItemIndex = 0)
    MaterialTheme(colors = Colors(primary = lime, onPrimary = ink, background = Color.Black, surface = ink, onSurface = Color(0xfff5f4ed))) {
        Scaffold(timeText = { if (!scroll.isScrollInProgress) TimeText() }, positionIndicator = { PositionIndicator(scalingLazyListState = scroll) }) {
            ScalingLazyColumn(state = scroll, autoCentering = null, modifier = Modifier.fillMaxSize().background(Color.Black),
                contentPadding = PaddingValues(horizontal = 22.dp, vertical = 32.dp),
                horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(when { demo -> "POKAZ · BEZ GPS"; active && frame.mode == "preview" -> "PODGLĄD"; active -> "W DRODZE"; frame.mode == "stopped" -> "MIASTO W ZASIĘGU"; !connected -> "BRAK POŁĄCZENIA"; !fresh -> "DANE WYGASŁY"; else -> "GPS WSTRZYMANY" },
                        fontSize = 11.sp, color = lime, textAlign = TextAlign.Center)
                    if (demo || active) Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        ManeuverGlyph(instruction, lime, Modifier.size(38.dp))
                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(if (frame.mode == "preview" && !demo) "ODCINEK" else "ZA OKOŁO", fontSize = 10.sp, color = Color(0xffb8cbbf))
                        Text("${if (demo) listOf(40, 120, 0)[demoStep] else frame.distanceM} m", fontSize = 34.sp, fontWeight = FontWeight.Bold, color = lime)
                        }
                    } else Box(Modifier.size(34.dp).background(ink, CircleShape), contentAlignment = Alignment.Center) {
                        Text("↗", color = lime, fontSize = 22.sp)
                    }
                    Text(if (!active && !demo && frame.mode == "stopped") "Twoja trasa\nna nadgarstku" else instruction,
                        fontSize = 20.sp, lineHeight = 24.sp, fontWeight = FontWeight.SemiBold, textAlign = TextAlign.Center,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite; heading() })
                    }
                }
                if (active && frame.total > 0) item { Text("Manewr ${frame.step} z ${frame.total}", color = Color(0xffb8cbbf), fontSize = 12.sp) }
                item {
                    Text(when { demo -> "Przykładowe manewry. To nie jest trasa."; active -> frame.note; frame.mode == "stopped" -> "Wybierz trasę na telefonie i włącz prowadzenie GPS."; !connected -> "Połącz zegarek z telefonem. Poprzednia instrukcja jest ukryta."; !fresh -> "Instrukcja wygasła. Sprawdź telefon."; else -> frame.note },
                        fontSize = 13.sp, lineHeight = 17.sp, color = Color(0xffc6d3cd), textAlign = TextAlign.Center)
                }
                if (demo) item { Chip(onClick = { demoStep = (demoStep + 1) % 3 }, label = { Text("Następny manewr") }, modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp)) }
                if (!active) item {
                    Chip(onClick = { demo = !demo; demoStep = 0 }, label = { Text(if (demo) "Zakończ pokaz" else "Zobacz pokaz") },
                        colors = ChipDefaults.secondaryChipColors(), modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp))
                }
            }
        }
    }
}
