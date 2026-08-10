package it.meko.openclawmobile

import android.util.Base64
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import okhttp3.Dns
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Protocol
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.Inet6Address
import java.net.InetAddress
import java.util.concurrent.TimeUnit

data class AgentResult(
    val text: String,
    val modelId: String,
    val costUsd: Double,
    val toolActions: Int,
    val webSearches: Int,
    val skillTrace: List<String>
)

class AgentClient(private val client: OkHttpClient = defaultClient()) {
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    companion object {
        private fun defaultClient(): OkHttpClient {
            val ipv4FirstDns = object : Dns {
                override fun lookup(hostname: String): List<InetAddress> =
                    Dns.SYSTEM.lookup(hostname).sortedBy { if (it is Inet6Address) 1 else 0 }
            }
            return OkHttpClient.Builder()
                .dns(ipv4FirstDns)
                .retryOnConnectionFailure(true)
                .connectTimeout(30, TimeUnit.SECONDS)
                .readTimeout(150, TimeUnit.SECONDS)
                .writeTimeout(90, TimeUnit.SECONDS)
                .callTimeout(240, TimeUnit.SECONDS)
                .protocols(listOf(Protocol.HTTP_1_1))
                .build()
        }
    }

    suspend fun run(
        apiKey: String,
        model: ModelInfo,
        messages: List<ChatMessage>,
        attachments: List<ChatAttachment>,
        relevantMemory: String,
        relevantSkills: String,
        maxOutputTokens: Int,
        enableDeviceTools: Boolean,
        enableWebTools: Boolean = true
    ): AgentResult = withContext(Dispatchers.IO) {
        require(apiKey.isNotBlank()) { "Inserisci la API key OpenRouter" }
        require(maxOutputTokens >= 128 || model.isFree) {
            "Budget mensile quasi esaurito: passa a Gratis o aumenta il budget"
        }

        val wireMessages = JSONArray()
        wireMessages.put(
            JSONObject()
                .put("role", "system")
                .put("content", buildSystemPrompt(relevantMemory, relevantSkills, enableDeviceTools, enableWebTools))
        )

        val lastUserIndex = messages.indexOfLast { it.role == "user" }
        messages.forEachIndexed { index, message ->
            val obj = JSONObject().put("role", message.role)
            if (index == lastUserIndex && attachments.isNotEmpty()) {
                val parts = JSONArray()
                if (message.content.isNotBlank()) {
                    parts.put(JSONObject().put("type", "text").put("text", message.content))
                }
                attachments.forEach { parts.put(attachmentPart(it)) }
                obj.put("content", parts)
            } else {
                obj.put("content", message.content)
            }
            wireMessages.put(obj)
        }

        var totalCost = 0.0
        var actions = 0
        var webSearches = 0
        var lastText = ""
        val trace = mutableListOf<String>()
        val toolsEnabled = enableDeviceTools && ClawAccessibilityService.available()

        repeat(8) { turn ->
            val body = JSONObject()
                .put("model", model.id)
                .put("messages", wireMessages)
                .put("stream", false)
                .put("parallel_tool_calls", false)
                .put("max_tokens", if (model.isFree) maxOutputTokens.coerceAtLeast(2048) else maxOutputTokens)

            val tools = JSONArray()
            if (enableWebTools) {
                tools.put(
                    JSONObject()
                        .put("type", "openrouter:web_search")
                        .put(
                            "parameters",
                            JSONObject()
                                .put("max_results", 3)
                                .put("max_total_results", 6)
                                .put("search_context_size", "low")
                        )
                )
                tools.put(
                    JSONObject()
                        .put("type", "openrouter:web_fetch")
                        .put(
                            "parameters",
                            JSONObject()
                                .put("engine", "openrouter")
                                .put("max_uses", 3)
                                .put("max_content_tokens", 12_000)
                        )
                )
                tools.put(JSONObject().put("type", "openrouter:datetime"))
            }
            if (toolsEnabled) {
                val local = deviceTools()
                for (i in 0 until local.length()) tools.put(local.getJSONObject(i))
            }
            if (tools.length() > 0) {
                body.put("tools", tools)
                body.put("tool_choice", "auto")
            }

            if (attachments.any { it.mimeType.equals("application/pdf", true) }) {
                body.put(
                    "plugins",
                    JSONArray().put(
                        JSONObject()
                            .put("id", "file-parser")
                            .put("pdf", JSONObject().put("engine", "cloudflare-ai"))
                    )
                )
            }

            val response = executeWithRetry(
                Request.Builder()
                    .url("https://openrouter.ai/api/v1/chat/completions")
                    .header("Authorization", "Bearer ${apiKey.trim()}")
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("User-Agent", "OpenClaw-Mobile/0.5")
                    .header("X-Title", "OpenClaw Mobile")
                    .post(body.toString().toRequestBody(jsonType))
                    .build()
            )

            response.use {
                val raw = it.body?.string().orEmpty()
                if (!it.isSuccessful) error(providerError(it.code, raw))
                val root = JSONObject(raw)
                val usage = root.optJSONObject("usage")
                totalCost += costFromUsage(usage, model)
                webSearches += usage?.optJSONObject("server_tool_use")?.optInt("web_search_requests", 0) ?: 0

                val choice = root.optJSONArray("choices")?.optJSONObject(0)
                    ?: error("Il provider ha risposto senza choices")
                val assistant = choice.optJSONObject("message")
                    ?: error("Risposta del provider non valida")
                val content = assistant.optString("content").takeIf { text -> text.isNotBlank() }.orEmpty()
                if (content.isNotBlank()) lastText = content

                val toolCalls = assistant.optJSONArray("tool_calls")
                if (!toolsEnabled || toolCalls == null || toolCalls.length() == 0) {
                    val finalText = content.ifBlank { lastText }.ifBlank { "Operazione completata." }
                    return@withContext AgentResult(finalText, model.id, totalCost, actions, webSearches, trace)
                }

                wireMessages.put(JSONObject(assistant.toString()).put("role", "assistant"))
                for (i in 0 until toolCalls.length()) {
                    val call = toolCalls.optJSONObject(i) ?: continue
                    val callId = call.optString("id")
                    val fn = call.optJSONObject("function") ?: continue
                    val name = fn.optString("name")
                    val args = runCatching { JSONObject(fn.optString("arguments", "{}")) }.getOrDefault(JSONObject())
                    val result = executeDeviceTool(name, args)
                    actions++
                    trace += traceLine(name, args, result)
                    wireMessages.put(
                        JSONObject()
                            .put("role", "tool")
                            .put("tool_call_id", callId)
                            .put("content", result.take(12_000))
                    )
                    delay(220)
                }
            }

            if (turn == 7) {
                return@withContext AgentResult(
                    lastText.ifBlank { "Ho raggiunto il limite di azioni per questa richiesta." },
                    model.id,
                    totalCost,
                    actions,
                    webSearches,
                    trace
                )
            }
        }
        AgentResult(lastText.ifBlank { "Operazione terminata." }, model.id, totalCost, actions, webSearches, trace)
    }

    private fun buildSystemPrompt(memory: String, skills: String, deviceTools: Boolean, webTools: Boolean): String = buildString {
        append("Sei il second brain personale dell'utente su Android. Devi essere utile, operativo e trasparente. ")
        append("Rispondi in italiano salvo richiesta diversa. Mantieni le risposte concise quando il compito è semplice. ")
        append("Quando puoi completare un compito con gli strumenti disponibili, agisci invece di limitarti a spiegare. ")
        append("Per task sul dispositivo osserva la schermata quando serve, esegui un passo alla volta e verifica il risultato. ")
        append("Non inventare mai di aver cliccato, aperto o scritto qualcosa: considera riuscita un'azione solo dopo il risultato del tool. ")
        append("Per inviare messaggi, pubblicare contenuti, acquisti, cancellazioni o altre azioni irreversibili, se l'utente non ha già dato un comando esplicito e specifico, chiedi conferma prima dell'ultimo passo. ")
        append("Usa Markdown semanticamente ma senza decorazioni inutili. Non riempire la risposta di titoli o enfasi. ")
        if (!deviceTools) append("I tool Android non sono attivi: per agire sulle app indica di abilitare Accessibilità nella sezione Device. ")
        if (webTools) append("Hai strumenti web on-demand: usali solo quando servono informazioni attuali o quando l'utente chiede di leggere/cercare sul web. ")
        if (memory.isNotBlank()) append("\n\nMemoria personale rilevante recuperata localmente; usala solo se pertinente:\n$memory")
        if (skills.isNotBlank()) append("\n\nProcedure locali già riuscite in passato. Riutilizzale come guida, ma verifica sempre la UI corrente:\n$skills")
    }

    private fun deviceTools(): JSONArray = JSONArray().apply {
        put(tool("screen_snapshot", "Legge gli elementi visibili della schermata Android", JSONObject()))
        put(tool("open_app", "Apre un'app installata per nome", JSONObject().put("app", stringProp("Nome app")), listOf("app")))
        put(tool("tap_text", "Tocca un elemento visibile identificato dal testo", JSONObject().put("text", stringProp("Testo visibile")), listOf("text")))
        put(tool("type_text", "Inserisce testo nel campo modificabile attivo", JSONObject().put("text", stringProp("Testo da inserire")), listOf("text")))
        put(tool("scroll", "Scorre la schermata", JSONObject().put("direction", JSONObject().put("type", "string").put("enum", JSONArray(listOf("up", "down")))), listOf("direction")))
        put(tool("global_action", "Esegue navigazione Android", JSONObject().put("action", JSONObject().put("type", "string").put("enum", JSONArray(listOf("back", "home", "recents")))), listOf("action")))
    }

    private fun stringProp(description: String): JSONObject = JSONObject().put("type", "string").put("description", description)

    private fun tool(name: String, description: String, properties: JSONObject, required: List<String> = emptyList()): JSONObject {
        val params = JSONObject().put("type", "object").put("properties", properties).put("additionalProperties", false)
        if (required.isNotEmpty()) params.put("required", JSONArray(required))
        return JSONObject().put("type", "function").put(
            "function",
            JSONObject().put("name", name).put("description", description).put("parameters", params)
        )
    }

    private fun executeDeviceTool(name: String, args: JSONObject): String = when (name) {
        "screen_snapshot" -> ClawAccessibilityService.screenSnapshot() ?: "Accessibilità non attiva"
        "open_app" -> ClawAccessibilityService.execute("apri ${args.optString("app")}") ?: "Accessibilità non attiva"
        "tap_text" -> ClawAccessibilityService.execute("clicca ${args.optString("text")}") ?: "Accessibilità non attiva"
        "type_text" -> ClawAccessibilityService.execute("scrivi ${args.optString("text")}") ?: "Accessibilità non attiva"
        "scroll" -> ClawAccessibilityService.execute(if (args.optString("direction") == "up") "scorri su" else "scorri giù") ?: "Accessibilità non attiva"
        "global_action" -> ClawAccessibilityService.execute(
            when (args.optString("action")) {
                "back" -> "indietro"
                "home" -> "home"
                else -> "recenti"
            }
        ) ?: "Accessibilità non attiva"
        else -> "Tool non riconosciuto: $name"
    }

    private fun traceLine(name: String, args: JSONObject, result: String): String {
        val action = when (name) {
            "open_app" -> "apri ${args.optString("app")}" 
            "tap_text" -> "tocca ${args.optString("text")}" 
            "type_text" -> "scrivi ${args.optString("text").take(80)}"
            "scroll" -> "scorri ${args.optString("direction")}" 
            "global_action" -> args.optString("action")
            "screen_snapshot" -> "verifica schermata"
            else -> name
        }
        return "$action → ${result.lineSequence().firstOrNull().orEmpty().take(90)}"
    }

    private fun attachmentPart(attachment: ChatAttachment): JSONObject {
        val mime = attachment.mimeType.ifBlank { "application/octet-stream" }.lowercase()
        val dataUrl = "data:$mime;base64,${attachment.base64}"
        return when {
            mime.startsWith("image/") -> JSONObject().put("type", "image_url").put("image_url", JSONObject().put("url", dataUrl))
            mime.startsWith("text/") || attachment.name.endsWith(".json", true) || attachment.name.endsWith(".csv", true) -> {
                val text = runCatching { String(Base64.decode(attachment.base64, Base64.DEFAULT), Charsets.UTF_8) }.getOrDefault("")
                JSONObject().put("type", "text").put("text", "Allegato ${attachment.name}:\n${text.take(160_000)}")
            }
            else -> JSONObject().put("type", "file").put("file", JSONObject().put("filename", attachment.name).put("file_data", dataUrl))
        }
    }

    private fun costFromUsage(usage: JSONObject?, model: ModelInfo): Double {
        if (usage == null) return 0.0
        val direct = usage.optDouble("cost", Double.NaN)
        if (direct.isFinite() && direct >= 0.0) return direct
        val promptTokens = usage.optInt("prompt_tokens", usage.optInt("input_tokens", 0)).coerceAtLeast(0)
        val completionTokens = usage.optInt("completion_tokens", usage.optInt("output_tokens", 0)).coerceAtLeast(0)
        val input = model.promptPricePerMillion?.let { promptTokens * it / 1_000_000.0 } ?: 0.0
        val output = model.completionPricePerMillion?.let { completionTokens * it / 1_000_000.0 } ?: 0.0
        return input + output
    }

    private suspend fun executeWithRetry(request: Request): okhttp3.Response {
        var last: IOException? = null
        repeat(3) { attempt ->
            try {
                return client.newCall(request).execute()
            } catch (e: IOException) {
                last = e
                if (attempt < 2) delay(500L * (attempt + 1))
            }
        }
        throw IOException("Connessione OpenRouter interrotta: ${last?.message ?: "errore rete"}", last)
    }

    private fun providerError(code: Int, raw: String): String {
        val msg = runCatching {
            val root = JSONObject(raw)
            root.optJSONObject("error")?.optString("message")?.takeIf { it.isNotBlank() }
                ?: root.optString("message").takeIf { it.isNotBlank() }
        }.getOrNull()
        val prefix = when (code) {
            400 -> "Richiesta non valida"
            401 -> "API key non valida"
            402 -> "Credito OpenRouter insufficiente"
            403 -> "Accesso al modello negato"
            404 -> "Modello non disponibile"
            413 -> "Allegato troppo grande"
            429 -> "Rate limit OpenRouter"
            in 500..599 -> "Errore temporaneo del provider"
            else -> "Errore OpenRouter HTTP $code"
        }
        return if (msg.isNullOrBlank()) "$prefix (HTTP $code)" else "$prefix — $msg"
    }
}
