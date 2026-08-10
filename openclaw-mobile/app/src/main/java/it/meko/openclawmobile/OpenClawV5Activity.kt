package it.meko.openclawmobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import java.util.Locale

class OpenClawV5Activity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        )
        super.onCreate(savedInstanceState)
        setContent { V5App() }
    }
}

@Composable
private fun V5App() {
    MaterialTheme(colorScheme = V5Scheme) {
        val context = androidx.compose.ui.platform.LocalContext.current
        val scope = rememberCoroutineScope()
        val secureStore = remember { SecureStore(context) }
        val memoryStore = remember { MemoryStore(context) }
        val skillStore = remember { SkillStore(context) }
        val budgetStore = remember { MonthlyBudgetStore(context) }
        val providerClient = remember { ProviderClient() }
        val agentClient = remember { AgentClient() }
        val gatewayBridge = remember { OpenClawGatewayBridge(context) }

        var section by remember { mutableStateOf(V5Section.CHAT) }
        var routeMode by remember { mutableStateOf(ChatRouteMode.AUTO) }
        var apiKey by remember { mutableStateOf("") }
        var manualModelId by remember { mutableStateOf("") }
        var models by remember { mutableStateOf<List<ModelInfo>>(emptyList()) }
        var loading by remember { mutableStateOf(false) }
        var status by remember { mutableStateOf("Pronto") }
        var prompt by remember { mutableStateOf("") }
        var webEnabled by remember { mutableStateOf(true) }
        var phoneEnabled by remember { mutableStateOf(true) }
        var memoryEnabled by remember { mutableStateOf(true) }
        var learningEnabled by remember { mutableStateOf(memoryStore.isLearningEnabled()) }
        var brainRefresh by remember { mutableIntStateOf(0) }
        var budgetRefresh by remember { mutableIntStateOf(0) }
        var lastModelUsed by remember { mutableStateOf("") }
        val messages = remember { mutableStateListOf<V5ChatMessage>() }
        val attachments = remember { mutableStateListOf<ChatAttachment>() }

        var gatewayUrl by remember { mutableStateOf("") }
        var gatewayToken by remember { mutableStateOf("") }
        var gatewayStatus by remember { mutableStateOf("Non configurato") }
        var gatewayTesting by remember { mutableStateOf(false) }

        fun withFreeRouter(loaded: List<ModelInfo>): List<ModelInfo> {
            if (loaded.any { it.id.equals("openrouter/free", true) }) return loaded
            return loaded + ModelInfo(
                id = "openrouter/free",
                name = "OpenRouter Free Router",
                contextLength = 200_000,
                promptPricePerMillion = 0.0,
                completionPricePerMillion = 0.0,
                capabilityScore = 70,
                reasoning = true,
                vision = true,
                tools = true,
                fileInput = true
            )
        }

        suspend fun refreshModels() {
            if (apiKey.isBlank()) {
                status = "Inserisci la chiave OpenRouter"
                return
            }
            loading = true
            status = "Aggiorno il catalogo…"
            runCatching { providerClient.listModels(ProviderMode.OPENROUTER, apiKey, "") }
                .onSuccess {
                    models = withFreeRouter(it)
                    status = "${models.size} modelli disponibili"
                }
                .onFailure { status = it.message ?: "Errore catalogo OpenRouter" }
            loading = false
        }

        fun setRoute(mode: ChatRouteMode) {
            routeMode = mode
            secureStore.put("chat_route_mode", mode.name)
        }

        LaunchedEffect(Unit) {
            apiKey = secureStore.get("api_key")
            manualModelId = secureStore.get("selected_model")
            routeMode = runCatching {
                ChatRouteMode.valueOf(secureStore.get("chat_route_mode").ifBlank { ChatRouteMode.AUTO.name })
            }.getOrDefault(ChatRouteMode.AUTO)
            gatewayUrl = secureStore.get("gateway_url")
            gatewayToken = secureStore.get("gateway_token")
            webEnabled = secureStore.get("web_enabled").let { it.isBlank() || it == "1" }
            phoneEnabled = secureStore.get("phone_tools_enabled").let { it.isBlank() || it == "1" }
            memoryEnabled = secureStore.get("memory_context_enabled").let { it.isBlank() || it == "1" }
            if (apiKey.isNotBlank()) refreshModels()
        }

        val speechLauncher = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let {
                    if (it.isNotBlank()) prompt = it
                }
            }
        }
        val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                speechLauncher.launch(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                    putExtra(RecognizerIntent.EXTRA_PROMPT, "Parla al tuo second brain")
                })
            } else status = "Permesso microfono non concesso"
        }
        val attachmentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            if (uris.isNotEmpty()) {
                scope.launch {
                    status = "Preparo gli allegati…"
                    runCatching { loadChatAttachments(context, uris) }
                        .onSuccess { loaded ->
                            attachments.clear()
                            attachments.addAll(loaded.attachments)
                            status = loaded.note ?: "${loaded.attachments.size} allegati pronti"
                        }
                        .onFailure { status = it.message ?: "Impossibile leggere gli allegati" }
                }
            }
        }

        fun sendMessage() {
            if (loading || (prompt.isBlank() && attachments.isEmpty())) return
            if (apiKey.isBlank()) {
                section = V5Section.MODELS
                status = "Configura OpenRouter per iniziare"
                return
            }
            if (models.isEmpty()) {
                status = "Carico i modelli: riprova tra un attimo"
                scope.launch { refreshModels() }
                return
            }

            val rawText = prompt.trim()
            val taskText = rawText.ifBlank { "Analizza gli allegati e dimmi cosa contengono." }
            val sendAttachments = attachments.toList()
            val requiresVision = sendAttachments.any { it.mimeType.startsWith("image/", true) }
            val eligible = if (requiresVision) {
                models.filter { it.vision || it.id.equals("openrouter/free", true) }
            } else models

            var decision = SmartModelRouter.choose(
                requestedMode = routeMode,
                prompt = taskText,
                attachments = sendAttachments.size,
                models = eligible,
                manualModelId = manualModelId,
                budgetFraction = budgetStore.usageFraction()
            )
            if (decision == null) {
                status = if (routeMode == ChatRouteMode.MANUAL) "Scegli il modello Manuale" else "Nessun modello compatibile"
                section = V5Section.MODELS
                return
            }

            if (budgetStore.remainingEur() <= 0.01 && !decision.model.isFree) {
                if (routeMode == ChatRouteMode.MANUAL) {
                    status = "Budget mensile raggiunto: scegli Gratis"
                    return
                }
                decision = SmartModelRouter.choose(
                    requestedMode = ChatRouteMode.FREE,
                    prompt = taskText,
                    attachments = sendAttachments.size,
                    models = eligible,
                    manualModelId = manualModelId,
                    budgetFraction = 1.0
                ) ?: run {
                    status = "Budget raggiunto e nessun modello gratuito disponibile"
                    return
                }
            }

            val primary = decision
            val relevantMemory = if (memoryEnabled) memoryStore.contextTextFor(taskText) else ""
            val relevantSkills = if (memoryEnabled) skillStore.contextFor(taskText) else ""
            val history = messages.takeLast(10).map { ChatMessage(it.role, it.text) } + ChatMessage("user", taskText)
            val estimatedInputTokens = (
                history.sumOf { it.content.length } + relevantMemory.length + relevantSkills.length
            ).coerceAtLeast(1) / 4
            var outputLimit = budgetStore.maxOutputTokens(
                primary.model,
                estimatedInputTokens,
                if (primary.mode == ChatRouteMode.ADVANCED) 5200 else 3200
            )
            if (primary.model.isFree) outputLimit = 4096
            if (outputLimit == 0) {
                status = "Budget insufficiente per questo modello: usa Gratis"
                return
            }

            prompt = ""
            attachments.clear()
            messages += V5ChatMessage("user", taskText)
            loading = true
            status = "${primary.reason} · ${v5ShortModel(primary.model.id)}"

            scope.launch {
                suspend fun execute(d: RouteDecision): AgentResult {
                    val maxTokens = if (d.model.isFree) 4096 else budgetStore.maxOutputTokens(
                        d.model,
                        estimatedInputTokens,
                        if (d.mode == ChatRouteMode.ADVANCED) 5200 else 3200
                    ).coerceAtLeast(128)
                    return agentClient.run(
                        apiKey = apiKey,
                        model = d.model,
                        messages = history,
                        attachments = sendAttachments,
                        relevantMemory = relevantMemory,
                        relevantSkills = relevantSkills,
                        maxOutputTokens = maxTokens,
                        enableDeviceTools = phoneEnabled,
                        enableWebTools = webEnabled
                    )
                }

                var used = primary
                var outcome = runCatching { execute(primary) }
                if (outcome.isFailure && routeMode != ChatRouteMode.MANUAL) {
                    val fallback = SmartModelRouter.choose(
                        requestedMode = primary.mode,
                        prompt = taskText,
                        attachments = sendAttachments.size,
                        models = eligible.filterNot { it.id == primary.model.id },
                        manualModelId = manualModelId,
                        budgetFraction = budgetStore.usageFraction()
                    )
                    if (fallback != null) {
                        used = fallback
                        status = "Fallback · ${v5ShortModel(fallback.model.id)}"
                        outcome = runCatching { execute(fallback) }
                    }
                }

                outcome.onSuccess { result ->
                    budgetStore.addUsd(result.costUsd)
                    budgetRefresh++
                    lastModelUsed = result.modelId
                    messages += V5ChatMessage(
                        role = "assistant",
                        text = result.text,
                        modelId = result.modelId,
                        costUsd = result.costUsd,
                        toolActions = result.toolActions,
                        webSearches = result.webSearches
                    )
                    if (memoryEnabled && learningEnabled && memoryStore.learnFrom(rawText)) brainRefresh++
                    if (memoryEnabled && result.toolActions >= 2 && skillStore.learn(taskText, result.skillTrace)) brainRefresh++
                    status = "Pronto · ${v5ShortModel(used.model.id)}"
                }.onFailure { error ->
                    messages += V5ChatMessage("assistant", "Errore: ${error.message ?: "richiesta non riuscita"}")
                    status = error.message ?: "Errore"
                }
                loading = false
            }
        }

        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0xFF0C0B12), V5Bg, Color(0xFF06080B))))
        ) {
            Box(
                Modifier
                    .size(270.dp)
                    .align(Alignment.TopEnd)
                    .clip(CircleShape)
                    .background(Brush.radialGradient(listOf(V5Purple.copy(alpha = 0.10f), Color.Transparent)))
            )
            Column(
                Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .imePadding()
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                V5TopBar(
                    routeMode = routeMode,
                    lastModel = lastModelUsed.ifBlank { manualModelId },
                    spentEur = budgetStore.spentEurConservative(),
                    budgetEur = budgetStore.budgetEur(),
                    refresh = budgetRefresh
                )
                Spacer(Modifier.height(8.dp))
                Box(Modifier.weight(1f)) {
                    when (section) {
                        V5Section.CHAT -> V5ChatScreen(
                            messages = messages,
                            prompt = prompt,
                            onPrompt = { prompt = it },
                            routeMode = routeMode,
                            onRouteMode = ::setRoute,
                            loading = loading,
                            status = status,
                            attachments = attachments,
                            onRemoveAttachment = { index -> if (index in attachments.indices) attachments.removeAt(index) },
                            onAttach = {
                                attachmentLauncher.launch(
                                    arrayOf(
                                        "image/*", "application/pdf", "text/*", "application/json", "text/csv",
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    )
                                )
                            },
                            onMic = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                            onSend = ::sendMessage,
                            onNewChat = {
                                messages.clear(); attachments.clear(); prompt = ""; status = "Nuova chat"
                            },
                            onGoModels = { section = V5Section.MODELS },
                            webEnabled = webEnabled,
                            onWebEnabled = {
                                webEnabled = it; secureStore.put("web_enabled", if (it) "1" else "0")
                            },
                            phoneEnabled = phoneEnabled,
                            onPhoneEnabled = {
                                phoneEnabled = it; secureStore.put("phone_tools_enabled", if (it) "1" else "0")
                            },
                            memoryEnabled = memoryEnabled,
                            onMemoryEnabled = {
                                memoryEnabled = it; secureStore.put("memory_context_enabled", if (it) "1" else "0")
                            }
                        )

                        V5Section.MODELS -> V5ModelsScreen(
                            apiKey = apiKey,
                            onApiKey = { apiKey = it },
                            models = models,
                            manualModelId = manualModelId,
                            routeMode = routeMode,
                            loading = loading,
                            status = status,
                            budgetStore = budgetStore,
                            refresh = budgetRefresh,
                            onSaveKey = {
                                secureStore.put("api_key", apiKey); status = "Chiave salvata nel Keystore"
                            },
                            onRefresh = { scope.launch { refreshModels() } },
                            onSelectManual = {
                                manualModelId = it.id
                                secureStore.put("selected_model", it.id)
                                setRoute(ChatRouteMode.MANUAL)
                                status = "Manuale: ${it.name}"
                            },
                            onBudget = { value -> budgetStore.setBudgetEur(value); budgetRefresh++ }
                        )

                        V5Section.BRAIN -> V5BrainScreen(
                            memoryStore = memoryStore,
                            skillStore = skillStore,
                            learningEnabled = learningEnabled,
                            refresh = brainRefresh,
                            onLearning = {
                                learningEnabled = it; memoryStore.setLearningEnabled(it)
                            },
                            onRefresh = { brainRefresh++ }
                        )

                        V5Section.DEVICE -> V5DeviceScreen(
                            webEnabled = webEnabled,
                            gatewayUrl = gatewayUrl,
                            onGatewayUrl = { gatewayUrl = it },
                            gatewayToken = gatewayToken,
                            onGatewayToken = { gatewayToken = it },
                            gatewayStatus = gatewayStatus,
                            gatewayTesting = gatewayTesting,
                            onSaveGateway = {
                                secureStore.put("gateway_url", gatewayUrl)
                                secureStore.put("gateway_token", gatewayToken)
                                gatewayStatus = "Configurazione salvata"
                            },
                            onTestGateway = {
                                if (gatewayUrl.isBlank()) gatewayStatus = "Inserisci l'URL del Gateway"
                                else {
                                    secureStore.put("gateway_url", gatewayUrl)
                                    secureStore.put("gateway_token", gatewayToken)
                                    gatewayTesting = true
                                    gatewayStatus = "Handshake OpenClaw v4…"
                                    scope.launch {
                                        val result = gatewayBridge.testConnection(gatewayUrl, gatewayToken)
                                        gatewayStatus = if (result.ok) {
                                            "Connesso${result.serverVersion?.let { " · v$it" }.orEmpty()}"
                                        } else result.message
                                        gatewayTesting = false
                                    }
                                }
                            },
                            openAccessibility = { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                            openNotifications = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
                            openBluetooth = { context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
                        )
                    }
                }
                Spacer(Modifier.height(8.dp))
                V5BottomDock(section) { section = it }
            }
        }
    }
}
