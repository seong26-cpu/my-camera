package com.mycamera.eventhelper

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** 폰 안(앱 전용 폴더)에 JSON 파일로 저장. 외부로 나가지 않음. */
object Store {
    private const val RECIPES = "recipes.json"
    private const val LOGS = "logs.json"
    private const val SETTINGS = "settings.json"
    private const val MAX_LOGS = 2000

    /** 응모를 '끝낸 것'으로 보는 결과 코드 */
    val DONE_CODES = setOf("SUCCESS", "ALREADY_DONE", "CLOSED", "USER_SKIPPED")

    private val lock = Any()

    private fun read(ctx: Context, name: String, def: String): String = synchronized(lock) {
        val f = File(ctx.filesDir, name)
        if (f.exists()) f.readText() else def
    }

    private fun write(ctx: Context, name: String, text: String) = synchronized(lock) {
        val tmp = File(ctx.filesDir, "$name.tmp")
        tmp.writeText(text)
        tmp.renameTo(File(ctx.filesDir, name))
    }

    fun recipesText(ctx: Context) = read(ctx, RECIPES, "[]")
    fun recipes(ctx: Context): JSONArray = try { JSONArray(recipesText(ctx)) } catch (e: Exception) { JSONArray() }
    fun saveRecipes(ctx: Context, text: String) { JSONArray(text); write(ctx, RECIPES, text) }

    fun logsText(ctx: Context) = read(ctx, LOGS, "[]")
    fun logs(ctx: Context): JSONArray = try { JSONArray(logsText(ctx)) } catch (e: Exception) { JSONArray() }

    fun settings(ctx: Context): JSONObject = try { JSONObject(read(ctx, SETTINGS, "{}")) } catch (e: Exception) { JSONObject() }
    fun saveSettings(ctx: Context, text: String) { JSONObject(text); write(ctx, SETTINGS, text) }

    fun recipe(ctx: Context, id: String): JSONObject? {
        val arr = recipes(ctx)
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            if (r.optString("id") == id) return r
        }
        return null
    }

    fun today(): String = LocalDate.now().toString()

    fun addLog(ctx: Context, recipeId: String, name: String, code: String, message: String) {
        val entry = JSONObject()
            .put("ts", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
            .put("date", today())
            .put("recipeId", recipeId)
            .put("name", name)
            .put("code", code)
            .put("message", message)
        addLogEntry(ctx, entry)
    }

    fun addLogEntry(ctx: Context, entry: JSONObject) = synchronized(lock) {
        if (!entry.has("date")) entry.put("date", today())
        if (!entry.has("ts")) entry.put("ts", LocalDateTime.now().format(DateTimeFormatter.ISO_LOCAL_DATE_TIME))
        val old = logs(ctx)
        val out = JSONArray()
        val start = maxOf(0, old.length() - (MAX_LOGS - 1))
        for (i in start until old.length()) out.put(old.get(i))
        out.put(entry)
        write(ctx, LOGS, out.toString())
    }

    /** 오늘 응모 대상인가 (켜짐 + 기간 안) */
    fun isActiveToday(r: JSONObject): Boolean {
        if (!r.optBoolean("enabled", true)) return false
        val t = today()
        val start = r.optString("start", "")
        val end = r.optString("end", "")
        if (start.isNotEmpty() && t < start) return false
        if (end.isNotEmpty() && t > end) return false
        return true
    }

    fun doneToday(ctx: Context, id: String): Boolean {
        val arr = logs(ctx)
        val t = today()
        for (i in arr.length() - 1 downTo 0) {
            val l = arr.optJSONObject(i) ?: continue
            if (l.optString("date") != t) break
            if (l.optString("recipeId") == id && l.optString("code") in DONE_CODES) return true
        }
        return false
    }

    /** 오늘 아직 안 한 응모 목록 */
    fun pendingToday(ctx: Context): List<JSONObject> {
        val arr = recipes(ctx)
        val out = mutableListOf<JSONObject>()
        for (i in 0 until arr.length()) {
            val r = arr.optJSONObject(i) ?: continue
            if (isActiveToday(r) && !doneToday(ctx, r.optString("id"))) out.add(r)
        }
        return out
    }
}
