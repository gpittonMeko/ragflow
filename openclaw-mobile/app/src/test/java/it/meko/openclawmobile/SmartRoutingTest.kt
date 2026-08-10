package it.meko.openclawmobile

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class SmartRoutingTest {
    private val models = listOf(
        ModelInfo(
            id = "deepseek/deepseek-v4-flash",
            name = "DeepSeek V4 Flash",
            promptPricePerMillion = 0.09,
            completionPricePerMillion = 0.18,
            tools = true,
            reasoning = true,
            intelligenceRank = 20
        ),
        ModelInfo(
            id = "xiaomi/mimo-v2.5",
            name = "MiMo V2.5",
            promptPricePerMillion = 0.105,
            completionPricePerMillion = 0.28,
            tools = true,
            intelligenceRank = 25
        ),
        ModelInfo(
            id = "moonshotai/kimi-k2.6",
            name = "Kimi K2.6",
            promptPricePerMillion = 0.67,
            completionPricePerMillion = 3.39,
            tools = true,
            reasoning = true,
            intelligenceRank = 8
        ),
        ModelInfo(
            id = "deepseek/deepseek-v4-pro",
            name = "DeepSeek V4 Pro",
            promptPricePerMillion = 0.435,
            completionPricePerMillion = 0.87,
            tools = true,
            reasoning = true,
            intelligenceRank = 10
        ),
        ModelInfo(
            id = "nvidia/nemotron-3-ultra:free",
            name = "Nemotron 3 Ultra Free",
            promptPricePerMillion = 0.0,
            completionPricePerMillion = 0.0,
            tools = true,
            reasoning = true,
            intelligenceRank = 30
        ),
        ModelInfo(
            id = "openrouter/free",
            name = "OpenRouter Free Router",
            promptPricePerMillion = 0.0,
            completionPricePerMillion = 0.0,
            tools = true
        )
    )

    @Test
    fun normalChatPrefersDeepSeekFlash() {
        val result = SmartModelRouter.choose(ChatRouteMode.NORMAL, "Spiegami questa cosa", 0, models, "", 0.1)
        assertEquals("deepseek/deepseek-v4-flash", result?.model?.id)
    }

    @Test
    fun phoneTaskPrefersMimoInNormalMode() {
        val result = SmartModelRouter.choose(ChatRouteMode.NORMAL, "Apri Spotify e cerca De Andre", 0, models, "", 0.1)
        assertEquals("xiaomi/mimo-v2.5", result?.model?.id)
    }

    @Test
    fun advancedPhoneTaskPrefersKimi() {
        val result = SmartModelRouter.choose(ChatRouteMode.ADVANCED, "Apri l'app e completa questa procedura sul telefono", 0, models, "", 0.1)
        assertEquals("moonshotai/kimi-k2.6", result?.model?.id)
    }

    @Test
    fun autoMovesToFreeNearBudgetLimit() {
        val result = SmartModelRouter.choose(ChatRouteMode.AUTO, "Dimmi il meteo concettualmente", 0, models, "", 0.95)
        assertTrue(result?.model?.isFree == true)
        assertEquals(ChatRouteMode.FREE, result?.mode)
    }
}
