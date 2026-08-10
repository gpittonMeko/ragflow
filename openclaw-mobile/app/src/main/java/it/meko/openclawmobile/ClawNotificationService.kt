package it.meko.openclawmobile

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.CopyOnWriteArrayList

data class NotificationSnapshot(val app: String, val title: String, val text: String, val time: Long)

class ClawNotificationService : NotificationListenerService() {
    companion object {
        private val recent = CopyOnWriteArrayList<NotificationSnapshot>()
        fun recentNotifications(): List<NotificationSnapshot> = recent.take(20)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        val n = sbn?.notification ?: return
        val extras = n.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
        if (title.isBlank() && text.isBlank()) return
        recent.add(0, NotificationSnapshot(sbn.packageName, title, text, sbn.postTime))
        while (recent.size > 20) recent.removeAt(recent.lastIndex)
    }
}
