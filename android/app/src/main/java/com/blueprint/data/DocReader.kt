package com.blueprint.data

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.ByteArrayInputStream
import java.util.zip.ZipInputStream

/**
 * Reads an uploaded idea document into plain text. Supports .txt / .md (UTF-8) and .docx
 * (unzips word/document.xml and strips the WordprocessingML markup) — no external deps,
 * so it works in the same self-contained way the web app's mammoth-based reader did.
 */
object DocReader {

    data class Doc(val name: String, val text: String)

    fun read(context: Context, uri: Uri): Doc? {
        val name = displayName(context, uri) ?: "document"
        val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        val text = if (name.endsWith(".docx", ignoreCase = true) || looksLikeZip(bytes)) {
            extractDocx(bytes)
        } else {
            bytes.decodeToString()
        }
        return Doc(name, text.trim())
    }

    private fun displayName(context: Context, uri: Uri): String? {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
            if (c.moveToFirst() && c.columnCount > 0) return c.getString(0)
        }
        return uri.lastPathSegment
    }

    // docx (and any zip) begins with the "PK" local-file-header signature.
    private fun looksLikeZip(bytes: ByteArray): Boolean =
        bytes.size >= 2 && bytes[0] == 'P'.code.toByte() && bytes[1] == 'K'.code.toByte()

    private fun extractDocx(bytes: ByteArray): String {
        runCatching {
            ZipInputStream(ByteArrayInputStream(bytes)).use { zis ->
                var entry = zis.nextEntry
                while (entry != null) {
                    if (entry.name == "word/document.xml") {
                        return xmlToText(zis.readBytes().decodeToString())
                    }
                    entry = zis.nextEntry
                }
            }
        }
        return ""
    }

    private fun xmlToText(xml: String): String {
        val withBreaks = xml
            .replace(Regex("<w:tab[^>]*/>"), "\t")
            .replace(Regex("<w:br[^>]*/>"), "\n")
            .replace("</w:p>", "\n")
        val stripped = withBreaks.replace(Regex("<[^>]+>"), "")
        return stripped
            .replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .replace(Regex("[ \\t]+\n"), "\n")
            .replace(Regex("\n{3,}"), "\n\n")
            .trim()
    }
}
