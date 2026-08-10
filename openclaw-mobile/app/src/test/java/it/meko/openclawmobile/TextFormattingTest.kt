package it.meko.openclawmobile

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TextFormattingTest {
    @Test
    fun removesRawMarkdownMarkersButKeepsContent() {
        val rendered = cleanAssistantText("## Titolo\n**Importante** e *corsivo*\n- punto\n`codice`")
        assertTrue(rendered.contains("Titolo"))
        assertTrue(rendered.contains("Importante"))
        assertTrue(rendered.contains("• punto"))
        assertTrue(rendered.contains("codice"))
        assertFalse(rendered.contains("**"))
        assertFalse(rendered.contains("##"))
    }
}
