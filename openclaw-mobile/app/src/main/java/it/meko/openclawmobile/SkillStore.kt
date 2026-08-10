package it.meko.openclawmobile

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

data class LearnedSkill(
    val id: Long,
    val title: String,
    val trigger: String,
    val steps: List<String>,
    val updatedAt: Long,
    val uses: Int = 0,
    val pinned: Boolean = false
)

class SkillStore(context: Context) {
    private val prefs = context.getSharedPreferences("openclaw_learned_skills", Context.MODE_PRIVATE)

    companion object {
        const val MAX_SKILLS = 36
        const val MAX_RETRIEVED = 3
        const val MAX_CONTEXT_CHARS = 1_300
    }

    fun list(): List<LearnedSkill> {
        val raw = prefs.getString("items", "[]") ?: "[]"
        val array = runCatching { JSONArray(raw) }.getOrDefault(JSONArray())
        return buildList {
            for (i in 0 until array.length()) {
                val obj = array.optJSONObject(i) ?: continue
                val title = obj.optString("title").trim()
                val trigger = obj.optString("trigger").trim()
                if (title.isBlank() || trigger.isBlank()) continue
                val stepsArray = obj.optJSONArray("steps") ?: JSONArray()
                val steps = buildList {
                    for (j in 0 until stepsArray.length()) {
                        stepsArray.optString(j).trim().takeIf { it.isNotBlank() }?.let(::add)
                    }
                }
                if (steps.isEmpty()) continue
                add(
                    LearnedSkill(
                        id = obj.optLong("id"),
                        title = title,
                        trigger = trigger,
                        steps = steps,
                        updatedAt = obj.optLong("updatedAt"),
                        uses = obj.optInt("uses", 0),
                        pinned = obj.optBoolean("pinned", false)
                    )
                )
            }
        }.sortedWith(compareByDescending<LearnedSkill> { it.pinned }.thenByDescending { it.updatedAt })
    }

    /**
     * Learns only from a task that really executed at least two Android tool actions.
     * No LLM call is made here: the successful tool trace itself becomes the reusable procedure.
     */
    fun learn(task: String, trace: List<String>): Boolean {
        val cleanTask = task.trim().replace(Regex("\\s+"), " ")
        val cleanSteps = trace.map { it.trim().replace(Regex("\\s+"), " ").take(180) }
            .filter { it.isNotBlank() }
            .take(12)
        if (cleanTask.length < 5 || cleanSteps.size < 2) return false

        val trigger = triggerFor(cleanTask)
        if (trigger.isBlank()) return false
        val current = list().toMutableList()
        val existing = current.firstOrNull { similarity(it.trigger, trigger) >= 0.60 }
        val learned = LearnedSkill(
            id = existing?.id ?: System.nanoTime(),
            title = cleanTask.take(72),
            trigger = trigger,
            steps = cleanSteps,
            updatedAt = System.currentTimeMillis(),
            uses = existing?.uses ?: 0,
            pinned = existing?.pinned ?: false
        )
        if (existing != null) current.remove(existing)
        current.add(0, learned)
        save(current.take(MAX_SKILLS))
        return true
    }

    fun contextFor(prompt: String): String {
        val promptTokens = tokens(prompt)
        if (promptTokens.isEmpty()) return ""
        val ranked = list().map { skill ->
            val overlap = tokens(skill.trigger).intersect(promptTokens).size
            val score = overlap * 7 + if (skill.pinned) 7 else 0 + skill.uses.coerceAtMost(4)
            skill to score
        }.filter { it.second > 0 }
            .sortedWith(compareByDescending<Pair<LearnedSkill, Int>> { it.second }.thenByDescending { it.first.updatedAt })
            .take(MAX_RETRIEVED)

        val lines = mutableListOf<String>()
        var chars = 0
        for ((skill, _) in ranked) {
            val block = buildString {
                append("Procedura già riuscita: ${skill.title}\n")
                skill.steps.forEach { append("- $it\n") }
            }.trim()
            if (chars + block.length > MAX_CONTEXT_CHARS) break
            lines += block
            chars += block.length
        }
        return lines.joinToString("\n\n")
    }

    fun markUsed(id: Long) {
        val items = list().toMutableList()
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return
        items[index] = items[index].copy(uses = items[index].uses + 1, updatedAt = System.currentTimeMillis())
        save(items)
    }

    fun update(id: Long, title: String, steps: List<String>): Boolean {
        val items = list().toMutableList()
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return false
        val cleanTitle = title.trim().take(72)
        val cleanSteps = steps.map { it.trim().take(180) }.filter { it.isNotBlank() }.take(12)
        if (cleanTitle.length < 3 || cleanSteps.isEmpty()) return false
        items[index] = items[index].copy(
            title = cleanTitle,
            trigger = triggerFor(cleanTitle),
            steps = cleanSteps,
            updatedAt = System.currentTimeMillis()
        )
        save(items)
        return true
    }

    fun setPinned(id: Long, pinned: Boolean) {
        val items = list().toMutableList()
        val index = items.indexOfFirst { it.id == id }
        if (index < 0) return
        items[index] = items[index].copy(pinned = pinned)
        save(items)
    }

    fun remove(id: Long) = save(list().filterNot { it.id == id })

    fun clear() = prefs.edit().putString("items", "[]").apply()

    private fun triggerFor(text: String): String = tokens(text).take(10).joinToString(" ")

    private fun similarity(a: String, b: String): Double {
        val aa = tokens(a).toSet()
        val bb = tokens(b).toSet()
        if (aa.isEmpty() || bb.isEmpty()) return 0.0
        val intersection = aa.intersect(bb).size.toDouble()
        val union = aa.union(bb).size.toDouble()
        return if (union == 0.0) 0.0 else intersection / union
    }

    private fun tokens(text: String): List<String> = text
        .lowercase(Locale.ROOT)
        .replace(Regex("[^a-zà-ÿ0-9 ]"), " ")
        .split(Regex("\\s+"))
        .filter { it.length >= 3 && it !in stopWords }
        .distinct()

    private fun save(items: List<LearnedSkill>) {
        val array = JSONArray()
        for (item in items.take(MAX_SKILLS)) {
            val steps = JSONArray().apply { item.steps.forEach(::put) }
            array.put(
                JSONObject()
                    .put("id", item.id)
                    .put("title", item.title)
                    .put("trigger", item.trigger)
                    .put("steps", steps)
                    .put("updatedAt", item.updatedAt)
                    .put("uses", item.uses)
                    .put("pinned", item.pinned)
            )
        }
        prefs.edit().putString("items", array.toString()).apply()
    }

    private val stopWords = setOf(
        "che", "con", "per", "una", "uno", "del", "della", "dei", "degli", "delle",
        "sono", "come", "anche", "non", "poi", "sul", "nel", "nella", "the", "and", "for", "with"
    )
}
