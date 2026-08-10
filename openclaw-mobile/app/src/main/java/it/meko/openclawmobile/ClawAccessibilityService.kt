package it.meko.openclawmobile

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.os.Bundle
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class ClawAccessibilityService : AccessibilityService() {
    companion object {
        @Volatile private var instance: ClawAccessibilityService? = null

        fun available(): Boolean = instance != null

        fun screenSnapshot(): String? = instance?.snapshot()

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
                lower == "scorri giù" || lower == "scorri giu" || lower == "scroll down" -> {
                    if (service.scroll(true)) "Scorrimento eseguito" else "Nessun elemento scorrevole trovato"
                }
                lower == "scorri su" || lower == "scroll up" -> {
                    if (service.scroll(false)) "Scorrimento eseguito" else "Nessun elemento scorrevole trovato"
                }
                lower.startsWith("clicca ") || lower.startsWith("tocca ") -> {
                    val target = text.substringAfter(" ").trim()
                    if (service.clickText(target)) "Ho toccato: $target" else "Testo non trovato: $target"
                }
                lower.startsWith("apri ") -> {
                    val app = text.substringAfter(" ").trim()
                    if (service.openApp(app)) "Apro $app" else "App non trovata: $app"
                }
                lower.startsWith("scrivi ") || lower.startsWith("inserisci ") -> {
                    val value = text.substringAfter(" ").trim()
                    if (service.setText(value)) "Testo inserito" else "Nessun campo di testo modificabile trovato"
                }
                lower == "leggi schermata" || lower == "schermata" -> service.snapshot()
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
            repeat(6) {
                if (current?.isClickable == true && current?.performAction(AccessibilityNodeInfo.ACTION_CLICK) == true) return true
                current = current?.parent
            }
        }
        return false
    }

    private fun setText(value: String): Boolean {
        if (value.isBlank()) return false
        val root = rootInActiveWindow ?: return false
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        val target = when {
            focused?.isEditable == true -> focused
            else -> findFirstEditable(root)
        } ?: return false
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, value)
        }
        return target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun findFirstEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isEditable && node.isVisibleToUser) return node
        for (i in 0 until node.childCount) {
            findFirstEditable(node.getChild(i))?.let { return it }
        }
        return null
    }

    private fun snapshot(): String {
        val root = rootInActiveWindow ?: return "Schermata non disponibile"
        val lines = mutableListOf<String>()
        collectNodes(root, lines, 0)
        return lines.take(90).joinToString("\n").ifBlank { "Nessun elemento testuale visibile" }
    }

    private fun collectNodes(node: AccessibilityNodeInfo?, output: MutableList<String>, depth: Int) {
        if (node == null || output.size >= 90 || depth > 14) return
        if (node.isVisibleToUser) {
            val text = node.text?.toString()?.trim().orEmpty()
            val desc = node.contentDescription?.toString()?.trim().orEmpty()
            if (text.isNotBlank() || desc.isNotBlank() || node.isEditable || node.isClickable) {
                val label = when {
                    text.isNotBlank() -> text
                    desc.isNotBlank() -> desc
                    node.isEditable -> "[campo testo]"
                    else -> "[elemento]"
                }.replace("\n", " ").take(140)
                val flags = buildList {
                    if (node.isClickable) add("click")
                    if (node.isEditable) add("edit")
                    if (node.isScrollable) add("scroll")
                    if (node.isChecked) add("checked")
                }.joinToString(",")
                output += if (flags.isBlank()) label else "$label [$flags]"
            }
        }
        for (i in 0 until node.childCount) collectNodes(node.getChild(i), output, depth + 1)
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
