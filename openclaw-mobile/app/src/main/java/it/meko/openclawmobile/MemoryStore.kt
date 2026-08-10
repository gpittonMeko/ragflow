package it.meko.openclawmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class MemoryItem(val id: Long, val text: String, val createdAt: Long)

class MemoryStore(context: Context) {
    private val prefs = context.getSharedPreferences("openclaw_memory", Context.MODE_PRIVATE)

    fun isLearningEnabled(): Boolean = prefs.getBoolean("learning", true)

    fun setLearningEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("learning", enabled).apply()
    }

    fun list(): List<MemoryItem> {
        val raw = prefs.getString("items", "[]") ?: "[]"
        val array = runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
        return buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                add(MemoryItem(obj.optLong("id"), obj.optString("text"), obj.optLong("createdAt")))
            }
        }.sortedByDescending { it.createdAt }
    }

    fun add(text: String) {
        val clean = text.trim()
        if (clean.isBlank()) return
        val items = list().toMutableList()
        items.add(0, MemoryItem(System.nanoTime(), clean.take(1000), System.currentTimeMillis()))
        save(items.take(40))
    }

    fun remove(id: Long) = save(list().filterNot { it.id == id })

    fun clear() = prefs.edit().putString("items", "[]").apply()

    fun contextText(limit: Int = 8): String = list().take(limit).joinToString("\n") { "- ${it.text}" }

    private fun save(items: List<MemoryItem>) {
        val array = JSONArray()
        items.forEach { item ->
            array.put(JSONObject().put("id", item.id).put("text", item.text).put("createdAt", item.createdAt))
        }
        prefs.edit().putString("items", array.toString()).apply()
    }
}
