package pl.przejscie.phone

import android.app.Activity
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.widget.TextView
import java.io.File

/** Explicit emulator test only. Requests competing focus without playing audio. */
class FocusProbeActivity : Activity() {
    private var request: AudioFocusRequest? = null
    private val handler = Handler(Looper.getMainLooper())
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.HARDWARE !in listOf("ranchu", "goldfish") || !File(cacheDir, "tts-probe-enabled").isFile) {
            finish(); return
        }
        setContentView(TextView(this).apply { text = "Test emulatora: przerwanie instrukcji głosowej"; textSize = 24f })
    }
    override fun onResume() {
        super.onResume()
        if (isFinishing) return
        handler.postDelayed({
            val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setOnAudioFocusChangeListener({}, handler).build()
            request = focus
            val result = getSystemService(AudioManager::class.java).requestAudioFocus(focus)
            Log.i("PrzejscieFocusProbe", "request=$result")
            handler.postDelayed({ finish() }, 3_000)
        }, 150)
    }
    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        request?.let { getSystemService(AudioManager::class.java).abandonAudioFocusRequest(it) }
        super.onDestroy()
    }
}
