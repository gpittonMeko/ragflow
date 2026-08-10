package it.meko.openclawmobile

import android.Manifest
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.provider.Settings
import android.speech.RecognizerIntent
import android.util.Base64
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AttachFile
import androidx.compose.material.icons.rounded.AttachMoney
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Edit
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
import androidx.compose.material3.TextButton
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
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.ByteArrayInputStream
import java.util.Locale
import java.util.zip.ZipInputStream

private enum class V4Section(val label: String) { CHAT("Chat"), MODELS("Modelli"), MEMORY("Memoria"), DEVICE("Device") }
private enum class V4Sort { INTELLIGENCE, PRICE }
private enum class V4Filter { ALL, FREE, REASONING, VISION, FILES }

private val V4Bg = Color(0xFF08090C)
private val V4Panel = Color(0xFF12141A)
private val V4Raised = Color(0xFF191C24)
private val V4Border = Color(0xFF2A2E39)
private val V4Accent = Color(0xFF9B8CFF)
private val V4AccentDeep = Color(0xFF6B5BDC)
private val V4Mint = Color(0xFF69E0BD)
private val V4Amber = Color(0xFFFFC46C)
private val V4Text = Color(0xFFF8F8FA)
private val V4Muted = Color(0xFFB5B8C3)
private val V4Subtle = Color(0xFF858A97)
private val V4UserBubble = Color(0xFF6557D7)
private val V4AssistantBubble = Color(0xFF171A21)

private val V4Scheme = darkColorScheme(
    background = V4Bg,
    surface = V4Panel,
    surfaceVariant = V4Raised,
    primary = V4Accent,
    secondary = V4Mint,
    tertiary = V4Amber,
    onBackground = V4Text,
    onSurface = V4Text,
    onSurfaceVariant = V4Muted,
    onPrimary = Color.White,
    onSecondary = Color(0xFF05231B)
)

class OpenClawV4Activity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(android.graphics.Color.TRANSPARENT)
        )
        super.onCreate(savedInstanceState)
        setContent { OpenClawV4App() }
    }
}

@Composable
private fun OpenClawV4App() {
    MaterialTheme(colorScheme = V4Scheme) {
        val context = androidx.compose.ui.platform.LocalContext.current
        val secureStore = remember { SecureStore(context) }
        val memoryStore = remember { MemoryStore(context) }
        val providerClient = remember { ProviderClient() }
        val scope = rememberCoroutineScope()

        var section by remember { mutableStateOf(V4Section.CHAT) }
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
        val attachments = remember { mutableStateListOf<ChatAttachment>() }

        LaunchedEffect(Unit) {
            val storedKey = secureStore.get("api_key")
            val storedBase = secureStore.get("base_url").ifBlank { "https://api.openai.com/v1" }
            val storedModel = secureStore.get("selected_model")
            val storedMode = if (secureStore.get("provider") == "custom") ProviderMode.OPENAI_COMPATIBLE else ProviderMode.OPENROUTER
            apiKey = storedKey
            baseUrl = storedBase
            selectedModel = storedModel
            providerMode = storedMode

            if (storedKey.isNotBlank() || storedMode == ProviderMode.OPENAI_COMPATIBLE) {
                loading = true
                runCatching { providerClient.listModels(storedMode, storedKey, storedBase) }
                    .onSuccess { loaded ->
                        models = loaded
                        status = if (loaded.isEmpty()) "Catalogo vuoto" else "Pronto"
                    }
                    .onFailure { status = it.message ?: "Configura il provider" }
                loading = false
            }
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

        val attachmentLauncher = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            if (uris.isNotEmpty()) {
                scope.launch {
                    status = "Preparo gli allegati…"
                    runCatching { readPickedAttachments(context, uris) }
                        .onSuccess { result ->
                            attachments.clear()
                            attachments.addAll(result.attachments)
                            status = result.note ?: "${result.attachments.size} allegati pronti"
                        }
                        .onFailure { status = it.message ?: "Impossibile leggere gli allegati" }
                }
            }
        }

        Box(
            Modifier
                .fillMaxSize()
                .background(Brush.verticalGradient(listOf(Color(0xFF0C0B12), V4Bg, Color(0xFF080A0E))))
        ) {
            Column(
                Modifier
                    .fillMaxSize()
                    .windowInsetsPadding(WindowInsets.safeDrawing)
                    .imePadding()
                    .padding(horizontal = 14.dp, vertical = 8.dp)
            ) {
                V4TopBar(selectedModel = selectedModel, providerMode = providerMode)
                Spacer(Modifier.height(9.dp))

                Box(Modifier.weight(1f)) {
                    when (section) {
                        V4Section.CHAT -> V4ChatScreen(
                            messages = messages,
                            prompt = prompt,
                            onPrompt = { prompt = it },
                            loading = loading,
                            status = status,
                            selectedModel = selectedModel,
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
                            onNewChat = {
                                messages.clear()
                                attachments.clear()
                                prompt = ""
                                status = "Nuova chat"
                            },
                            onGoModels = { section = V4Section.MODELS },
                            onSuggestion = { prompt = it },
                            onSend = {
                                if (loading || (prompt.isBlank() && attachments.isEmpty())) return@V4ChatScreen
                                if (selectedModel.isBlank()) {
                                    status = "Scegli prima un modello"
                                    section = V4Section.MODELS
                                    return@V4ChatScreen
                                }

                                val rawUserText = prompt.trim()
                                val userText = rawUserText.ifBlank { "Analizza gli allegati e dimmi cosa contengono." }
                                val sendAttachments = attachments.toList()
                                val attachmentLabel = if (sendAttachments.isNotEmpty()) {
                                    "\n📎 " + sendAttachments.joinToString(", ") { it.name }
                                } else ""
                                val displayMessage = userText + attachmentLabel
                                prompt = ""
                                messages.add(ChatMessage("user", displayMessage))
                                loading = true
                                status = "Sto pensando…"

                                scope.launch {
                                    runCatching {
                                        val relevantMemory = memoryStore.contextTextFor(userText)
                                        val outbound = buildList {
                                            if (relevantMemory.isNotBlank()) {
                                                add(
                                                    ChatMessage(
                                                        "system",
                                                        "Profilo utente rilevante, recuperato localmente. Usalo solo se pertinente:\n$relevantMemory"
                                                    )
                                                )
                                            }
                                            addAll(messages.dropLast(1))
                                            add(ChatMessage("user", userText))
                                        }
                                        providerClient.chat(
                                            mode = providerMode,
                                            apiKey = apiKey,
                                            baseUrl = baseUrl,
                                            model = selectedModel,
                                            messages = outbound,
                                            attachments = sendAttachments
                                        )
                                    }.onSuccess { answer ->
                                        messages.add(ChatMessage("assistant", answer))
                                        attachments.clear()
                                        status = "Pronto"
                                        if (learning && memoryStore.learnFrom(rawUserText)) memoryRefresh++
                                    }.onFailure { error ->
                                        status = error.message ?: "Errore sconosciuto"
                                        messages.add(ChatMessage("assistant", "Errore: $status"))
                                    }
                                    loading = false
                                }
                            }
                        )

                        V4Section.MODELS -> V4ModelsScreen(
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
                                status = "Provider salvato"
                            },
                            onLoadModels = {
                                loading = true
                                status = "Aggiorno i modelli…"
                                scope.launch {
                                    runCatching { providerClient.listModels(providerMode, apiKey, baseUrl) }
                                        .onSuccess { loaded ->
                                            models = loaded
                                            status = "${loaded.size} modelli"
                                        }
                                        .onFailure { status = it.message ?: "Errore catalogo" }
                                    loading = false
                                }
                            },
                            onSelect = { model ->
                                selectedModel = model.id
                                secureStore.put("selected_model", model.id)
                                status = "Attivo: ${model.name}"
                            }
                        )

                        V4Section.MEMORY -> V4MemoryScreen(
                            memoryStore = memoryStore,
                            learning = learning,
                            refresh = memoryRefresh,
                            onLearning = {
                                learning = it
                                memoryStore.setLearningEnabled(it)
                            },
                            onRefresh = { memoryRefresh++ }
                        )

                        V4Section.DEVICE -> V4DeviceScreen(
                            accessibilityAvailable = ClawAccessibilityService.available(),
                            notifications = ClawNotificationService.recentNotifications(),
                            openAccessibility = { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                            openNotifications = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
                            openBluetooth = { context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
                        )
                    }
                }

                Spacer(Modifier.height(9.dp))
                V4BottomDock(selected = section, onSelect = { section = it })
            }
        }
    }
}

@Composable
private fun V4TopBar(selectedModel: String, providerMode: ProviderMode) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Box(
            Modifier
                .size(38.dp)
                .clip(RoundedCornerShape(13.dp))
                .background(Brush.linearGradient(listOf(V4Accent, V4AccentDeep))),
            contentAlignment = Alignment.Center
        ) {
            Icon(Icons.Rounded.SmartToy, null, tint = Color.White, modifier = Modifier.size(21.dp))
        }
        Spacer(Modifier.size(10.dp))
        Column(Modifier.weight(1f)) {
            Text("OpenClaw", color = V4Text, fontSize = 18.sp, fontWeight = FontWeight.Bold)
            Text("private mobile agent", color = V4Subtle, fontSize = 9.sp, fontWeight = FontWeight.Medium)
        }
        Surface(shape = RoundedCornerShape(13.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.End) {
                Text(
                    selectedModel.substringAfter('/').ifBlank { if (providerMode == ProviderMode.OPENROUTER) "Nessun modello" else "Custom API" }.take(18),
                    color = V4Text,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(if (providerMode == ProviderMode.OPENROUTER) "OPENROUTER" else "CUSTOM", color = V4Accent, fontSize = 7.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun V4BottomDock(selected: V4Section, onSelect: (V4Section) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(23.dp),
        color = Color(0xF214161C),
        border = BorderStroke(1.dp, V4Border)
    ) {
        Row(Modifier.fillMaxWidth().padding(5.dp), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            V4Section.entries.forEach { item ->
                val active = selected == item
                Surface(
                    onClick = { onSelect(item) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(18.dp),
                    color = if (active) Color(0xFF242031) else Color.Transparent
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 7.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(2.dp)
                    ) {
                        Icon(
                            when (item) {
                                V4Section.CHAT -> Icons.Rounded.Chat
                                V4Section.MODELS -> Icons.Rounded.SmartToy
                                V4Section.MEMORY -> Icons.Rounded.Memory
                                V4Section.DEVICE -> Icons.Rounded.Devices
                            },
                            item.label,
                            modifier = Modifier.size(20.dp),
                            tint = if (active) V4Accent else V4Subtle
                        )
                        Text(item.label, color = if (active) V4Text else V4Subtle, fontSize = 9.sp, fontWeight = if (active) FontWeight.Bold else FontWeight.Medium)
                    }
                }
            }
        }
    }
}

@Composable
private fun V4ChatScreen(
    messages: List<ChatMessage>,
    prompt: String,
    onPrompt: (String) -> Unit,
    loading: Boolean,
    status: String,
    selectedModel: String,
    attachments: List<ChatAttachment>,
    onRemoveAttachment: (Int) -> Unit,
    onAttach: () -> Unit,
    onMic: () -> Unit,
    onNewChat: () -> Unit,
    onGoModels: () -> Unit,
    onSuggestion: (String) -> Unit,
    onSend: () -> Unit
) {
    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Chat", color = V4Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text(
                    if (selectedModel.isBlank()) "Scegli un modello per iniziare" else selectedModel.substringAfter('/'),
                    color = V4Muted,
                    fontSize = 11.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
            TextButton(onClick = onNewChat, enabled = messages.isNotEmpty() || attachments.isNotEmpty()) { Text("Nuova") }
        }
        Spacer(Modifier.height(8.dp))

        if (messages.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Box(
                        Modifier.size(58.dp).clip(CircleShape).background(V4Accent.copy(alpha = 0.12f)),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Rounded.SmartToy, null, tint = V4Accent, modifier = Modifier.size(27.dp))
                    }
                    Text("Chiedi. Allega. Agisci.", color = V4Text, fontSize = 21.sp, fontWeight = FontWeight.SemiBold)
                    Text("Immagini, PDF, testo e DOCX senza riempire la memoria.", color = V4Muted, fontSize = 12.sp)
                    if (selectedModel.isBlank()) {
                        OutlinedButton(onClick = onGoModels) { Text("Scegli modello") }
                    } else {
                        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                            SuggestionChip("Riassumi un PDF") { onSuggestion("Riassumi questo documento e dammi i punti chiave") }
                            SuggestionChip("Analizza immagine") { onSuggestion("Analizza questa immagine in dettaglio") }
                            SuggestionChip("Agisci sul telefono") { onSuggestion("Apri ") }
                        }
                    }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(messages) { message -> V4Message(message) }
            }
        }

        if (attachments.isNotEmpty()) {
            Spacer(Modifier.height(7.dp))
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                attachments.forEachIndexed { index, attachment ->
                    Surface(shape = RoundedCornerShape(13.dp), color = V4Raised, border = BorderStroke(1.dp, V4Border)) {
                        Row(Modifier.padding(start = 9.dp, end = 3.dp, top = 4.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Rounded.AttachFile, null, modifier = Modifier.size(14.dp), tint = V4Mint)
                            Spacer(Modifier.size(5.dp))
                            Text(attachment.name.take(22), color = V4Text, fontSize = 9.sp, maxLines = 1)
                            IconButton(onClick = { onRemoveAttachment(index) }, modifier = Modifier.size(28.dp)) {
                                Icon(Icons.Rounded.Close, "Rimuovi", modifier = Modifier.size(15.dp), tint = V4Muted)
                            }
                        }
                    }
                }
            }
        }

        Spacer(Modifier.height(7.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 3.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(6.dp).clip(CircleShape).background(if (loading) V4Amber else V4Mint))
            Spacer(Modifier.size(6.dp))
            Text(status, color = V4Subtle, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Spacer(Modifier.height(6.dp))

        Surface(shape = RoundedCornerShape(25.dp), color = V4Raised, border = BorderStroke(1.dp, V4Border)) {
            Row(Modifier.fillMaxWidth().padding(5.dp), verticalAlignment = Alignment.Bottom) {
                IconButton(onClick = onAttach, modifier = Modifier.size(42.dp)) {
                    Icon(Icons.Rounded.AttachFile, "Allega", tint = V4Muted)
                }
                TextField(
                    value = prompt,
                    onValueChange = onPrompt,
                    modifier = Modifier.weight(1f),
                    placeholder = { Text("Messaggio…", color = V4Subtle) },
                    minLines = 1,
                    maxLines = 5,
                    colors = TextFieldDefaults.colors(
                        focusedContainerColor = Color.Transparent,
                        unfocusedContainerColor = Color.Transparent,
                        focusedIndicatorColor = Color.Transparent,
                        unfocusedIndicatorColor = Color.Transparent,
                        focusedTextColor = V4Text,
                        unfocusedTextColor = V4Text
                    )
                )
                IconButton(onClick = onMic, modifier = Modifier.size(42.dp)) { Icon(Icons.Rounded.Mic, "Microfono", tint = V4Muted) }
                Surface(shape = CircleShape, color = V4Accent, modifier = Modifier.size(42.dp)) {
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
private fun SuggestionChip(text: String, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(15.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
        Text(text, Modifier.padding(horizontal = 11.dp, vertical = 8.dp), color = V4Muted, fontSize = 10.sp)
    }
}

@Composable
private fun V4Message(message: ChatMessage) {
    val isUser = message.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Surface(
            modifier = Modifier.fillMaxWidth(if (isUser) 0.86f else 0.94f),
            shape = RoundedCornerShape(
                topStart = 20.dp,
                topEnd = 20.dp,
                bottomStart = if (isUser) 20.dp else 7.dp,
                bottomEnd = if (isUser) 7.dp else 20.dp
            ),
            color = if (isUser) V4UserBubble else V4AssistantBubble,
            border = if (isUser) null else BorderStroke(1.dp, V4Border)
        ) {
            Column(Modifier.padding(horizontal = 14.dp, vertical = 12.dp)) {
                Text(if (isUser) "TU" else "OPENCLAW", color = if (isUser) Color(0xFFE9E5FF) else V4Accent, fontSize = 8.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.7.sp)
                Spacer(Modifier.height(4.dp))
                Text(message.content, color = Color.White, fontSize = 14.sp, lineHeight = 20.sp)
            }
        }
    }
}

@Composable
private fun V4ModelsScreen(
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
    var sort by remember { mutableStateOf(V4Sort.INTELLIGENCE) }
    var filter by remember { mutableStateOf(V4Filter.ALL) }
    var showProvider by remember { mutableStateOf(false) }

    val visible = remember(models, query, sort, filter) {
        val filtered = models.filter { model ->
            val matchesQuery = query.isBlank() || model.name.contains(query, true) || model.id.contains(query, true)
            val matchesFilter = when (filter) {
                V4Filter.ALL -> true
                V4Filter.FREE -> model.isFree
                V4Filter.REASONING -> model.reasoning
                V4Filter.VISION -> model.vision
                V4Filter.FILES -> model.fileInput
            }
            matchesQuery && matchesFilter
        }
        when (sort) {
            V4Sort.INTELLIGENCE -> filtered.sortedWith(
                compareBy<ModelInfo> { it.intelligenceRank ?: Int.MAX_VALUE }
                    .thenByDescending { it.capabilityScore }
                    .thenBy { it.name.lowercase() }
            )
            V4Sort.PRICE -> filtered.sortedWith(
                compareBy<ModelInfo> { it.averagePricePerMillion == null }
                    .thenBy { it.averagePricePerMillion ?: Double.MAX_VALUE }
                    .thenBy { it.intelligenceRank ?: Int.MAX_VALUE }
            )
        }
    }

    Column(Modifier.fillMaxSize()) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Modelli", color = V4Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
                Text("${visible.size}/${models.size} · ${if (providerMode == ProviderMode.OPENROUTER) "OpenRouter" else "API custom"}", color = V4Muted, fontSize = 10.sp)
            }
            IconButton(onClick = { showProvider = !showProvider }) { Icon(Icons.Rounded.Settings, "Provider", tint = if (showProvider) V4Accent else V4Muted) }
            IconButton(onClick = onLoadModels, enabled = !loading) {
                if (loading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Icon(Icons.Rounded.Refresh, "Aggiorna", tint = V4Muted)
            }
        }

        if (showProvider) {
            Spacer(Modifier.height(8.dp))
            Surface(shape = RoundedCornerShape(18.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
                Column(Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                        FilterChip(selected = providerMode == ProviderMode.OPENROUTER, onClick = { onProviderMode(ProviderMode.OPENROUTER) }, label = { Text("OpenRouter") })
                        FilterChip(selected = providerMode == ProviderMode.OPENAI_COMPATIBLE, onClick = { onProviderMode(ProviderMode.OPENAI_COMPATIBLE) }, label = { Text("API custom") })
                    }
                    OutlinedTextField(
                        value = apiKey,
                        onValueChange = onApiKey,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("API key") },
                        leadingIcon = { Icon(Icons.Rounded.Lock, null) },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        shape = RoundedCornerShape(15.dp)
                    )
                    if (providerMode == ProviderMode.OPENAI_COMPATIBLE) {
                        OutlinedTextField(value = baseUrl, onValueChange = onBaseUrl, modifier = Modifier.fillMaxWidth(), label = { Text("Base URL") }, singleLine = true, shape = RoundedCornerShape(15.dp))
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(onClick = { onSave(); showProvider = false }) { Text("Salva") }
                        OutlinedButton(onClick = onLoadModels, enabled = !loading) { Text("Salva e aggiorna") }
                    }
                }
            }
        }

        Spacer(Modifier.height(8.dp))
        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Cerca modello…") },
            leadingIcon = { Icon(Icons.Rounded.Search, null) },
            singleLine = true,
            shape = RoundedCornerShape(16.dp)
        )
        Spacer(Modifier.height(6.dp))

        Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            FilterChip(selected = filter == V4Filter.ALL, onClick = { filter = V4Filter.ALL }, label = { Text("Tutti") })
            FilterChip(selected = filter == V4Filter.FREE, onClick = { filter = V4Filter.FREE }, label = { Text("Gratis") })
            FilterChip(selected = filter == V4Filter.REASONING, onClick = { filter = V4Filter.REASONING }, label = { Text("Reasoning") })
            FilterChip(selected = filter == V4Filter.VISION, onClick = { filter = V4Filter.VISION }, label = { Text("Visione") })
            FilterChip(selected = filter == V4Filter.FILES, onClick = { filter = V4Filter.FILES }, label = { Text("File") })
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Tune, null, tint = V4Subtle, modifier = Modifier.size(16.dp))
            Spacer(Modifier.size(5.dp))
            Text("Ordina", color = V4Subtle, fontSize = 10.sp, modifier = Modifier.weight(1f))
            TextButton(onClick = { sort = V4Sort.INTELLIGENCE }) {
                Icon(Icons.Rounded.Star, null, tint = if (sort == V4Sort.INTELLIGENCE) V4Accent else V4Subtle, modifier = Modifier.size(15.dp))
                Text(" Intelligenza", color = if (sort == V4Sort.INTELLIGENCE) V4Accent else V4Muted, fontSize = 10.sp)
            }
            TextButton(onClick = { sort = V4Sort.PRICE }) {
                Icon(Icons.Rounded.AttachMoney, null, tint = if (sort == V4Sort.PRICE) V4Amber else V4Subtle, modifier = Modifier.size(15.dp))
                Text(" Prezzo", color = if (sort == V4Sort.PRICE) V4Amber else V4Muted, fontSize = 10.sp)
            }
        }

        Text(status, color = V4Subtle, fontSize = 9.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        Spacer(Modifier.height(5.dp))

        if (models.isEmpty() && !loading) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Nessun modello caricato", color = V4Text, fontWeight = FontWeight.Medium)
                    Text("Apri ⚙ per configurare il provider.", color = V4Muted, fontSize = 11.sp)
                    OutlinedButton(onClick = { showProvider = true }) { Text("Configura") }
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier.weight(1f).fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                items(visible, key = { it.id }) { model ->
                    V4ModelRow(model = model, selected = model.id == selectedModel, onClick = { onSelect(model) })
                }
            }
        }
    }
}

@Composable
private fun V4ModelRow(model: ModelInfo, selected: Boolean, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(17.dp),
        color = if (selected) Color(0xFF242033) else V4Panel,
        border = BorderStroke(1.dp, if (selected) V4Accent.copy(alpha = 0.65f) else V4Border)
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(model.name, color = V4Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    if (model.name != model.id) Text(model.id, color = V4Subtle, fontSize = 8.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (selected) Icon(Icons.Rounded.CheckCircle, "Selezionato", tint = V4Mint, modifier = Modifier.size(18.dp))
            }
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                val rankText = model.intelligenceRank?.let { "AI #$it" } ?: "AI n/d"
                Text(rankText, color = V4Accent, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                Spacer(Modifier.size(10.dp))
                Text(v4PriceLabel(model), color = if (model.isFree) V4Mint else V4Amber, fontSize = 9.sp, fontWeight = FontWeight.Medium)
                Spacer(Modifier.weight(1f))
                val flags = buildList {
                    if (model.reasoning) add("R")
                    if (model.vision) add("V")
                    if (model.fileInput) add("F")
                    if (model.tools) add("T")
                }.joinToString(" · ")
                if (flags.isNotBlank()) Text(flags, color = V4Muted, fontSize = 8.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun v4PriceLabel(model: ModelInfo): String {
    if (model.isFree) return "Gratis"
    val p = model.averagePricePerMillion ?: return "Prezzo n/d"
    return when {
        p < 0.01 -> "< $0.01 / 1M"
        p < 1 -> "$${String.format(Locale.US, "%.2f", p)} / 1M"
        else -> "$${String.format(Locale.US, "%.1f", p)} / 1M"
    }
}

@Composable
private fun V4MemoryScreen(
    memoryStore: MemoryStore,
    learning: Boolean,
    refresh: Int,
    onLearning: (Boolean) -> Unit,
    onRefresh: () -> Unit
) {
    var note by remember { mutableStateOf("") }
    var editingId by remember { mutableStateOf<Long?>(null) }
    var editText by remember { mutableStateOf("") }
    val memories = remember(refresh) { memoryStore.list() }

    Column(Modifier.fillMaxSize()) {
        Text("Memoria adattiva", color = V4Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
        Text("Micro-RAG locale: piccolo, modificabile, recupera solo ciò che serve.", color = V4Muted, fontSize = 11.sp)
        Spacer(Modifier.height(9.dp))

        Surface(shape = RoundedCornerShape(18.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
            Column(Modifier.fillMaxWidth().padding(13.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Impara automaticamente", color = V4Text, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                        Text("Solo preferenze e fatti stabili. Nessuna chiamata AI extra.", color = V4Muted, fontSize = 9.sp)
                    }
                    Switch(checked = learning, onCheckedChange = onLearning)
                }
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    MemoryStat("${memories.size}/${MemoryStore.MAX_PROFILE_ITEMS}", "ricordi")
                    MemoryStat("≤${MemoryStore.MAX_RETRIEVED_ITEMS}", "per richiesta")
                    MemoryStat("≤${MemoryStore.MAX_CONTEXT_CHARS}", "caratteri")
                    MemoryStat("0", "call extra")
                }
            }
        }

        Spacer(Modifier.height(9.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = note,
                onValueChange = { note = it },
                modifier = Modifier.weight(1f),
                placeholder = { Text("Aggiungi una preferenza o un fatto…") },
                maxLines = 3,
                shape = RoundedCornerShape(16.dp)
            )
            Spacer(Modifier.size(6.dp))
            Surface(shape = CircleShape, color = V4Accent, modifier = Modifier.size(44.dp)) {
                IconButton(onClick = {
                    if (note.isNotBlank()) {
                        memoryStore.add(note)
                        note = ""
                        onRefresh()
                    }
                }) { Icon(Icons.Rounded.Add, "Aggiungi", tint = Color.White) }
            }
        }
        Spacer(Modifier.height(8.dp))

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("Profilo locale", color = V4Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            if (memories.isNotEmpty()) TextButton(onClick = { memoryStore.clear(); onRefresh() }) { Text("Cancella tutto", color = V4Muted, fontSize = 9.sp) }
        }

        if (memories.isEmpty()) {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                Text("Nessun ricordo ancora. OpenClaw imparerà solo informazioni stabili.", color = V4Muted, fontSize = 11.sp)
            }
        } else {
            LazyColumn(Modifier.weight(1f).fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                items(memories, key = { it.id }) { item ->
                    Surface(shape = RoundedCornerShape(16.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
                        if (editingId == item.id) {
                            Column(Modifier.fillMaxWidth().padding(10.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
                                OutlinedTextField(value = editText, onValueChange = { editText = it }, modifier = Modifier.fillMaxWidth(), maxLines = 4)
                                Row(horizontalArrangement = Arrangement.End, modifier = Modifier.fillMaxWidth()) {
                                    TextButton(onClick = { editingId = null }) { Text("Annulla") }
                                    TextButton(onClick = {
                                        if (memoryStore.update(item.id, editText)) onRefresh()
                                        editingId = null
                                    }) { Text("Salva") }
                                }
                            }
                        } else {
                            Row(Modifier.fillMaxWidth().padding(start = 12.dp, top = 9.dp, bottom = 9.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Text(item.text, color = V4Text, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.weight(1f))
                                IconButton(onClick = { editingId = item.id; editText = item.text }, modifier = Modifier.size(36.dp)) { Icon(Icons.Rounded.Edit, "Modifica", tint = V4Muted, modifier = Modifier.size(17.dp)) }
                                IconButton(onClick = { memoryStore.remove(item.id); onRefresh() }, modifier = Modifier.size(36.dp)) { Icon(Icons.Rounded.Delete, "Elimina", tint = V4Subtle, modifier = Modifier.size(17.dp)) }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun MemoryStat(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, color = V4Mint, fontSize = 12.sp, fontWeight = FontWeight.Bold)
        Text(label, color = V4Subtle, fontSize = 7.sp)
    }
}

@Composable
private fun V4DeviceScreen(
    accessibilityAvailable: Boolean,
    notifications: List<NotificationSnapshot>,
    openAccessibility: () -> Unit,
    openNotifications: () -> Unit,
    openBluetooth: () -> Unit
) {
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        item {
            Text("Device", color = V4Text, fontSize = 24.sp, fontWeight = FontWeight.Bold)
            Text("Permessi espliciti, controllo locale.", color = V4Muted, fontSize = 11.sp)
            Spacer(Modifier.height(4.dp))
        }
        item { V4Capability("Controllo Android", if (accessibilityAvailable) "Attivo" else "Da abilitare", accessibilityAvailable, openAccessibility) }
        item { V4Capability("Notifiche", "${notifications.size} recenti", notifications.isNotEmpty(), openNotifications) }
        item { V4Capability("Bluetooth & glasses", "Routing audio Android", false, openBluetooth) }
        if (notifications.isNotEmpty()) {
            item { Text("Ultime notifiche", color = V4Text, fontSize = 14.sp, fontWeight = FontWeight.SemiBold) }
            items(notifications.take(8)) { n ->
                Surface(shape = RoundedCornerShape(15.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
                    Column(Modifier.fillMaxWidth().padding(11.dp)) {
                        Text(n.title.ifBlank { n.app }, color = V4Text, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                        Text(n.text, color = V4Muted, fontSize = 10.sp, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun V4Capability(title: String, subtitle: String, active: Boolean, onClick: () -> Unit) {
    Surface(onClick = onClick, shape = RoundedCornerShape(17.dp), color = V4Panel, border = BorderStroke(1.dp, V4Border)) {
        Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(8.dp).clip(CircleShape).background(if (active) V4Mint else V4Subtle.copy(alpha = 0.45f)))
            Spacer(Modifier.size(10.dp))
            Column(Modifier.weight(1f)) {
                Text(title, color = V4Text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                Text(subtitle, color = V4Muted, fontSize = 9.sp)
            }
            Text("Apri", color = V4Accent, fontSize = 9.sp, fontWeight = FontWeight.Bold)
        }
    }
}

private data class AttachmentLoadResult(val attachments: List<ChatAttachment>, val note: String?)

private suspend fun readPickedAttachments(context: Context, uris: List<Uri>): AttachmentLoadResult = withContext(Dispatchers.IO) {
    val maxFiles = 6
    val maxEach = 8L * 1024L * 1024L
    val maxTotal = 12L * 1024L * 1024L
    val selected = uris.take(maxFiles)
    val output = mutableListOf<ChatAttachment>()
    var total = 0L
    var skipped = 0

    for (uri in selected) {
        val metadata = queryAttachmentMetadata(context, uri)
        if (metadata.size > maxEach || total + metadata.size > maxTotal) {
            skipped++
            continue
        }
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: run {
            skipped++
            continue
        }
        if (bytes.size.toLong() > maxEach || total + bytes.size > maxTotal) {
            skipped++
            continue
        }

        val rawMime = context.contentResolver.getType(uri).orEmpty().ifBlank { inferMime(metadata.name) }
        val isDocx = rawMime == "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || metadata.name.lowercase().endsWith(".docx")
        val attachment = if (isDocx) {
            val extracted = extractDocxText(bytes)
            if (extracted.isBlank()) {
                skipped++
                continue
            }
            ChatAttachment(
                name = metadata.name,
                mimeType = "text/plain",
                base64 = Base64.encodeToString(extracted.toByteArray(Charsets.UTF_8), Base64.NO_WRAP),
                sizeBytes = extracted.toByteArray(Charsets.UTF_8).size.toLong()
            )
        } else {
            ChatAttachment(
                name = metadata.name,
                mimeType = rawMime,
                base64 = Base64.encodeToString(bytes, Base64.NO_WRAP),
                sizeBytes = bytes.size.toLong()
            )
        }
        total += bytes.size
        output += attachment
    }

    if (output.isEmpty()) error("Nessun allegato valido. Limite: 8 MB per file, 12 MB totali.")
    val note = when {
        skipped > 0 -> "${output.size} allegati pronti · $skipped ignorati per dimensione/formato"
        uris.size > maxFiles -> "${output.size} allegati pronti · massimo $maxFiles per messaggio"
        else -> null
    }
    AttachmentLoadResult(output, note)
}

private data class AttachmentMetadata(val name: String, val size: Long)

private fun queryAttachmentMetadata(context: Context, uri: Uri): AttachmentMetadata {
    var name = uri.lastPathSegment?.substringAfterLast('/') ?: "allegato"
    var size = 0L
    context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) {
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
            if (nameIndex >= 0) name = cursor.getString(nameIndex) ?: name
            if (sizeIndex >= 0 && !cursor.isNull(sizeIndex)) size = cursor.getLong(sizeIndex)
        }
    }
    return AttachmentMetadata(name, size)
}

private fun inferMime(name: String): String = when (name.substringAfterLast('.', "").lowercase()) {
    "pdf" -> "application/pdf"
    "png" -> "image/png"
    "jpg", "jpeg" -> "image/jpeg"
    "webp" -> "image/webp"
    "txt", "md", "csv", "log" -> "text/plain"
    "json" -> "application/json"
    "docx" -> "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    else -> "application/octet-stream"
}

private fun extractDocxText(bytes: ByteArray): String {
    ZipInputStream(ByteArrayInputStream(bytes)).use { zip ->
        while (true) {
            val entry = zip.nextEntry ?: break
            if (entry.name == "word/document.xml") {
                val xml = zip.readBytes().toString(Charsets.UTF_8)
                return xml
                    .replace(Regex("<w:tab[^>]*/>"), "\t")
                    .replace("</w:p>", "\n")
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
    }
    return ""
}
