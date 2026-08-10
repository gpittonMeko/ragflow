package it.meko.openclawmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

data class MemoryItem(val id: Long, val text: String, val createdAt: Long)

class MemoryStore(context: Context) {
    private val prefs = context.getSharedPreferences("openclaw_memory", Context.MODE_PRIVATE)

    companion object {
        const val MAX_PROFILE_ITEMS = 12
        private const val MAX_MEMORY_CHARS = 280
        private const val MAX_CONTEXT_CHARS = 800
    }

    init {
        purgeLegacyTranscriptMemories()
    }

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
                val text = obj.optString("text").trim()
                if (text.isNotBlank()) {
                    add(MemoryItem(obj.optLong("id"), text, obj.optLong("createdAt")))
                }
            }
        }.sortedByDescending { it.createdAt }
    }

    fun add(text: String) {
        addOrReplace(text.trim().take(MAX_MEMORY_CHARS))
    }

    /**
     * Learns only stable-looking facts/preferences with local heuristics.
     * No extra LLM request is made, so this adds effectively zero model latency/cost.
     */
    fun learnFrom(text: String): Boolean {
        if (!isLearningEnabled()) return false
        val candidates = text
            .split(Regex("[\\n.!?]+"))
            .map { it.trim() }
            .filter { it.length in 18..MAX_MEMORY_CHARS }
            .filter(::looksLikeStableMemory)

        var changed = false
        candidates.take(2).forEach { candidate ->
            changed = addOrReplace(cleanLearnedMemory(candidate)) || changed
        }
        return changed
    }

    fun remove(id: Long) = save(list().filterNot { it.id == id })

    fun clear() = prefs.edit().putString("items", "[]").apply()

    /** Backwards-compatible entry point for older UI. */
    fun contextText(limit: Int = 8): String = contextTextFor("", limit.coerceAtMost(4))

    /**
     * Returns at most a few relevant memories instead of injecting the full profile.
     * Global style/preferences get a small baseline score so they remain useful.
     */
    fun contextTextFor(prompt: String, limit: Int = 4): String {
        val memories = list()
        if (memories.isEmpty()) return ""

        val promptTokens = tokens(prompt)
        val ranked = memories.map { memory ->
            val memoryTokens = tokens(memory.text)
            val overlap = if (promptTokens.isEmpty()) 0 else memoryTokens.count { it in promptTokens }
            val lower = memory.text.lowercase(Locale.ROOT)
            val globalPreference = if (
                lower.contains("preferisco") || lower.contains("mi piace") ||
                lower.contains("non mi piace") || lower.contains("voglio che") ||
                lower.contains("non voglio") || lower.contains("mi chiamo")
            ) 2 else 0
            memory to (overlap * 4 + globalPreference)
        }

        val selected = ranked
            .sortedWith(compareByDescending<Pair<MemoryItem, Int>> { it.second }.thenByDescending { it.first.createdAt })
            .filter { it.second > 0 || promptTokens.isEmpty() }
            .take(limit.coerceIn(1, 4))
            .map { it.first }
            .ifEmpty {
                ranked.sortedByDescending { it.first.createdAt }.take(2).map { it.first }
            }

        val lines = mutableListOf<String>()
        var chars = 0
        for (item in selected) {
            val line = "- ${item.text}"
            if (chars + line.length > MAX_CONTEXT_CHARS) break
            lines += line
            chars += line.length
        }
        return lines.joinToString("\n")
    }

    fun estimatedContextChars(prompt: String = ""): Int = contextTextFor(prompt).length

    private fun looksLikeStableMemory(sentence: String): Boolean {
        val s = sentence.lowercase(Locale.ROOT)
        val markers = listOf(
            "mi chiamo ",
            "lavoro come ",
            "lavoro con ",
            "vivo a ",
            "abito a ",
            "preferisco ",
            "mi piace ",
            "non mi piace ",
            "odio ",
            "voglio che ",
            "non voglio che ",
            "ricordati che ",
            "ricorda che ",
            "uso sempre ",
            "di solito uso ",
            "sono un ",
            "sono una "
        )
        return markers.any { s.contains(it) }
    }

    private fun cleanLearnedMemory(text: String): String {
        return text.trim()
            .removePrefix("Ricordati che ")
            .removePrefix("ricordati che ")
            .removePrefix("Ricorda che ")
            .removePrefix("ricorda che ")
            .trim()
            .take(MAX_MEMORY_CHARS)
    }

    private fun addOrReplace(raw: String): Boolean {
        val clean = raw.trim().replace(Regex("\\s+"), " ").take(MAX_MEMORY_CHARS)
        if (clean.length < 3) return false

        val current = list().toMutableList()
        val duplicate = current.firstOrNull { similarity(it.text, clean) >= 0.72 }
        if (duplicate != null && normalize(duplicate.text) == normalize(clean)) return false

        if (duplicate != null) current.remove(duplicate)
        current.add(0, MemoryItem(System.nanoTime(), clean, System.currentTimeMillis()))
        save(current.take(MAX_PROFILE_ITEMS))
        return true
    }

    private fun similarity(a: String, b: String): Double {
        val aa = tokens(a)
        val bb = tokens(b)
        if (aa.isEmpty() || bb.isEmpty()) return 0.0
        val intersection = aa.intersect(bb).size.toDouble()
        val union = aa.union(bb).size.toDouble()
        return if (union == 0.0) 0.0 else intersection / union
    }

    private fun tokens(text: String): Set<String> = text
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-zà-ÿ0-9 ]"), " ")
        .split(Regex("\\s+"))
        .filter { it.length >= 3 && it !in stopWords }
        .toSet()

    private fun normalize(text: String): String = text
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-zà-ÿ0-9]"), "")

    private fun purgeLegacyTranscriptMemories() {
        val existing = listWithoutMigration()
        val cleaned = existing.filterNot {
            it.text.startsWith("L’utente ha chiesto:", ignoreCase = true) ||
                it.text.startsWith("L'utente ha chiesto:", ignoreCase = true)
        }.take(MAX_PROFILE_ITEMS)
        if (cleaned.size != existing.size) save(cleaned)
    }

    private fun listWithoutMigration(): List<MemoryItem> {
        val raw = prefs.getString("items", "[]") ?: "[]"
        val array = runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
        return buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val text = obj.optString("text").trim()
                if (text.isNotBlank()) add(MemoryItem(obj.optLong("id"), text, obj.optLong("createdAt")))
            }
        }.sortedByDescending { it.createdAt }
    }

    private fun save(items: List<MemoryItem>) {
        val array = JSONArray()
        items.take(MAX_PROFILE_ITEMS).forEach { item ->
            array.put(JSONObject().put("id", item.id).put("text", item.text).put("createdAt", item.createdAt))
        }
        prefs.edit().putString("items", array.toString()).apply()
    }

    private val stopWords = setOf(
        "che", "con", "per", "una", "uno", "del", "della", "dei", "degli", "delle",
        "sono", "come", "anche", "non", "the", "and", "for", "with", "that", "this"
    )
}
