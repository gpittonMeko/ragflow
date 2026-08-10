package it.meko.openclawmobile

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

data class AttachmentLoadResult(
    val attachments: List<ChatAttachment>,
    val note: String? = null
)

suspend fun loadChatAttachments(context: Context, uris: List<Uri>): AttachmentLoadResult = withContext(Dispatchers.IO) {
    val output = mutableListOf<ChatAttachment>()
    val notes = mutableListOf<String>()
    var totalBytes = 0L

    for (uri in uris.take(5)) {
        val metadata = queryAttachmentMetadata(context, uri)
        val name = metadata.first.ifBlank { "allegato" }
        val declaredSize = metadata.second
        if (declaredSize > 10L * 1024L * 1024L) {
            notes += "$name saltato: oltre 10 MB"
            continue
        }

        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: continue
        if (bytes.size > 10 * 1024 * 1024) {
            notes += "$name saltato: oltre 10 MB"
            continue
        }
        if (totalBytes + bytes.size > 18L * 1024L * 1024L) {
            notes += "Limite allegati 18 MB raggiunto"
            break
        }

        val mime = context.contentResolver.getType(uri).orEmpty().ifBlank { mimeFromName(name) }
        if (name.endsWith(".docx", true) || mime.contains("wordprocessingml", true)) {
            val text = extractDocxText(bytes)
            if (text.isBlank()) {
                notes += "$name: testo DOCX non leggibile"
                continue
            }
            val textBytes = text.take(180_000).toByteArray(Charsets.UTF_8)
            output += ChatAttachment(
                name = "$name.txt",
                mimeType = "text/plain",
                base64 = Base64.encodeToString(textBytes, Base64.NO_WRAP),
                sizeBytes = textBytes.size.toLong()
            )
            totalBytes += textBytes.size
        } else {
            output += ChatAttachment(
                name = name,
                mimeType = mime,
                base64 = Base64.encodeToString(bytes, Base64.NO_WRAP),
                sizeBytes = bytes.size.toLong()
            )
            totalBytes += bytes.size
        }
    }

    AttachmentLoadResult(output, notes.takeIf { it.isNotEmpty() }?.joinToString(" · "))
}

private fun queryAttachmentMetadata(context: Context, uri: Uri): Pair<String, Long> {
    var name = ""
    var size = -1L
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (nameIndex >= 0) name = cursor.getString(nameIndex).orEmpty()
            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
        }
    }
    return name to size
}

private fun mimeFromName(name: String): String = when {
    name.endsWith(".pdf", true) -> "application/pdf"
    name.endsWith(".png", true) -> "image/png"
    name.endsWith(".jpg", true) || name.endsWith(".jpeg", true) -> "image/jpeg"
    name.endsWith(".webp", true) -> "image/webp"
    name.endsWith(".json", true) -> "application/json"
    name.endsWith(".csv", true) -> "text/csv"
    name.endsWith(".md", true) -> "text/markdown"
    name.endsWith(".txt", true) -> "text/plain"
    else -> "application/octet-stream"
}

private fun extractDocxText(bytes: ByteArray): String {
    return runCatching {
        ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
            while (true) {
                val entry = zip.nextEntry ?: break
                if (entry.name == "word/document.xml") {
                    val xml = zip.readBytes().toString(Charsets.UTF_8)
                    return@use xml
                        .replace(Regex("</w:p>"), "\n")
                        .replace(Regex("<w:tab[^>]*/>"), "\t")
                        .replace(Regex("<[^>]+>"), "")
                        .replace("&amp;", "&")
                        .replace("&lt;", "<")
                        .replace("&gt;", ">")
                        .replace("&quot;", "\"")
                        .replace("&apos;", "'")
                        .replace(Regex("[ \\t]+"), " ")
                        .replace(Regex("\\n{3,}"), "\n\n")
                        .trim()
                }
            }
            ""
        }
    }.getOrDefault("")
}
