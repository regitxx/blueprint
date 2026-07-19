package com.blueprint.net

import com.blueprint.data.Prompts
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

/**
 * Minimal Gemini REST client (generateContent) with JSON response mode — mirrors the
 * web app's structured-output calls in services/gemini.ts without pulling in a heavy SDK.
 */
class GeminiClient(
    private val apiKeyProvider: () -> String,
    private val model: String = Prompts.MODEL_DEFAULT,
) {
    private val http = OkHttpClient.Builder()
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json".toMediaType()

    class GeminiException(message: String) : Exception(message)

    /**
     * Sends [system] + [user] and returns the model's raw JSON text (already unwrapped from
     * any ```json fences). Throws [GeminiException] on transport / API / empty-response errors.
     */
    suspend fun generateJson(system: String, user: String, temperature: Double = 0.4): String =
        withContext(Dispatchers.IO) {
            val key = apiKeyProvider()
            if (key.isBlank()) throw GeminiException("No Gemini API key set")

            val body = buildJsonObject {
                put("systemInstruction", buildJsonObject {
                    put("parts", buildJsonArray { add(buildJsonObject { put("text", system) }) })
                })
                put("contents", buildJsonArray {
                    add(buildJsonObject {
                        put("role", "user")
                        put("parts", buildJsonArray { add(buildJsonObject { put("text", user) }) })
                    })
                })
                put("generationConfig", buildJsonObject {
                    put("responseMimeType", "application/json")
                    put("temperature", temperature)
                })
            }.toString()

            val url = "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$key"
            val request = Request.Builder()
                .url(url)
                .post(body.toRequestBody(jsonMedia))
                .build()

            http.newCall(request).execute().use { resp ->
                val raw = resp.body?.string().orEmpty()
                if (!resp.isSuccessful) {
                    throw GeminiException("Gemini HTTP ${resp.code}: ${raw.take(300)}")
                }
                val text = extractText(raw)
                    ?: throw GeminiException("Gemini returned no text")
                stripFences(text)
            }
        }

    private fun extractText(raw: String): String? = runCatching {
        val root = Json.parseToJsonElement(raw).jsonObject
        val candidates = root["candidates"] as? JsonArray ?: return null
        val first = candidates.firstOrNull()?.jsonObject ?: return null
        val parts = first["content"]?.jsonObject?.get("parts") as? JsonArray ?: return null
        parts.firstOrNull()?.jsonObject?.get("text")?.jsonPrimitive?.content
    }.getOrNull()

    private fun stripFences(s: String): String {
        val t = s.trim()
        if (!t.startsWith("```")) return t
        return t.removePrefix("```json").removePrefix("```")
            .removeSuffix("```").trim()
    }

    companion object {
        /** Lenient JSON reader for parsing agent output into model classes. */
        val lenient = Json { ignoreUnknownKeys = true; isLenient = true; coerceInputValues = true }
    }
}
