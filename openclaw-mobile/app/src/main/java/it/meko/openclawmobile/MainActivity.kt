package it.meko.openclawmobile

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.provider.Settings
import android.speech.RecognizerIntent
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
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
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.util.Locale

enum class AppSection(val label: String) { CHAT("Chat"), MODELS("Modelli"), MEMORY("Memoria"), DEVICE("Device") }
enum class ModelSort { INTELLIGENCE, PRICE }
enum class ModelFilter { ALL, FREE, REASONING, VISION }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { OpenClawMobileApp() }
    }
}

private val ClawColors = darkColorScheme(
    background = Color(0xFF07080C),
    surface = Color(0xFF11131A),
    surfaceVariant = Color(0xFF181B24),
    primary = Color(0xFFB7A7FF),
    secondary = Color(0xFF72DFC8),
    tertiary = Color(0xFFFFC778),
    onBackground = Color(0xFFF6F3FA),
    onSurface = Color(0xFFF6F3FA),
    onSurfaceVariant = Color(0xFFAAACB8)
)

private val AppGradient = Brush.verticalGradient(
    listOf(Color(0xFF0D0B18), Color(0xFF07080C), Color(0xFF080A10))
)

@Composable
fun OpenClawMobileApp() {
    MaterialTheme(colorScheme = ClawColors) {
        val context = LocalContext.current
        val secureStore = remember { SecureStore(context) }
        val memoryStore = remember { MemoryStore(context) }
        val providerClient = remember { ProviderClient() }
        val scope = rememberCoroutineScope()

        var section by remember { mutableStateOf(AppSection.CHAT) }
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
                val heard = result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()
                if (!heard.isNullOrBlank()) prompt = heard
            }
        }
        val micPermissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) {
                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, Locale.getDefault().toLanguageTag())
                    putExtra(RecognizerIntent.EXTRA_PROMPT, "Parla con OpenClaw")
                }
                speechLauncher.launch(intent)
            } else status = "Permesso microfono non concesso"
        }

        Box(Modifier.fillMaxSize().background(AppGradient)) {
            Scaffold(
                containerColor = Color.Transparent,
                bottomBar = {
                    PremiumBottomBar(selected = section, onSelect = { section = it })
                }
            ) { padding ->
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .padding(horizontal = 16.dp, vertical = 10.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    PremiumHeader(selectedModel = selectedModel, providerMode = providerMode)
                    when (section) {
                        AppSection.CHAT -> ChatScreen(
                            modifier = Modifier.weight(1f),
                            messages = messages,
                            prompt = prompt,
                            onPrompt = { prompt = it },
                            loading = loading,
                            status = status,
                            selectedModel = selectedModel,
                            onMic = { micPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO) },
                            onSend = {
                                val userText = prompt.trim()
                                if (userText.isBlank() || loading) return@ChatScreen
                                prompt = ""
                                val deviceResult = ClawAccessibilityService.execute(userText)
                                if (deviceResult != null) {
                                    messages.add(ChatMessage("user", userText))
                                    messages.add(ChatMessage("assistant", deviceResult))
                                    status = deviceResult
                                } else if (selectedModel.isBlank()) {
                                    status = "Seleziona prima un modello"
                                    section = AppSection.MODELS
                                } else {
                                    messages.add(ChatMessage("user", userText))
                                    loading = true
                                    status = "OpenClaw sta pensando…"
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
                                            status = "Risposta ricevuta"
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

                        AppSection.MODELS -> ModelsScreen(
                            modifier = Modifier.weight(1f),
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
                                status = "Credenziali protette e salvate"
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

                        AppSection.MEMORY -> MemoryScreen(
                            modifier = Modifier.weight(1f),
                            memoryStore = memoryStore,
                            learning = learning,
                            refresh = memoryRefresh,
                            onLearning = {
                                learning = it
                                memoryStore.setLearningEnabled(it)
                            },
                            onRefresh = { memoryRefresh++ }
                        )

                        AppSection.DEVICE -> DeviceScreen(
                            modifier = Modifier.weight(1f),
                            accessibilityAvailable = ClawAccessibilityService.available(),
                            notifications = ClawNotificationService.recentNotifications(),
                            openAccessibility = { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                            openNotifications = { context.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)) },
                            openBluetooth = { context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PremiumHeader(selectedModel: String, providerMode: ProviderMode) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.14f),
            modifier = Modifier.size(46.dp)
        ) {
            Box(contentAlignment = Alignment.Center) {
                Icon(Icons.Rounded.SmartToy, null, tint = MaterialTheme.colorScheme.primary)
            }
        }
        Spacer(Modifier.size(11.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("OpenClaw", fontSize = 20.sp, fontWeight = FontWeight.SemiBold)
                Spacer(Modifier.size(7.dp))
                Box(Modifier.size(7.dp).clip(CircleShape).background(MaterialTheme.colorScheme.secondary))
            }
            Text("mobile intelligence", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Surface(
            shape = RoundedCornerShape(15.dp),
            color = MaterialTheme.colorScheme.surface.copy(alpha = 0.88f)
        ) {
            Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp), horizontalAlignment = Alignment.End) {
                Text(
                    selectedModel.substringAfter('/').ifBlank {
                        if (providerMode == ProviderMode.OPENROUTER) "OpenRouter" else "Custom"
                    }.take(18),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    if (providerMode == ProviderMode.OPENROUTER) "OPENROUTER" else "API CUSTOM",
                    fontSize = 8.sp,
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
private fun PremiumBottomBar(selected: AppSection, onSelect: (AppSection) -> Unit) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp),
        shape = RoundedCornerShape(28.dp),
        color = Color(0xF2171921)
    ) {
        Row(Modifier.fillMaxWidth().padding(6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            AppSection.entries.forEach { item ->
                val isSelected = selected == item
                Card(
                    onClick = { onSelect(item) },
                    modifier = Modifier.weight(1f),
                    shape = RoundedCornerShape(21.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f) else Color.Transparent
                    )
                ) {
                    Column(
                        Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(3.dp)
                    ) {
                        Icon(
                            when (item) {
                                AppSection.CHAT -> Icons.Rounded.Chat
                                AppSection.MODELS -> Icons.Rounded.SmartToy
                                AppSection.MEMORY -> Icons.Rounded.Memory
                                AppSection.DEVICE -> Icons.Rounded.Devices
                            },
                            null,
                            modifier = Modifier.size(21.dp),
                            tint = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            item.label,
                            fontSize = 9.sp,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            color = if (isSelected) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ChatScreen(
    modifier: Modifier,
    messages: List<ChatMessage>,
    prompt: String,
    onPrompt: (String) -> Unit,
    loading: Boolean,
    status: String,
    selectedModel: String,
    onMic: () -> Unit,
    onSend: () -> Unit
) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Card(
            modifier = Modifier.fillMaxWidth().weight(1f),
            shape = RoundedCornerShape(30.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xCC11131A))
        ) {
            if (messages.isEmpty()) {
                Box(Modifier.fillMaxSize().padding(28.dp), contentAlignment = Alignment.Center) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Surface(
                            modifier = Modifier.size(72.dp),
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.13f)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Rounded.SmartToy, null, modifier = Modifier.size(34.dp), tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                        Text("Cosa vuoi fare?", fontSize = 25.sp, fontWeight = FontWeight.SemiBold)
                        Text(
                            if (selectedModel.isBlank()) "Scegli un modello e OpenClaw è pronto."
                            else "Chat, voce e azioni sul telefono in un solo agente.",
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            fontSize = 13.sp
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 14.dp, vertical = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(messages) { message -> MessageBubble(message) }
                }
            }
        }

        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier.size(7.dp).clip(CircleShape).background(
                    if (loading) MaterialTheme.colorScheme.tertiary else MaterialTheme.colorScheme.secondary
                )
            )
            Spacer(Modifier.size(7.dp))
            Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 2)
        }

        TextField(
            value = prompt,
            onValueChange = onPrompt,
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Messaggio a OpenClaw…") },
            minLines = 1,
            maxLines = 4,
            shape = RoundedCornerShape(27.dp),
            leadingIcon = {
                IconButton(onClick = onMic) { Icon(Icons.Rounded.Mic, "Microfono") }
            },
            trailingIcon = {
                Surface(
                    shape = CircleShape,
                    color = MaterialTheme.colorScheme.primary,
                    modifier = Modifier.size(42.dp)
                ) {
                    IconButton(onClick = onSend, enabled = !loading) {
                        if (loading) CircularProgressIndicator(modifier = Modifier.size(19.dp), strokeWidth = 2.dp, color = Color(0xFF151221))
                        else Icon(Icons.Rounded.Send, "Invia", tint = Color(0xFF151221))
                    }
                }
            },
            colors = TextFieldDefaults.colors(
                focusedContainerColor = Color(0xF21A1C24),
                unfocusedContainerColor = Color(0xF21A1C24),
                focusedIndicatorColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent
            )
        )
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Card(
            modifier = Modifier.fillMaxWidth(0.88f),
            shape = RoundedCornerShape(
                topStart = 22.dp,
                topEnd = 22.dp,
                bottomStart = if (isUser) 22.dp else 7.dp,
                bottomEnd = if (isUser) 7.dp else 22.dp
            ),
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f)
                else Color(0xFF1A1D27)
            )
        ) {
            Column(Modifier.padding(horizontal = 15.dp, vertical = 13.dp)) {
                Text(
                    if (isUser) "TU" else "OPENCLAW",
                    fontSize = 9.sp,
                    letterSpacing = 0.8.sp,
                    color = if (isUser) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(5.dp))
                Text(message.content, lineHeight = 21.sp)
            }
        }
    }
}

@Composable
private fun ModelsScreen(
    modifier: Modifier,
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
    var sort by remember { mutableStateOf(ModelSort.INTELLIGENCE) }
    var filter by remember { mutableStateOf(ModelFilter.ALL) }

    val visibleModels = remember(models, query, sort, filter) {
        val filtered = models.filter { model ->
            val searchMatch = query.isBlank() || model.name.contains(query, true) || model.id.contains(query, true)
            val filterMatch = when (filter) {
                ModelFilter.ALL -> true
                ModelFilter.FREE -> model.isFree
                ModelFilter.REASONING -> model.reasoning
                ModelFilter.VISION -> model.vision
            }
            searchMatch && filterMatch
        }
        when (sort) {
            ModelSort.INTELLIGENCE -> filtered.sortedWith(
                compareByDescending<ModelInfo> { it.capabilityScore }
                    .thenByDescending { it.contextLength }
                    .thenBy { it.name.lowercase() }
            )
            ModelSort.PRICE -> filtered.sortedWith(
                compareBy<ModelInfo> { it.averagePricePerMillion == null }
                    .thenBy { it.averagePricePerMillion ?: Double.MAX_VALUE }
                    .thenByDescending { it.capabilityScore }
            )
        }
    }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text("Model lab", fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
                Text("Trova il modello giusto, senza indovinare.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            if (models.isNotEmpty()) {
                Surface(shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f)) {
                    Text("${visibleModels.size}/${models.size}", Modifier.padding(horizontal = 10.dp, vertical = 6.dp), color = MaterialTheme.colorScheme.secondary, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }

        Card(
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color(0xCC11131A))
        ) {
            Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = providerMode == ProviderMode.OPENROUTER,
                        onClick = { onProviderMode(ProviderMode.OPENROUTER) },
                        label = { Text("OpenRouter") }
                    )
                    FilterChip(
                        selected = providerMode == ProviderMode.OPENAI_COMPATIBLE,
                        onClick = { onProviderMode(ProviderMode.OPENAI_COMPATIBLE) },
                        label = { Text("API custom") }
                    )
                }
                OutlinedTextField(
                    value = apiKey,
                    onValueChange = onApiKey,
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("API key") },
                    leadingIcon = { Icon(Icons.Rounded.Lock, null) },
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                    shape = RoundedCornerShape(17.dp)
                )
                if (providerMode == ProviderMode.OPENAI_COMPATIBLE) {
                    OutlinedTextField(
                        value = baseUrl,
                        onValueChange = onBaseUrl,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Base URL") },
                        singleLine = true,
                        shape = RoundedCornerShape(17.dp)
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedButton(onClick = onSave) {
                        Icon(Icons.Rounded.Settings, null, modifier = Modifier.size(18.dp))
                        Text("  Salva")
                    }
                    Button(onClick = onLoadModels, enabled = !loading) {
                        Icon(Icons.Rounded.Refresh, null, modifier = Modifier.size(18.dp))
                        Text(if (loading) "  Carico…" else "  Aggiorna")
                    }
                }
            }
        }

        OutlinedTextField(
            value = query,
            onValueChange = { query = it },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("Cerca modello o provider…") },
            leadingIcon = { Icon(Icons.Rounded.Search, null) },
            singleLine = true,
            shape = RoundedCornerShape(18.dp)
        )

        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(7.dp)
        ) {
            FilterChip(selected = filter == ModelFilter.ALL, onClick = { filter = ModelFilter.ALL }, label = { Text("Tutti") })
            FilterChip(selected = filter == ModelFilter.FREE, onClick = { filter = ModelFilter.FREE }, label = { Text("Gratis") })
            FilterChip(selected = filter == ModelFilter.REASONING, onClick = { filter = ModelFilter.REASONING }, label = { Text("Reasoning") })
            FilterChip(selected = filter == ModelFilter.VISION, onClick = { filter = ModelFilter.VISION }, label = { Text("Visione") })
        }

        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Rounded.Tune, null, modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.size(7.dp))
            Text("Ordina", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f))
            FilterChip(
                selected = sort == ModelSort.INTELLIGENCE,
                onClick = { sort = ModelSort.INTELLIGENCE },
                leadingIcon = { Icon(Icons.Rounded.Star, null, modifier = Modifier.size(16.dp)) },
                label = { Text("Intelligenza") }
            )
            Spacer(Modifier.size(6.dp))
            FilterChip(
                selected = sort == ModelSort.PRICE,
                onClick = { sort = ModelSort.PRICE },
                leadingIcon = { Icon(Icons.Rounded.AttachMoney, null, modifier = Modifier.size(16.dp)) },
                label = { Text("Prezzo") }
            )
        }

        Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, maxLines = 2)

        if (models.isEmpty() && !loading) {
            Box(Modifier.fillMaxWidth().weight(1f), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.SmartToy, null, modifier = Modifier.size(36.dp), tint = MaterialTheme.colorScheme.primary)
                    Text("Carica il catalogo modelli", fontWeight = FontWeight.Medium)
                    Text("Prezzo e capacità vengono letti dal provider.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }
        } else {
            LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(visibleModels, key = { it.id }) { model ->
                    ModelCard(model = model, selected = model.id == selectedModel, onClick = { onSelect(model) })
                }
            }
        }
    }
}

@Composable
private fun ModelCard(model: ModelInfo, selected: Boolean, onClick: () -> Unit) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(22.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.14f) else Color(0xD914161E)
        )
    ) {
        Column(Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Column(Modifier.weight(1f)) {
                    Text(model.name, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(model.id, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (selected) {
                    Icon(Icons.Rounded.CheckCircle, "Selezionato", tint = MaterialTheme.colorScheme.secondary, modifier = Modifier.size(20.dp))
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                MetricPill(
                    icon = Icons.Rounded.Star,
                    text = if (model.capabilityScore > 0) "${model.capabilityScore}/100 stima" else "score n/d",
                    accent = MaterialTheme.colorScheme.primary
                )
                MetricPill(
                    icon = Icons.Rounded.AttachMoney,
                    text = priceLabel(model),
                    accent = MaterialTheme.colorScheme.tertiary
                )
            }

            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                if (model.contextLength > 0) TinyTag(contextLabel(model.contextLength))
                if (model.reasoning) TinyTag("Reasoning")
                if (model.vision) TinyTag("Visione")
                if (model.tools) TinyTag("Tools")
                if (model.isFree) TinyTag("Gratis")
            }
        }
    }
}

@Composable
private fun MetricPill(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String, accent: Color) {
    Surface(shape = RoundedCornerShape(12.dp), color = accent.copy(alpha = 0.10f)) {
        Row(Modifier.padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(icon, null, modifier = Modifier.size(14.dp), tint = accent)
            Spacer(Modifier.size(4.dp))
            Text(text, fontSize = 9.sp, color = accent, fontWeight = FontWeight.Medium)
        }
    }
}

@Composable
private fun TinyTag(text: String) {
    Surface(shape = RoundedCornerShape(10.dp), color = MaterialTheme.colorScheme.surfaceVariant) {
        Text(text, Modifier.padding(horizontal = 8.dp, vertical = 4.dp), fontSize = 9.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

private fun priceLabel(model: ModelInfo): String {
    if (model.isFree) return "Gratis"
    val price = model.averagePricePerMillion ?: return "prezzo n/d"
    return when {
        price < 0.01 -> "< $0.01 / 1M"
        price < 1.0 -> "$${String.format(Locale.US, "%.2f", price)} / 1M"
        else -> "$${String.format(Locale.US, "%.1f", price)} / 1M"
    }
}

private fun contextLabel(contextLength: Int): String {
    return if (contextLength >= 1_000_000) {
        String.format(Locale.US, "%.1fM ctx", contextLength / 1_000_000.0)
    } else {
        "${contextLength / 1000}K ctx"
    }
}

@Composable
private fun MemoryScreen(
    modifier: Modifier,
    memoryStore: MemoryStore,
    learning: Boolean,
    refresh: Int,
    onLearning: (Boolean) -> Unit,
    onRefresh: () -> Unit
) {
    var note by remember { mutableStateOf("") }
    val memories = remember(refresh) { memoryStore.list() }

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Memory", fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
        Text("Quello che OpenClaw ricorda è sempre visibile e sotto il tuo controllo.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)

        Card(shape = RoundedCornerShape(24.dp), colors = CardDefaults.cardColors(containerColor = Color(0xCC11131A))) {
            Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.secondary.copy(alpha = 0.12f), modifier = Modifier.size(42.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(Icons.Rounded.Memory, null, tint = MaterialTheme.colorScheme.secondary) }
                }
                Spacer(Modifier.size(11.dp))
                Column(Modifier.weight(1f)) {
                    Text("Apprendimento locale", fontWeight = FontWeight.SemiBold)
                    Text("Salvato sul dispositivo", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp)
                }
                Switch(checked = learning, onCheckedChange = onLearning)
            }
        }

        OutlinedTextField(
            value = note,
            onValueChange = { note = it },
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Nuova memoria") },
            shape = RoundedCornerShape(18.dp)
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(onClick = {
                if (note.isNotBlank()) {
                    memoryStore.add(note)
                    note = ""
                    onRefresh()
                }
            }) { Text("Aggiungi") }
            OutlinedButton(onClick = {
                memoryStore.clear()
                onRefresh()
            }) { Text("Cancella tutto") }
        }

        LazyColumn(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            items(memories, key = { it.id }) { item ->
                Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color(0xD914161E))) {
                    Row(Modifier.fillMaxWidth().padding(13.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(item.text, modifier = Modifier.weight(1f), lineHeight = 19.sp)
                        IconButton(onClick = {
                            memoryStore.remove(item.id)
                            onRefresh()
                        }) { Icon(Icons.Rounded.Delete, "Elimina") }
                    }
                }
            }
        }
    }
}

@Composable
private fun DeviceScreen(
    modifier: Modifier,
    accessibilityAvailable: Boolean,
    notifications: List<NotificationSnapshot>,
    openAccessibility: () -> Unit,
    openNotifications: () -> Unit,
    openBluetooth: () -> Unit
) {
    LazyColumn(modifier = modifier, verticalArrangement = Arrangement.spacedBy(10.dp)) {
        item {
            Text("Device", fontSize = 24.sp, fontWeight = FontWeight.SemiBold)
            Text("Permessi espliciti. Nessun controllo nascosto.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            Spacer(Modifier.height(5.dp))
        }
        item {
            CapabilityCard(
                icon = Icons.Rounded.Devices,
                title = "Controllo Android",
                subtitle = if (accessibilityAvailable) "Attivo · home, back, scroll, click e apertura app" else "Abilita Accessibility Service per i comandi sul telefono",
                button = if (accessibilityAvailable) "Impostazioni" else "Abilita",
                active = accessibilityAvailable,
                onClick = openAccessibility
            )
        }
        item {
            CapabilityCard(
                icon = Icons.Rounded.Notifications,
                title = "Notifiche",
                subtitle = "${notifications.size} notifiche recenti disponibili dopo l’autorizzazione",
                button = "Gestisci accesso",
                active = notifications.isNotEmpty(),
                onClick = openNotifications
            )
        }
        item {
            CapabilityCard(
                icon = Icons.Rounded.Bluetooth,
                title = "Glasses & Bluetooth",
                subtitle = "Audio e voce tramite routing Android. Display smart-glasses predisposto come esperienza dedicata.",
                button = "Bluetooth",
                active = false,
                onClick = openBluetooth
            )
        }
        if (notifications.isNotEmpty()) {
            item { Text("Ultime notifiche", fontSize = 17.sp, fontWeight = FontWeight.Medium) }
            items(notifications.take(10)) { n ->
                Card(shape = RoundedCornerShape(18.dp), colors = CardDefaults.cardColors(containerColor = Color(0xD914161E))) {
                    Column(Modifier.fillMaxWidth().padding(13.dp)) {
                        Text(n.title.ifBlank { n.app }, fontWeight = FontWeight.Medium)
                        Text(n.text, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun CapabilityCard(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    title: String,
    subtitle: String,
    button: String,
    active: Boolean,
    onClick: () -> Unit
) {
    Card(colors = CardDefaults.cardColors(containerColor = Color(0xCC11131A)), shape = RoundedCornerShape(24.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(11.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(shape = CircleShape, color = MaterialTheme.colorScheme.primary.copy(alpha = 0.11f), modifier = Modifier.size(42.dp)) {
                    Box(contentAlignment = Alignment.Center) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }
                }
                Spacer(Modifier.size(11.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, fontSize = 16.sp, fontWeight = FontWeight.SemiBold)
                    Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 11.sp, lineHeight = 16.sp)
                }
                Box(
                    Modifier.size(8.dp).clip(CircleShape).background(
                        if (active) MaterialTheme.colorScheme.secondary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.35f)
                    )
                )
            }
            OutlinedButton(onClick = onClick) { Text(button) }
        }
    }
}
