package fr.asdecoeur.vario12coeur

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity(), SensorEventListener {

    private lateinit var webView: WebView
    private lateinit var sensorManager: SensorManager

    // 0f = pas encore de mesure : le JavaScript l'ignore (plage valide 300 à 1200 hPa).
    @Volatile private var dernierePressionHpa: Float = 0f
    @Volatile private var derniereAccelZ: Float = 0f
    @Volatile private var pressionDisponible: Boolean = false
    @Volatile private var accelDisponible: Boolean = false
    private var notificationsDemandees = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // L'autorisation d'overlay n'est plus demandée au lancement :
        // elle l'est quand on appuie sur le bouton Overlay (voir setOverlayEnabled).

        webView = WebView(this)
        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.allowFileAccess = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webViewClient = WebViewClient()
        val bridge = BaroBridge()
        webView.addJavascriptInterface(bridge, "SuperVarioBridge")
        // Alias conservé pour compatibilité avec d'éventuelles anciennes versions.
        webView.addJavascriptInterface(bridge, "AndroidBaro")
        webView.loadUrl("file:///android_asset/www/index.html")
        setContentView(webView)

        // Capteurs
        sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager

        sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)?.let { pressure ->
            sensorManager.registerListener(this, pressure, SensorManager.SENSOR_DELAY_GAME)
            pressionDisponible = true
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let { accel ->
            sensorManager.registerListener(this, accel, SensorManager.SENSOR_DELAY_GAME)
            accelDisponible = true
        }
    }

    override fun onSensorChanged(event: SensorEvent) {
        when (event.sensor.type) {
            Sensor.TYPE_PRESSURE -> {
                dernierePressionHpa = event.values[0]
            }
            Sensor.TYPE_ACCELEROMETER -> {
                // Axe Y = vertical quand le téléphone est tenu en portrait
                derniereAccelZ = event.values[1]
            }
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    override fun onResume() {
        super.onResume()
        // Retour dans l'appli : si l'overlay était lancé, la page le ferme et réaffiche l'interface.
        webView.evaluateJavascript("window.retourDepuisOverlay && window.retourDepuisOverlay()", null)
        sensorManager.getDefaultSensor(Sensor.TYPE_PRESSURE)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
        sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    override fun onPause() {
        super.onPause()
        sensorManager.unregisterListener(this)
    }

    override fun onDestroy() {
        sensorManager.unregisterListener(this)
        webView.stopLoading()
        webView.destroy()
        super.onDestroy()
    }

    /** Ouvre directement la page d'autorisation de CETTE application (pas la liste de toutes les applis). */
    private fun demanderPermissionOverlay() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:$packageName")
        )
        startActivity(intent)
    }

    /** Android 13+ : sans cette autorisation, la notification du service n'est pas affichée. */
    private fun notificationsAutorisees(): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun demanderPermissionNotifications() {
        requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1001)
    }

    inner class BaroBridge {
        @JavascriptInterface fun getPressure(): Float = if (pressionDisponible) dernierePressionHpa else 0f
        @JavascriptInterface fun getAccelZ(): Float = derniereAccelZ
        @JavascriptInterface fun hasPressureSensor(): Boolean = pressionDisponible
        @JavascriptInterface fun hasAccelSensor(): Boolean = accelDisponible

        /**
         * Démarre/arrête le mode overlay. Appelé depuis le JS.
         * Renvoie true seulement si l'overlay a été lancé (le JS peut alors passer l'appli en arrière-plan).
         */
        @JavascriptInterface
        fun setOverlayEnabled(enabled: Boolean): Boolean {
            val intent = Intent(this@MainActivity, OverlayService::class.java)

            if (!enabled) {
                stopService(intent)
                return false
            }

            // Pas d'autorisation : on ouvre l'écran de réglage et on s'arrête là.
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(this@MainActivity)) {
                runOnUiThread { demanderPermissionOverlay() }
                return false
            }

            // Première fois seulement : on demande l'autorisation des notifications et on
            // s'arrête là (la boîte de dialogue interromprait l'appli). Un second appui lance l'overlay.
            if (!notificationsAutorisees() && !notificationsDemandees) {
                notificationsDemandees = true
                runOnUiThread { demanderPermissionNotifications() }
                return false
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(intent)
            } else {
                startService(intent)
            }
            return true
        }

        /**
         * Position et taille du vario dans la page (pixels CSS) : la fenêtre flottante
         * reprendra exactement cette zone de l'écran.
         */
        @JavascriptInterface
        fun setOverlayBounds(left: Double, top: Double, width: Double, height: Double) {
            val d = resources.displayMetrics.density
            val loc = IntArray(2)
            webView.getLocationOnScreen(loc)
            OverlayService.boundsPx = intArrayOf(
                (loc[0] + left * d).toInt(),
                (loc[1] + top * d).toInt(),
                (width * d).toInt(),
                (height * d).toInt()
            )
        }

        /**
         * Alpha du coloriage Vario (0–100) tel que réglé par le curseur en temps réel.
         * Doit être appelé avant setOverlayEnabled(true).
         */
        @JavascriptInterface
        fun setOverlayAlpha(alpha: Int) {
            OverlayService.alphaColoriage = alpha.coerceIn(0, 100)
        }

        /** Place l'app en arrière-plan pour que l'utilisateur voie l'autre app en dessous */
        @JavascriptInterface
        fun moveToBackground() {
            runOnUiThread {
                moveTaskToBack(true)
            }
        }

        /** Ferme complètement l'activité lorsque le bouton Arrêt est utilisé. */
        @JavascriptInterface
        fun exitApp() {
            runOnUiThread {
                finishAndRemoveTask()
            }
        }
    }
}
