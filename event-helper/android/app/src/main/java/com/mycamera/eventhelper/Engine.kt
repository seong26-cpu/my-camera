package com.mycamera.eventhelper

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** 자동 보조 엔진(assets/engine) 설정 만들기 + 알림창 문구 판정 (runner.js 와 같은 규칙) */
object Engine {
    private var runner: String? = null
    private var defaults: JSONObject? = null

    fun runner(ctx: Context): String =
        runner ?: ctx.assets.open("engine/runner.js").bufferedReader().use { it.readText() }.also { runner = it }

    fun defaults(ctx: Context): JSONObject =
        defaults ?: JSONObject(ctx.assets.open("engine/defaults.json").bufferedReader().use { it.readText() }).also { defaults = it }

    /** 레시피 값이 있으면 그것을, 없으면 유형별 기본값 */
    private fun words(recipe: JSONObject, key: String, def: JSONArray?): JSONArray {
        val own = recipe.optJSONArray(key)
        if (own != null && own.length() > 0) return own
        val s = recipe.optString(key, "")
        if (s.isNotBlank()) return JSONArray(s.split(',').map { it.trim() }.filter { it.isNotEmpty() })
        return def ?: JSONArray()
    }

    fun patterns(ctx: Context, recipe: JSONObject): JSONObject {
        val base = JSONObject(defaults(ctx).getJSONObject("patterns").toString())
        val extra = recipe.optJSONObject("patterns") ?: return base
        // 사이트별 문구는 기본 문구 '앞에' 추가
        for (k in extra.keys()) {
            val add = extra.optJSONArray(k) ?: continue
            val merged = JSONArray()
            for (i in 0 until add.length()) merged.put(add.get(i))
            val old = base.optJSONArray(k) ?: JSONArray()
            for (i in 0 until old.length()) merged.put(old.get(i))
            base.put(k, merged)
        }
        return base
    }

    fun config(ctx: Context, recipe: JSONObject): JSONObject {
        val d = defaults(ctx)
        val type = recipe.optString("type", "attend")
        return JSONObject()
            .put("id", recipe.optString("id"))
            .put("type", type)
            .put("answer", recipe.optString("quizAnswer", ""))
            .put("keywords", words(recipe, "keywords", d.getJSONObject("keywords").optJSONArray(type)))
            .put("navKeywords", words(recipe, "navKeywords", d.getJSONObject("navKeywords").optJSONArray(type)))
            .put("patterns", patterns(ctx, recipe))
            .put("targetSelector", recipe.optString("targetSelector", ""))
            .put("targetText", recipe.optString("targetText", ""))
            .put("navText", recipe.optString("navText", ""))
            .also { cfg ->
                // 프로필은 '폼 입력' 유형에만 전달 (다른 사이트 페이지에는 넣지 않음)
                if (type == "form") {
                    val pf = Profile.load(ctx)
                    if (pf.length() > 0) cfg.put("profile", pf)
                }
            }
    }

    fun pickerScript(ctx: Context, mode: String): String =
        "window.__EH_PICK_MODE=" + JSONObject.quote(mode) + ";\n" +
            ctx.assets.open("engine/picker.js").bufferedReader().use { it.readText() }

    /** 주입할 자바스크립트 (설정 + 엔진) */
    fun script(ctx: Context, recipe: JSONObject): String =
        "window.__EH_CFG=" + config(ctx, recipe).toString() + ";\n" + runner(ctx)

    /** 판정 순서: 이미참여 → 마감 → 로그인 → 캡차 → 오답 → 성공 */
    fun classify(p: JSONObject, text: String): Pair<String, String>? {
        val order = listOf("already" to "ALREADY_DONE", "closed" to "CLOSED", "login" to "LOGIN_REQUIRED",
            "captcha" to "CAPTCHA", "wrong" to "FAILED", "success" to "SUCCESS")
        for ((key, code) in order) {
            val arr = p.optJSONArray(key) ?: continue
            for (i in 0 until arr.length()) {
                val w = arr.optString(i)
                if (w.isNotEmpty() && text.contains(w)) return code to w
            }
        }
        return null
    }
}
