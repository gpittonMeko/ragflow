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
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.compose.setContent
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AttachMoney
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Notifications
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
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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

private enum class V3Section(val label: String) { CHAT("Chat"), MODELS("Modelli"), MEMORY("Memoria"), DEVICE("Device") }
private enum class V3Sort { INTELLIGENCE, PRICE }
private enum class V3Filter { ALL, FREE, REASONING, VISION }

private val V3Bg = Color(0xFF07080B)
private val V3Panel = Color(0xFF101218)
private val V3PanelRaised = Color(0xFF161922)
private val V3Border = Color(0xFF282C38)
private val V3Accent = Color(0xFF8B7CFF)
private val V3AccentStrong = Color(0xFF6E5EE8)
private val V3Mint = Color(0xFF63E6C2)
private val V3Amber = Color(0xFFFFC46B)
private val V3Text = Color(0xFFF8F8FB)
private val V3TextMuted = Color(0xFFB4B7C2)
private val V3TextSubtle = Color(0xFF858A98)
private val V3AssistantBubble = Color(0xFF171A22)
private val V3UserBubble = Color(0xFF5F52CC)

private val V3Scheme = darkColorScheme(
    background = V3Bg,
    surface = V3Panel,
    surfaceVariant = V3PanelRaised,
    primary = V3Accent,
    secondary = V3Mint,
    tertiary = V3Amber,
    onBackground = V3Text,
    onSurface = V3Text,
    onSurfaceVariant = V3TextMuted,
    onPrimary = Color.White,
    onSecondary = Color(0xFF06231C)
)

class OpenClawV3Activity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        )
        super.onCreate(savedInstanceState)
        setContent { OpenClawV3App() }
    }
}

@Composable
private fun OpenClawV3App() {
    MaterialTheme(colorScheme = V3Scheme) {
        val context = androidx.compose.ui.platform.LocalContext.current
        val secureStore = remember { SecureStore(context) }
        val memoryStore = remember { MemoryStore(context) }
        val providerClient = remember { ProviderClient() }
        val scope = rememberCoroutineScope()

        var section by remember { mutableStateOf(V3Section.CHAT) }
        var providerMode by remember { mutableStateOf(ProviderMode.OPENROUTER) }
        var apiKey by remember { mutableStateOf("") }
        var baseUrl by remember { mutableStateOf("https://api.openai.com/v1") }
        var selectedModel by remember { mutableStateOf("") }
        var models by remember { mutableStateOf<List<ModelInfo>>(emptyList()) }
        var loading by remember { mutableStateOf(false) }
        var status by remember { mutableStateOf("Pronto") }
        var prompt by remember { mutableStateOf("") }
        var learning by remember { mutableStateOf(memoryStore.isLearningEnabled()) }
        var memoryRefresh by remember { mutableStateOf(0) }
        val messages = remember { mutableStateListOf<ChatMessage>() }

        LaunchedEffect(Unit) {
            apiKey = secureStore.get("api_key")
            baseUrl = secureStore.get("base_url").ifBlank { "https://api.openai.com/v1" }
            selectedModel = secureStore.get("selected_model")
            providerMode = if (secureStore.get("provider") == "custom") ProviderMode.OPENAI_COMPATIBLE else ProviderMode.OPENROUTER
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
                    putExtra(RecognizerIntent.EXTRA_PROMPT, "Parla con OpenClaw")
                })
            } else status = "Permesso microfono non concesso"
        }

        Box(
            Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        listOf(Color(0xFF0B0A12), V3Bg, Color(0xFF080A0F))
                    )
                )
        ) {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .imePadding()
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                V3TopBar(selectedModel = selectedModel, providerMode = providerMode)
                Spacer(Modifier.height(10.dp))

                Box(Modifier.weight(1f)) {
                    when (section) {
                        V3Section.CHAT -> V3ChatScreen(
                            messages = messages,
                            prompt = prompt,
                            onPrompt = { prompt = it },
                            loading = loading,
                            status = status,
                            selectedModel = selectedModel,
                            onSuggestion = { prompt = it },
                            onMic = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                            onSend = {
                                val userText = prompt.trim()
                                if (userText.isBlank() || loading) return@V3ChatScreen
                                prompt = ""
                                val deviceResult = ClawAccessibilityService.execute(userText)
                                if (deviceResult != null) {
                                    messages.add(ChatMessage("user", userText))
                                    messages.add(ChatMessage("assistant", deviceResult))
                                    status = deviceResult
                                } else if (selectedModel.isBlank()) {
                                    status = "Scegli un modello prima di inviare"
                                    section = V3Section.MODELS
                                } else {
                                    messages.add(ChatMessage("user", userText))
                                    loading = true
                                    status = "Sto pensando…"
                                    scope.launch {
                                        runCatching {
                                            val memoryText = memoryStore.contextText()
                                            val outbound = buildList {
                                                if (memoryText.isNotBlank()) {
                                                    add(ChatMessage("system", "Memoria personale dell’utente:\n$memoryText\nUsala solo se utile."))
                                                }
                                                addAll(messages.toList())
                                            }
                                            providerClient.chat(providerMode, apiKey, baseUrl, selectedModel, outbound)
                                        }.onSuccess { answer ->
                                            messages.add(ChatMessage("assistant", answer))
                                            status = "Pronto"
                                            if (learning) {
                                                memoryStore.add("L’utente ha chiesto: ${userText.take(300)}")
                                                memoryRefresh++
                                            }
                                        }.onFailure { error ->
                                            status = error.message ?: "Errore sconosciuto"
                                            messages.add(ChatMessage("assistant", "Errore: $status"))
                                        }
                                        loading = false
                                    }
                                }
                            }
                        )

                        V3Section.MODELS -> V3ModelsScreen(
                            providerMode = providerMode,
                            onProviderMode = {
                                providerMode = it
                                models = emptyList()
                                secureStore.put("provider", if (it == ProviderMode.OPENROUTER) "openrouter" else "custom")
                            },
                            apiKey = apiKey,
                            onApiKey = { apiKey = it },
                            baseUrl = baseUrl,
                            onBaseUrl = { baseUrl = it },
                            models = models,
                            selectedModel = selectedModel,
                            status = status,
                            loading = loading,
                            onSave = {
                                secureStore.put("api_key", apiKey)
                                secureStore.put("base_url", baseUrl)
                                status = "Credenziali salvate in modo sicuro"
                            },
                            onLoadModels = {
                                loading = true
                                status = "Aggiorno il catalogo…"
                                scope.launch {
                                    runCatching { providerClient.listModels(providerMode, apiKey, baseUrl) }
                                        .onSuccess { loaded ->
                                            models = loaded
                                            status = "${loaded.size} modelli disponibili"
                                        }
                                        .onFailure { status = it.message ?: "Errore nel caricamento modelli" }
                                    loading = false
                                }
                            },
                            onSelect = { model ->
                                selectedModel = model.id
                                secureStore.put("selected_model", model.id)
                                status = "Attivo: ${model.name}"
                            }
                        )

                        V3Section.MEMORY -> V3MemoryScreen(
                            memoryStore = memoryStore,
                            learning = learning,
                            refresh = memoryRefresh,
                            onLearning = {
                                learning = it
                                memoryStore.setLearningEnabled(it)
                            },
                            onRefresh = { memoryRefresh++ }
                        )

                        V3Section.DEVICE -> V3DeviceScreen(
                            accessibilityAvailable = ClawAccessibilityService.available(),
                            notifications = ClawNotificationService.recentNotifications(),
                            openAccessibility = { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                            openNotifications = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
                            openBluetooth = { context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
                        )
                    }
                }

                Spacer(Modifier.height(10.dp))
                V3BottomDock(selected = section, onSelect = { section = it })
            }
        }
    }
}

@Composable
private fun V3TopBar(selectedModel: String, providerMode: ProviderMode) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(
                    Brush.linearGradient(
                        listOf(Color(0xFF9E91FF), Color(0xFF6455D9))
                    )
                ),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.SmartToy, null, tint = Color.White, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text("OpenClaw", color = V3Text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(6.dp).clip(CircleShape).background(V3Mint))
                Spacer(Modifier.size(5.dp))
                Text("Agent online", color = V3TextMuted, fontSize = 10.sp, fontWeight = FontWeight.Medium)
            }
        }
        Surface(
            shape = RoundedCornerShape(14.dp),
            color = V3Panel,
            border = BorderStroke(1.dp, V3Border)
        ) {
            Column(
                Modifier.padding(horizontal = 11.dp, vertical = 7.dp),
                horizontalAlignment = Alignment.End
            ) {
                Text(
                    selectedModel.substringAfter('/').ifBlank {
                        if (providerMode == ProviderMode.OPENROUTER) "OpenRouter" else "Custom API"
                    }.take(18),
                    color = V3Text,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    if (providerMode == ProviderMode.OPENROUTER) "OPENROUTER" else "CUSTOM",
                    color = V3Accent,
                    fontSize = 8.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun V3BottomDock(selected: V3Section, onSelect: (V3Section) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(24.dp),
        color = Color(0xF214161D),
        border = BorderStroke(1.dp, Color(0xFF252936))
    ) {
        Row(Modifier.fillMaxWidth().padding(5.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            V3Section.entries.forEach { item ->
                val active = selected == item
                Surface(
                    onClick = { onSelect(item) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(19.dp),
                    color = if (active) Color(0xFF242033) else Color.Transparent
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 7.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Icon(
                            imageVector = when (item) {
                                V3Section.CHAT -> Icons.Rounded.Chat
                                V3Section.MODELS -> Icons.Rounded.SmartToy
                                V3Section.MEMORY -> Icons.Rounded.Memory
                                V3Section.DEVICE -> Icons.Rounded.Devices
                            },
                            contentDescription = item.label,
                            modifier = Modifier.size(20.dp),
                            tint = if (active) V3Accent else V3TextSubtle
                        )
                        Text(
                            item.label,
                            color = if (active) V3Text else V3TextSubtle,
                            fontSize = 9.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun V3ChatScreen(
    messages: List<ChatMessage>,
    prompt: String,
    onPrompt: (String) -> Unit,
    loading: Boolean,
    status: String,
    selectedModel: String,
    onSuggestion: (String) -> Unit,
    onMic: () -> Unit,
    onSend: () -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        if (messages.isEmpty()) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Column(
                    Modifier.fillMaxWidth().padding(horizontal = 10.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Box(
                        Modifier
                            .size(66.dp)
                            .clip(RoundedCornerShape(22.dp))
                            .background(Color(0xFF171423)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.SmartToy, null, tint = V3Accent, modifier = Modifier.size(32.dp))
                    }
                    Spacer(Modifier.height(18.dp))
                    Text("Come posso aiutarti?", color = V3Text, fontSize = 26.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(7.dp))
                    Text(
                        if (selectedModel.isBlank()) "Scegli un modello e poi scrivi o parla."
                        else "Chat, voce e controllo del telefono nello stesso agente.",
                        color = V3TextMuted,
                        fontSize = 13.sp
                    )
                    Spacer(Modifier.height(18.dp))
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        SuggestionChip("Riassumi le notifiche", onSuggestion)
                        SuggestionChip("Apri WhatsApp", onSuggestion)
                        SuggestionChip("Cosa ricordi di me?", onSuggestion)
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.fillMaxWidth().weight(1f),
                verticalArrangement = Arrangement.spacedBy(13.dp)
            ) {
                items(messages) { message -> V3MessageBubble(message) }
            }
        }

        Row(
            Modifier.fillMaxWidth().padding(horizontal = 5.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                Modifier
                    .size(6.dp)
                    .clip(CircleShape)
                    .background(if (loading) V3Amber else V3Mint)
            )
            Spacer(Modifier.size(6.dp))
            Text(status, color = V3TextMuted, fontSize = 10.sp, maxLines = 2)
        }

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(25.dp),
            color = Color(0xFF14171E),
            border = BorderStroke(1.dp, Color(0xFF303441))
        ) {
            Row(
                Modifier.fillMaxWidth().padding(start = 5.dp, end = 7.dp, top = 5.dp, bottom = 5.dp),
                verticalAlignment = Alignment.Bottom
            ) {
                IconButton(onClick = onMic, modifier = Modifier.size(42.dp)) {
                    Icon(Icons.Rounded.Mic, "Microfono", tint = V3TextMuted)
                }
                TextField(
                    value = prompt,
                    onValueChange = onPrompt,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Messaggio a OpenClaw…", color = V3TextSubtle) },
                    minLines = 1,
                    maxLines = 4,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedTextColor = V3Text,
                        unfocusedTextColor = V3Text,
                        cursorColor = V3Accent
                    )
                )
                Surface(
                    modifier = Modifier.size(42.dp),
                    shape = CircleShape,
                    color = if (prompt.isBlank() || loading) Color(0xFF2B2E38) else V3AccentStrong
                ) {
                    IconButton(onClick = onSend, enabled = prompt.isNotBlank() && !loading) {
                        if (loading) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = V3Text)
                        } else {
                            Icon(Icons.Rounded.Send, "Invia", tint = Color.White, modifier = Modifier.size(19.dp))
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SuggestionChip(text: String, onSelect: (String) -> Unit) {
    Surface(
        onClick = { onSelect(text) },
        shape = RoundedCornerShape(16.dp),
        color = V3Panel,
        border = BorderStroke(1.dp, V3Border)
    ) {
        Text(text, Modifier.padding(horizontal = 12.dp, vertical = 9.dp), color = V3TextMuted, fontSize = 11.sp)
    }
}

@Composable
private fun V3MessageBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    val isError = !isUser && message.content.startsWith("Errore:")
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start,
        verticalAlignment = Alignment.Bottom
    ) {
        if (!isUser) {
            Box(
                Modifier
                    .size(29.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(Color(0xFF221F32)),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Rounded.SmartToy, null, tint = V3Accent, modifier = Modifier.size(16.dp))
            }
            Spacer(Modifier.size(8.dp))
        }

        Surface(
            modifier = Modifier.fillMaxWidth(0.84f),
            shape = RoundedCornerShape(
                topStart = 20.dp,
                topEnd = 20.dp,
                bottomStart = if (isUser) 20.dp else 6.dp,
                bottomEnd = if (isUser) 6.dp else 20.dp
            ),
            color = if (isUser) V3UserBubble else V3AssistantBubble,
            border = if (isUser) null else BorderStroke(1.dp, if (isError) Color(0xFF6E3D48) else V3Border)
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                Text(
                    if (isUser) "TU" else "OPENCLAW",
                    color = if (isUser) Color(0xFFE8E5FF) else V3Accent,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 0.7.sp
                )
                Spacer(Modifier.height(5.dp))
                Text(
                    message.content,
                    color = if (isUser) Color.White else V3Text,
                    fontSize = 15.sp,
                    lineHeight = 21.sp,
                    fontWeight = FontWeight.Normal
                )
            }
        }
    }
}

@Composable
private fun V3ModelsScreen(
    providerMode: ProviderMode,
    onProviderMode: (ProviderMode) -> Unit,
    apiKey: String,
    onApiKey: (String) -> Unit,
    baseUrl: String,
    onBaseUrl: (String) -> Unit,
    models: List<ModelInfo>,
    selectedModel: String,
    status: String,
    loading: Boolean,
    onSave: () -> Unit,
    onLoadModels: () -> Unit,
    onSelect: (ModelInfo) -> Unit
) {
    var query by remember { mutableStateOf("") }
    var sort by remember { mutableStateOf(V3Sort.INTELLIGENCE) }
    var filter by remember { mutableStateOf(V3Filter.ALL) }

    val visible = remember(models, query, sort, filter) {
        val filtered = models.filter { model ->
            val textMatch = query.isBlank() || model.name.contains(query, true) || model.id.contains(query, true)
            val filterMatch = when (filter) {
                V3Filter.ALL -> true
                V3Filter.FREE -> model.isFree
                V3Filter.REASONING -> model.reasoning
                V3Filter.VISION -> model.vision
            }
            textMatch && filterMatch
        }
        when (sort) {
            V3Sort.INTELLIGENCE -> filtered.sortedWith(
                compareByDescending<ModelInfo> { it.capabilityScore }
                    .thenByDescending { it.contextLength }
                    .thenBy { it.name.lowercase() }
            )
            V3Sort.PRICE -> filtered.sortedWith(
                compareBy<ModelInfo> { it.averagePricePerMillion == null }
                    .thenBy { it.averagePricePerMillion ?: Double.MAX_VALUE }
                    .thenByDescending { it.capabilityScore }
            )
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Model Lab", color = V3Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
                Text("Capacità, prezzo e filtri in un’unica vista.", color = V3TextMuted, fontSize = 11.sp)
            }
            if (models.isNotEmpty()) {
                Surface(shape = RoundedCornerShape(12.dp), color = Color(0xFF14251F)) {
                    Text("${visible.size}/${models.size}", Modifier.padding(horizontal = 9.dp, vertical = 6.dp), color = V3Mint, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
        Spacer(Modifier.height(11.dp))

        Surface(
            shape = RoundedCornerShape(20.dp),
            color = V3Panel,
            border = BorderStroke(1.dp, V3Border)
        ) {
            Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    ProviderPill("OpenRouter", providerMode == ProviderMode.OPENROUTER) { onProviderMode(ProviderMode.OPENROUTER) }
                    ProviderPill("API custom", providerMode == ProviderMode.OPENAI_COMPATIBLE) { onProviderMode(ProviderMode.OPENAI_COMPATIBLE) }
                }
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = onApiKey,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("API key") },
                    leadingIcon = { Icon(Icons.Rounded.Lock, null) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(16.dp)
                )
                if (providerMode == ProviderMode.OPENAI_COMPATIBLE) {
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = onBaseUrl,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Base URL") },
                        singleLine = true,
                        shape = RoundedCornerShape(16.dp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onSave, shape = RoundedCornerShape(14.dp)) {
                        Icon(Icons.Rounded.Settings, null, modifier = Modifier.size(17.dp))
                        Text("  Salva")
                    }
                    Button(
                        onClick = onLoadModels,
                        enabled = !loading,
                        shape = RoundedCornerShape(14.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = V3AccentStrong)
                    ) {
                        Icon(Icons.Rounded.Refresh, null, modifier = Modifier.size(17.dp))
                        Text(if (loading) "  Carico…" else "  Aggiorna")
                    }
                }
            }
        }

        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Cerca modello…") },
            leadingIcon = { Icon(Icons.Rounded.Search, null) },
            singleLine = true,
            shape = RoundedCornerShape(17.dp)
        )

        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
            FilterChip(selected = filter == V3Filter.ALL, onClick = { filter = V3Filter.ALL }, label = { Text("Tutti") })
            FilterChip(selected = filter == V3Filter.FREE, onClick = { filter = V3Filter.FREE }, label = { Text("Gratis") })
            FilterChip(selected = filter == V3Filter.REASONING, onClick = { filter = V3Filter.REASONING }, label = { Text("Reasoning") })
            FilterChip(selected = filter == V3Filter.VISION, onClick = { filter = V3Filter.VISION }, label = { Text("Visione") })
        }

        Spacer(Modifier.height(8.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Tune, null, modifier = Modifier.size(17.dp), tint = V3TextSubtle)
            Spacer(Modifier.size(6.dp))
            Text("ORDINA", color = V3TextSubtle, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.weight(1f))
            SegmentedSortButton("Intelligenza", sort == V3Sort.INTELLIGENCE) { sort = V3Sort.INTELLIGENCE }
            Spacer(Modifier.size(5.dp))
            SegmentedSortButton("Prezzo", sort == V3Sort.PRICE) { sort = V3Sort.PRICE }
        }

        Text(status, color = V3TextMuted, fontSize = 10.sp, modifier = Modifier.padding(vertical = 7.dp), maxLines = 2)

        if (models.isEmpty() && !loading) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(Icons.Rounded.SmartToy, null, tint = V3Accent, modifier = Modifier.size(34.dp))
                    Spacer(Modifier.height(8.dp))
                    Text("Carica il catalogo", color = V3Text, fontWeight = FontWeight.SemiBold)
                    Text("Prezzi e capacità arrivano dal provider.", color = V3TextMuted, fontSize = 11.sp)
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(visible, key = { it.id }) { model ->
                    V3ModelCard(model, model.id == selectedModel) { onSelect(model) }
                }
            }
        }
    }
}

@Composable
private fun ProviderPill(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(13.dp),
        color = if (selected) Color(0xFF29243D) else V3PanelRaised,
        border = BorderStroke(1.dp, if (selected) Color(0xFF544A82) else V3Border)
    ) {
        Text(label, Modifier.padding(horizontal = 11.dp, vertical = 7.dp), color = if (selected) V3Text else V3TextMuted, fontSize = 11.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun SegmentedSortButton(label: String, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (selected) Color(0xFF28233A) else Color.Transparent,
        border = BorderStroke(1.dp, if (selected) Color(0xFF4C436D) else V3Border)
    ) {
        Text(label, Modifier.padding(horizontal = 9.dp, vertical = 6.dp), color = if (selected) V3Text else V3TextMuted, fontSize = 10.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
private fun V3ModelCard(model: ModelInfo, selected: Boolean, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = if (selected) Color(0xFF201D31) else V3Panel),
        border = BorderStroke(1.dp, if (selected) Color(0xFF514879) else V3Border)
    ) {
        Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(model.name, color = V3Text, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(model.id, color = V3TextSubtle, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (selected) Icon(Icons.Rounded.CheckCircle, "Selezionato", tint = V3Mint, modifier = Modifier.size(19.dp))
            }
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                V3Metric(Icons.Rounded.Star, if (model.capabilityScore > 0) "${model.capabilityScore}/100 stima" else "score n/d", V3Accent)
                V3Metric(Icons.Rounded.AttachMoney, v3PriceLabel(model), V3Amber)
            }
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (model.contextLength > 0) V3Tag(v3ContextLabel(model.contextLength))
                if (model.reasoning) V3Tag("Reasoning")
                if (model.vision) V3Tag("Visione")
                if (model.tools) V3Tag("Tools")
                if (model.isFree) V3Tag("Gratis")
            }
        }
    }
}

@Composable
private fun V3Metric(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, accent: Color) {
    Surface(shape = RoundedCornerShape(11.dp), color = accent.copy(alpha = 0.10f)) {
        Row(Modifier.padding(horizontal = 7.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, modifier = Modifier.size(13.dp), tint = accent)
            Spacer(Modifier.size(4.dp))
            Text(text, color = accent, fontSize = 9.sp, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun V3Tag(text: String) {
    Surface(shape = RoundedCornerShape(9.dp), color = V3PanelRaised, border = BorderStroke(1.dp, V3Border)) {
        Text(text, Modifier.padding(horizontal = 7.dp, vertical = 4.dp), color = V3TextMuted, fontSize = 8.sp)
    }
}

private fun v3PriceLabel(model: ModelInfo): String {
    if (model.isFree) return "Gratis"
    val price = model.averagePricePerMillion ?: return "prezzo n/d"
    return when {
        price < 0.01 -> "< $0.01 / 1M"
        price < 1.0 -> "$${String.format(Locale.US, "%.2f", price)} / 1M"
        else -> "$${String.format(Locale.US, "%.1f", price)} / 1M"
    }
}

private fun v3ContextLabel(contextLength: Int): String = if (contextLength >= 1_000_000) {
    String.format(Locale.US, "%.1fM ctx", contextLength / 1_000_000.0)
} else {
    "${contextLength / 1000}K ctx"
}

@Composable
private fun V3MemoryScreen(
    memoryStore: MemoryStore,
    learning: Boolean,
    refresh: Int,
    onLearning: (Boolean) -> Unit,
    onRefresh: () -> Unit
) {
    var note by remember { mutableStateOf("") }
    val memories = remember(refresh) { memoryStore.list() }

    Column(Modifier.fillMaxSize()) {
        Text("Memoria", color = V3Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
        Text("Trasparente, modificabile e sempre sotto il tuo controllo.", color = V3TextMuted, fontSize = 11.sp)
        Spacer(Modifier.height(12.dp))

        Surface(shape = RoundedCornerShape(19.dp), color = V3Panel, border = BorderStroke(1.dp, V3Border)) {
            Row(Modifier.fillMaxWidth().padding(14.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF142620)), contentAlignment = Alignment.Center) {
                    Icon(Icons.Rounded.Memory, null, tint = V3Mint, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.size(10.dp))
                Column(Modifier.weight(1f)) {
                    Text("Apprendimento locale", color = V3Text, fontWeight = FontWeight.SemiBold)
                    Text("Salvato soltanto sul dispositivo", color = V3TextMuted, fontSize = 10.sp)
                }
                Switch(checked = learning, onCheckedChange = onLearning)
            }
        }

        Spacer(Modifier.height(10.dp))
        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nuova memoria") },
            shape = RoundedCornerShape(16.dp)
        )
        Spacer(Modifier.height(8.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = {
                    if (note.isNotBlank()) {
                        memoryStore.add(note)
                        note = ""
                        onRefresh()
                    }
                },
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = V3AccentStrong)
            ) { Text("Aggiungi") }
            OutlinedButton(onClick = { memoryStore.clear(); onRefresh() }, shape = RoundedCornerShape(14.dp)) { Text("Cancella tutto") }
        }

        Spacer(Modifier.height(10.dp))
        LazyColumn(Modifier.fillMaxWidth().weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(memories, key = { it.id }) { item ->
                Surface(shape = RoundedCornerShape(16.dp), color = V3Panel, border = BorderStroke(1.dp, V3Border)) {
                    Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(item.text, modifier = Modifier.weight(1f), color = V3Text, fontSize = 13.sp, lineHeight = 18.sp)
                        IconButton(onClick = { memoryStore.remove(item.id); onRefresh() }) {
                            Icon(Icons.Rounded.Delete, "Elimina", tint = V3TextSubtle)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun V3DeviceScreen(
    accessibilityAvailable: Boolean,
    notifications: List<NotificationSnapshot>,
    openAccessibility: () -> Unit,
    openNotifications: () -> Unit,
    openBluetooth: () -> Unit
) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(9.dp)) {
        item {
            Text("Device", color = V3Text, fontSize = 23.sp, fontWeight = FontWeight.Bold)
            Text("Permessi espliciti. Nessun controllo nascosto.", color = V3TextMuted, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
        }
        item {
            V3Capability(
                icon = Icons.Rounded.Devices,
                title = "Controllo Android",
                subtitle = if (accessibilityAvailable) "Attivo · home, back, scroll, click e apertura app" else "Abilita Accessibility Service per i comandi sul telefono",
                action = if (accessibilityAvailable) "Impostazioni" else "Abilita",
                active = accessibilityAvailable,
                onClick = openAccessibility
            )
        }
        item {
            V3Capability(
                icon = Icons.Rounded.Notifications,
                title = "Notifiche",
                subtitle = "${notifications.size} notifiche recenti disponibili dopo l’autorizzazione",
                action = "Gestisci",
                active = notifications.isNotEmpty(),
                onClick = openNotifications
            )
        }
        item {
            V3Capability(
                icon = Icons.Rounded.Bluetooth,
                title = "Glasses & Bluetooth",
                subtitle = "Audio e voce via Android. La UI per smart glasses resta un’esperienza dedicata.",
                action = "Bluetooth",
                active = false,
                onClick = openBluetooth
            )
        }
        if (notifications.isNotEmpty()) {
            item { Text("ULTIME NOTIFICHE", color = V3TextSubtle, fontSize = 9.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 5.dp)) }
            items(notifications.take(10)) { n ->
                Surface(shape = RoundedCornerShape(16.dp), color = V3Panel, border = BorderStroke(1.dp, V3Border)) {
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(n.title.ifBlank { n.app }, color = V3Text, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                        if (n.text.isNotBlank()) Text(n.text, color = V3TextMuted, fontSize = 11.sp, lineHeight = 16.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun V3Capability(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    action: String,
    active: Boolean,
    onClick: () -> Unit
) {
    Surface(shape = RoundedCornerShape(18.dp), color = V3Panel, border = BorderStroke(1.dp, V3Border)) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(38.dp).clip(RoundedCornerShape(12.dp)).background(Color(0xFF1B1928)), contentAlignment = Alignment.Center) {
                    Icon(icon, null, tint = V3Accent, modifier = Modifier.size(20.dp))
                }
                Spacer(Modifier.size(10.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, color = V3Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                    Text(subtitle, color = V3TextMuted, fontSize = 10.sp, lineHeight = 15.sp)
                }
                Box(Modifier.size(7.dp).clip(CircleShape).background(if (active) V3Mint else Color(0xFF555B69)))
            }
            OutlinedButton(onClick = onClick, shape = RoundedCornerShape(13.dp)) { Text(action) }
        }
    }
}
