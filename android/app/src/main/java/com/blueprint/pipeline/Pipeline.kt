package com.blueprint.pipeline

import com.blueprint.data.Prompts
import com.blueprint.model.AgentName
import com.blueprint.model.ComparisonRow
import com.blueprint.model.Insight
import com.blueprint.model.LogEntry
import com.blueprint.model.LogStatus
import com.blueprint.model.RunResult
import com.blueprint.model.Source
import com.blueprint.model.Variant
import com.blueprint.net.GeminiClient
import com.blueprint.net.Sources
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.Serializable

/** Streamed events the Run screen renders as a live agent console. */
sealed interface PipelineEvent {
    data class Log(val entry: LogEntry) : PipelineEvent
    data class Update(val id: Int, val status: LogStatus) : PipelineEvent
    data class Done(val result: RunResult) : PipelineEvent
    data class Failed(val message: String) : PipelineEvent
}

/**
 * The three-agent research sprint, ported from services/gemini.ts:
 * Scout drafts queries → live arXiv/GitHub rails gather sources → Analyst extracts insights →
 * Architect drafts cited variants + a trade-off table. Every step streams a console line.
 */
class Pipeline(
    private val gemini: GeminiClient,
    private val sources: Sources,
) {
    @Serializable
    private data class ScoutOut(
        val arxivQueries: List<String> = emptyList(),
        val githubQueries: List<String> = emptyList(),
    )

    @Serializable
    private data class AnalystOut(val insights: List<Insight> = emptyList())

    @Serializable
    private data class ArchitectOut(
        val variants: List<Variant> = emptyList(),
        val comparison: List<ComparisonRow> = emptyList(),
    )

    private val json get() = GeminiClient.lenient

    fun run(topic: String): Flow<PipelineEvent> = flow {
        var nextId = 0
        suspend fun log(agent: AgentName, text: String): Int {
            val id = nextId++
            emit(PipelineEvent.Log(LogEntry(id, agent, text, LogStatus.RUN)))
            return id
        }
        suspend fun ok(id: Int) = emit(PipelineEvent.Update(id, LogStatus.OK))
        suspend fun err(id: Int) = emit(PipelineEvent.Update(id, LogStatus.ERR))

        try {
            val sysId = log(AgentName.SYSTEM, "Run started · \"$topic\"")
            ok(sysId)

            // 1. Scout — draft search queries
            val scoutId = log(AgentName.SCOUT, "Drafting search queries")
            val scout = json.decodeFromString(
                ScoutOut.serializer(),
                gemini.generateJson(
                    Prompts.SCOUT,
                    "Idea: $topic\n\nReturn JSON {\"arxivQueries\": string[], \"githubQueries\": string[]}. " +
                        "2-4 arXiv queries, 2-3 GitHub queries.",
                ),
            )
            ok(scoutId)

            // 2. Live sources — arXiv + GitHub rails
            val srcId = log(AgentName.SCOUT, "Searching arXiv + GitHub")
            val arxivLimit = Prompts.SOURCE_LIMITS["arxiv"] ?: 4
            val ghLimit = Prompts.SOURCE_LIMITS["github"] ?: 3
            val gathered = mutableListOf<Source>()
            for (q in scout.arxivQueries.take(3)) gathered += sources.searchArxiv(q, arxivLimit)
            for (q in scout.githubQueries.take(3)) gathered += sources.searchGithub(q, ghLimit)

            val deduped = gathered
                .distinctBy { it.url }
                .take(Prompts.SOURCE_LIMITS["total"] ?: 7)
                .mapIndexed { i, s -> s.copy(id = "s${i + 1}") }

            if (deduped.isEmpty()) {
                err(srcId)
                emit(PipelineEvent.Failed("No live sources found for \"$topic\". Try a broader idea or check connectivity."))
                return@flow
            }
            emit(PipelineEvent.Log(LogEntry(nextId++, AgentName.SCOUT, "Found ${deduped.size} sources", LogStatus.OK)))
            ok(srcId)

            // 3. Analyst — extract insights per source
            val anId = log(AgentName.ANALYST, "Reading ${deduped.size} sources")
            val sourceText = deduped.joinToString("\n\n") { s ->
                "[${s.id}] (${s.origin}) ${s.title}\n${s.snippet}"
            }
            val analyst = json.decodeFromString(
                AnalystOut.serializer(),
                gemini.generateJson(
                    Prompts.ANALYST,
                    "Sources:\n$sourceText\n\nReturn JSON {\"insights\": [{\"sourceId\", \"architecture\", " +
                        "\"algorithmOrMath\", \"limitations\", \"metrics\", \"relevance\"}]} — one insight per source id above.",
                ),
            )
            ok(anId)

            // 4. Architect — draft cited variants + comparison
            val arcId = log(AgentName.ARCHITECT, "Drafting architecture variants")
            val insightText = analyst.insights.joinToString("\n\n") { i ->
                "[${i.sourceId}] arch: ${i.architecture}; algo: ${i.algorithmOrMath}; " +
                    "limits: ${i.limitations}; metrics: ${i.metrics}; relevance: ${i.relevance}"
            }
            val validIds = deduped.joinToString(", ") { it.id }
            val architect = json.decodeFromString(
                ArchitectOut.serializer(),
                gemini.generateJson(
                    Prompts.ARCHITECT,
                    "User idea: $topic\n\nSource insights (cite ONLY these sourceIds: $validIds):\n$insightText\n\n" +
                        "Return JSON {\"variants\": [{\"id\", \"name\", \"profile\", \"tagline\", \"summary\", " +
                        "\"mermaid\", \"components\": [{\"name\", \"role\", \"sourceIds\": string[]}], \"risks\", " +
                        "\"whenToChoose\"}], \"comparison\": [{\"criterion\", \"values\": string[]}]}.",
                ),
            )
            ok(arcId)

            emit(
                PipelineEvent.Done(
                    RunResult(
                        topic = topic,
                        sources = deduped,
                        insights = analyst.insights,
                        variants = architect.variants,
                        comparison = architect.comparison,
                    )
                )
            )
        } catch (e: Exception) {
            emit(PipelineEvent.Failed(e.message ?: "Pipeline failed"))
        }
    }

    /** Refine: re-draft variants from the SAME sources to satisfy a user instruction. */
    suspend fun refine(previous: RunResult, instruction: String): RunResult {
        val insightText = previous.insights.joinToString("\n\n") { i ->
            "[${i.sourceId}] arch: ${i.architecture}; algo: ${i.algorithmOrMath}; " +
                "limits: ${i.limitations}; metrics: ${i.metrics}; relevance: ${i.relevance}"
        }
        val prevVariants = previous.variants.joinToString("\n") { v ->
            "- ${v.id} (${v.profile}): ${v.name} — ${v.tagline}"
        }
        val validIds = previous.sources.joinToString(", ") { it.id }
        val out = json.decodeFromString(
            ArchitectOut.serializer(),
            gemini.generateJson(
                Prompts.ARCHITECT_REFINE,
                "User idea: ${previous.topic}\n\nPrevious variants:\n$prevVariants\n\n" +
                    "Instruction: $instruction\n\nSource insights (cite ONLY: $validIds):\n$insightText\n\n" +
                    "Return the SAME JSON shape {\"variants\": [...], \"comparison\": [...]}.",
            ),
        )
        return previous.copy(variants = out.variants, comparison = out.comparison)
    }
}
