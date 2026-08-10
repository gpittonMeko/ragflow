package it.meko.openclawmobile

/**
 * Small display renderer for chat output. It removes raw Markdown control characters that look
 * broken in a native Text view while preserving readable bullets, code and links.
 */
fun cleanAssistantText(raw: String): String {
    var text = raw.replace("\r\n", "\n")
    text = text.replace(Regex("(?m)^\\s{0,3}#{1,6}\\s+"), "")
    text = text.replace(Regex("(?m)^\\s*[-*+]\\s+"), "• ")
    text = text.replace(Regex("\\*\\*([^*]+)\\*\\*"), "$1")
    text = text.replace(Regex("__([^_]+)__"), "$1")
    text = text.replace(Regex("(?<!\\*)\\*([^*\\n]+)\\*(?!\\*)"), "$1")
    text = text.replace(Regex("(?<!_)_([^_\\n]+)_(?!_)"), "$1")
    text = text.replace("```", "")
    text = text.replace(Regex("`([^`]+)`"), "$1")
    text = text.replace(Regex("\\[([^]]+)]\\((https?://[^)]+)\\)"), "$1\n$2")
    text = text.replace(Regex("\\n{3,}"), "\n\n")
    return text.trim()
}
