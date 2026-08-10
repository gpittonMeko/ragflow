package it.meko.openclawmobile

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.Lock
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Search
import androidx.compose.material.icons.rounded.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun V5ModelsScreen(
    apiKey: String,
    onApiKey: (String) -> Unit,
    models: List<ModelInfo>,
    manualModelId: String,
    routeMode: ChatRouteMode,
    loading: Boolean,
    status: String,
    budgetStore: MonthlyBudgetStore,
    refresh: Int,
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
                V5ModelSort.INTELLIGENCE -> compareBy<ModelInfo> { it.intelligenceRank ?: Int.MAX_VALUE }
                    .thenBy { it.averagePricePerMillion ?: Double.MAX_VALUE }
                V5ModelSort.PRICE -> compareBy<ModelInfo> { it.averagePricePerMillion ?: Double.MAX_VALUE }
                    .thenBy { it.intelligenceRank ?: Int.MAX_VALUE }
                V5ModelSort.VALUE -> compareByDescending<ModelInfo> { v5ModelValue(it) }
                    .thenBy { it.intelligenceRank ?: Int.MAX_VALUE }
            }
        )
        .toList()

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
                            Text(
                                "€${v5FormatCompact(budgetStore.spentEurConservative())} usati · €${v5FormatCompact(budgetStore.remainingEur())} disponibili",
                                color = V5Muted,
                                fontSize = 9.sp
                            )
                        }
                        Text("max €20", color = V5Mint, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                    }
                    LinearProgressIndicator(progress = fraction.toFloat(), modifier = Modifier.fillMaxWidth().height(5.dp))
                    Row(
                        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        listOf(5.0, 10.0, 15.0, 20.0).forEach { value ->
                            FilterChip(
                                selected = budgetStore.budgetEur() == value,
                                onClick = { onBudget(value) },
                                label = { Text("€${value.toInt()}", fontSize = 9.sp) }
                            )
                        }
                    }
                    Text(
                        "Auto privilegia i modelli value e passa ai gratuiti quando il budget si avvicina al limite.",
                        color = V5Subtle,
                        fontSize = 8.sp
                    )
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Profili rapidi", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                V5RouteExplanation("Normale", "DeepSeek V4 Flash · MiMo V2.5", "Uso quotidiano e telefono")
                V5RouteExplanation("Avanzata", "Kimi K2.6 · DeepSeek V4 Pro", "Reasoning e task lunghi")
                V5RouteExplanation("Gratis", "Nemotron · Kimi free · Free Router", "Solo modelli gratuiti")
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
                        Text(
                            if (apiKey.isBlank()) "Chiave non configurata" else "Chiave cifrata localmente",
                            color = V5Muted,
                            fontSize = 8.sp
                        )
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
                                if (loading) CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                                else Icon(Icons.Rounded.Refresh, null, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.size(5.dp))
                                Text("Aggiorna")
                            }
                        }
                    }
                }
            }
        }
        item {
            OutlinedTextField(
                value = search,
                onValueChange = { search = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Cerca modello") },
                leadingIcon = { Icon(Icons.Rounded.Search, null) },
                singleLine = true
            )
            Spacer(Modifier.height(6.dp))
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                V5ModelSort.entries.forEach { option ->
                    FilterChip(
                        selected = sort == option,
                        onClick = { sort = option },
                        label = { Text(option.label, fontSize = 9.sp) }
                    )
                }
                FilterChip(selected = freeOnly, onClick = { freeOnly = !freeOnly }, label = { Text("Gratis", fontSize = 9.sp) })
                FilterChip(selected = toolsOnly, onClick = { toolsOnly = !toolsOnly }, label = { Text("Tools", fontSize = 9.sp) })
            }
            Text(
                "${visible.size} modelli · $status",
                color = V5Subtle,
                fontSize = 8.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
        }
        items(visible, key = { it.id }) { model ->
            V5ModelRow(
                model = model,
                selected = routeMode == ChatRouteMode.MANUAL && manualModelId == model.id,
                onClick = { onSelectManual(model) }
            )
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}

@Composable
private fun V5RouteExplanation(title: String, models: String, description: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Surface(modifier = Modifier.size(7.dp), shape = CircleShape, color = V5Purple) {}
        Spacer(Modifier.size(8.dp))
        Column(Modifier.weight(1f)) {
            Text(title, color = V5Text, fontSize = 10.sp, fontWeight = FontWeight.Bold)
            Text(models, color = V5Purple, fontSize = 9.sp, fontWeight = FontWeight.SemiBold)
        }
        Text(description, color = V5Subtle, fontSize = 8.sp)
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
                    Text(
                        model.name,
                        color = V5Text,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Text(model.id, color = V5Subtle, fontSize = 7.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                if (selected) Icon(Icons.Rounded.CheckCircle, null, tint = V5Mint, modifier = Modifier.size(18.dp))
            }
            Row(
                Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(5.dp)
            ) {
                V5TinyTag(if (model.isFree) "GRATIS" else v5PriceLabel(model), if (model.isFree) V5Mint else V5Muted)
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
internal fun V5TinyTag(text: String, tint: Color) {
    Surface(shape = RoundedCornerShape(8.dp), color = tint.copy(alpha = .10f)) {
        Text(text, Modifier.padding(horizontal = 6.dp, vertical = 3.dp), color = tint, fontSize = 7.sp, fontWeight = FontWeight.Bold)
    }
}
