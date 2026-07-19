package com.blueprint.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * Kotlin data contracts that mirror the web app's `types.ts` EXACTLY — identical field
 * names and optionality — so JSON from Gemini / the backend deserializes directly.
 * These are the shared contracts every screen and agent call uses.
 */

enum class AgentName(val tag: String) {
    @SerialName("scout") SCOUT("SCT"),
    @SerialName("analyst") ANALYST("ANL"),
    @SerialName("architect") ARCHITECT("ARC"),
    @SerialName("reader") READER("RDR"),
    @SerialName("cartographer") CARTOGRAPHER("MAP"),
    @SerialName("interpreter") INTERPRETER("INT"),
    @SerialName("system") SYSTEM("SYS");
}

enum class LogStatus { RUN, OK, ERR }

data class LogEntry(
    val id: Int,
    val agent: AgentName,
    val text: String,
    val status: LogStatus,
)

@Serializable
data class Interpretation(
    val id: String = "",
    val name: String,
    val oneLiner: String,
    val keyDifference: String,
    val exampleUser: String,
    val impliedConstraints: List<String> = emptyList(),
)

@Serializable
data class Source(
    val id: String,
    val kind: String,            // "paper" | "repo"
    val title: String,
    val url: String,
    val origin: String,          // "arXiv" | "GitHub" | "Paper" | …
    val snippet: String,
    val meta: String? = null,
)

@Serializable
data class Insight(
    val sourceId: String,
    val architecture: String,
    val algorithmOrMath: String,
    val limitations: String,
    val metrics: String,
    val relevance: String,
)

@Serializable
data class VariantComponent(
    val name: String,
    val role: String,
    val sourceIds: List<String> = emptyList(),
)

@Serializable
data class Variant(
    val id: String,
    val name: String,
    val profile: String,         // "Fast MVP" | "Scalable" | "Research-grade"
    val tagline: String,
    val summary: String,
    val mermaid: String,
    val components: List<VariantComponent> = emptyList(),
    val risks: String,
    val whenToChoose: String,
)

@Serializable
data class ComparisonRow(
    val criterion: String,
    val values: List<String> = emptyList(),
)

@Serializable
data class RunResult(
    val topic: String,
    val sources: List<Source> = emptyList(),
    val insights: List<Insight> = emptyList(),
    val variants: List<Variant> = emptyList(),
    val comparison: List<ComparisonRow> = emptyList(),
    val constraints: List<String>? = null,
    val docName: String? = null,
    val repoUrl: String? = null,
    val chosenInterpretation: String? = null,
)
