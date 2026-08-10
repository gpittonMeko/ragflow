package it.meko.openclawmobile

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class ClawAccessibilityService : AccessibilityService() {
    companion object {
        @Volatile private var instance: ClawAccessibilityService? = null

        fun available(): Boolean = instance != null

        fun execute(command: String): String? {
            val service = instance ?: return null
            val text = command.trim()
            val lower = text.lowercase()
            return when {
                lower == "home" || lower == "telefono home" -> {
                    service.performGlobalAction(GLOBAL_ACTION_HOME); "Home eseguito"
                }
                lower == "indietro" || lower == "telefono indietro" -> {
                    service.performGlobalAction(GLOBAL_ACTION_BACK); "Indietro eseguito"
                }
                lower == "recenti" || lower == "telefono recenti" -> {
                    service.performGlobalAction(GLOBAL_ACTION_RECENTS); "Recenti aperti"
                }
                lower == "scorri giù" || lower == "scorri giu" -> {
                    if (service.scroll(true)) "Scorrimento eseguito" else "Nessun elemento scorrevole trovato"
                }
                lower == "scorri su" -> {
                    if (service.scroll(false)) "Scorrimento eseguito" else "Nessun elemento scorrevole trovato"
                }
                lower.startsWith("clicca ") -> {
                    val target = text.substringAfter(" ").trim()
                    if (service.clickText(target)) "Ho cliccato: $target" else "Testo non trovato: $target"
                }
                lower.startsWith("apri ") -> {
                    val app = text.substringAfter(" ").trim()
                    if (service.openApp(app)) "Apro $app" else "App non trovata: $app"
                }
                else -> null
            }
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onDestroy() {
        if (instance === this) instance = null
        super.onDestroy()
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) = Unit
    override fun onInterrupt() = Unit

    private fun scroll(forward: Boolean): Boolean {
        val action = if (forward) AccessibilityNodeInfo.ACTION_SCROLL_FORWARD else AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD
        return performOnFirstScrollable(rootInActiveWindow, action)
    }

    private fun performOnFirstScrollable(node: AccessibilityNodeInfo?, action: Int): Boolean {
        if (node == null) return false
        if (node.isScrollable && node.performAction(action)) return true
        for (i in 0 until node.childCount) {
            if (performOnFirstScrollable(node.getChild(i), action)) return true
        }
        return false
    }

    private fun clickText(target: String): Boolean {
        if (target.isBlank()) return false
        val nodes = rootInActiveWindow?.findAccessibilityNodeInfosByText(target).orEmpty()
        for (node in nodes) {
            var current: AccessibilityNodeInfo? = node
            repeat(5) {
                if (current?.isClickable == true && current?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
                current = current?.parent
            }
        }
        return false
    }

    private fun openApp(label: String): Boolean {
        val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        val matches = packageManager.queryIntentActivities(launcher, 0)
        val match = matches.firstOrNull {
            it.loadLabel(packageManager).toString().contains(label, ignoreCase = true)
        } ?: return false
        val intent = packageManager.getLaunchIntentForPackage(match.activityInfo.packageName) ?: return false
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        startActivity(intent)
        return true
    }
}
