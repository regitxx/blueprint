package com.blueprint.net

import com.blueprint.model.Source
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.OkHttpClient
import okhttp3.Request
import java.net.URLEncoder
import java.util.concurrent.TimeUnit

/**
 * Live source rails: arXiv (Atom XML) and GitHub search (JSON). Returns sources with a blank
 * id — the pipeline assigns stable s1, s2… ids after dedup. Mirrors services/sources.ts.
 */
class Sources {
    private val http = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .build()

    private fun enc(q: String) = URLEncoder.encode(q, "UTF-8")

    suspend fun searchArxiv(query: String, limit: Int): List<Source> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "https://export.arxiv.org/api/query?search_query=all:${enc(query)}" +
                "&start=0&max_results=$limit&sortBy=relevance"
            val req = Request.Builder().url(url).header("User-Agent", "Blueprint/0.1").build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                parseArxiv(resp.body?.string().orEmpty(), limit)
            }
        }.getOrDefault(emptyList())
    }

    suspend fun searchGithub(query: String, limit: Int): List<Source> = withContext(Dispatchers.IO) {
        runCatching {
            val url = "https://api.github.com/search/repositories?q=${enc(query)}" +
                "&sort=stars&order=desc&per_page=$limit"
            val req = Request.Builder().url(url)
                .header("User-Agent", "Blueprint/0.1")
                .header("Accept", "application/vnd.github+json")
                .build()
            http.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) return@withContext emptyList()
                parseGithub(resp.body?.string().orEmpty(), limit)
            }
        }.getOrDefault(emptyList())
    }

    // --- parsing -----------------------------------------------------------

    private val entryRe = Regex("<entry>([\\s\\S]*?)</entry>")
    private val tagRe = { tag: String -> Regex("<$tag[^>]*>([\\s\\S]*?)</$tag>") }

    private fun parseArxiv(xml: String, limit: Int): List<Source> {
        return entryRe.findAll(xml).take(limit).map { m ->
            val block = m.groupValues[1]
            val title = tagRe("title").find(block)?.groupValues?.get(1).clean()
            val summary = tagRe("summary").find(block)?.groupValues?.get(1).clean()
            val id = tagRe("id").find(block)?.groupValues?.get(1).clean()
            val authors = tagRe("name").findAll(block).map { it.groupValues[1].clean() }.take(2).toList()
            val year = Regex("<published>(\\d{4})").find(block)?.groupValues?.get(1)
            Source(
                id = "",
                kind = "paper",
                title = title.ifBlank { "Untitled paper" },
                url = id,
                origin = "arXiv",
                snippet = summary.take(320),
                meta = buildList { addAll(authors); year?.let { add(it) } }.joinToString(", ").ifBlank { null },
            )
        }.filter { it.url.isNotBlank() }.toList()
    }

    private fun parseGithub(body: String, limit: Int): List<Source> {
        val root = Json.parseToJsonElement(body).jsonObject
        val items = root["items"] as? JsonArray ?: return emptyList()
        return items.take(limit).mapNotNull { el ->
            val o = el.jsonObject
            val full = o["full_name"]?.jsonPrimitive?.content ?: return@mapNotNull null
            val url = o["html_url"]?.jsonPrimitive?.content ?: return@mapNotNull null
            val desc = o["description"]?.jsonPrimitive?.contentOrNull().orEmpty()
            val stars = o["stargazers_count"]?.jsonPrimitive?.int ?: 0
            val lang = o["language"]?.jsonPrimitive?.contentOrNull().orEmpty()
            Source(
                id = "",
                kind = "repo",
                title = full,
                url = url,
                origin = "GitHub",
                snippet = desc.take(320),
                meta = buildString {
                    append("★ ")
                    append(if (stars >= 1000) "%.1fk".format(stars / 1000.0) else stars.toString())
                    if (lang.isNotBlank()) append(" · $lang")
                },
            )
        }
    }

    private fun String?.clean(): String =
        this?.replace(Regex("\\s+"), " ")?.trim().orEmpty()

    private fun kotlinx.serialization.json.JsonPrimitive.contentOrNull(): String? =
        if (this.toString() == "null") null else this.content
}
