package com.blueprint.ui

import androidx.compose.foundation.background
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
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.blueprint.RunPhase
import com.blueprint.UiState
import com.blueprint.ui.components.AgentBadge
import com.blueprint.ui.components.SectionLabel
import com.blueprint.ui.components.StatusGlyph
import com.blueprint.ui.theme.BpAmber
import com.blueprint.ui.theme.BpBg
import com.blueprint.ui.theme.BpCyan
import com.blueprint.ui.theme.BpDim
import com.blueprint.ui.theme.BpInk

@Composable
fun RunScreen(
    state: UiState,
    onOpenResults: () -> Unit,
    onCancel: () -> Unit,
) {
    val listState = rememberLazyListState()
    LaunchedEffect(state.logs.size) {
        if (state.logs.isNotEmpty()) listState.animateScrollToItem(state.logs.lastIndex)
    }
    // Auto-advance to results when the run finishes.
    LaunchedEffect(state.phase) {
        if (state.phase == RunPhase.DONE && state.result != null) onOpenResults()
    }

    Column(Modifier.fillMaxSize().background(BpBg).padding(16.dp)) {
        SectionLabel("Agent console")
        Spacer(Modifier.height(2.dp))
        Text(state.topic, style = MaterialTheme.typography.titleMedium, color = BpInk)
        if (state.usingDemo) {
            Spacer(Modifier.height(2.dp))
            Text("demo mode", style = MaterialTheme.typography.labelSmall, color = BpAmber)
        }
        Spacer(Modifier.height(12.dp))

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(state.logs, key = { it.id }) { entry ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    AgentBadge(entry.agent)
                    Spacer(Modifier.width(10.dp))
                    Text(entry.text, style = MaterialTheme.typography.bodyMedium, color = BpInk, modifier = Modifier.weight(1f))
                    Spacer(Modifier.width(8.dp))
                    StatusGlyph(entry.status)
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        when (state.phase) {
            RunPhase.ERROR -> {
                Box(
                    Modifier.fillMaxWidth()
                        .background(BpAmber.copy(alpha = 0.10f), RoundedCornerShape(8.dp))
                        .padding(12.dp)
                ) {
                    Text(state.error ?: "Run failed", style = MaterialTheme.typography.bodyMedium, color = BpAmber)
                }
                Spacer(Modifier.height(10.dp))
                Button(
                    onClick = onCancel,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BpCyan, contentColor = BpBg),
                ) { Text("BACK", style = MaterialTheme.typography.labelLarge) }
            }
            RunPhase.DONE -> {
                Button(
                    onClick = onOpenResults,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = BpCyan, contentColor = BpBg),
                ) { Text("VIEW BLUEPRINT", style = MaterialTheme.typography.labelLarge) }
            }
            else -> {
                Text("working…", style = MaterialTheme.typography.bodyMedium, color = BpDim)
            }
        }
    }
}
