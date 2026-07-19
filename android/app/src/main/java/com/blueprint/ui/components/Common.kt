package com.blueprint.ui.components

import android.annotation.SuppressLint
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
 * Renders a Mermaid `flowchart TD` in a WebView using mermaid from a CDN. The WebView
 * auto-sizes to the diagram's real height (no clipping), fits the width, and disables text
 * selection. If mermaid can't load (e.g. offline), it falls back to the diagram source so the
 * box is never blank or broken.
 */
@SuppressLint("SetJavaScriptEnabled")
@Composable
fun MermaidView(mermaid: String, modifier: Modifier = Modifier) {
    // Reset per-diagram so swiping between variants re-measures instead of reusing a stale height.
    var heightDp by remember(mermaid) { mutableStateOf(200.dp) }
    var failed by remember(mermaid) { mutableStateOf(false) }

    if (failed) {
        MermaidSourceFallback(mermaid, modifier)
        return
    }

    val escaped = mermaid
        .replace("\\", "\\\\")
        .replace("`", "\\`")
        .replace("$", "\\$")
    val html = """
        <!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          html,body{margin:0;padding:8px;background:#12253F;
            -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
          #d{display:flex;justify-content:center;}
          .mermaid{color:#DCE9F7;font-family:monospace;}
          svg{max-width:100%;height:auto;}
        </style></head>
        <body>
          <div id="d"><pre class="mermaid"></pre></div>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"></script>
          <script>
            const code = `$escaped`;
            var done = false;
            function fail(){ if(!done){ done = true; try{ Android.onError(); }catch(e){} } }
            setTimeout(fail, 6000); // CDN unreachable backstop
            (async function(){
              try {
                document.querySelector('.mermaid').textContent = code;
                mermaid.initialize({startOnLoad:false, theme:'dark', securityLevel:'strict',
                  flowchart:{useMaxWidth:true},
                  themeVariables:{primaryColor:'#12253F', primaryBorderColor:'#2B4A73',
                    primaryTextColor:'#DCE9F7', lineColor:'#5FD4F5', fontFamily:'monospace'}});
                await mermaid.run({querySelector:'.mermaid'});
                if (!document.querySelector('.mermaid svg')) return fail();
                done = true;
                function report(){ try { Android.setHeight(Math.ceil(document.documentElement.scrollHeight) + 8); } catch(e){} }
                report();                    // initial
                requestAnimationFrame(report); // after paint
                setTimeout(report, 400);       // after fonts/layout settle
              } catch(e){ fail(); }
            })();
          </script>
        </body></html>
    """.trimIndent()

    AndroidView(
        modifier = modifier.height(heightDp),
        factory = { ctx ->
            WebView(ctx).apply {
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                setBackgroundColor(0xFF12253F.toInt())
                isLongClickable = false
                setOnLongClickListener { true }
                addJavascriptInterface(object {
                    // scrollHeight is CSS px; with initial-scale=1 that maps 1:1 to dp.
                    @JavascriptInterface fun setHeight(px: Int) = post {
                        heightDp = px.coerceIn(120, 900).dp
                    }
                    @JavascriptInterface fun onError() = post { failed = true }
                }, "Android")
            }
        },
        update = { it.loadDataWithBaseURL("https://blueprint.local/", html, "text/html", "utf-8", null) },
    )
}

/** Offline / render-failure fallback: show the flowchart source instead of a blank box. */
@Composable
private fun MermaidSourceFallback(mermaid: String, modifier: Modifier = Modifier) {
    Column(
        modifier
            .background(BpSurface)
            .heightIn(min = 120.dp)
            .horizontalScroll(rememberScrollState())
            .padding(12.dp)
    ) {
        SectionLabel("diagram source (offline)")
        Spacer(Modifier.height(6.dp))
        Text(mermaid, style = MaterialTheme.typography.bodyMedium, color = BpDim)
    }
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
