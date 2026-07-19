package com.blueprint.data

import com.blueprint.model.ComparisonRow
import com.blueprint.model.Insight
import com.blueprint.model.RunResult
import com.blueprint.model.Source
import com.blueprint.model.Variant
import com.blueprint.model.VariantComponent

/**
 * A single realistic cached run so every screen is fully navigable before any API key is set
 * (mirrors the web app's `examples.generated.ts` role). Live runs replace this at runtime.
 */
object SeedData {

    val EXAMPLE_TOPICS = listOf(
        "on-device semantic search for personal notes",
        "real-time collaborative whiteboard",
        "privacy-first health symptom tracker",
        "AI code-review assistant for pull requests",
    )

    val SAMPLE = RunResult(
        topic = "on-device semantic search for personal notes",
        sources = listOf(
            Source(
                id = "s1", kind = "paper", title = "Efficient On-Device Dense Retrieval with Quantized Embeddings",
                url = "https://arxiv.org/abs/2404.01234", origin = "arXiv",
                snippet = "We show 8-bit product-quantized embeddings retain 97% of full-precision retrieval quality while cutting index size 4x, enabling sub-50ms search over 100k documents on mobile CPUs.",
                meta = "Chen et al., 2024",
            ),
            Source(
                id = "s2", kind = "repo", title = "usearch — smaller & faster single-file vector search",
                url = "https://github.com/unum-cloud/usearch", origin = "GitHub",
                snippet = "A compact HNSW implementation with quantization support, bindings for many languages, and a memory-mapped index suitable for constrained devices.",
                meta = "★ 2.1k · C++/Rust",
            ),
            Source(
                id = "s3", kind = "repo", title = "sqlite-vec — vector search as a SQLite extension",
                url = "https://github.com/asg017/sqlite-vec", origin = "GitHub",
                snippet = "Stores and queries vectors inside an ordinary SQLite database, so retrieval piggybacks on the storage layer apps already ship.",
                meta = "★ 4.3k · C",
            ),
        ),
        insights = listOf(
            Insight("s1", "Quantized dense-retrieval index queried on-device.", "8-bit product quantization of embedding vectors.", "Quality drop grows past ~1M docs; not stated for images.", "97% quality retained, 4x smaller, <50ms over 100k docs.", "Directly supports fast local search under mobile constraints."),
            Insight("s2", "Memory-mapped HNSW graph for approximate nearest neighbour.", "HNSW with optional scalar quantization.", "Recall tuning needed per dataset.", "not stated", "Ready-made local index engine to embed."),
            Insight("s3", "Vectors stored/queried inside SQLite.", "Brute-force + optional ANN over rows.", "Brute-force scales poorly beyond ~50k rows.", "not stated", "Zero-infra option reusing the app's existing DB."),
        ),
        variants = listOf(
            Variant(
                id = "v1", name = "Pocket Index", profile = "Fast MVP",
                tagline = "Ship search this week with the database you already have.",
                summary = "Embed notes with a small on-device model, store vectors in sqlite-vec, and query by cosine over rows. No servers, no extra infra — the note store is the search index.",
                mermaid = "flowchart TD\n  A[\"Note editor\"] -->|\"text\"| B[\"On-device embedder\"]\n  B -->|\"vector\"| C[\"sqlite-vec table\"]\n  D[\"Query box\"] -->|\"query text\"| B\n  C -->|\"top-k rows\"| E[\"Ranked results\"]",
                components = listOf(
                    VariantComponent("On-device embedder", "Turns note + query text into vectors", listOf("s1")),
                    VariantComponent("sqlite-vec table", "Stores vectors beside note rows and ranks them", listOf("s3")),
                    VariantComponent("Ranked results view", "Shows nearest notes with highlights", listOf("s3")),
                ),
                risks = "Brute-force query in SQLite degrades past ~50k notes (s3); revisit ANN before large libraries.",
                whenToChoose = "You want the shortest path to working local search and libraries stay modest.",
            ),
            Variant(
                id = "v2", name = "Mapped Graph", profile = "Scalable",
                tagline = "Sub-50ms over 100k+ notes with a memory-mapped ANN index.",
                summary = "Quantize embeddings and serve them from a memory-mapped HNSW index so retrieval stays fast and RAM-cheap as the library grows into six figures.",
                mermaid = "flowchart TD\n  A[\"Note editor\"] -->|\"text\"| B[\"Embedder\"]\n  B -->|\"vector\"| C[\"Quantizer\"]\n  C -->|\"8-bit vec\"| D[\"usearch HNSW index\"]\n  E[\"Query box\"] -->|\"query\"| B\n  D -->|\"top-k\"| F[\"Ranked results\"]",
                components = listOf(
                    VariantComponent("Embedder", "Shared text-to-vector model", listOf("s1")),
                    VariantComponent("Quantizer", "8-bit product quantization to shrink the index 4x", listOf("s1")),
                    VariantComponent("usearch HNSW index", "Memory-mapped approximate nearest-neighbour search", listOf("s2")),
                ),
                risks = "HNSW recall needs per-dataset tuning (s2); quantization quality unverified beyond ~1M docs (s1).",
                whenToChoose = "Libraries reach tens or hundreds of thousands of notes and latency must stay flat.",
            ),
            Variant(
                id = "v3", name = "Hybrid Recall", profile = "Research-grade",
                tagline = "Challenger take — pair lexical + dense recall for hard queries.",
                summary = "Run keyword and quantized-dense retrieval in parallel and fuse the ranks, trading a little latency for markedly better recall on rare terms the embedder misses.",
                mermaid = "flowchart TD\n  A[\"Query box\"] -->|\"query\"| B[\"Embedder\"]\n  A -->|\"terms\"| C[\"Lexical index\"]\n  B -->|\"vector\"| D[\"usearch HNSW index\"]\n  C -->|\"candidates\"| E[\"Rank fusion\"]\n  D -->|\"candidates\"| E\n  E -->|\"fused top-k\"| F[\"Ranked results\"]",
                components = listOf(
                    VariantComponent("Lexical index", "Exact-term recall for names and rare tokens", listOf("s3")),
                    VariantComponent("usearch HNSW index", "Dense semantic recall", listOf("s2")),
                    VariantComponent("Rank fusion", "Reciprocal-rank fusion of both result sets", listOf("s1", "s2")),
                ),
                risks = "Sources don't quantify fusion gains for notes specifically; treat recall lift as hypothesis, not proven.",
                whenToChoose = "Recall on rare/technical queries matters more than the last few milliseconds.",
            ),
        ),
        comparison = listOf(
            ComparisonRow("Time to MVP", listOf("~2 days", "~1 week", "~2 weeks")),
            ComparisonRow("Scaling ceiling", listOf("~50k notes", "1M+ notes", "1M+ notes")),
            ComparisonRow("Query latency", listOf("Good <50k", "<50ms at 100k", "+10-20ms fusion")),
            ComparisonRow("Ops complexity", listOf("None", "Low", "Medium")),
            ComparisonRow("Defensibility", listOf("Low", "Medium", "High (recall)")),
            ComparisonRow("Rough monthly cost (cloud + LLM)", listOf("~\$0/mo", "~\$0/mo", "~\$0/mo")),
        ),
    )
}
