package it.meko.openclawmobile

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import java.util.Locale

internal enum class V5Section(val label: String) {
    CHAT("Chat"), MODELS("Modelli"), BRAIN("Brain"), DEVICE("Device")
}

internal enum class V5ModelSort(val label: String) {
    VALUE("Valore"), INTELLIGENCE("Intelligenza"), PRICE("Prezzo")
}

internal enum class V5BrainTab { MEMORIES, SKILLS }

internal data class V5ChatMessage(
    val role: String,
    val text: String,
    val modelId: String = "",
    val costUsd: Double = 0.0,
    val toolActions: Int = 0,
    val webSearches: Int = 0
)

internal val V5Bg = Color(0xFF07080B)
internal val V5Panel = Color(0xFF111319)
internal val V5Raised = Color(0xFF181B22)
internal val V5Border = Color(0xFF292D37)
internal val V5Text = Color(0xFFF7F7FA)
internal val V5Muted = Color(0xFFADB1BC)
internal val V5Subtle = Color(0xFF777D89)
internal val V5Purple = Color(0xFF9F91FF)
internal val V5Blue = Color(0xFF78A9FF)
internal val V5Mint = Color(0xFF6FDCBE)
internal val V5Amber = Color(0xFFFFC36A)
internal val V5Danger = Color(0xFFFF7A85)
internal val V5User = Color(0xFF5C50C9)

internal val V5Scheme = darkColorScheme(
    background = V5Bg,
    surface = V5Panel,
    surfaceVariant = V5Raised,
    primary = V5Purple,
    secondary = V5Mint,
    tertiary = V5Amber,
    onBackground = V5Text,
    onSurface = V5Text,
    onSurfaceVariant = V5Muted,
    onPrimary = Color.White
)

internal fun v5ShortModel(id: String): String = id.substringAfter('/').take(30)

internal fun v5FormatCompact(value: Double): String =
    String.format(Locale.US, if (value < 1) "%.2f" else "%.1f", value)

internal fun v5FormatCost(value: Double): String = when {
    value < 0.001 -> String.format(Locale.US, "%.4f", value)
    value < 0.01 -> String.format(Locale.US, "%.3f", value)
    else -> String.format(Locale.US, "%.2f", value)
}

internal fun v5PriceLabel(model: ModelInfo): String {
    val avg = model.averagePricePerMillion ?: return "PREZZO ?"
    return "$${String.format(Locale.US, "%.2f", avg)}/1M"
}

/** Value is intentionally based on the live OpenRouter catalog, not a hard-coded brand score. */
internal fun v5ModelValue(model: ModelInfo): Double {
    val intelligence = 1_000.0 / (model.intelligenceRank ?: 500).coerceAtLeast(1)
    val toolBoost = if (model.tools) 1.25 else 1.0
    val reasoningBoost = if (model.reasoning) 1.10 else 1.0
    if (model.isFree) return intelligence * toolBoost * reasoningBoost * 100.0
    val price = (model.averagePricePerMillion ?: 20.0).coerceAtLeast(0.02)
    return intelligence * toolBoost * reasoningBoost / (0.12 + price)
}

internal fun v5CopyText(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Risposta OpenClaw", text))
}
