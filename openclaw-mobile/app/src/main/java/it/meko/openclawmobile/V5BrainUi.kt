package it.meko.openclawmobile

import androidx.compose.foundation.BorderStroke
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Delete
import androidx.compose.material.icons.rounded.Edit
import androidx.compose.material.icons.rounded.PushPin
import androidx.compose.material.icons.rounded.Star
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
internal fun V5BrainScreen(
    memoryStore: MemoryStore,
    skillStore: SkillStore,
    learningEnabled: Boolean,
    refresh: Int,
    onLearning: (Boolean) -> Unit,
    onRefresh: () -> Unit
) {
    var tab by remember { mutableStateOf(V5BrainTab.MEMORIES) }
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
            Text(
                "Memoria selettiva e procedure locali. La cronologia chat non diventa memoria.",
                color = V5Muted,
                fontSize = 10.sp
            )
        }
        item {
            Surface(shape = RoundedCornerShape(18.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text("Apprendimento locale", color = V5Text, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Text(
                            "${memories.size} memorie · ${skills.size} skills · retrieval max ${MemoryStore.MAX_RETRIEVED_ITEMS}",
                            color = V5Muted,
                            fontSize = 8.sp
                        )
                    }
                    Switch(checked = learningEnabled, onCheckedChange = onLearning)
                }
            }
        }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                FilterChip(
                    selected = tab == V5BrainTab.MEMORIES,
                    onClick = { tab = V5BrainTab.MEMORIES },
                    label = { Text("Memorie") }
                )
                FilterChip(
                    selected = tab == V5BrainTab.SKILLS,
                    onClick = { tab = V5BrainTab.SKILLS },
                    label = { Text("Skills") }
                )
            }
        }

        if (tab == V5BrainTab.MEMORIES) {
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
                        }) {
                            Icon(Icons.Rounded.Add, "Aggiungi", tint = V5Purple)
                        }
                    }
                }
            }
            items(memories, key = { it.id }) { memory ->
                Surface(shape = RoundedCornerShape(16.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                    Column(Modifier.padding(11.dp)) {
                        if (editingMemory == memory.id) {
                            OutlinedTextField(
                                value = editMemoryText,
                                onValueChange = { editMemoryText = it },
                                modifier = Modifier.fillMaxWidth(),
                                minLines = 2
                            )
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = { editingMemory = null }) { Text("Annulla") }
                                TextButton(onClick = {
                                    if (memoryStore.update(memory.id, editMemoryText)) onRefresh()
                                    editingMemory = null
                                }) { Text("Salva") }
                            }
                        } else {
                            Row(verticalAlignment = Alignment.Top) {
                                V5TinyTag(memory.kind.label.uppercase(), if (memory.pinned) V5Purple else V5Muted)
                                Spacer(Modifier.size(7.dp))
                                Text(
                                    memory.text,
                                    color = V5Text,
                                    fontSize = 11.sp,
                                    lineHeight = 16.sp,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                IconButton(
                                    onClick = { memoryStore.setPinned(memory.id, !memory.pinned); onRefresh() },
                                    modifier = Modifier.size(31.dp)
                                ) {
                                    Icon(
                                        Icons.Rounded.PushPin,
                                        "Fissa",
                                        tint = if (memory.pinned) V5Purple else V5Subtle,
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                                IconButton(
                                    onClick = { editMemoryText = memory.text; editingMemory = memory.id },
                                    modifier = Modifier.size(31.dp)
                                ) {
                                    Icon(Icons.Rounded.Edit, "Modifica", tint = V5Muted, modifier = Modifier.size(15.dp))
                                }
                                IconButton(
                                    onClick = { memoryStore.remove(memory.id); onRefresh() },
                                    modifier = Modifier.size(31.dp)
                                ) {
                                    Icon(Icons.Rounded.Delete, "Elimina", tint = V5Danger, modifier = Modifier.size(15.dp))
                                }
                            }
                        }
                    }
                }
            }
        } else {
            item {
                Text(
                    "Le skills vengono create solo dopo sequenze di azioni realmente riuscite. Nessuna seconda chiamata AI.",
                    color = V5Subtle,
                    fontSize = 9.sp
                )
            }
            if (skills.isEmpty()) {
                item {
                    Surface(shape = RoundedCornerShape(16.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                        Text(
                            "Nessuna skill ancora. Dopo un task multi-step sul telefono la procedura può essere ricordata localmente.",
                            Modifier.padding(13.dp),
                            color = V5Muted,
                            fontSize = 10.sp
                        )
                    }
                }
            }
            items(skills, key = { it.id }) { skill ->
                Surface(shape = RoundedCornerShape(16.dp), color = V5Panel, border = BorderStroke(1.dp, V5Border)) {
                    Column(Modifier.padding(11.dp)) {
                        if (editingSkill == skill.id) {
                            OutlinedTextField(
                                value = editSkillTitle,
                                onValueChange = { editSkillTitle = it },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Nome") }
                            )
                            Spacer(Modifier.height(6.dp))
                            OutlinedTextField(
                                value = editSkillSteps,
                                onValueChange = { editSkillSteps = it },
                                modifier = Modifier.fillMaxWidth(),
                                label = { Text("Passi, uno per riga") },
                                minLines = 3
                            )
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                TextButton(onClick = { editingSkill = null }) { Text("Annulla") }
                                TextButton(onClick = {
                                    if (skillStore.update(skill.id, editSkillTitle, editSkillSteps.lines())) onRefresh()
                                    editingSkill = null
                                }) { Text("Salva") }
                            }
                        } else {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Rounded.Star,
                                    null,
                                    tint = if (skill.pinned) V5Purple else V5Amber,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(Modifier.size(7.dp))
                                Text(
                                    skill.title,
                                    color = V5Text,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.weight(1f)
                                )
                            }
                            Spacer(Modifier.height(5.dp))
                            skill.steps.take(5).forEach { step ->
                                Text(
                                    "• ${step.substringBefore("→").trim()}",
                                    color = V5Muted,
                                    fontSize = 9.sp,
                                    lineHeight = 14.sp
                                )
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                IconButton(
                                    onClick = { skillStore.setPinned(skill.id, !skill.pinned); onRefresh() },
                                    modifier = Modifier.size(31.dp)
                                ) {
                                    Icon(
                                        Icons.Rounded.PushPin,
                                        "Fissa",
                                        tint = if (skill.pinned) V5Purple else V5Subtle,
                                        modifier = Modifier.size(15.dp)
                                    )
                                }
                                IconButton(
                                    onClick = {
                                        editSkillTitle = skill.title
                                        editSkillSteps = skill.steps.joinToString("\n")
                                        editingSkill = skill.id
                                    },
                                    modifier = Modifier.size(31.dp)
                                ) {
                                    Icon(Icons.Rounded.Edit, "Modifica", tint = V5Muted, modifier = Modifier.size(15.dp))
                                }
                                IconButton(
                                    onClick = { skillStore.remove(skill.id); onRefresh() },
                                    modifier = Modifier.size(31.dp)
                                ) {
                                    Icon(Icons.Rounded.Delete, "Elimina", tint = V5Danger, modifier = Modifier.size(15.dp))
                                }
                            }
                        }
                    }
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)) }
    }
}
