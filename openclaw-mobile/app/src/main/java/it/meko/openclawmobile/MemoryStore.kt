package it.meko.openclawmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

enum class MemoryKind(val label: String) {
    PROFILE("Profilo"),
    PREFERENCE("Preferenze"),
    PROJECT("Progetti"),
    PERSON("Persone"),
    ROUTINE("Routine"),
    NOTE("Note")
}

data class MemoryItem(
    val id: Long,
    val text: String,
    val createdAt: Long,
    val kind: MemoryKind = MemoryKind.NOTE,
    val pinned: Boolean = false
)

class MemoryStore(context: Context) {
    private val prefs = context.getSharedPreferences("openclaw_memory", Context.MODE_PRIVATE)

    companion object {
        // Storage may grow, but retrieval remains deliberately tiny.
        const val MAX_PROFILE_ITEMS = 48
        const val MAX_RETRIEVED_ITEMS = 5
        const val MAX_CONTEXT_CHARS = 1_100
        private const val MAX_MEMORY_CHARS = 320
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
                if (text.isBlank()) continue
                val kind = runCatching { MemoryKind.valueOf(obj.optString("kind", "NOTE")) }.getOrDefault(classify(text))
                add(
                    MemoryItem(
                        id = obj.optLong("id"),
                        text = text,
                        createdAt = obj.optLong("createdAt"),
                        kind = kind,
                        pinned = obj.optBoolean("pinned", false)
                    )
                )
            }
        }.sortedWith(compareByDescending<MemoryItem> { it.pinned }.thenByDescending { it.createdAt })
    }

    fun add(text: String, kind: MemoryKind? = null) {
        addOrReplace(text.trim().take(MAX_MEMORY_CHARS), kind)
    }

    fun update(id: Long, text: String, kind: MemoryKind? = null): Boolean {
        val clean = text.trim().replace(Regex("\\s+"), " ").take(MAX_MEMORY_CHARS)
        if (clean.length < 3) return false
        val items = list().toMutableList()
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return false
        items[index] = items[index].copy(
            text = clean,
            kind = kind ?: classify(clean),
            createdAt = System.currentTimeMillis()
        )
        save(items.take(MAX_PROFILE_ITEMS))
        return true
    }

    fun setPinned(id: Long, pinned: Boolean): Boolean {
        val items = list().toMutableList()
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return false
        items[index] = items[index].copy(pinned = pinned)
        save(items)
        return true
    }

    /**
     * Zero-network learning: only explicit/stable first-person facts are accepted.
     * Chat history, questions, temporary task state and attachments are not stored.
     */
    fun learnFrom(text: String): Boolean {
        if (!isLearningEnabled()) return false
        val candidates = text
            .split(Regex("[\\n.!?]+"))
            .map { it.trim() }
            .filter { it.length in 16..MAX_MEMORY_CHARS }
            .filter(::looksLikeStableMemory)

        var changed = false
        for (candidate in candidates.take(2)) {
            val clean = cleanLearnedMemory(candidate)
            if (addOrReplace(clean, classify(clean))) changed = true
        }
        return changed
    }

    fun remove(id: Long) = save(list().filterNot { it.id == id })

    fun clear() = prefs.edit().putString("items", "[]").apply()

    fun contextText(limit: Int = MAX_RETRIEVED_ITEMS): String = contextTextFor("", limit)

    fun contextTextFor(prompt: String, limit: Int = MAX_RETRIEVED_ITEMS): String {
        val memories = list()
        if (memories.isEmpty()) return ""

        val promptTokens = tokens(prompt)
        val now = System.currentTimeMillis()
        val ranked = memories.map { memory ->
            val memoryTokens = tokens(memory.text)
            val intersection = memoryTokens.intersect(promptTokens)
            var score = 0
            intersection.forEach { token -> score += if (token.length >= 7) 7 else 4 }
            score += phraseAffinity(prompt, memory.text)
            if (memory.pinned) score += 8
            if (memory.kind == MemoryKind.PREFERENCE || memory.kind == MemoryKind.PROFILE) score += 3
            if (promptLooksLikeProject(prompt) && memory.kind == MemoryKind.PROJECT) score += 6
            if (promptLooksLikePerson(prompt) && memory.kind == MemoryKind.PERSON) score += 5
            val ageDays = ((now - memory.createdAt).coerceAtLeast(0L) / 86_400_000L).toInt()
            score += when {
                ageDays < 7 -> 2
                ageDays < 45 -> 1
                else -> 0
            }
            memory to score
        }

        val selected = ranked
            .sortedWith(compareByDescending<Pair<MemoryItem, Int>> { it.second }.thenByDescending { it.first.createdAt })
            .filter { it.second > 2 || promptTokens.isEmpty() || it.first.pinned }
            .take(limit.coerceIn(1, MAX_RETRIEVED_ITEMS))
            .map { it.first }
            .ifEmpty {
                memories.filter { it.pinned || it.kind == MemoryKind.PREFERENCE || it.kind == MemoryKind.PROFILE }
                    .take(2)
            }

        val lines = mutableListOf<String>()
        var chars = 0
        for (item in selected) {
            val line = "- [${item.kind.label}] ${item.text}"
            if (chars + line.length > MAX_CONTEXT_CHARS) break
            lines += line
            chars += line.length
        }
        return lines.joinToString("\n")
    }

    fun estimatedContextChars(prompt: String = ""): Int = contextTextFor(prompt).length

    private fun looksLikeStableMemory(sentence: String): Boolean {
        val s = sentence.lowercase(Locale.ROOT)
        if (s.contains("oggi ") || s.contains("adesso ") || s.contains("in questo momento")) return false
        val markers = listOf(
            "mi chiamo ", "lavoro come ", "lavoro con ", "vivo a ", "abito a ",
            "preferisco ", "mi piace ", "non mi piace ", "odio ", "voglio che ",
            "non voglio che ", "ricordati che ", "ricorda che ", "uso sempre ",
            "di solito uso ", "sono un ", "sono una ", "il mio progetto", "la mia azienda",
            "mia moglie", "mio marito", "mio figlio", "mia figlia", "il mio obiettivo"
        )
        return markers.any(s::contains)
    }

    private fun classify(text: String): MemoryKind {
        val s = text.lowercase(Locale.ROOT)
        return when {
            listOf("preferisco", "mi piace", "non mi piace", "odio", "voglio che", "non voglio").any(s::contains) -> MemoryKind.PREFERENCE
            listOf("progetto", "obiettivo", "sto costruendo", "azienda", "cliente").any(s::contains) -> MemoryKind.PROJECT
            listOf("moglie", "marito", "figlio", "figlia", "collega", "socio", "cliente si chiama").any(s::contains) -> MemoryKind.PERSON
            listOf("ogni giorno", "ogni settimana", "di solito", "routine", "uso sempre").any(s::contains) -> MemoryKind.ROUTINE
            listOf("mi chiamo", "lavoro come", "vivo a", "abito a", "sono un", "sono una").any(s::contains) -> MemoryKind.PROFILE
            else -> MemoryKind.NOTE
        }
    }

    private fun cleanLearnedMemory(text: String): String = text.trim()
        .removePrefix("Ricordati che ").removePrefix("ricordati che ")
        .removePrefix("Ricorda che ").removePrefix("ricorda che ")
        .trim().take(MAX_MEMORY_CHARS)

    private fun addOrReplace(raw: String, explicitKind: MemoryKind? = null): Boolean {
        val clean = raw.trim().replace(Regex("\\s+"), " ").take(MAX_MEMORY_CHARS)
        if (clean.length < 3) return false

        val current = list().toMutableList()
        val duplicate = current.firstOrNull { similarity(it.text, clean) >= 0.66 }
        if (duplicate != null && normalize(duplicate.text) == normalize(clean)) return false

        val pinned = duplicate?.pinned ?: false
        if (duplicate != null) current.remove(duplicate)
        current.add(
            0,
            MemoryItem(
                id = duplicate?.id ?: System.nanoTime(),
                text = clean,
                createdAt = System.currentTimeMillis(),
                kind = explicitKind ?: classify(clean),
                pinned = pinned
            )
        )
        save(current.take(MAX_PROFILE_ITEMS))
        return true
    }

    private fun phraseAffinity(prompt: String, memory: String): Int {
        val p = prompt.lowercase(Locale.ROOT)
        val m = memory.lowercase(Locale.ROOT)
        return when {
            p.length >= 12 && m.contains(p.take(28)) -> 6
            m.length >= 12 && p.contains(m.take(28)) -> 6
            else -> 0
        }
    }

    private fun promptLooksLikeProject(prompt: String): Boolean =
        listOf("progetto", "lavoro", "cliente", "azienda", "obiettivo", "roadmap").any { prompt.contains(it, true) }

    private fun promptLooksLikePerson(prompt: String): Boolean =
        listOf("chi è", "persona", "cliente", "collega", "socio", "famiglia", "moglie", "marito").any { prompt.contains(it, true) }

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
                if (text.isNotBlank()) {
                    add(MemoryItem(obj.optLong("id"), text, obj.optLong("createdAt"), classify(text), obj.optBoolean("pinned", false)))
                }
            }
        }.sortedByDescending { it.createdAt }
    }

    private fun save(items: List<MemoryItem>) {
        val array = JSONArray()
        for (item in items.take(MAX_PROFILE_ITEMS)) {
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("text", item.text)
                    .put("createdAt", item.createdAt)
                    .put("kind", item.kind.name)
                    .put("pinned", item.pinned)
            )
        }
        prefs.edit().putString("items", array.toString()).apply()
    }

    private val stopWords = setOf(
        "che", "con", "per", "una", "uno", "del", "della", "dei", "degli", "delle",
        "sono", "come", "anche", "non", "the", "and", "for", "with", "that", "this"
    )
}
