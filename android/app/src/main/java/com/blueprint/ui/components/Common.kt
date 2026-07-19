package com.blueprint.ui.components

import android.annotation.SuppressLint
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.blueprint.model.AgentName
import com.blueprint.model.LogStatus
import com.blueprint.ui.theme.BpAmber
import com.blueprint.ui.theme.BpCyan
import com.blueprint.ui.theme.BpDim
import com.blueprint.ui.theme.BpInk
import com.blueprint.ui.theme.BpLine
import com.blueprint.ui.theme.BpSurface

/** UPPERCASE wide-tracked section label, drafting-sheet style. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, color: Color = BpDim) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = color,
        modifier = modifier,
    )
}

private fun agentColor(agent: AgentName): Color = when (agent) {
    AgentName.ARCHITECT -> BpAmber
    AgentName.SYSTEM -> BpDim
    else -> BpCyan
}

/** Colored monospace tag badge, e.g. [SCT], [ANL], [ARC]. */
@Composable
fun AgentBadge(agent: AgentName) {
    val c = agentColor(agent)
    Box(
        Modifier
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, c.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
            .background(c.copy(alpha = 0.10f))
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(agent.tag, style = MaterialTheme.typography.labelSmall, color = c, fontWeight = FontWeight.Bold)
    }
}

/** Status glyph for a log line: spinner-ish dot while running, ✓ done, ✕ error. */
@Composable
fun StatusGlyph(status: LogStatus) {
    val (glyph, color) = when (status) {
        LogStatus.RUN -> "•" to BpDim
        LogStatus.OK -> "✓" to BpCyan
        LogStatus.ERR -> "✕" to Color(0xFFFF6B6B)
    }
    Text(glyph, style = MaterialTheme.typography.bodyMedium, color = color)
}

/** Tappable source chip like [s1] that opens its URL. */
@Composable
fun SourceChip(id: String, onClick: () -> Unit) {
    Box(
        Modifier
            .clip(RoundedCornerShape(4.dp))
            .border(1.dp, BpCyan.copy(alpha = 0.5f), RoundedCornerShape(4.dp))
            .background(BpCyan.copy(alpha = 0.08f))
            .clickable(onClick = onClick)
            .padding(horizontal = 6.dp, vertical = 2.dp)
    ) {
        Text(id, style = MaterialTheme.typography.labelSmall, color = BpCyan)
    }
}

@Composable
fun HairlineCard(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Box(
        modifier
            .clip(RoundedCornerShape(8.dp))
            .background(BpSurface)
            .border(1.dp, BpLine, RoundedCornerShape(8.dp))
            .padding(14.dp)
    ) { content() }
}

/**
 * Renders a Mermaid `flowchart TD` in a WebView using mermaid from a CDN.
 * Requires network; the diagram source is always shown as a fallback caption elsewhere.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MermaidView(mermaid: String, modifier: Modifier = Modifier) {
    val escaped = mermaid
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("$", "\\$")
    val html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html,body{margin:0;padding:8px;background:#12253F;}
          #d{display:flex;justify-content:center;}
          .mermaid{color:#DCE9F7;font-family:monospace;}
        </style></head>
        <body>
          <div id="d"><pre class="mermaid"></pre></div>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
          <script>
            const code = `$escaped`;
            document.querySelector('.mermaid').textContent = code;
            mermaid.initialize({startOnLoad:true, theme:'dark',
              themeVariables:{primaryColor:'#12253F', primaryBorderColor:'#2B4A73',
                primaryTextColor:'#DCE9F7', lineColor:'#5FD4F5', fontFamily:'monospace'}});
          </script>
        </body></html>
    """.trimIndent()

    AndroidView(
        modifier = modifier.height(260.dp),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                setBackgroundColor(0xFF12253F.toInt())
            }
        },
        update = { it.loadDataWithBaseURL("https://blueprint.local/", html, "text/html", "utf-8", null) },
    )
}

/** Small helper: consistent content padding for scrollable screens. */
val screenPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)

@Composable
fun MutedText(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyMedium, color = BpDim, modifier = modifier)
}

@Composable
fun InkText(text: String, modifier: Modifier = Modifier) {
    Text(text, style = MaterialTheme.typography.bodyLarge, color = BpInk, modifier = modifier)
}
