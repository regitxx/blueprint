package com.blueprint

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.blueprint.data.SeedData
import com.blueprint.model.AgentName
import com.blueprint.model.LogEntry
import com.blueprint.model.LogStatus
import com.blueprint.model.RunResult
import com.blueprint.net.GeminiClient
import com.blueprint.net.Sources
import com.blueprint.pipeline.Pipeline
import com.blueprint.pipeline.PipelineEvent
import com.blueprint.settings.KeyStore
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class RunPhase { IDLE, RUNNING, DONE, ERROR }

data class UiState(
    val topic: String = "",
    val logs: List<LogEntry> = emptyList(),
    val result: RunResult? = null,
    val phase: RunPhase = RunPhase.IDLE,
    val error: String? = null,
    val refining: Boolean = false,
    val usingDemo: Boolean = false,
    val hasKey: Boolean = false,
)

class MainViewModel(app: Application) : AndroidViewModel(app) {

    private val keyStore = KeyStore(app)
    private val gemini = GeminiClient(apiKeyProvider = { keyStore.effectiveKey() })
    private val pipeline = Pipeline(gemini, Sources())

    private val _state = MutableStateFlow(UiState(hasKey = keyStore.hasKey()))
    val state: StateFlow<UiState> = _state.asStateFlow()

    val exampleTopics get() = SeedData.EXAMPLE_TOPICS

    fun refreshKeyStatus() = _state.update { it.copy(hasKey = keyStore.hasKey()) }

    fun startRun(topic: String) {
        val trimmed = topic.trim()
        if (trimmed.isEmpty() || _state.value.phase == RunPhase.RUNNING) return

        if (!keyStore.hasKey()) {
            runDemo(trimmed)
            return
        }
        _state.update {
            it.copy(topic = trimmed, logs = emptyList(), result = null, error = null,
                phase = RunPhase.RUNNING, usingDemo = false)
        }
        viewModelScope.launch {
            pipeline.run(trimmed).collect { ev ->
                when (ev) {
                    is PipelineEvent.Log -> _state.update { it.copy(logs = it.logs + ev.entry) }
                    is PipelineEvent.Update -> _state.update { st ->
                        st.copy(logs = st.logs.map { if (it.id == ev.id) it.copy(status = ev.status) else it })
                    }
                    is PipelineEvent.Done -> _state.update { it.copy(result = ev.result, phase = RunPhase.DONE) }
                    is PipelineEvent.Failed -> _state.update { it.copy(error = ev.message, phase = RunPhase.ERROR) }
                }
            }
        }
    }

    /** No-key demo: scripted console animation, then the seeded sample run. */
    private fun runDemo(topic: String) {
        _state.update {
            it.copy(topic = topic, logs = emptyList(), result = null, error = null,
                phase = RunPhase.RUNNING, usingDemo = true)
        }
        viewModelScope.launch {
            val script = listOf(
                AgentName.SYSTEM to "Demo mode · no API key set",
                AgentName.SCOUT to "Drafting search queries",
                AgentName.SCOUT to "Searching arXiv + GitHub",
                AgentName.ANALYST to "Reading sources",
                AgentName.ARCHITECT to "Drafting architecture variants",
            )
            script.forEachIndexed { i, (agent, text) ->
                val entry = LogEntry(i, agent, text, LogStatus.RUN)
                _state.update { it.copy(logs = it.logs + entry) }
                delay(650)
                _state.update { st ->
                    st.copy(logs = st.logs.map { if (it.id == i) it.copy(status = LogStatus.OK) else it })
                }
            }
            _state.update { it.copy(result = SeedData.SAMPLE, phase = RunPhase.DONE) }
        }
    }

    fun refine(instruction: String) {
        val current = _state.value.result ?: return
        if (instruction.isBlank() || _state.value.refining) return
        if (_state.value.usingDemo || !keyStore.hasKey()) {
            // Demo mode can't call the model; surface it plainly rather than faking a change.
            _state.update { it.copy(error = "Set a Gemini API key in Settings to refine live.") }
            return
        }
        _state.update { it.copy(refining = true, error = null) }
        viewModelScope.launch {
            runCatching { pipeline.refine(current, instruction) }
                .onSuccess { r -> _state.update { it.copy(result = r, refining = false) } }
                .onFailure { e -> _state.update { it.copy(refining = false, error = e.message ?: "Refine failed") } }
        }
    }

    fun reset() = _state.update {
        UiState(hasKey = keyStore.hasKey())
    }

    // --- settings ---------------------------------------------------------
    fun currentRuntimeKey() = keyStore.runtimeKey()
    fun saveKey(value: String) { keyStore.setRuntimeKey(value); refreshKeyStatus() }
    fun clearKey() { keyStore.clearRuntimeKey(); refreshKeyStatus() }
    fun buildKeyPresent() = BuildConfig.GEMINI_API_KEY.isNotBlank()
}
