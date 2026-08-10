package it.meko.openclawmobile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject

data class ModelInfo(val id: String, val name: String = id)
data class ChatMessage(val role: String, val content: String)

enum class ProviderMode { OPENROUTER, OPENAI_COMPATIBLE }

class ProviderClient(private val client: OkHttpClient = OkHttpClient()) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun listModels(
        mode: ProviderMode,
        apiKey: String,
        baseUrl: String
    ): List<ModelInfo> = withContext(Dispatchers.IO) {
        val url = when (mode) {
            ProviderMode.OPENROUTER -> "https://openrouter.ai/api/v1/models"
            ProviderMode.OPENAI_COMPATIBLE -> "${baseUrl.trimEnd('/')}/models"
        }
        val builder = Request.Builder().url(url)
        if (apiKey.isNotBlank()) builder.header("Authorization", "Bearer $apiKey")
        val response = client.newCall(builder.build()).execute()
        response.use {
            if (!it.isSuccessful) error("Errore modelli HTTP ${it.code}")
            val root = JSONObject(it.body?.string().orEmpty())
            val data = root.optJSONArray("data") ?: JSONArray()
            buildList {
                for (i in 0 until data.length()) {
                    val obj = data.optJSONObject(i) ?: continue
                    val id = obj.optString("id")
                    if (id.isNotBlank()) add(ModelInfo(id, obj.optString("name", id)))
                }
            }.sortedBy { it.name.lowercase() }
        }
    }

    suspend fun chat(
        mode: ProviderMode,
        apiKey: String,
        baseUrl: String,
        model: String,
        messages: List<ChatMessage>
    ): String = withContext(Dispatchers.IO) {
        val url = when (mode) {
            ProviderMode.OPENROUTER -> "https://openrouter.ai/api/v1/chat/completions"
            ProviderMode.OPENAI_COMPATIBLE -> "${baseUrl.trimEnd('/')}/chat/completions"
        }
        val array = JSONArray()
        messages.forEach { message ->
            array.put(JSONObject().put("role", message.role).put("content", message.content))
        }
        val bodyJson = JSONObject()
            .put("model", model)
            .put("messages", array)
            .put("stream", false)

        val requestBuilder = Request.Builder()
            .url(url)
            .header("Content-Type", "application/json")
            .post(bodyJson.toString().toRequestBody(jsonType))
        if (apiKey.isNotBlank()) requestBuilder.header("Authorization", "Bearer $apiKey")
        if (mode == ProviderMode.OPENROUTER) {
            requestBuilder.header("X-Title", "OpenClaw Mobile")
        }

        val response = client.newCall(requestBuilder.build()).execute()
        response.use {
            val raw = it.body?.string().orEmpty()
            if (!it.isSuccessful) {
                val detail = runCatching { JSONObject(raw).optJSONObject("error")?.optString("message") }.getOrNull()
                error(detail?.takeIf { msg -> msg.isNotBlank() } ?: "Errore chat HTTP ${it.code}")
            }
            val root = JSONObject(raw)
            root.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
                ?.takeIf { text -> text.isNotBlank() }
                ?: error("Risposta del provider senza testo")
        }
    }
}
