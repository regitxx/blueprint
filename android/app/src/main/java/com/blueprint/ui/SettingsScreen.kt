package com.blueprint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.blueprint.ui.components.SectionLabel
import com.blueprint.ui.theme.BpBg
import com.blueprint.ui.theme.BpCyan
import com.blueprint.ui.theme.BpDim
import com.blueprint.ui.theme.BpInk
import com.blueprint.ui.theme.BpLine
import com.blueprint.ui.theme.BpSurface

@Composable
fun SettingsScreen(
    initialKey: String,
    buildKeyPresent: Boolean,
    onSave: (String) -> Unit,
    onClear: () -> Unit,
    onBack: () -> Unit,
) {
    var key by remember { mutableStateOf(initialKey) }
    var saved by remember { mutableStateOf(false) }

    Column(Modifier.fillMaxSize().background(BpBg).padding(20.dp)) {
        Text("‹ Back", style = MaterialTheme.typography.labelLarge, color = BpCyan,
            modifier = Modifier.clickable(onClick = onBack).padding(bottom = 16.dp))

        SectionLabel("Settings")
        Spacer(Modifier.height(4.dp))
        Text("Gemini API key", style = MaterialTheme.typography.titleMedium, color = BpInk)
        Spacer(Modifier.height(8.dp))
        Text(
            "Your key is stored encrypted on this device and used only to call the Gemini API " +
                "directly. Leave empty to browse in demo mode. Get a key at aistudio.google.com/apikey.",
            style = MaterialTheme.typography.bodyMedium, color = BpDim,
        )

        if (buildKeyPresent) {
            Spacer(Modifier.height(8.dp))
            Text("A build-time key is configured; a key entered here overrides it.",
                style = MaterialTheme.typography.labelSmall, color = BpDim)
        }

        Spacer(Modifier.height(16.dp))
        OutlinedTextField(
            value = key,
            onValueChange = { key = it; saved = false },
            modifier = Modifier.fillMaxWidth(),
            placeholder = { Text("AIza…", color = BpDim) },
            textStyle = MaterialTheme.typography.bodyMedium,
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = BpCyan, unfocusedBorderColor = BpLine,
                focusedTextColor = BpInk, unfocusedTextColor = BpInk, cursorColor = BpCyan,
                focusedContainerColor = BpSurface, unfocusedContainerColor = BpSurface,
            ),
        )

        Spacer(Modifier.height(16.dp))
        Button(
            onClick = { onSave(key); saved = true },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BpCyan, contentColor = BpBg),
        ) { Text(if (saved) "SAVED ✓" else "SAVE KEY", style = MaterialTheme.typography.labelLarge) }

        Spacer(Modifier.height(10.dp))
        OutlinedButton(
            onClick = { key = ""; onClear(); saved = false },
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(8.dp),
        ) { Text("CLEAR KEY", style = MaterialTheme.typography.labelLarge, color = BpDim) }

        Spacer(Modifier.height(24.dp))
        Button(
            onClick = onBack,
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(8.dp),
            colors = ButtonDefaults.buttonColors(containerColor = BpSurface, contentColor = BpInk),
        ) { Text("DONE", style = MaterialTheme.typography.labelLarge) }
    }
}
