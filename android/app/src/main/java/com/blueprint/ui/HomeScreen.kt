package com.blueprint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.blueprint.ui.components.SectionLabel
import com.blueprint.ui.theme.BpAmber
import com.blueprint.ui.theme.BpBg
import com.blueprint.ui.theme.BpCyan
import com.blueprint.ui.theme.BpDim
import com.blueprint.ui.theme.BpInk
import com.blueprint.ui.theme.BpLine
import com.blueprint.ui.theme.BpSurface

@Composable
fun HomeScreen(
    exampleTopics: List<String>,
    hasKey: Boolean,
    onDraft: (String) -> Unit,
    onOpenSettings: () -> Unit,
) {
    var topic by remember { mutableStateOf("") }

    Column(
        Modifier
            .fillMaxSize()
            .background(BpBg)
            .verticalScroll(rememberScrollState())
            .padding(20.dp)
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                SectionLabel("Blueprint")
                Spacer(Modifier.height(4.dp))
                Text("idea → cited architecture", style = MaterialTheme.typography.titleLarge, color = BpInk)
                Text("in ~30 seconds", style = MaterialTheme.typography.titleMedium, color = BpCyan)
            }
            IconButton(onClick = onOpenSettings) {
                Icon(Icons.Filled.Settings, contentDescription = "Settings", tint = BpDim)
            }
        }

        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = topic,
            onValueChange = { topic = it },
            modifier = Modifier.fillMaxWidth().height(120.dp),
            placeholder = { Text("Describe the product you want to build", color = BpDim) },
            textStyle = MaterialTheme.typography.bodyLarge,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Go),
            keyboardActions = KeyboardActions(onGo = { if (topic.isNotBlank()) onDraft(topic) }),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = BpCyan,
                unfocusedBorderColor = BpLine,
                focusedTextColor = BpInk,
                unfocusedTextColor = BpInk,
                cursorColor = BpCyan,
                focusedContainerColor = BpSurface,
                unfocusedContainerColor = BpSurface,
            ),
        )

        Spacer(Modifier.height(16.dp))

        Button(
            onClick = { if (topic.isNotBlank()) onDraft(topic) },
            enabled = topic.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BpCyan, contentColor = BpBg),
        ) {
            Text("DRAFT IT", style = MaterialTheme.typography.labelLarge)
        }

        if (!hasKey) {
            Spacer(Modifier.height(12.dp))
            Box(
                Modifier
                    .fillMaxWidth()
                    .border(1.dp, BpAmber.copy(alpha = 0.5f), RoundedCornerShape(8.dp))
                    .background(BpAmber.copy(alpha = 0.08f))
                    .clickable(onClick = onOpenSettings)
                    .padding(12.dp)
            ) {
                Text(
                    "No Gemini key set — runs use the built-in demo. Tap to add a key for live research.",
                    style = MaterialTheme.typography.bodyMedium, color = BpAmber,
                )
            }
        }

        Spacer(Modifier.height(28.dp))
        SectionLabel("Example blueprints")
        Spacer(Modifier.height(10.dp))
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            exampleTopics.forEach { ex ->
                Box(
                    Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(8.dp))
                        .background(BpSurface)
                        .border(1.dp, BpLine, RoundedCornerShape(8.dp))
                        .clickable { onDraft(ex) }
                        .padding(14.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("›", color = BpCyan, style = MaterialTheme.typography.titleMedium)
                        Spacer(Modifier.width(10.dp))
                        Text(ex, style = MaterialTheme.typography.bodyLarge, color = BpInk)
                    }
                }
            }
        }
        Spacer(Modifier.height(24.dp))
    }
}
