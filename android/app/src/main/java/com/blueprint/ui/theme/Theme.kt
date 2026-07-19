package com.blueprint.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.sp

// Blueprint drafting-paper palette (mirrors ANDROID_PROMPTS design system).
val BpBg = Color(0xFF0E1D33)
val BpSurface = Color(0xFF12253F)
val BpInk = Color(0xFFDCE9F7)
val BpDim = Color(0xFF8FA9C9)
val BpLine = Color(0xFF2B4A73)
val BpCyan = Color(0xFF5FD4F5)
val BpAmber = Color(0xFFF5B95F)

private val BlueprintColors = darkColorScheme(
    primary = BpCyan,
    onPrimary = BpBg,
    secondary = BpAmber,
    background = BpBg,
    onBackground = BpInk,
    surface = BpSurface,
    onSurface = BpInk,
    surfaceVariant = BpSurface,
    onSurfaceVariant = BpDim,
    outline = BpLine,
    error = Color(0xFFFF6B6B),
)

// Monospace everywhere — labels and log lines read like engineering drafting paper.
private val mono = FontFamily.Monospace
private val BlueprintType = Typography(
    displaySmall = TextStyle(fontFamily = mono, fontSize = 26.sp, letterSpacing = 0.5.sp),
    titleLarge = TextStyle(fontFamily = mono, fontSize = 20.sp, letterSpacing = 0.5.sp),
    titleMedium = TextStyle(fontFamily = mono, fontSize = 16.sp, letterSpacing = 0.4.sp),
    bodyLarge = TextStyle(fontFamily = mono, fontSize = 15.sp, lineHeight = 22.sp),
    bodyMedium = TextStyle(fontFamily = mono, fontSize = 13.sp, lineHeight = 19.sp),
    labelLarge = TextStyle(fontFamily = mono, fontSize = 13.sp, letterSpacing = 1.5.sp),
    labelSmall = TextStyle(fontFamily = mono, fontSize = 11.sp, letterSpacing = 1.2.sp),
)

@Composable
fun BlueprintTheme(content: @Composable () -> Unit) {
    // Deliberately single dark look — the drafting-paper aesthetic is the brand.
    MaterialTheme(
        colorScheme = BlueprintColors,
        typography = BlueprintType,
        content = content,
    )
}
