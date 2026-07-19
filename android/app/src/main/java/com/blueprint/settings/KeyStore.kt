package com.blueprint.settings

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.blueprint.BuildConfig

/**
 * Resolves the Gemini API key. Precedence: a runtime key the user pasted into Settings
 * (stored encrypted on-device) wins; otherwise the build-time key from local.properties /
 * the GEMINI_API_KEY env var (BuildConfig). Empty string means "no key — run in demo mode".
 */
class KeyStore(context: Context) {

    private val prefs by lazy {
        val master = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            master,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun runtimeKey(): String = prefs.getString(KEY, "").orEmpty()

    fun setRuntimeKey(value: String) {
        prefs.edit().putString(KEY, value.trim()).apply()
    }

    fun clearRuntimeKey() {
        prefs.edit().remove(KEY).apply()
    }

    /** The key actually used for requests, honoring precedence. */
    fun effectiveKey(): String {
        val runtime = runtimeKey()
        return if (runtime.isNotBlank()) runtime else BuildConfig.GEMINI_API_KEY
    }

    fun hasKey(): Boolean = effectiveKey().isNotBlank()

    companion object {
        const val PREFS_NAME = "blueprint_secure_prefs"
        private const val KEY = "gemini_api_key"
    }
}
