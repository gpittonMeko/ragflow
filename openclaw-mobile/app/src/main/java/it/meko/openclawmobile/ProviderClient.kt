package it.meko.openclawmobile

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.Inet6Address
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import kotlin.math.ln
import kotlin.math.min

data class ModelInfo(
    val id: String,
    val name: String = id,
    val contextLength: Int = 0,
    val promptPricePerMillion: Double? = null,
    val completionPricePerMillion: Double? = null,
    val capabilityScore: Int = 0,
    val reasoning: Boolean = false,
    val vision: Boolean = false,
    val tools: Boolean = false
) {
    val averagePricePerMillion: Double?
        get() {
            val prices = listOfNotNull(promptPricePerMillion, completionPricePerMillion)
            return prices.takeIf { it.isNotEmpty() }?.average()
        }

    val isFree: Boolean
        get() = promptPricePerMillion == 0.0 && completionPricePerMillion == 0.0
}

data class ChatMessage(val role: String, val content: String)

enum class ProviderMode { OPENROUTER, OPENAI_COMPATIBLE }

class ProviderClient(private val client: OkHttpClient = defaultClient()) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    companion object {
        private fun defaultClient(): OkHttpClient {
            val ipv4FirstDns = object : Dns {
                override fun lookup(hostname: String): List<InetAddress> {
                    return Dns.SYSTEM.lookup(hostname)
                        .sortedBy { if (it is Inet6Address) 1 else 0 }
                }
            }

            return OkHttpClient.Builder()
                .dns(ipv4FirstDns)
                .retryOnConnectionFailure(true)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(90, TimeUnit.SECONDS)
                .writeTimeout(45, TimeUnit.SECONDS)
                .callTimeout(120, TimeUnit.SECONDS)
                .protocols(listOf(Protocol.HTTP_1_1))
                .build()
        }
    }

    suspend fun listModels(
        mode: ProviderMode,
        apiKey: String,
        baseUrl: String
    ): List<ModelInfo> = withContext(Dispatchers.IO) {
        requireCredentials(mode, apiKey, baseUrl)
        val url = when (mode) {
            ProviderMode.OPENROUTER -> "https://openrouter.ai/api/v1/models"
            ProviderMode.OPENAI_COMPATIBLE -> "${normalizeBaseUrl(baseUrl)}/models"
        }
        val builder = Request.Builder()
            .url(url)
            .header("Accept", "application/json")
            .header("User-Agent", "OpenClaw-Mobile/0.2")
        if (apiKey.isNotBlank()) builder.header("Authorization", "Bearer ${apiKey.trim()}")
        if (mode == ProviderMode.OPENROUTER) builder.header("X-Title", "OpenClaw Mobile")

        executeWithRetry(builder.build()).use {
            val raw = it.body?.string().orEmpty()
            if (!it.isSuccessful) error(providerError(it.code, raw, "modelli"))
            val root = JSONObject(raw)
            val data = root.optJSONArray("data") ?: JSONArray()
            buildList {
                for (i in 0 until data.length()) {
                    val obj = data.optJSONObject(i) ?: continue
                    val id = obj.optString("id")
                    if (id.isBlank()) continue

                    if (mode == ProviderMode.OPENROUTER) {
                        val supported = jsonStringSet(obj.optJSONArray("supported_parameters"))
                        val architecture = obj.optJSONObject("architecture")
                        val modalities = jsonStringSet(architecture?.optJSONArray("input_modalities"))
                        val modalityText = architecture?.optString("modality").orEmpty().lowercase()
                        val pricing = obj.optJSONObject("pricing")
                        val promptPrice = perMillion(pricing?.optString("prompt"))
                        val completionPrice = perMillion(pricing?.optString("completion"))
                        val contextLength = obj.optInt("context_length", 0).coerceAtLeast(0)
                        val reasoning = supported.any { it.contains("reasoning") }
                        val tools = supported.any { it == "tools" || it.contains("tool_choice") }
                        val vision = modalities.any { it.contains("image") } || modalityText.contains("image")
                        val structured = supported.any {
                            it.contains("structured") || it.contains("json_schema") || it.contains("response_format")
                        }

                        add(
                            ModelInfo(
                                id = id,
                                name = obj.optString("name", id).ifBlank { id },
                                contextLength = contextLength,
                                promptPricePerMillion = promptPrice,
                                completionPricePerMillion = completionPrice,
                                capabilityScore = capabilityScore(
                                    contextLength = contextLength,
                                    reasoning = reasoning,
                                    vision = vision,
                                    tools = tools,
                                    structured = structured
                                ),
                                reasoning = reasoning,
                                vision = vision,
                                tools = tools
                            )
                        )
                    } else {
                        add(ModelInfo(id = id, name = obj.optString("name", id).ifBlank { id }))
                    }
                }
            }.sortedBy { model -> model.name.lowercase() }
        }
    }

    suspend fun chat(
        mode: ProviderMode,
        apiKey: String,
        baseUrl: String,
        model: String,
        messages: List<ChatMessage>
    ): String = withContext(Dispatchers.IO) {
        requireCredentials(mode, apiKey, baseUrl)
        require(model.isNotBlank()) { "Seleziona un modello prima di inviare" }

        val url = when (mode) {
            ProviderMode.OPENROUTER -> "https://openrouter.ai/api/v1/chat/completions"
            ProviderMode.OPENAI_COMPATIBLE -> "${normalizeBaseUrl(baseUrl)}/chat/completions"
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
            .header("Accept", "application/json")
            .header("Content-Type", "application/json")
            .header("User-Agent", "OpenClaw-Mobile/0.2")
            .post(bodyJson.toString().toRequestBody(jsonType))
        if (apiKey.isNotBlank()) requestBuilder.header("Authorization", "Bearer ${apiKey.trim()}")
        if (mode == ProviderMode.OPENROUTER) requestBuilder.header("X-Title", "OpenClaw Mobile")

        executeWithRetry(requestBuilder.build()).use {
            val raw = it.body?.string().orEmpty()
            if (!it.isSuccessful) error(providerError(it.code, raw, "chat"))
            val root = JSONObject(raw)
            root.optJSONArray("choices")
                ?.optJSONObject(0)
                ?.optJSONObject("message")
                ?.optString("content")
                ?.takeIf { text -> text.isNotBlank() }
                ?: error("Il provider ha risposto senza testo")
        }
    }

    private suspend fun executeWithRetry(request: Request): Response {
        var lastError: IOException? = null
        repeat(3) { attempt ->
            try {
                return client.newCall(request).execute()
            } catch (error: IOException) {
                lastError = error
                if (attempt < 2) delay(500L * (attempt + 1))
            }
        }
        val detail = lastError?.message?.takeIf { it.isNotBlank() } ?: lastError?.javaClass?.simpleName.orEmpty()
        throw IOException(
            "Connessione al provider interrotta${if (detail.isNotBlank()) ": $detail" else ""}. Riprova; se sei su rete mobile, prova anche Wi-Fi.",
            lastError
        )
    }

    private fun requireCredentials(mode: ProviderMode, apiKey: String, baseUrl: String) {
        if (mode == ProviderMode.OPENROUTER && apiKey.isBlank()) {
            error("Inserisci e salva la API key OpenRouter")
        }
        if (mode == ProviderMode.OPENAI_COMPATIBLE && baseUrl.isBlank()) {
            error("Inserisci la Base URL del provider")
        }
    }

    private fun normalizeBaseUrl(baseUrl: String): String {
        val value = baseUrl.trim().trimEnd('/')
        require(value.startsWith("https://") || value.startsWith("http://")) {
            "Base URL non valida: deve iniziare con https:// o http://"
        }
        return value
    }

    private fun providerError(code: Int, raw: String, operation: String): String {
        val apiMessage = runCatching {
            val root = JSONObject(raw)
            root.optJSONObject("error")?.optString("message")
                ?.takeIf { it.isNotBlank() }
                ?: root.optString("message").takeIf { it.isNotBlank() }
        }.getOrNull()

        val prefix = when (code) {
            400 -> "Richiesta non valida"
            401 -> "API key non valida o non autorizzata"
            402 -> "Credito/quota del provider insufficiente"
            403 -> "Accesso al modello negato"
            404 -> "Modello o endpoint non trovato"
            408 -> "Timeout del provider"
            429 -> "Limite richieste raggiunto"
            in 500..599 -> "Errore temporaneo del provider"
            else -> "Errore $operation HTTP $code"
        }
        return if (!apiMessage.isNullOrBlank()) "$prefix — $apiMessage" else "$prefix (HTTP $code)"
    }

    private fun perMillion(raw: String?): Double? {
        val value = raw?.trim()?.toDoubleOrNull() ?: return null
        return value * 1_000_000.0
    }

    private fun jsonStringSet(array: JSONArray?): Set<String> {
        if (array == null) return emptySet()
        return buildSet {
            for (i in 0 until array.length()) {
                array.optString(i).trim().lowercase().takeIf { it.isNotBlank() }?.let(::add)
            }
        }
    }

    private fun capabilityScore(
        contextLength: Int,
        reasoning: Boolean,
        vision: Boolean,
        tools: Boolean,
        structured: Boolean
    ): Int {
        var score = 36
        if (reasoning) score += 26
        if (tools) score += 12
        if (vision) score += 10
        if (structured) score += 7
        if (contextLength > 0) {
            val contextBoost = (ln(contextLength.coerceAtLeast(8_000) / 8_000.0) / ln(2.0) * 3.5).toInt()
            score += min(9, contextBoost.coerceAtLeast(0))
        }
        return score.coerceIn(0, 100)
    }
}
