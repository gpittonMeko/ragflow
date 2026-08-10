package it.meko.openclawmobile

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.Mic
import androidx.compose.material.icons.rounded.Send
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun V5ChatScreen(
    messages: List<V5ChatMessage>,
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
        Spacer(Modifier.height(5.dp))

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
        Row(
            Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            V5ToolToggle("Web", Icons.Rounded.Language, webEnabled, onWebEnabled)
            V5ToolToggle(
                "Telefono",
                Icons.Rounded.Devices,
                phoneEnabled,
                onPhoneEnabled,
                activeAvailable = ClawAccessibilityService.available()
            )
            V5ToolToggle("Memoria", Icons.Rounded.Memory, memoryEnabled, onMemoryEnabled)
        }
        Spacer(Modifier.height(7.dp))

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
                    Text(
                        "Chiedi, allega, cerca sul web o fammi agire sul telefono.",
                        color = V5Muted,
                        fontSize = 11.sp
                    )
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(7.dp)
                    ) {
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
                                    Text(
                                        message.text,
                                        Modifier.padding(horizontal = 14.dp, vertical = 11.dp),
                                        color = Color.White,
                                        fontSize = 14.sp,
                                        lineHeight = 20.sp
                                    )
                                }
                            }
                        }
                    } else {
                        V5AssistantMessage(message) {
                            v5CopyText(context, cleanAssistantText(message.text))
                        }
                    }
                }
            }
        }

        if (attachments.isNotEmpty()) {
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(7.dp)
            ) {
                attachments.forEachIndexed { index, attachment ->
                    Surface(shape = RoundedCornerShape(13.dp), color = V5Raised, border = BorderStroke(1.dp, V5Border)) {
                        Row(
                            Modifier.padding(start = 9.dp, end = 3.dp, top = 4.dp, bottom = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Rounded.Add, null, modifier = Modifier.size(14.dp), tint = V5Mint)
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
                IconButton(onClick = onAttach, modifier = Modifier.size(42.dp)) {
                    Icon(Icons.Rounded.Add, "Allega", tint = V5Muted)
                }
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
                IconButton(onClick = onMic, modifier = Modifier.size(42.dp)) {
                    Icon(Icons.Rounded.Mic, "Microfono", tint = V5Muted)
                }
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
    icon: ImageVector,
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
private fun V5AssistantMessage(message: V5ChatMessage, onCopy: () -> Unit) {
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
            Spacer(Modifier.height(5.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (message.modelId.isNotBlank()) {
                    Text(v5ShortModel(message.modelId), color = V5Subtle, fontSize = 8.sp, fontWeight = FontWeight.SemiBold)
                    if (message.costUsd > 0) {
                        Text(
                            " · ~€${v5FormatCost(message.costUsd * MonthlyBudgetStore.USD_TO_EUR_SAFETY)}",
                            color = V5Subtle,
                            fontSize = 8.sp
                        )
                    } else Text(" · gratis", color = V5Mint, fontSize = 8.sp)
                }
                if (message.toolActions > 0) Text(" · ${message.toolActions} azioni", color = V5Subtle, fontSize = 8.sp)
                if (message.webSearches > 0) Text(" · web ${message.webSearches}", color = V5Subtle, fontSize = 8.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = onCopy, modifier = Modifier.size(30.dp)) {
                    Icon(Icons.Rounded.ContentCopy, "Copia", tint = V5Muted, modifier = Modifier.size(15.dp))
                }
            }
        }
    }
}
