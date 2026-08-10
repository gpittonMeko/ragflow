package it.meko.openclawmobile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Bluetooth
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Language
import androidx.compose.material.icons.rounded.Notifications
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun V5DeviceScreen(
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
            Text(
                "Il Direct Brain funziona sul telefono; OpenClaw Gateway è un'estensione opzionale.",
                color = V5Muted,
                fontSize = 10.sp
            )
        }
        item {
            V5DeviceCard(
                title = "Controllo Android",
                subtitle = if (ClawAccessibilityService.available()) {
                    "Attivo · l'agent loop può leggere, toccare, scrivere e scorrere"
                } else {
                    "Da abilitare · senza questo l'agente non può agire sulle app"
                },
                icon = Icons.Rounded.Devices,
                active = ClawAccessibilityService.available(),
                action = "Accessibilità",
                onAction = openAccessibility
            )
        }
        item {
            V5DeviceCard(
                title = "Web on-demand",
                subtitle = if (webEnabled) {
                    "Attivo · ricerca e lettura web solo quando il task lo richiede"
                } else {
                    "Disattivato dalla Chat"
                },
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
                        Box(
                            Modifier.size(30.dp).clip(RoundedCornerShape(10.dp)).background(V5Purple.copy(alpha = .12f)),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(Icons.Rounded.SmartToy, null, tint = V5Purple, modifier = Modifier.size(17.dp))
                        }
                        Spacer(Modifier.size(8.dp))
                        Column(Modifier.weight(1f)) {
                            Text("OpenClaw Gateway", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                            Text("Protocollo v4 reale · opzionale", color = V5Purple, fontSize = 8.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                    Text(
                        "Serve solo per collegare il telefono a un Gateway OpenClaw esterno. Il Direct Brain non dipende dal Gateway.",
                        color = V5Muted,
                        fontSize = 9.sp
                    )
                    OutlinedTextField(
                        value = gatewayUrl,
                        onValueChange = onGatewayUrl,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("wss://gateway o host") },
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = gatewayToken,
                        onValueChange = onGatewayToken,
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Token / bootstrap auth") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true
                    )
                    Text(
                        gatewayStatus,
                        color = if (gatewayStatus.startsWith("Connesso")) V5Mint else V5Muted,
                        fontSize = 9.sp
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(onClick = onSaveGateway, modifier = Modifier.weight(1f)) { Text("Salva") }
                        Button(onClick = onTestGateway, enabled = !gatewayTesting, modifier = Modifier.weight(1f)) {
                            if (gatewayTesting) {
                                CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                            } else {
                                Icon(Icons.Rounded.CheckCircle, null, modifier = Modifier.size(16.dp))
                            }
                            Spacer(Modifier.size(5.dp))
                            Text("Test")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun V5DeviceCard(
    title: String,
    subtitle: String,
    icon: ImageVector,
    active: Boolean,
    action: String?,
    onAction: () -> Unit
) {
    Surface(shape = RoundedCornerShape(17.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
        Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(35.dp)
                    .clip(RoundedCornerShape(11.dp))
                    .background(if (active) V5Mint.copy(alpha = .10f) else V5Amber.copy(alpha = .10f)),
                contentAlignment = Alignment.Center
            ) {
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
