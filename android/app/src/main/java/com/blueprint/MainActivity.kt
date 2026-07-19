package com.blueprint

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.net.toUri
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.blueprint.ui.HomeScreen
import com.blueprint.ui.ResultsScreen
import com.blueprint.ui.RunScreen
import com.blueprint.ui.SettingsScreen
import com.blueprint.ui.theme.BlueprintTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            BlueprintTheme {
                Scaffold(Modifier.fillMaxSize()) { insets ->
                    BlueprintApp(Modifier.padding(insets))
                }
            }
        }
    }
}

private object Routes {
    const val HOME = "home"
    const val RUN = "run"
    const val RESULTS = "results"
    const val SETTINGS = "settings"
}

@Composable
private fun BlueprintApp(modifier: Modifier = Modifier) {
    val nav = rememberNavController()
    val vm: MainViewModel = viewModel()
    val state by vm.state.collectAsStateWithLifecycle()
    val context = LocalContext.current

    fun openUrl(url: String) {
        if (url.isBlank()) return
        runCatching { context.startActivity(Intent(Intent.ACTION_VIEW, url.toUri())) }
    }
    fun openSourceById(id: String) {
        openUrl(state.result?.sources?.firstOrNull { it.id == id }?.url.orEmpty())
    }

    NavHost(nav, startDestination = Routes.HOME, modifier = modifier) {
        composable(Routes.HOME) {
            HomeScreen(
                exampleTopics = vm.exampleTopics,
                hasKey = state.hasKey,
                onDraft = { topic ->
                    vm.startRun(topic)
                    nav.navigate(Routes.RUN)
                },
                onOpenSettings = { nav.navigate(Routes.SETTINGS) },
            )
        }
        composable(Routes.RUN) {
            RunScreen(
                state = state,
                onOpenResults = {
                    nav.navigate(Routes.RESULTS) {
                        popUpTo(Routes.RUN) { inclusive = true }
                    }
                },
                onCancel = {
                    vm.reset()
                    nav.popBackStack(Routes.HOME, inclusive = false)
                },
            )
        }
        composable(Routes.RESULTS) {
            val result = state.result
            if (result == null) {
                // Guard: nothing to show — bounce home.
                nav.popBackStack(Routes.HOME, inclusive = false)
            } else {
                ResultsScreen(
                    result = result,
                    refining = state.refining,
                    error = state.error,
                    onRefine = { vm.refine(it) },
                    onOpenSource = { openSourceById(it) },
                    onNewRun = {
                        vm.reset()
                        nav.navigate(Routes.HOME) {
                            popUpTo(Routes.HOME) { inclusive = true }
                        }
                    },
                )
            }
        }
        composable(Routes.SETTINGS) {
            SettingsScreen(
                initialKey = vm.currentRuntimeKey(),
                buildKeyPresent = vm.buildKeyPresent(),
                onSave = { vm.saveKey(it) },
                onClear = { vm.clearKey() },
                onBack = { nav.popBackStack() },
            )
        }
    }
}
