package it.meko.openclawmobile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Chat
import androidx.compose.material.icons.rounded.Devices
import androidx.compose.material.icons.rounded.Memory
import androidx.compose.material.icons.rounded.SmartToy
import androidx.compose.material.icons.rounded.Tune
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun V5TopBar(
    routeMode: ChatRouteMode,
    lastModel: String,
    spentEur: Double,
    budgetEur: Double,
    refresh: Int
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
                if (lastModel.isBlank()) "OpenClaw Mobile · ${routeMode.label}" else "${routeMode.label} · ${v5ShortModel(lastModel)}",
                color = V5Subtle,
                fontSize = 9.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        Surface(shape = RoundedCornerShape(13.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
            Column(Modifier.padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.End) {
                Text("€${v5FormatCompact(spentEur)} / €${v5FormatCompact(budgetEur)}", color = V5Text, fontSize = 10.sp, fontWeight = FontWeight.Bold)
                Text("MESE", color = if (spentEur < budgetEur * .9) V5Mint else V5Amber, fontSize = 7.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
internal fun V5BottomDock(selected: V5Section, onSelect: (V5Section) -> Unit) {
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
                                V5Section.BRAIN -> Icons.Rounded.Memory
                                V5Section.DEVICE -> Icons.Rounded.Devices
                            },
                            item.label,
                            modifier = Modifier.size(19.dp),
                            tint = if (active) V5Purple else V5Subtle
                        )
                        Text(
                            item.label,
                            color = if (active) V5Text else V5Subtle,
                            fontSize = 9.sp,
                            fontWeight = if (active) FontWeight.Bold else FontWeight.Medium
                        )
                    }
                }
            }
        }
    }
}
