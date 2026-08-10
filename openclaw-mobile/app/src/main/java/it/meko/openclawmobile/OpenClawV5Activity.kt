package it.meko.openclawmobile

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.darkColorScheme
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.util.Locale

private enum class V5Section(val label: String) { CHAT("Chat"), MODELS("Modelli"), MEMORY("Brain"), DEVICE("Device") }
private enum class V5ModelSort(val label: String) { VALUE("Valore"), INTELLIGENCE("Intelligenza"), PRICE("Prezzo") }
private enum class V5MemoryTab { MEMORY, SKILLS }

private data class V5Message(
    val role: String,
    val text: String,
    val modelId: String = "",
    val costUsd: Double = 0.0,
    val toolActions: Int = 0,
    val webSearches: Int = 0
)

private val V5Bg = Color(0xFF07080B)
private val V5Panel = Color(0xFF111319)
private val V5Raised = Color(0xFF181B22)
private val V5Border = Color(0xFF292D37)
private val V5Text = Color(0xFFF7F7FA)
private val V5Muted = Color(0xFFADB1BC)
private val V5Subtle = Color(0xFF777D89)
private val V5Purple = Color(0xFF9F91FF)
private val V5Blue = Color(0xFF78A9FF)
private val V5Mint = Color(0xFF6FDCBE)
private val V5Amber = Color(0xFFFFC36A)
private val V5Danger = Color(0xFFFF7A85)
private val V5User = Color(0xFF5C50C9)

private val V5Scheme = darkColorScheme(
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
        val messages = remember { mutableStateListOf<V5Message>() }
        val attachments = remember { mutableStateListOf<ChatAttachment>() }

        var gatewayUrl by remember { mutableStateOf("") }
        var gatewayToken by remember { mutableStateOf("") }
        var gatewayStatus by remember { mutableStateOf("Non configurato") }
        var gatewayTesting by remember { mutableStateOf(false) }

        fun catalogWithFreeRouter(loaded: List<ModelInfo>): List<ModelInfo> {
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
                fileInput = true,
                intelligenceRank = null
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
                .onSuccess { loaded ->
                    models = catalogWithFreeRouter(loaded)
                    status = "${models.size} modelli disponibili"
                }
                .onFailure { status = it.message ?: "Errore catalogo OpenRouter" }
            loading = false
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
                result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { heard ->
                    if (heard.isNotBlank()) prompt = heard
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

        fun setRoute(mode: ChatRouteMode) {
            routeMode = mode
            secureStore.put("chat_route_mode", mode.name)
        }

        fun sendMessage() {
            if (loading || (prompt.isBlank() && attachments.isEmpty())) return
            if (apiKey.isBlank()) {
                section = V5Section.MODELS
                status = "Configura OpenRouter per iniziare"
                return
            }
            if (models.isEmpty()) {
                scope.launch { refreshModels() }
                return
            }

            val rawText = prompt.trim()
            val taskText = rawText.ifBlank { "Analizza gli allegati e dimmi cosa contengono." }
            val sendAttachments = attachments.toList()
            val requiresVision = sendAttachments.any { it.mimeType.startsWith("image/", true) }
            val eligibleModels = if (requiresVision) {
                models.filter { it.vision || it.id.equals("openrouter/free", true) }
            } else models

            var decision = SmartModelRouter.choose(
                requestedMode = routeMode,
                prompt = taskText,
                attachments = sendAttachments.size,
                models = eligibleModels,
                manualModelId = manualModelId,
                budgetFraction = budgetStore.usageFraction()
            )
            if (decision == null) {
                status = if (routeMode == ChatRouteMode.MANUAL) "Scegli un modello Manuale" else "Nessun modello compatibile"
                section = V5Section.MODELS
                return
            }

            if (budgetStore.remainingEur() <= 0.01 && !decision.model.isFree) {
                if (routeMode == ChatRouteMode.MANUAL) {
                    status = "Budget mensile raggiunto: scegli Gratis"
                    return
                }
                decision = SmartModelRouter.choose(
                    ChatRouteMode.FREE,
                    taskText,
                    sendAttachments.size,
                    eligibleModels,
                    manualModelId,
                    1.0
                ) ?: run {
                    status = "Budget raggiunto e nessun modello gratuito disponibile"
                    return
                }
            }

            val primaryDecision = decision
            val relevantMemory = if (memoryEnabled) memoryStore.contextTextFor(taskText) else ""
            val relevantSkills = if (memoryEnabled) skillStore.contextFor(taskText) else ""
            val history = messages.takeLast(10).map { ChatMessage(it.role, it.text) } + ChatMessage("user", taskText)
            val estimatedInputTokens = (
                history.sumOf { it.content.length } + relevantMemory.length + relevantSkills.length
            ).coerceAtLeast(1) / 4
            var maxOutput = budgetStore.maxOutputTokens(
                primaryDecision.model,
                estimatedInputTokens,
                if (primaryDecision.mode == ChatRouteMode.ADVANCED) 5200 else 3200
            )
            if (primaryDecision.model.isFree) maxOutput = 4096
            if (maxOutput == 0) {
                status = "Budget insufficiente per questo modello: usa Gratis"
                return
            }

            prompt = ""
            attachments.clear()
            messages.add(V5Message("user", taskText))
            loading = true
            status = "${primaryDecision.reason} · ${shortModel(primaryDecision.model.id)}"

            scope.launch {
                suspend fun runDecision(d: RouteDecision): AgentResult = agentClient.run(
                    apiKey = apiKey,
                    model = d.model,
                    messages = history,
                    attachments = sendAttachments,
                    relevantMemory = relevantMemory,
                    relevantSkills = relevantSkills,
                    maxOutputTokens = budgetStore.maxOutputTokens(
                        d.model,
                        estimatedInputTokens,
                        if (d.mode == ChatRouteMode.ADVANCED) 5200 else 3200
                    ).let { if (d.model.isFree) 4096 else it.coerceAtLeast(128) },
                    enableDeviceTools = phoneEnabled,
                    enableWebTools = webEnabled
                )

                var usedDecision = primaryDecision
                var outcome = runCatching { runDecision(primaryDecision) }
                if (outcome.isFailure && routeMode != ChatRouteMode.MANUAL) {
                    val fallback = SmartModelRouter.choose(
                        requestedMode = primaryDecision.mode,
                        prompt = taskText,
                        attachments = sendAttachments.size,
                        models = eligibleModels.filterNot { it.id == primaryDecision.model.id },
                        manualModelId = manualModelId,
                        budgetFraction = budgetStore.usageFraction()
                    )
                    if (fallback != null) {
                        usedDecision = fallback
                        status = "Fallback · ${shortModel(fallback.model.id)}"
                        outcome = runCatching { runDecision(fallback) }
                    }
                }

                outcome.onSuccess { result ->
                    budgetStore.addUsd(result.costUsd)
                    budgetRefresh++
                    lastModelUsed = result.modelId
                    messages.add(
                        V5Message(
                            role = "assistant",
                            text = result.text,
                            modelId = result.modelId,
                            costUsd = result.costUsd,
                            toolActions = result.toolActions,
                            webSearches = result.webSearches
                        )
                    )
                    if (memoryEnabled && learningEnabled && memoryStore.learnFrom(rawText)) brainRefresh++
                    if (memoryEnabled && result.toolActions >= 2 && skillStore.learn(taskText, result.skillTrace)) brainRefresh++
                    status = "Pronto · ${shortModel(usedDecision.model.id)}"
                }.onFailure { error ->
                    messages.add(V5Message("assistant", "Errore: ${error.message ?: "richiesta non riuscita"}"))
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
                    .size(290.dp)
                    .align(Alignment.TopEnd)
                    .background(
                        Brush.radialGradient(
                            listOf(V5Purple.copy(alpha = 0.10f), Color.Transparent)
                        )
                    )
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
                    budgetRefresh = budgetRefresh
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
                                        "image/*",
                                        "application/pdf",
                                        "text/*",
                                        "application/json",
                                        "text/csv",
                                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    )
                                )
                            },
                            onMic = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                            onSend = ::sendMessage,
                            onNewChat = {
                                messages.clear()
                                attachments.clear()
                                prompt = ""
                                status = "Nuova chat"
                            },
                            onGoModels = { section = V5Section.MODELS },
                            webEnabled = webEnabled,
                            onWebEnabled = {
                                webEnabled = it
                                secureStore.put("web_enabled", if (it) "1" else "0")
                            },
                            phoneEnabled = phoneEnabled,
                            onPhoneEnabled = {
                                phoneEnabled = it
                                secureStore.put("phone_tools_enabled", if (it) "1" else "0")
                            },
                            memoryEnabled = memoryEnabled,
                            onMemoryEnabled = {
                                memoryEnabled = it
                                secureStore.put("memory_context_enabled", if (it) "1" else "0")
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
                            budgetRefresh = budgetRefresh,
                            onSaveKey = {
                                secureStore.put("api_key", apiKey)
                                status = "Chiave salvata nel Keystore"
                            },
                            onRefresh = { scope.launch { refreshModels() } },
                            onSelectManual = { model ->
                                manualModelId = model.id
                                secureStore.put("selected_model", model.id)
                                setRoute(ChatRouteMode.MANUAL)
                                status = "Manuale: ${model.name}"
                            },
                            onBudget = {
                                budgetStore.setBudgetEur(it)
                                budgetRefresh++
                            }
                        )

                        V5Section.MEMORY -> V5BrainScreen(
                            memoryStore = memoryStore,
                            skillStore = skillStore,
                            learningEnabled = learningEnabled,
                            refresh = brainRefresh,
                            onLearning = {
                                learningEnabled = it
                                memoryStore.setLearningEnabled(it)
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
                                if (gatewayUrl.isBlank()) {
                                    gatewayStatus = "Inserisci l'URL del Gateway"
                                } else {
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
                V5BottomDock(selected = section, onSelect = { section = it })
            }
        }
    }
}

@Composable
private fun V5TopBar(
    routeMode: ChatRouteMode,
    lastModel: String,
    spentEur: Double,
    budgetEur: Double,
    budgetRefresh: Int
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(Brush.linearGradient(listOf(V5Purple, V5Blue))),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.SmartToy, null, tint = Color.White, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text("Second Brain", color = V5Text, fontSize = 17.sp, fontWeight = FontWeight.Bold)
            Text(
                if (lastModel.isBlank()) "OpenClaw Mobile · ${routeMode.label}" else "${routeMode.label} · ${shortModel(lastModel)}",
                color = V5Subtle,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Surface(shape = RoundedCornerShape(13.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.End) {
                Text("€${formatCompact(spentEur)} / €${formatCompact(budgetEur)}", color = V5Text, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text("MESE", color = if (spentEur < budgetEur * .9) V5Mint else V5Amber, fontSize = 7.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun V5BottomDock(selected: V5Section, onSelect: (V5Section) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color(0xF214161C),
        border = BorderStroke(1.dp, V5Border)
    ) {
        Row(Modifier.fillMaxWidth().padding(5.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            V5Section.entries.forEach { item ->
                val active = selected == item
                Surface(
                    onClick = { onSelect(item) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(18.dp),
                    color = if (active) Color(0xFF242130) else Color.Transparent
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 7.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Icon(
                            when (item) {
                                V5Section.CHAT -> Icons.Rounded.Chat
                                V5Section.MODELS -> Icons.Rounded.Tune
                                V5Section.MEMORY -> Icons.Rounded.Memory
                                V5Section.DEVICE -> Icons.Rounded.Devices
                            },
                            item.label,
                            modifier = Modifier.size(19.dp),
                            tint = if (active) V5Purple else V5Subtle
                        )
                        Text(item.label, color = if (active) V5Text else V5Subtle, fontSize = 9.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
        }
    }
}

@Composable
private fun V5ChatScreen(
    messages: List<V5Message>,
    prompt: String,
    onPrompt: (String) -> Unit,
    routeMode: ChatRouteMode,
    onRouteMode: (ChatRouteMode) -> Unit,
    loading: Boolean,
    status: String,
    attachments: List<ChatAttachment>,
    onRemoveAttachment: (Int) -> Unit,
    onAttach: () -> Unit,
    onMic: () -> Unit,
    onSend: () -> Unit,
    onNewChat: () -> Unit,
    onGoModels: () -> Unit,
    webEnabled: Boolean,
    onWebEnabled: (Boolean) -> Unit,
    phoneEnabled: Boolean,
    onPhoneEnabled: (Boolean) -> Unit,
    memoryEnabled: Boolean,
    onMemoryEnabled: (Boolean) -> Unit
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val listState = rememberLazyListState()
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.lastIndex)
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Agent", color = V5Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Text("ragiona · cerca · usa le app · ricorda", color = V5Muted, fontSize = 10.sp)
            }
            TextButton(onClick = onNewChat, enabled = messages.isNotEmpty()) { Text("Nuova") }
        }
        Spacer(Modifier.height(6.dp))

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            ChatRouteMode.entries.forEach { mode ->
                FilterChip(
                    selected = routeMode == mode,
                    onClick = { if (mode == ChatRouteMode.MANUAL) onGoModels() else onRouteMode(mode) },
                    label = { Text(mode.label, fontSize = 10.sp) }
                )
            }
        }
        Spacer(Modifier.height(3.dp))
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            V5ToolToggle("Web", Icons.Rounded.Language, webEnabled, onWebEnabled)
            V5ToolToggle("Telefono", Icons.Rounded.Devices, phoneEnabled, onPhoneEnabled, activeAvailable = ClawAccessibilityService.available())
            V5ToolToggle("Memoria", Icons.Rounded.Memory, memoryEnabled, onMemoryEnabled)
        }
        Spacer(Modifier.height(8.dp))

        if (messages.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(11.dp)) {
                    Box(
                        Modifier
                            .size(70.dp)
                            .clip(CircleShape)
                            .background(Brush.radialGradient(listOf(V5Purple.copy(alpha = .28f), V5Purple.copy(alpha = .06f)))),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.SmartToy, null, tint = V5Purple, modifier = Modifier.size(31.dp))
                    }
                    Text("Che cosa vuoi fare?", color = V5Text, fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
                    Text("Puoi chiedere, allegare, cercare sul web o farmi agire sul telefono.", color = V5Muted, fontSize = 11.sp)
                    Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        V5Suggestion("Apri Spotify") { onPrompt("Apri Spotify e cerca ") }
                        V5Suggestion("Cerca sul web") { onPrompt("Cerca sul web le ultime informazioni su ") }
                        V5Suggestion("Analizza documento") { onPrompt("Analizza questo documento e dammi i punti importanti") }
                    }
                }
            }
        } else {
            LazyColumn(
                state = listState,
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(15.dp)
            ) {
                items(messages) { message ->
                    if (message.role == "user") {
                        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                            Surface(
                                modifier = Modifier.fillMaxWidth(.86f),
                                shape = RoundedCornerShape(20.dp, 20.dp, 7.dp, 20.dp),
                                color = V5User
                            ) {
                                SelectionContainer {
                                    Text(message.text, Modifier.padding(horizontal = 14.dp, vertical = 11.dp), color = Color.White, fontSize = 14.sp, lineHeight = 20.sp)
                                }
                            }
                        }
                    } else {
                        V5AssistantMessage(message = message, onCopy = { copyText(context, cleanAssistantText(message.text)) })
                    }
                }
            }
        }

        if (attachments.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                attachments.forEachIndexed { index, attachment ->
                    Surface(shape = RoundedCornerShape(13.dp), color = V5Raised, border = BorderStroke(1.dp, V5Border)) {
                        Row(Modifier.padding(start = 9.dp, end = 3.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.AttachFile, null, modifier = Modifier.size(14.dp), tint = V5Mint)
                            Spacer(Modifier.size(5.dp))
                            Text(attachment.name.take(24), color = V5Text, fontSize = 9.sp, maxLines = 1)
                            IconButton(onClick = { onRemoveAttachment(index) }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Rounded.Close, "Rimuovi", modifier = Modifier.size(15.dp), tint = V5Muted)
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(5.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (loading) V5Amber else V5Mint))
            Spacer(Modifier.size(6.dp))
            Text(status, color = V5Subtle, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(6.dp))

        Surface(shape = RoundedCornerShape(26.dp), color = Color(0xFF171A21), border = BorderStroke(1.dp, V5Border)) {
            Row(Modifier.fillMaxWidth().padding(5.dp), verticalAlignment = Alignment.Bottom) {
                IconButton(onClick = onAttach, modifier = Modifier.size(42.dp)) { Icon(Icons.Rounded.Add, "Allega", tint = V5Muted) }
                TextField(
                    value = prompt,
                    onValueChange = onPrompt,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Chiedi o fai qualcosa…", color = V5Subtle) },
                    minLines = 1,
                    maxLines = 5,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedTextColor = V5Text,
                        unfocusedTextColor = V5Text
                    )
                )
                IconButton(onClick = onMic, modifier = Modifier.size(42.dp)) { Icon(Icons.Rounded.Mic, "Microfono", tint = V5Muted) }
                Surface(shape = CircleShape, color = V5Purple, modifier = Modifier.size(42.dp)) {
                    IconButton(onClick = onSend, enabled = !loading) {
                        if (loading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = Color.White)
                        else Icon(Icons.Rounded.Send, "Invia", tint = Color.White, modifier = Modifier.size(19.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun V5ToolToggle(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    enabled: Boolean,
    onEnabled: (Boolean) -> Unit,
    activeAvailable: Boolean = true
) {
    Surface(
        onClick = { onEnabled(!enabled) },
        shape = RoundedCornerShape(13.dp),
        color = if (enabled) V5Purple.copy(alpha = .11f) else Color.Transparent,
        border = BorderStroke(1.dp, if (enabled) V5Purple.copy(alpha = .34f) else V5Border)
    ) {
        Row(Modifier.padding(horizontal = 9.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, tint = if (enabled && activeAvailable) V5Purple else V5Subtle, modifier = Modifier.size(14.dp))
            Spacer(Modifier.size(5.dp))
            Text(label, color = if (enabled) V5Text else V5Subtle, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
            if (enabled && !activeAvailable) {
                Spacer(Modifier.size(5.dp))
                Box(Modifier.size(5.dp).clip(CircleShape).background(V5Amber))
            }
        }
    }
}

@Composable
private fun V5Suggestion(text: String, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(14.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
        Text(text, Modifier.padding(horizontal = 11.dp, vertical = 8.dp), color = V5Muted, fontSize = 10.sp)
    }
}

@Composable
private fun V5AssistantMessage(message: V5Message, onCopy: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
        Box(
            Modifier.size(28.dp).clip(RoundedCornerShape(9.dp)).background(V5Purple.copy(alpha = .14f)),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.SmartToy, null, tint = V5Purple, modifier = Modifier.size(16.dp))
        }
        Spacer(Modifier.size(9.dp))
        Column(Modifier.weight(1f)) {
            SelectionContainer {
                Text(cleanAssistantText(message.text), color = V5Text, fontSize = 14.sp, lineHeight = 21.sp)
            }
            Spacer(Modifier.height(6.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (message.modelId.isNotBlank()) {
                    Text(shortModel(message.modelId), color = V5Subtle, fontSize = 8.sp, fontWeight = FontWeight.SemiBold)
                }
                if (message.costUsd > 0) {
                    Text("  ·  ~€${formatCost(message.costUsd * MonthlyBudgetStore.USD_TO_EUR_SAFETY)}", color = V5Subtle, fontSize = 8.sp)
                } else if (message.modelId.isNotBlank()) {
                    Text("  ·  gratis", color = V5Mint, fontSize = 8.sp)
                }
                if (message.toolActions > 0) Text("  ·  ${message.toolActions} azioni", color = V5Subtle, fontSize = 8.sp)
                if (message.webSearches > 0) Text("  ·  web ${message.webSearches}", color = V5Subtle, fontSize = 8.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onCopy, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Rounded.ContentCopy, "Copia", tint = V5Muted, modifier = Modifier.size(15.dp))
                }
            }
        }
    }
}

@Composable
private fun V5ModelsScreen(
    apiKey: String,
    onApiKey: (String) -> Unit,
    models: List<ModelInfo>,
    manualModelId: String,
    routeMode: ChatRouteMode,
    loading: Boolean,
    status: String,
    budgetStore: MonthlyBudgetStore,
    budgetRefresh: Int,
    onSaveKey: () -> Unit,
    onRefresh: () -> Unit,
    onSelectManual: (ModelInfo) -> Unit,
    onBudget: (Double) -> Unit
) {
    var search by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(V5ModelSort.VALUE) }
    var freeOnly by remember { mutableStateOf(false) }
    var toolsOnly by remember { mutableStateOf(false) }
    var showProvider by remember { mutableStateOf(apiKey.isBlank()) }

    val visible = models
        .asSequence()
        .filter { search.isBlank() || it.name.contains(search, true) || it.id.contains(search, true) }
        .filter { !freeOnly || it.isFree }
        .filter { !toolsOnly || it.tools || it.id.equals("openrouter/free", true) }
        .sortedWith(
            when (sort) {
                V5ModelSort.INTELLIGENCE -> compareBy<ModelInfo> { it.intelligenceRank ?: Int.MAX_VALUE }.thenBy { it.averagePricePerMillion ?: Double.MAX_VALUE }
                V5ModelSort.PRICE -> compareBy<ModelInfo> { it.averagePricePerMillion ?: Double.MAX_VALUE }.thenBy { it.intelligenceRank ?: Int.MAX_VALUE }
                V5ModelSort.VALUE -> compareByDescending<ModelInfo> { modelValue(model) }.thenBy { it.intelligenceRank ?: Int.MAX_VALUE }
            }
        ).toList()

    val fraction = budgetStore.usageFraction().coerceIn(0.0, 1.0)
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Model Router", color = V5Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            Text("Qualità utile per euro speso, con fallback automatico.", color = V5Muted, fontSize = 10.sp)
        }
        item {
            Surface(shape = RoundedCornerShape(18.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text("Budget mensile", color = V5Text, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                            Text("€${formatCompact(budgetStore.spentEurConservative())} usati · €${formatCompact(budgetStore.remainingEur())} disponibili", color = V5Muted, fontSize = 9.sp)
                        }
                        Text("max €20", color = V5Mint, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                    LinearProgressIndicator(progress = fraction.toFloat(), modifier = Modifier.fillMaxWidth().height(5.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        listOf(5.0, 10.0, 15.0, 20.0).forEach { value ->
                            FilterChip(
                                selected = budgetStore.budgetEur() == value,
                                onClick = { onBudget(value) },
                                label = { Text("€${value.toInt()}", fontSize = 9.sp) }
                            )
                        }
                    }
                    Text("Auto usa Gratis quando il budget è quasi esaurito; le modalità pagate non superano il tetto locale.", color = V5Subtle, fontSize = 8.sp)
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(7.dp)) {
                Text("Profili rapidi", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                V5RouteExplanation("Normale", "DeepSeek V4 Flash · MiMo V2.5", "Costo/efficacia per uso quotidiano")
                V5RouteExplanation("Avanzata", "Kimi K2.6 · DeepSeek V4 Pro", "Task complessi, reasoning e agent loop lunghi")
                V5RouteExplanation("Gratis", "Nemotron · Kimi free · Free Router", "Solo modelli gratuiti disponibili")
            }
        }
        item {
            Surface(
                onClick = { showProvider = !showProvider },
                shape = RoundedCornerShape(16.dp),
                color = V5Panel,
                border = BorderStroke(1.dp, V5Border)
            ) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Rounded.Lock, null, tint = V5Purple, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Column(Modifier.weight(1f)) {
                        Text("OpenRouter", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(if (apiKey.isBlank()) "Chiave non configurata" else "Chiave salvata localmente e cifrata", color = V5Muted, fontSize = 8.sp)
                    }
                    Icon(Icons.Rounded.Settings, null, tint = V5Muted, modifier = Modifier.size(17.dp))
                }
            }
            if (showProvider) {
                Spacer(Modifier.height(7.dp))
                Surface(shape = RoundedCornerShape(16.dp), color = V5Raised, border = BorderStroke(1.dp, V5Border)) {
                    Column(Modifier.padding(11.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = apiKey,
                            onValueChange = onApiKey,
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("OpenRouter API key") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Button(onClick = onSaveKey, modifier = Modifier.weight(1f)) { Text("Salva") }
                            OutlinedButton(onClick = onRefresh, modifier = Modifier.weight(1f), enabled = !loading) {
                                if (loading) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp) else Icon(Icons.Rounded.Refresh, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.size(5.dp))
                                Text("Modelli")
                            }
                        }
                    }
                }
            }
        }
        item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = search,
                    onValueChange = { search = it },
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Cerca modello") },
                    leadingIcon = { Icon(Icons.Rounded.Search, null) },
                    singleLine = true
                )
            }
            Spacer(Modifier.height(6.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                V5ModelSort.entries.forEach { option ->
                    FilterChip(selected = sort == option, onClick = { sort = option }, label = { Text(option.label, fontSize = 9.sp) })
                }
                FilterChip(selected = freeOnly, onClick = { freeOnly = !freeOnly }, label = { Text("Gratis", fontSize = 9.sp) })
                FilterChip(selected = toolsOnly, onClick = { toolsOnly = !toolsOnly }, label = { Text("Tools", fontSize = 9.sp) })
            }
            Spacer(Modifier.height(3.dp))
            Text("${visible.size} modelli · $status", color = V5Subtle, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        items(visible, key = { it.id }) { model ->
            V5ModelRow(model = model, selected = routeMode == ChatRouteMode.MANUAL && manualModelId == model.id, onClick = { onSelectManual(model) })
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun V5RouteExplanation(title: String, models: String, description: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(7.dp).clip(CircleShape).background(V5Purple))
        Spacer(Modifier.size(8.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = V5Text, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(models, color = V5Purple, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
        }
        Text(description, color = V5Subtle, fontSize = 8.sp, modifier = Modifier.fillMaxWidth(.47f))
    }
}

@Composable
private fun V5ModelRow(model: ModelInfo, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(17.dp),
        color = if (selected) V5Purple.copy(alpha = .12f) else V5Panel,
        border = BorderStroke(1.dp, if (selected) V5Purple.copy(alpha = .55f) else V5Border)
    ) {
        Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(5.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(model.name, color = V5Text, fontSize = 11.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(model.id, color = V5Subtle, fontSize = 7.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (selected) Icon(Icons.Rounded.CheckCircle, null, tint = V5Mint, modifier = Modifier.size(18.dp))
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                V5TinyTag(if (model.isFree) "GRATIS" else priceLabel(model), if (model.isFree) V5Mint else V5Muted)
                model.intelligenceRank?.let { V5TinyTag("INT #$it", V5Purple) }
                if (model.tools) V5TinyTag("TOOLS", V5Blue)
                if (model.reasoning) V5TinyTag("REASONING", V5Amber)
                if (model.vision) V5TinyTag("VISION", V5Mint)
                if (model.contextLength > 0) V5TinyTag("${model.contextLength / 1000}K", V5Muted)
            }
        }
    }
}

@Composable
private fun V5TinyTag(text: String, tint: Color) {
    Surface(shape = RoundedCornerShape(8.dp), color = tint.copy(alpha = .10f)) {
        Text(text, Modifier.padding(horizontal = 6.dp, vertical = 3.dp), color = tint, fontSize = 7.sp, fontWeight = FontWeight.Bold)
    }
}

@Composable
private fun V5BrainScreen(
    memoryStore: MemoryStore,
    skillStore: SkillStore,
    learningEnabled: Boolean,
    refresh: Int,
    onLearning: (Boolean) -> Unit,
    onRefresh: () -> Unit
) {
    var tab by remember { mutableStateOf(V5MemoryTab.MEMORY) }
    var newMemory by remember { mutableStateOf("") }
    var editingMemory by remember { mutableStateOf<Long?>(null) }
    var editMemoryText by remember { mutableStateOf("") }
    var editingSkill by remember { mutableStateOf<Long?>(null) }
    var editSkillTitle by remember { mutableStateOf("") }
    var editSkillSteps by remember { mutableStateOf("") }
    val memories = remember(refresh) { memoryStore.list() }
    val skills = remember(refresh) { skillStore.list() }

    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Second Brain", color = V5Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            Text("Memoria selettiva e procedure locali. La cronologia chat non viene salvata come memoria.", color = V5Muted, fontSize = 10.sp)
        }
        item {
            Surface(shape = RoundedCornerShape(18.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Apprendimento locale", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text("${memories.size} memorie · ${skills.size} skills · retrieval max ${MemoryStore.MAX_RETRIEVED_ITEMS}", color = V5Muted, fontSize = 8.sp)
                    }
                    Switch(checked = learningEnabled, onCheckedChange = onLearning)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                FilterChip(selected = tab == V5MemoryTab.MEMORY, onClick = { tab = V5MemoryTab.MEMORY }, label = { Text("Memorie") })
                FilterChip(selected = tab == V5MemoryTab.SKILLS, onClick = { tab = V5MemoryTab.SKILLS }, label = { Text("Skills") })
            }
        }

        if (tab == V5MemoryTab.MEMORY) {
            item {
                Surface(shape = RoundedCornerShape(16.dp), color = V5Raised, border = BorderStroke(1.dp, V5Border)) {
                    Row(Modifier.fillMaxWidth().padding(7.dp), verticalAlignment = Alignment.CenterVertically) {
                        TextField(
                            value = newMemory,
                            onValueChange = { newMemory = it },
                            modifier = Modifier.weight(1f),
                            placeholder = { Text("Aggiungi un fatto o una preferenza…", fontSize = 10.sp) },
                            colors = TextFieldDefaults.colors(
                                focusedContainerColor = Color.Transparent,
                                unfocusedContainerColor = Color.Transparent,
                                focusedIndicatorColor = Color.Transparent,
                                unfocusedIndicatorColor = Color.Transparent
                            )
                        )
                        IconButton(onClick = {
                            if (newMemory.isNotBlank()) {
                                memoryStore.add(newMemory)
                                newMemory = ""
                                onRefresh()
                            }
                        }) { Icon(Icons.Rounded.Add, "Aggiungi", tint = V5Purple) }
                    }
                }
            }
            items(memories, key = { it.id }) { item ->
                Surface(shape = RoundedCornerShape(16.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                    Column(Modifier.padding(11.dp)) {
                        if (editingMemory == item.id) {
                            OutlinedTextField(value = editMemoryText, onValueChange = { editMemoryText = it }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = { editingMemory = null }) { Text("Annulla") }
                                TextButton(onClick = {
                                    if (memoryStore.update(item.id, editMemoryText)) onRefresh()
                                    editingMemory = null
                                }) { Text("Salva") }
                            }
                        } else {
                            Row(verticalAlignment = Alignment.Top) {
                                V5TinyTag(item.kind.label.uppercase(), if (item.pinned) V5Purple else V5Muted)
                                Spacer(Modifier.size(7.dp))
                                Text(item.text, color = V5Text, fontSize = 11.sp, lineHeight = 16.sp, modifier = Modifier.weight(1f))
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                IconButton(onClick = { memoryStore.setPinned(item.id, !item.pinned); onRefresh() }, modifier = Modifier.size(31.dp)) {
                                    Icon(Icons.Rounded.PushPin, "Fissa", tint = if (item.pinned) V5Purple else V5Subtle, modifier = Modifier.size(15.dp))
                                }
                                IconButton(onClick = { editMemoryText = item.text; editingMemory = item.id }, modifier = Modifier.size(31.dp)) {
                                    Icon(Icons.Rounded.Edit, "Modifica", tint = V5Muted, modifier = Modifier.size(15.dp))
                                }
                                IconButton(onClick = { memoryStore.remove(item.id); onRefresh() }, modifier = Modifier.size(31.dp)) {
                                    Icon(Icons.Rounded.Delete, "Elimina", tint = V5Danger, modifier = Modifier.size(15.dp))
                                }
                            }
                        }
                    }
                }
            }
        } else {
            item {
                Text("Le skills vengono create solo dopo sequenze di azioni realmente riuscite. Non aggiungono una seconda chiamata AI.", color = V5Subtle, fontSize = 9.sp)
            }
            if (skills.isEmpty()) {
                item {
                    Surface(shape = RoundedCornerShape(16.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                        Text("Nessuna skill ancora. Quando completi un task multi-step sul telefono, la procedura può essere ricordata localmente.", Modifier.padding(13.dp), color = V5Muted, fontSize = 10.sp)
                    }
                }
            }
            items(skills, key = { it.id }) { skill ->
                Surface(shape = RoundedCornerShape(16.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                    Column(Modifier.padding(11.dp)) {
                        if (editingSkill == skill.id) {
                            OutlinedTextField(value = editSkillTitle, onValueChange = { editSkillTitle = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Nome") })
                            Spacer(Modifier.height(6.dp))
                            OutlinedTextField(value = editSkillSteps, onValueChange = { editSkillSteps = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Passi, uno per riga") }, minLines = 3)
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = { editingSkill = null }) { Text("Annulla") }
                                TextButton(onClick = {
                                    if (skillStore.update(skill.id, editSkillTitle, editSkillSteps.lines())) onRefresh()
                                    editingSkill = null
                                }) { Text("Salva") }
                            }
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Rounded.Star, null, tint = if (skill.pinned) V5Purple else V5Amber, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.size(7.dp))
                                Text(skill.title, color = V5Text, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
                            }
                            Spacer(Modifier.height(5.dp))
                            skill.steps.take(5).forEach { step -> Text("• ${step.substringBefore("→").trim()}", color = V5Muted, fontSize = 9.sp, lineHeight = 14.sp) }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                IconButton(onClick = { skillStore.setPinned(skill.id, !skill.pinned); onRefresh() }, modifier = Modifier.size(31.dp)) {
                                    Icon(Icons.Rounded.PushPin, "Fissa", tint = if (skill.pinned) V5Purple else V5Subtle, modifier = Modifier.size(15.dp))
                                }
                                IconButton(onClick = {
                                    editSkillTitle = skill.title
                                    editSkillSteps = skill.steps.joinToString("\n")
                                    editingSkill = skill.id
                                }, modifier = Modifier.size(31.dp)) { Icon(Icons.Rounded.Edit, "Modifica", tint = V5Muted, modifier = Modifier.size(15.dp)) }
                                IconButton(onClick = { skillStore.remove(skill.id); onRefresh() }, modifier = Modifier.size(31.dp)) { Icon(Icons.Rounded.Delete, "Elimina", tint = V5Danger, modifier = Modifier.size(15.dp)) }
                            }
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun V5DeviceScreen(
    webEnabled: Boolean,
    gatewayUrl: String,
    onGatewayUrl: (String) -> Unit,
    gatewayToken: String,
    onGatewayToken: (String) -> Unit,
    gatewayStatus: String,
    gatewayTesting: Boolean,
    onSaveGateway: () -> Unit,
    onTestGateway: () -> Unit,
    openAccessibility: () -> Unit,
    openNotifications: () -> Unit,
    openBluetooth: () -> Unit
) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Device & Tools", color = V5Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            Text("Il Direct Brain funziona sul telefono; OpenClaw Gateway è un'estensione opzionale.", color = V5Muted, fontSize = 10.sp)
        }
        item {
            V5DeviceCard(
                title = "Controllo Android",
                subtitle = if (ClawAccessibilityService.available()) "Attivo · agent loop può leggere, toccare, scrivere e scorrere" else "Da abilitare · senza questo il modello non può agire sulle app",
                icon = Icons.Rounded.Devices,
                active = ClawAccessibilityService.available(),
                action = "Accessibilità",
                onAction = openAccessibility
            )
        }
        item {
            V5DeviceCard(
                title = "Web on-demand",
                subtitle = if (webEnabled) "Attivo · OpenRouter search/fetch solo quando il modello ne ha bisogno" else "Disattivato dalla Chat",
                icon = Icons.Rounded.Language,
                active = webEnabled,
                action = null,
                onAction = {}
            )
        }
        item {
            V5DeviceCard(
                title = "Notifiche",
                subtitle = "Accesso opzionale al contesto delle notifiche del telefono",
                icon = Icons.Rounded.Notifications,
                active = ClawNotificationService.recentNotifications().isNotEmpty(),
                action = "Impostazioni",
                onAction = openNotifications
            )
        }
        item {
            V5DeviceCard(
                title = "Bluetooth / smart glasses",
                subtitle = "Microfono e audio seguono i dispositivi Bluetooth esposti da Android",
                icon = Icons.Rounded.Bluetooth,
                active = true,
                action = "Bluetooth",
                onAction = openBluetooth
            )
        }
        item {
            Surface(shape = RoundedCornerShape(19.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                Column(Modifier.padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(30.dp).clip(RoundedCornerShape(10.dp)).background(V5Purple.copy(alpha = .12f)), contentAlignment = Alignment.Center) {
                            Icon(Icons.Rounded.SmartToy, null, tint = V5Purple, modifier = Modifier.size(17.dp))
                        }
                        Spacer(Modifier.size(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text("OpenClaw Gateway", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text("Protocollo v4 reale · opzionale", color = V5Purple, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text("Serve solo se vuoi collegare questo telefono a un Gateway OpenClaw esterno. Il Direct Brain non dipende dal Gateway.", color = V5Muted, fontSize = 9.sp)
                    OutlinedTextField(value = gatewayUrl, onValueChange = onGatewayUrl, modifier = Modifier.fillMaxWidth(), label = { Text("wss://gateway o host") }, singleLine = true)
                    OutlinedTextField(value = gatewayToken, onValueChange = onGatewayToken, modifier = Modifier.fillMaxWidth(), label = { Text("Token / bootstrap auth") }, visualTransformation = PasswordVisualTransformation(), singleLine = true)
                    Text(gatewayStatus, color = if (gatewayStatus.startsWith("Connesso")) V5Mint else V5Muted, fontSize = 9.sp)
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = onSaveGateway, modifier = Modifier.weight(1f)) { Text("Salva") }
                        Button(onClick = onTestGateway, enabled = !gatewayTesting, modifier = Modifier.weight(1f)) {
                            if (gatewayTesting) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = Color.White)
                            else Icon(Icons.Rounded.CheckCircle, null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.size(5.dp))
                            Text("Test")
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun V5DeviceCard(
    title: String,
    subtitle: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    active: Boolean,
    action: String?,
    onAction: () -> Unit
) {
    Surface(shape = RoundedCornerShape(17.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(35.dp).clip(RoundedCornerShape(11.dp)).background(if (active) V5Mint.copy(alpha = .10f) else V5Amber.copy(alpha = .10f)), contentAlignment = Alignment.Center) {
                Icon(icon, null, tint = if (active) V5Mint else V5Amber, modifier = Modifier.size(19.dp))
            }
            Spacer(Modifier.size(9.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = V5Text, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                Text(subtitle, color = V5Muted, fontSize = 8.sp, lineHeight = 12.sp)
            }
            if (action != null) TextButton(onClick = onAction) { Text(action, fontSize = 9.sp) }
        }
    }
}

private fun shortModel(id: String): String = id.substringAfter('/').take(28)

private fun formatCompact(value: Double): String = String.format(Locale.US, if (value < 1) "%.2f" else "%.1f", value)
private fun formatCost(value: Double): String = when {
    value < 0.001 -> String.format(Locale.US, "%.4f", value)
    value < 0.01 -> String.format(Locale.US, "%.3f", value)
    else -> String.format(Locale.US, "%.2f", value)
}

private fun priceLabel(model: ModelInfo): String {
    val avg = model.averagePricePerMillion ?: return "PREZZO ?"
    return "$${String.format(Locale.US, "%.2f", avg)}/1M"
}

private fun modelValue(model: ModelInfo): Double {
    if (model.isFree) return 10_000.0 / (model.intelligenceRank ?: 250).coerceAtLeast(1)
    val rank = (model.intelligenceRank ?: 500).coerceAtLeast(1).toDouble()
    val price = (model.averagePricePerMillion ?: 20.0).coerceAtLeast(.02)
    val toolBoost = if (model.tools) 1.22 else 1.0
    val reasoningBoost = if (model.reasoning) 1.10 else 1.0
    return (1_000.0 / rank) * toolBoost * reasoningBoost / (0.12 + price)
}

private fun copyText(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
    clipboard.setPrimaryClip(ClipData.newPlainText("Risposta OpenClaw", text))
}
