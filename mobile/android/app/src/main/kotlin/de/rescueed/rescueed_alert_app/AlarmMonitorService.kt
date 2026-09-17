package de.rescueed.rescueed_alert_app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import android.os.VibrationEffect
import android.os.Vibrator
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit

/** Polls only while a helper has explicitly joined an active event. */
class AlarmMonitorService : Service() {
    companion object {
        const val ACTION_START = "de.rescueed.alert.MONITOR_START"
        const val ACTION_ACKNOWLEDGED = "de.rescueed.alert.MONITOR_ACKNOWLEDGED"
        private const val READY_CHANNEL = "rescueed_alarm_readiness_v1"
        private const val ALERT_CHANNEL = "rescueed_alarm_active_v1"
        private const val READY_NOTIFICATION = 701

        @Volatile private var active: AlarmMonitorService? = null
        fun acknowledge(alertId: String) { active?.acknowledgeLocal(alertId) }
    }

    private val lock = Any()
    private val executor = Executors.newSingleThreadScheduledExecutor()
    private val pending = mutableSetOf<String>()
    private val locallyAcknowledged = mutableSetOf<String>()
    private var polling: ScheduledFuture<*>? = null
    private var baseUrl = ""
    private var eventId = ""
    private var token = ""
    private var tone = "piep_piep"
    private var player: MediaPlayer? = null
    private var signalling = false
    private val manager by lazy { getSystemService(NOTIFICATION_SERVICE) as NotificationManager }

    override fun onCreate() {
        super.onCreate()
        active = this
        createChannels()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_ACKNOWLEDGED) {
            intent.getStringExtra("alertId")?.let(::acknowledgeLocal)
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_START) {
            stopSelf()
            return START_NOT_STICKY
        }
        val requestedBase = intent.getStringExtra("baseUrl")?.trimEnd('/') ?: ""
        val requestedEvent = intent.getStringExtra("eventId") ?: ""
        val requestedToken = intent.getStringExtra("token") ?: ""
        val requestedTone = intent.getStringExtra("tone") ?: "piep_piep"
        val uri = try { URI(requestedBase) } catch (_: Exception) { null }
        val local = uri?.host in setOf("localhost", "127.0.0.1", "10.0.2.2")
        if (requestedEvent.isBlank() || requestedToken.isBlank() ||
            uri?.scheme != "https" && !(uri?.scheme == "http" && local)) {
            stopSelf()
            return START_NOT_STICKY
        }

        val sameSession = baseUrl == requestedBase && eventId == requestedEvent && token == requestedToken
        if (!sameSession) synchronized(lock) {
            pending.forEach { manager.cancel(notificationId(it)) }
            pending.clear()
            locallyAcknowledged.clear()
            stopSignal()
        }
        baseUrl = requestedBase
        eventId = requestedEvent
        token = requestedToken
        tone = requestedTone
        val readiness = readyNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(READY_NOTIFICATION, readiness, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(READY_NOTIFICATION, readiness)
        }
        polling?.cancel(false)
        polling = executor.scheduleWithFixedDelay(::poll, 0, 5, TimeUnit.SECONDS)
        return START_REDELIVER_INTENT
    }

    private fun createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        manager.createNotificationChannel(NotificationChannel(
            READY_CHANNEL, "Alarmbereitschaft", NotificationManager.IMPORTANCE_LOW
        ).apply { description = "Aktiver Eventzugang – auf neue Alarmierungen warten" })
        manager.createNotificationChannel(NotificationChannel(
            ALERT_CHANNEL, "Aktive Alarmierungen", NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Alarmierungen des zugeteilten Sanitätsmittels"
            setSound(null, null) // The selected tone loops separately until acknowledgement.
            enableVibration(true)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        })
    }

    private fun openApp(): PendingIntent = PendingIntent.getActivity(
        this, 0, Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    private fun builder(channel: String): Notification.Builder =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(this, channel)
        else @Suppress("DEPRECATION") Notification.Builder(this)

    private fun readyNotification(): Notification = builder(READY_CHANNEL)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("RescueEd Alert · Alarmbereitschaft")
        .setContentText("Aktiver Eventzugang – Alarmierungen werden überwacht")
        .setContentIntent(openApp())
        .setOngoing(true)
        .build()

    private fun alertNotification(): Notification = builder(ALERT_CHANNEL)
        .setSmallIcon(R.mipmap.ic_launcher)
        .setContentTitle("RescueEd Alert · ALARM")
        .setContentText("Dein Sanitätsmittel wurde alarmiert. Zum Bestätigen öffnen.")
        .setContentIntent(openApp())
        .setCategory(Notification.CATEGORY_ALARM)
        .setPriority(Notification.PRIORITY_MAX)
        .setVisibility(Notification.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .build()

    private fun notificationId(alertId: String) = 1000 + (alertId.hashCode() and 0x7fffffff) % 1000000

    private fun poll() {
        if (baseUrl.isBlank() || eventId.isBlank() || token.isBlank()) return
        var connection: HttpURLConnection? = null
        try {
            val uri = URI("$baseUrl/api/mobile/session").resolve(
                "/api/mobile/session?eventId=${java.net.URLEncoder.encode(eventId, "UTF-8")}")
            connection = URL(uri.toString()).openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("X-RescueEd-Client", "mobile")
            when (connection.responseCode) {
                401, 404 -> { stopSelf(); return }
                200 -> Unit
                else -> return
            }
            val payload = connection.inputStream.bufferedReader().use { it.readText() }
            val rows = JSONObject(payload).optJSONArray("alerts") ?: return
            val current = mutableSetOf<String>()
            val stillUnacknowledged = mutableSetOf<String>()
            for (index in 0 until rows.length()) {
                val row = rows.optJSONObject(index) ?: continue
                if (!row.isNull("acknowledgedAt")) continue
                val id = row.optString("id")
                if (id.isNotBlank()) stillUnacknowledged.add(id)
            }
            synchronized(lock) {
                locallyAcknowledged.retainAll(stillUnacknowledged)
                current.addAll(stillUnacknowledged - locallyAcknowledged)
                (pending - current).forEach { manager.cancel(notificationId(it)) }
                (current - pending).forEach { manager.notify(notificationId(it), alertNotification()) }
                pending.clear()
                pending.addAll(current)
                if (pending.isEmpty()) stopSignal() else if (!signalling) startSignal()
            }
        } catch (_: Exception) {
            // Transient network failure: retain an active alarm and retry.
        } finally {
            connection?.disconnect()
        }
    }

    private fun acknowledgeLocal(alertId: String) = synchronized(lock) {
        locallyAcknowledged.add(alertId)
        pending.remove(alertId)
        manager.cancel(notificationId(alertId))
        if (pending.isEmpty()) stopSignal()
    }

    private fun startSignal() {
        signalling = true
        val resource = when (tone) {
            "doodoo" -> R.raw.tone_doodoo
            "reverb" -> R.raw.tone_reverb
            "sirene" -> R.raw.tone_sirene
            "vollalarm" -> R.raw.tone_vollalarm
            "vibration" -> 0
            else -> R.raw.tone_piep_piep
        }
        if (resource != 0) try {
            val descriptor = resources.openRawResourceFd(resource)
            player = MediaPlayer().apply {
                setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                setDataSource(descriptor.fileDescriptor, descriptor.startOffset, descriptor.length)
                isLooping = true
                prepare()
                start()
            }
            descriptor.close()
        } catch (_: Exception) {
            player?.release()
            player = null
        }
        val vibrator = getSystemService(VIBRATOR_SERVICE) as Vibrator
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 500), 0))
        } else {
            @Suppress("DEPRECATION") vibrator.vibrate(longArrayOf(0, 600, 500), 0)
        }
    }

    private fun stopSignal() {
        player?.let { try { it.stop() } catch (_: Exception) {}; it.release() }
        player = null
        signalling = false
        (getSystemService(VIBRATOR_SERVICE) as Vibrator).cancel()
    }

    override fun onDestroy() {
        polling?.cancel(true)
        executor.shutdownNow()
        synchronized(lock) {
            pending.forEach { manager.cancel(notificationId(it)) }
            pending.clear()
            locallyAcknowledged.clear()
            stopSignal()
        }
        token = ""
        active = null
        super.onDestroy()
    }
}
