package it.meko.openclawmobile

import android.content.Context
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.floor

enum class ChatRouteMode(val label: String) {
    AUTO("Auto"),
    NORMAL("Normale"),
    ADVANCED("Avanzata"),
    FREE("Gratis"),
    MANUAL("Manuale")
}

data class RouteDecision(
    val model: ModelInfo,
    val mode: ChatRouteMode,
    val reason: String
)

class MonthlyBudgetStore(context: Context) {
    private val prefs = context.getSharedPreferences("openclaw_monthly_budget", Context.MODE_PRIVATE)

    companion object {
        const val DEFAULT_BUDGET_EUR = 20.0
        const val MAX_BUDGET_EUR = 20.0
        // Conservative accounting buffer: $1 of provider cost counts as €1.10 locally.
        const val USD_TO_EUR_SAFETY = 1.10
    }

    private fun monthKey(): String = SimpleDateFormat("yyyy-MM", Locale.US).format(Date())

    fun budgetEur(): Double = prefs.getFloat("budget_eur", DEFAULT_BUDGET_EUR.toFloat()).toDouble().coerceIn(1.0, MAX_BUDGET_EUR)

    fun setBudgetEur(value: Double) {
        prefs.edit().putFloat("budget_eur", value.coerceIn(1.0, MAX_BUDGET_EUR).toFloat()).apply()
    }

    fun spentUsd(): Double = prefs.getFloat("spent_usd_${monthKey()}", 0f).toDouble().coerceAtLeast(0.0)

    fun spentEurConservative(): Double = spentUsd() * USD_TO_EUR_SAFETY

    fun remainingEur(): Double = (budgetEur() - spentEurConservative()).coerceAtLeast(0.0)

    fun usageFraction(): Double = (spentEurConservative() / budgetEur()).coerceIn(0.0, 1.5)

    fun addUsd(costUsd: Double) {
        if (!costUsd.isFinite() || costUsd <= 0.0) return
        val key = "spent_usd_${monthKey()}"
        prefs.edit().putFloat(key, (spentUsd() + costUsd).toFloat()).apply()
    }

    fun resetCurrentMonth() {
        prefs.edit().remove("spent_usd_${monthKey()}").apply()
    }

    fun maxOutputTokens(model: ModelInfo, estimatedInputTokens: Int, defaultMax: Int = 4096): Int {
        if (model.isFree) return defaultMax
        val inputPrice = model.promptPricePerMillion ?: return defaultMax
        val outputPrice = model.completionPricePerMillion ?: return defaultMax
        if (outputPrice <= 0.0) return defaultMax
        val remainingUsd = remainingEur() / USD_TO_EUR_SAFETY
        val estimatedInputUsd = estimatedInputTokens.coerceAtLeast(0) * inputPrice / 1_000_000.0
        val safeOutputUsd = (remainingUsd - estimatedInputUsd).coerceAtLeast(0.0) * 0.82
        val tokens = floor(safeOutputUsd * 1_000_000.0 / outputPrice).toInt()
        return when {
            tokens < 128 -> 0
            else -> tokens.coerceIn(128, defaultMax)
        }
    }
}

object SmartModelRouter {
    fun choose(
        requestedMode: ChatRouteMode,
        prompt: String,
        attachments: Int,
        models: List<ModelInfo>,
        manualModelId: String,
        budgetFraction: Double
    ): RouteDecision? {
        if (models.isEmpty()) return null
        if (requestedMode == ChatRouteMode.MANUAL) {
            return models.firstOrNull { it.id == manualModelId }?.let {
                RouteDecision(it, ChatRouteMode.MANUAL, "Scelta manuale")
            }
        }

        val actualMode = when {
            requestedMode != ChatRouteMode.AUTO -> requestedMode
            budgetFraction >= 0.90 -> ChatRouteMode.FREE
            isAdvanced(prompt, attachments) -> if (budgetFraction >= 0.82) ChatRouteMode.FREE else ChatRouteMode.ADVANCED
            budgetFraction >= 0.72 -> ChatRouteMode.FREE
            else -> ChatRouteMode.NORMAL
        }

        return when (actualMode) {
            ChatRouteMode.NORMAL -> chooseNormal(prompt, models)
            ChatRouteMode.ADVANCED -> chooseAdvanced(prompt, models)
            ChatRouteMode.FREE -> chooseFree(prompt, models)
            ChatRouteMode.AUTO -> null
            ChatRouteMode.MANUAL -> null
        }
    }

    private fun chooseNormal(prompt: String, models: List<ModelInfo>): RouteDecision? {
        val device = isDeviceTask(prompt)
        val preferred = if (device) {
            listOf("mimo-v2.5", "mimo", "deepseek-v4-flash", "deepseek v4 flash")
        } else {
            listOf("deepseek-v4-flash", "deepseek v4 flash", "mimo-v2.5", "mimo")
        }
        val model = findPreferred(models, preferred, requireTools = device)
            ?: bestValue(models, requireTools = device, freeOnly = false)
            ?: return null
        return RouteDecision(model, ChatRouteMode.NORMAL, if (device) "Value + tool calling" else "Miglior rapporto costo/qualità")
    }

    private fun chooseAdvanced(prompt: String, models: List<ModelInfo>): RouteDecision? {
        val device = isDeviceTask(prompt)
        val codeOrReasoning = isReasoningOrCode(prompt)
        val preferred = when {
            device -> listOf("kimi-k2.6", "kimi k2.6", "deepseek-v4-pro", "deepseek v4 pro")
            codeOrReasoning -> listOf("deepseek-v4-pro", "deepseek v4 pro", "kimi-k2.6", "kimi k2.6")
            else -> listOf("kimi-k2.6", "kimi k2.6", "deepseek-v4-pro", "deepseek v4 pro")
        }
        val model = findPreferred(models, preferred, requireTools = device)
            ?: models.filter { !it.isFree && (!device || it.tools) }
                .minWithOrNull(compareBy<ModelInfo> { it.intelligenceRank ?: Int.MAX_VALUE }.thenBy { it.averagePricePerMillion ?: Double.MAX_VALUE })
            ?: return null
        return RouteDecision(model, ChatRouteMode.ADVANCED, if (codeOrReasoning) "Reasoning avanzato" else "Task complesso/agentico")
    }

    private fun chooseFree(prompt: String, models: List<ModelInfo>): RouteDecision? {
        val device = isDeviceTask(prompt)
        val freeModels = models.filter { it.isFree && (!device || it.tools) }
        val preferred = listOf(
            "nemotron-3-ultra", "nemotron",
            "kimi-k2.6", "kimi k2.6",
            "deepseek",
            "openrouter/free"
        )
        val model = findPreferred(freeModels, preferred, requireTools = device)
            ?: freeModels.minByOrNull { it.intelligenceRank ?: Int.MAX_VALUE }
            ?: models.firstOrNull { it.id.equals("openrouter/free", true) }
            ?: return null
        return RouteDecision(model, ChatRouteMode.FREE, if (device) "Gratuito con tools" else "Risparmio budget")
    }

    private fun findPreferred(models: List<ModelInfo>, needles: List<String>, requireTools: Boolean): ModelInfo? {
        for (needle in needles) {
            val n = needle.lowercase(Locale.ROOT)
            models.firstOrNull { model ->
                (!requireTools || model.tools) &&
                    (model.id.lowercase(Locale.ROOT).contains(n) || model.name.lowercase(Locale.ROOT).contains(n))
            }?.let { return it }
        }
        return null
    }

    private fun bestValue(models: List<ModelInfo>, requireTools: Boolean, freeOnly: Boolean): ModelInfo? {
        val pool = models.filter { (!requireTools || it.tools) && (!freeOnly || it.isFree) }
        if (pool.isEmpty()) return null
        return pool.minByOrNull { model ->
            val rank = (model.intelligenceRank ?: 500).coerceAtLeast(1)
            val price = model.averagePricePerMillion ?: 10.0
            rank * (0.18 + price.coerceAtLeast(0.02))
        }
    }

    private fun isAdvanced(prompt: String, attachments: Int): Boolean {
        if (prompt.length > 700 || attachments > 1) return true
        return isReasoningOrCode(prompt) || listOf(
            "analizza in profondità", "analisi approfondita", "strategia", "architettura",
            "piano completo", "confronta dettagliatamente", "debug", "refactor", "ricerca complessa"
        ).any { prompt.contains(it, true) }
    }

    private fun isReasoningOrCode(prompt: String): Boolean = listOf(
        "ragiona", "dimostra", "calcola", "codice", "kotlin", "python", "javascript", "sql",
        "algoritmo", "bug", "debug", "architettura", "progetta", "ottimizza"
    ).any { prompt.contains(it, true) }

    fun isDeviceTask(prompt: String): Boolean = listOf(
        "telefono", "apri ", "clicca ", "tocca ", "scorri ", "vai su ", "premi ",
        "scrivi ", "inserisci ", "whatsapp", "spotify", "youtube", "gmail", "maps"
    ).any { prompt.contains(it, true) }
}
