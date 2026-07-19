package com.blueprint.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.CircularProgressIndicator
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.blueprint.model.RunResult
import com.blueprint.model.Source
import com.blueprint.model.Variant
import com.blueprint.ui.components.HairlineCard
import com.blueprint.ui.components.MermaidView
import com.blueprint.ui.components.SectionLabel
import com.blueprint.ui.components.SourceChip
import com.blueprint.ui.theme.BpAmber
import com.blueprint.ui.theme.BpBg
import com.blueprint.ui.theme.BpCyan
import com.blueprint.ui.theme.BpDim
import com.blueprint.ui.theme.BpInk
import com.blueprint.ui.theme.BpLine
import com.blueprint.ui.theme.BpSurface

@Composable
fun ResultsScreen(
    result: RunResult,
    refining: Boolean,
    error: String?,
    onRefine: (String) -> Unit,
    onOpenSource: (String) -> Unit,
    onNewRun: () -> Unit,
) {
    val pageCount = result.variants.size + 2 // variants + Compare + Sources
    val pager = rememberPagerState(pageCount = { pageCount })
    var refineText by remember { mutableStateOf("") }
    val sourcesById = remember(result) { result.sources.associateBy { it.id } }

    Column(Modifier.fillMaxSize().background(BpBg)) {
        // Header
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(Modifier.weight(1f)) {
                SectionLabel("Blueprint")
                Text(result.topic, style = MaterialTheme.typography.titleMedium, color = BpInk)
            }
            Text("NEW", style = MaterialTheme.typography.labelLarge, color = BpCyan,
                modifier = Modifier.clickable(onClick = onNewRun).padding(6.dp))
        }

        // Page indicator
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            repeat(pageCount) { i ->
                val on = i == pager.currentPage
                Box(
                    Modifier.height(3.dp).weight(1f)
                        .clip(RoundedCornerShape(2.dp))
                        .background(if (on) BpCyan else BpLine)
                )
            }
        }

        HorizontalPager(
            state = pager,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            pageSpacing = 12.dp,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
        ) { page ->
            when {
                page < result.variants.size ->
                    VariantSheet(result.variants[page], page, result.variants.size, sourcesById, onOpenSource)
                page == result.variants.size ->
                    ComparePage(result)
                else ->
                    SourcesPage(result.sources, onOpenSource)
            }
        }

        // Refine bar
        RefineBar(
            value = refineText,
            onValueChange = { refineText = it },
            refining = refining,
            error = error,
            onSubmit = { if (refineText.isNotBlank()) { onRefine(refineText); refineText = "" } },
        )
    }
}

@Composable
private fun VariantSheet(
    v: Variant,
    index: Int,
    total: Int,
    sourcesById: Map<String, Source>,
    onOpenSource: (String) -> Unit,
) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        HairlineCard(Modifier.fillMaxWidth()) {
            Column {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(v.name, style = MaterialTheme.typography.titleLarge, color = BpInk, modifier = Modifier.weight(1f))
                    ProfileBadge(v.profile)
                }
                Spacer(Modifier.height(4.dp))
                Text("sheet ${index + 1} of $total · drawn by Scout · Analyst · Architect",
                    style = MaterialTheme.typography.labelSmall, color = BpDim)
                Spacer(Modifier.height(8.dp))
                val challenger = v.tagline.startsWith("Challenger take")
                Text(v.tagline, style = MaterialTheme.typography.bodyLarge,
                    color = if (challenger) BpAmber else BpCyan)
            }
        }

        Spacer(Modifier.height(12.dp))
        Text(v.summary, style = MaterialTheme.typography.bodyLarge, color = BpInk)

        Spacer(Modifier.height(14.dp))
        SectionLabel("Diagram")
        Spacer(Modifier.height(6.dp))
        Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(8.dp)).border(1.dp, BpLine, RoundedCornerShape(8.dp))) {
            MermaidView(v.mermaid, Modifier.fillMaxWidth())
        }

        Spacer(Modifier.height(14.dp))
        SectionLabel("Components")
        Spacer(Modifier.height(6.dp))
        v.components.forEach { c ->
            Column(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Text(c.name, style = MaterialTheme.typography.bodyLarge, color = BpInk, fontWeight = FontWeight.Bold)
                Text(c.role, style = MaterialTheme.typography.bodyMedium, color = BpDim)
                Spacer(Modifier.height(4.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    c.sourceIds.forEach { id -> SourceChip(id) { onOpenSource(id) } }
                }
            }
        }

        Spacer(Modifier.height(12.dp))
        LabeledBlock("Risks", v.risks, BpAmber)
        Spacer(Modifier.height(10.dp))
        LabeledBlock("Choose this when", v.whenToChoose, BpCyan)
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun LabeledBlock(label: String, body: String, accent: androidx.compose.ui.graphics.Color) {
    Column {
        SectionLabel(label, color = accent)
        Spacer(Modifier.height(4.dp))
        Text(body, style = MaterialTheme.typography.bodyMedium, color = BpInk)
    }
}

@Composable
private fun ProfileBadge(profile: String) {
    Box(
        Modifier.clip(RoundedCornerShape(4.dp))
            .border(1.dp, BpCyan.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
            .background(BpCyan.copy(alpha = 0.10f))
            .padding(horizontal = 8.dp, vertical = 3.dp)
    ) {
        Text(profile.uppercase(), style = MaterialTheme.typography.labelSmall, color = BpCyan)
    }
}

@Composable
private fun ComparePage(result: RunResult) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        SectionLabel("Compare")
        Spacer(Modifier.height(8.dp))
        Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())) {
            Column {
                // header row: criterion + variant names
                Row {
                    CompareCell("", header = true, width = 150)
                    result.variants.forEach { CompareCell(it.name, header = true, width = 120) }
                }
                result.comparison.forEach { row ->
                    Row {
                        CompareCell(row.criterion, header = true, width = 150)
                        row.values.forEach { CompareCell(it, header = false, width = 120) }
                    }
                }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun CompareCell(text: String, header: Boolean, width: Int) {
    Box(
        Modifier.width(width.dp).height(56.dp)
            .border(1.dp, BpLine)
            .background(if (header) BpSurface else BpBg)
            .padding(8.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        Text(
            text,
            style = MaterialTheme.typography.bodyMedium,
            color = if (header) BpCyan else BpInk,
            fontWeight = if (header) FontWeight.Bold else FontWeight.Normal,
        )
    }
}

@Composable
private fun SourcesPage(sources: List<Source>, onOpenSource: (String) -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 8.dp)) {
        SectionLabel("Sources")
        Spacer(Modifier.height(8.dp))
        sources.forEach { s ->
            HairlineCard(Modifier.fillMaxWidth().padding(vertical = 6.dp)) {
                Column(Modifier.clickable { onOpenSource(s.id) }) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text("[${s.id}]", style = MaterialTheme.typography.labelSmall, color = BpCyan)
                        Spacer(Modifier.width(8.dp))
                        Text(s.origin, style = MaterialTheme.typography.labelSmall, color = BpDim)
                        s.meta?.let {
                            Spacer(Modifier.width(8.dp))
                            Text(it, style = MaterialTheme.typography.labelSmall, color = BpDim)
                        }
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(s.title, style = MaterialTheme.typography.bodyLarge, color = BpInk, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(4.dp))
                    Text(s.snippet, style = MaterialTheme.typography.bodyMedium, color = BpDim)
                }
            }
        }
        Spacer(Modifier.height(20.dp))
    }
}

@Composable
private fun RefineBar(
    value: String,
    onValueChange: (String) -> Unit,
    refining: Boolean,
    error: String?,
    onSubmit: () -> Unit,
) {
    Column(Modifier.fillMaxWidth().background(BpSurface).padding(12.dp)) {
        if (error != null) {
            Text(error, style = MaterialTheme.typography.labelSmall, color = BpAmber)
            Spacer(Modifier.height(6.dp))
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Refine — e.g. make it serverless", color = BpDim) },
                textStyle = MaterialTheme.typography.bodyMedium,
                singleLine = true,
                enabled = !refining,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onSubmit() }),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = BpCyan, unfocusedBorderColor = BpLine,
                    focusedTextColor = BpInk, unfocusedTextColor = BpInk, cursorColor = BpCyan,
                    focusedContainerColor = BpBg, unfocusedContainerColor = BpBg,
                ),
            )
            Spacer(Modifier.width(10.dp))
            if (refining) {
                CircularProgressIndicator(color = BpCyan, strokeWidth = 2.dp, modifier = Modifier.width(24.dp).height(24.dp))
            } else {
                Text("SEND", style = MaterialTheme.typography.labelLarge, color = BpCyan,
                    modifier = Modifier.clickable(onClick = onSubmit).padding(8.dp))
            }
        }
    }
}
