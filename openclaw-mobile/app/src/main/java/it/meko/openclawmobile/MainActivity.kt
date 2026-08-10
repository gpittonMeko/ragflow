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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DarkColorScheme
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch
import java.util.Locale

enum class AppSection(val label: String) { CHAT("Chat"), MODELS("Modelli"), MEMORY("Memoria"), DEVICE("Telefono") }

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { OpenClawMobileApp() }
    }
}

private val ClawColors: DarkColorScheme = darkColorScheme(
    background = Color(0xFF080A0F),
    surface = Color(0xFF11141B),
    surfaceVariant = Color(0xFF191D27),
    primary = Color(0xFFA99CFF),
    secondary = Color(0xFF78D8C8),
    onBackground = Color(0xFFF4F2F8),
    onSurface = Color(0xFFF4F2F8),
    onSurfaceVariant = Color(0xFFB8BAC5)
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
        var status by remember { mutableStateOf("Configura una API key e carica i modelli") }
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

        Scaffold(
            containerColor = MaterialTheme.colorScheme.background,
            bottomBar = {
                NavigationBar(containerColor = Color(0xFF0E1118)) {
                    AppSection.entries.forEach { item ->
                        NavigationBarItem(
                            selected = section == item,
                            onClick = { section = item },
                            icon = {
                                Icon(
                                    when (item) {
                                        AppSection.CHAT -> Icons.Rounded.Chat
                                        AppSection.MODELS -> Icons.Rounded.SmartToy
                                        AppSection.MEMORY -> Icons.Rounded.Memory
                                        AppSection.DEVICE -> Icons.Rounded.Devices
                                    },
                                    contentDescription = item.label
                                )
                            },
                            label = { Text(item.label) }
                        )
                    }
                }
            }
        ) { padding ->
            Column(
                modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 18.dp, vertical = 12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Header(selectedModel = selectedModel, providerMode = providerMode)
                when (section) {
                    AppSection.CHAT -> ChatScreen(
                        messages = messages,
                        prompt = prompt,
                        onPrompt = { prompt = it },
                        loading = loading,
                        status = status,
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
                            } else {
                                messages.add(ChatMessage("user", userText))
                                loading = true
                                status = "Sto interrogando ${selectedModel}…"
                                scope.launch {
                                    runCatching {
                                        val memoryText = memoryStore.contextText()
                                        val outbound = buildList {
                                            if (memoryText.isNotBlank()) add(ChatMessage("system", "Memoria personale dell’utente:\n$memoryText\nUsala solo se utile."))
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
                                        messages.add(ChatMessage("assistant", "Errore: ${status}"))
                                    }
                                    loading = false
                                }
                            }
                        }
                    )
                    AppSection.MODELS -> ModelsScreen(
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
                            status = "Credenziali salvate nel Keystore"
                        },
                        onLoadModels = {
                            loading = true
                            status = "Carico il catalogo modelli…"
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
                            status = "Modello selezionato: ${model.id}"
                        }
                    )
                    AppSection.MEMORY -> MemoryScreen(
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
                        accessibilityAvailable = ClawAccessibilityService.available(),
                        notifications = ClawNotificationService.recentNotifications(),
                        openAccessibility = { context.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)) },
                        openNotifications = { context.startActivity(Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS")) },
                        openBluetooth = { context.startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS)) }
                    )
                }
            }
        }
    }
}

@Composable
private fun Header(selectedModel: String, providerMode: ProviderMode) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text("OPENCLAW", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Text("Mobile Agent", fontSize = 28.sp, fontWeight = FontWeight.SemiBold)
        }
        AssistChip(
            onClick = {},
            label = { Text(selectedModel.ifBlank { if (providerMode == ProviderMode.OPENROUTER) "OpenRouter" else "Custom" }.take(24)) }
        )
    }
}

@Composable
private fun ChatScreen(
    messages: List<ChatMessage>,
    prompt: String,
    onPrompt: (String) -> Unit,
    loading: Boolean,
    status: String,
    onMic: () -> Unit,
    onSend: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth().weight(1f),
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        if (messages.isEmpty()) {
            Box(Modifier.fillMaxSize().padding(24.dp), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Icon(Icons.Rounded.SmartToy, null, tint = MaterialTheme.colorScheme.primary)
                    Text("Pronto a lavorare sul telefono", fontSize = 20.sp, fontWeight = FontWeight.Medium)
                    Text("Prova: “apri WhatsApp”, “indietro”, oppure fai una domanda al modello.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        } else {
            LazyColumn(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                items(messages) { message ->
                    MessageBubble(message)
                }
            }
        }
    }
    Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(
            value = prompt,
            onValueChange = onPrompt,
            modifier = Modifier.weight(1f),
            placeholder = { Text("Scrivi o parla…") },
            maxLines = 4,
            shape = RoundedCornerShape(20.dp)
        )
        IconButton(onClick = onMic) { Icon(Icons.Rounded.Mic, "Microfono") }
        IconButton(onClick = onSend, enabled = !loading) {
            if (loading) CircularProgressIndicator(modifier = Modifier.height(24.dp)) else Icon(Icons.Rounded.Send, "Invia")
        }
    }
}

@Composable
private fun MessageBubble(message: ChatMessage) {
    val isUser = message.role == "user"
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start) {
        Card(
            modifier = Modifier.fillMaxWidth(0.88f),
            shape = RoundedCornerShape(18.dp),
            colors = CardDefaults.cardColors(
                containerColor = if (isUser) MaterialTheme.colorScheme.primary.copy(alpha = 0.17f) else MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Column(Modifier.padding(14.dp)) {
                Text(if (isUser) "Tu" else "OpenClaw", fontSize = 11.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                Spacer(Modifier.height(4.dp))
                Text(message.content)
            }
        }
    }
}

@Composable
private fun ModelsScreen(
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
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        AssistChip(onClick = { onProviderMode(ProviderMode.OPENROUTER) }, label = { Text(if (providerMode == ProviderMode.OPENROUTER) "✓ OpenRouter" else "OpenRouter") })
        AssistChip(onClick = { onProviderMode(ProviderMode.OPENAI_COMPATIBLE) }, label = { Text(if (providerMode == ProviderMode.OPENAI_COMPATIBLE) "✓ API compatibile" else "API compatibile") })
    }
    OutlinedTextField(
        value = apiKey,
        onValueChange = onApiKey,
        modifier = Modifier.fillMaxWidth(),
        label = { Text("API key") },
        visualTransformation = PasswordVisualTransformation(),
        singleLine = true
    )
    if (providerMode == ProviderMode.OPENAI_COMPATIBLE) {
        OutlinedTextField(
            value = baseUrl,
            onValueChange = onBaseUrl,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Base URL (es. bridge OpenClaw / OpenAI-compatible)") },
            singleLine = true
        )
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedButton(onClick = onSave) { Icon(Icons.Rounded.Settings, null); Text(" Salva") }
        Button(onClick = onLoadModels, enabled = !loading) { Icon(Icons.Rounded.Refresh, null); Text(" Carica modelli") }
    }
    Text(status, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
    HorizontalDivider()
    Text("Catalogo", fontSize = 18.sp, fontWeight = FontWeight.Medium)
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        items(models, key = { it.id }) { model ->
            Card(
                onClick = { onSelect(model) },
                colors = CardDefaults.cardColors(
                    containerColor = if (model.id == selectedModel) MaterialTheme.colorScheme.primary.copy(alpha = 0.16f) else MaterialTheme.colorScheme.surface
                )
            ) {
                Column(Modifier.fillMaxWidth().padding(13.dp)) {
                    Text(model.name, fontWeight = FontWeight.Medium)
                    if (model.name != model.id) Text(model.id, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }
        }
    }
}

@Composable
private fun MemoryScreen(
    memoryStore: MemoryStore,
    learning: Boolean,
    refresh: Int,
    onLearning: (Boolean) -> Unit,
    onRefresh: () -> Unit
) {
    var note by remember { mutableStateOf("") }
    val items = remember(refresh) { memoryStore.list() }
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)) {
        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text("Apprendimento locale", fontWeight = FontWeight.Medium)
                Text("Memoria trasparente, modificabile e cancellabile.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            }
            Switch(checked = learning, onCheckedChange = onLearning)
        }
    }
    OutlinedTextField(value = note, onValueChange = { note = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Aggiungi una memoria") })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = { if (note.isNotBlank()) { memoryStore.add(note); note = ""; onRefresh() } }) { Text("Salva memoria") }
        OutlinedButton(onClick = { memoryStore.clear(); onRefresh() }) { Text("Cancella tutto") }
    }
    LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        items(items, key = { it.id }) { item ->
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(item.text, modifier = Modifier.weight(1f))
                    IconButton(onClick = { memoryStore.remove(item.id); onRefresh() }) { Icon(Icons.Rounded.Delete, "Elimina") }
                }
            }
        }
    }
}

@Composable
private fun DeviceScreen(
    accessibilityAvailable: Boolean,
    notifications: List<NotificationSnapshot>,
    openAccessibility: () -> Unit,
    openNotifications: () -> Unit,
    openBluetooth: () -> Unit
) {
    CapabilityCard(
        title = "Controllo UI Android",
        subtitle = if (accessibilityAvailable) "Attivo. Comandi: home, indietro, recenti, scorri, clicca…, apri…" else "Richiede Accessibility Service esplicitamente abilitato.",
        button = if (accessibilityAvailable) "Apri impostazioni" else "Abilita",
        onClick = openAccessibility
    )
    CapabilityCard(
        title = "Notifiche",
        subtitle = "${notifications.size} notifiche recenti disponibili in memoria volatile dopo l’autorizzazione.",
        button = "Gestisci accesso",
        onClick = openNotifications
    )
    CapabilityCard(
        title = "Meta glasses / Bluetooth",
        subtitle = "Il microfono può usare il routing Bluetooth esposto da Android. Le funzioni display Meta richiedono SDK e credenziali Meta dedicate.",
        button = "Bluetooth",
        onClick = openBluetooth
    )
    if (notifications.isNotEmpty()) {
        Text("Ultime notifiche", fontWeight = FontWeight.Medium)
        LazyColumn(Modifier.fillMaxSize(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            items(notifications.take(10)) { n ->
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                    Column(Modifier.fillMaxWidth().padding(12.dp)) {
                        Text(n.title.ifBlank { n.app }, fontWeight = FontWeight.Medium)
                        Text(n.text, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
        }
    }
}

@Composable
private fun CapabilityCard(title: String, subtitle: String, button: String, onClick: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface), shape = RoundedCornerShape(22.dp)) {
        Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text(title, fontSize = 18.sp, fontWeight = FontWeight.Medium)
            Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedButton(onClick = onClick) { Text(button) }
        }
    }
}
