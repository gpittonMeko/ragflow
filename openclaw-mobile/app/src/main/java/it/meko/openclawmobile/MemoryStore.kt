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
        const val MAX_RETRIEVED_ITEMS = 4
        const val MAX_CONTEXT_CHARS = 800
        private const val MAX_MEMORY_CHARS = 280
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
                if (text.isNotBlank()) add(MemoryItem(obj.optLong("id"), text, obj.optLong("createdAt")))
            }
        }.sortedByDescending { it.createdAt }
    }

    fun add(text: String) {
        addOrReplace(text.trim().take(MAX_MEMORY_CHARS))
    }

    fun update(id: Long, text: String): Boolean {
        val clean = text.trim().replace(Regex("\\s+"), " ").take(MAX_MEMORY_CHARS)
        if (clean.length < 3) return false
        val items = list().toMutableList()
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return false
        items[index] = items[index].copy(text = clean, createdAt = System.currentTimeMillis())
        save(items.sortedByDescending { it.createdAt }.take(MAX_PROFILE_ITEMS))
        return true
    }

    fun learnFrom(text: String): Boolean {
        if (!isLearningEnabled()) return false
        val candidates = text
            .split(Regex("[\\n.!?]+"))
            .map { it.trim() }
            .filter { it.length in 18..MAX_MEMORY_CHARS }
            .filter(::looksLikeStableMemory)

        var changed = false
        for (candidate in candidates.take(2)) {
            if (addOrReplace(cleanLearnedMemory(candidate))) changed = true
        }
        return changed
    }

    fun remove(id: Long) = save(list().filterNot { it.id == id })

    fun clear() = prefs.edit().putString("items", "[]").apply()

    fun contextText(limit: Int = 8): String = contextTextFor("", limit.coerceAtMost(MAX_RETRIEVED_ITEMS))

    fun contextTextFor(prompt: String, limit: Int = MAX_RETRIEVED_ITEMS): String {
        val memories: List<MemoryItem> = list()
        if (memories.isEmpty()) return ""

        val promptTokens: Set<String> = tokens(prompt)
        val now = System.currentTimeMillis()
        val ranked: List<Pair<MemoryItem, Int>> = memories.map { memory: MemoryItem ->
            val memoryTokens: Set<String> = tokens(memory.text)
            val intersection: Set<String> = memoryTokens.intersect(promptTokens)
            var overlapScore = 0
            for (token in intersection) {
                overlapScore += if (token.length >= 7) 6 else 4
            }
            val phraseScore: Int = phraseAffinity(prompt, memory.text)
            val globalPreference: Int = if (isGlobalPreference(memory.text)) 3 else 0
            val ageDays: Int = ((now - memory.createdAt).coerceAtLeast(0L) / 86_400_000L).toInt()
            val recency: Int = when {
                ageDays < 7 -> 2
                ageDays < 30 -> 1
                else -> 0
            }
            Pair(memory, overlapScore + phraseScore + globalPreference + recency)
        }

        val primary: List<MemoryItem> = ranked
            .sortedWith(compareByDescending<Pair<MemoryItem, Int>> { pair -> pair.second }.thenByDescending { pair -> pair.first.createdAt })
            .filter { pair -> pair.second > 1 || promptTokens.isEmpty() }
            .take(limit.coerceIn(1, MAX_RETRIEVED_ITEMS))
            .map { pair -> pair.first }

        val selected: List<MemoryItem> = if (primary.isNotEmpty()) {
            primary
        } else {
            ranked
                .filter { pair -> isGlobalPreference(pair.first.text) }
                .sortedByDescending { pair -> pair.first.createdAt }
                .take(2)
                .map { pair -> pair.first }
        }

        val lines = mutableListOf<String>()
        var chars = 0
        for (item in selected) {
            val line = "- ${item.text}"
            if (chars + line.length > MAX_CONTEXT_CHARS) break
            lines.add(line)
            chars += line.length
        }
        return lines.joinToString("\n")
    }

    fun estimatedContextChars(prompt: String = ""): Int = contextTextFor(prompt).length

    private fun looksLikeStableMemory(sentence: String): Boolean {
        val s = sentence.lowercase(Locale.ROOT)
        val markers = listOf(
            "mi chiamo ", "lavoro come ", "lavoro con ", "vivo a ", "abito a ",
            "preferisco ", "mi piace ", "non mi piace ", "odio ", "voglio che ",
            "non voglio che ", "ricordati che ", "ricorda che ", "uso sempre ",
            "di solito uso ", "sono un ", "sono una ", "il mio ", "la mia "
        )
        return markers.any { marker -> s.contains(marker) }
    }

    private fun cleanLearnedMemory(text: String): String = text.trim()
        .removePrefix("Ricordati che ").removePrefix("ricordati che ")
        .removePrefix("Ricorda che ").removePrefix("ricorda che ")
        .trim().take(MAX_MEMORY_CHARS)

    private fun addOrReplace(raw: String): Boolean {
        val clean = raw.trim().replace(Regex("\\s+"), " ").take(MAX_MEMORY_CHARS)
        if (clean.length < 3) return false

        val current = list().toMutableList()
        val duplicate = current.firstOrNull { item -> similarity(item.text, clean) >= 0.68 }
        if (duplicate != null && normalize(duplicate.text) == normalize(clean)) return false

        if (duplicate != null) current.remove(duplicate)
        current.add(0, MemoryItem(System.nanoTime(), clean, System.currentTimeMillis()))
        save(current.take(MAX_PROFILE_ITEMS))
        return true
    }

    private fun phraseAffinity(prompt: String, memory: String): Int {
        val p = prompt.lowercase(Locale.ROOT)
        val m = memory.lowercase(Locale.ROOT)
        return when {
            p.length >= 12 && m.contains(p.take(24)) -> 5
            m.length >= 12 && p.contains(m.take(24)) -> 5
            else -> 0
        }
    }

    private fun isGlobalPreference(text: String): Boolean {
        val lower = text.lowercase(Locale.ROOT)
        return listOf(
            "preferisco", "mi piace", "non mi piace", "voglio che", "non voglio",
            "mi chiamo", "lavoro come", "uso sempre", "di solito uso"
        ).any { marker -> lower.contains(marker) }
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
        .filter { token -> token.length >= 3 && token !in stopWords }
        .toSet()

    private fun normalize(text: String): String = text
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-zà-ÿ0-9]"), "")

    private fun purgeLegacyTranscriptMemories() {
        val existing = listWithoutMigration()
        val cleaned = existing.filterNot { item ->
            item.text.startsWith("L’utente ha chiesto:", ignoreCase = true) ||
                item.text.startsWith("L'utente ha chiesto:", ignoreCase = true)
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
        for (item in items.take(MAX_PROFILE_ITEMS)) {
            array.put(JSONObject().put("id", item.id).put("text", item.text).put("createdAt", item.createdAt))
        }
        prefs.edit().putString("items", array.toString()).apply()
    }

    private val stopWords = setOf(
        "che", "con", "per", "una", "uno", "del", "della", "dei", "degli", "delle",
        "sono", "come", "anche", "non", "the", "and", "for", "with", "that", "this"
    )
}
