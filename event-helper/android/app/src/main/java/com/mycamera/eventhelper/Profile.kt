package com.mycamera.eventhelper

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * 내 프로필(이름·휴대폰·이메일·생년월일) — 폰의 안드로이드 키 저장소(AndroidKeyStore) 키로 AES-GCM 암호화해 저장.
 * 키는 폰 밖으로 꺼낼 수 없음. 앱을 지우면 함께 사라짐.
 */
object Profile {
    private const val ALIAS = "eventhelper_profile_key"
    private const val FILE = "profile.enc"
    val FIELDS = listOf("name", "phone", "email", "birth")

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return gen.generateKey()
    }

    fun load(ctx: Context): JSONObject {
        val f = File(ctx.filesDir, FILE)
        if (!f.exists()) return JSONObject()
        return try {
            val raw = Base64.decode(f.readText(), Base64.NO_WRAP)
            val iv = raw.copyOfRange(0, 12)
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            JSONObject(String(c.doFinal(raw.copyOfRange(12, raw.size)), Charsets.UTF_8))
        } catch (e: Exception) {
            JSONObject()
        }
    }

    fun save(ctx: Context, input: JSONObject) {
        val clean = JSONObject()
        for (k in FIELDS) {
            val v = input.optString(k, "").trim().take(60)
            if (v.isNotEmpty()) clean.put(k, if (k == "phone" || k == "birth") v.filter { it.isDigit() } else v)
        }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val out = c.iv + c.doFinal(clean.toString().toByteArray(Charsets.UTF_8))
        val tmp = File(ctx.filesDir, "$FILE.tmp")
        tmp.writeText(Base64.encodeToString(out, Base64.NO_WRAP))
        tmp.renameTo(File(ctx.filesDir, FILE))
    }

    fun clear(ctx: Context) { File(ctx.filesDir, FILE).delete() }
}
