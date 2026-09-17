package de.rescueed.rescueed_alert_app

import android.content.Intent
import android.app.NotificationManager
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "de.rescueed.alert/monitor")
            .setMethodCallHandler { call, result ->
                when (call.method) {
                    "start" -> {
                        val baseUrl = call.argument<String>("baseUrl")
                        val eventId = call.argument<String>("eventId")
                        val token = call.argument<String>("token")
                        val tone = call.argument<String>("tone") ?: "piep_piep"
                        if (baseUrl.isNullOrBlank() || eventId.isNullOrBlank() || token.isNullOrBlank()) {
                            result.error("INVALID_SESSION", "Aktiver Eventzugang fehlt.", null)
                        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
                            !(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()) {
                            result.error("NOTIFICATIONS_DISABLED", "Benachrichtigungen sind deaktiviert.", null)
                        } else {
                            try {
                                val intent = Intent(this, AlarmMonitorService::class.java).apply {
                                    action = AlarmMonitorService.ACTION_START
                                    putExtra("baseUrl", baseUrl)
                                    putExtra("eventId", eventId)
                                    putExtra("token", token)
                                    putExtra("tone", tone)
                                }
                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) startForegroundService(intent)
                                else startService(intent)
                                result.success(null)
                            } catch (error: Exception) {
                                result.error("MONITOR_START_FAILED", error.message, null)
                            }
                        }
                    }
                    "stop" -> {
                        stopService(Intent(this, AlarmMonitorService::class.java))
                        result.success(null)
                    }
                    "acknowledged" -> {
                        val alertId = call.argument<String>("alertId")
                        if (!alertId.isNullOrBlank()) AlarmMonitorService.acknowledge(alertId)
                        result.success(null)
                    }
                    else -> result.notImplemented()
                }
            }
    }
}
