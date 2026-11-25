package com.mycamera.eventhelper

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import org.json.JSONObject

/**
 * 📱 공유로 앱 이벤트 화면 주소 가져오기:
 * 쇼핑몰 앱의 이벤트 화면 → [공유] → 응모 도우미 → 어느 이벤트에 붙일지 선택 → deepUrl 저장.
 * 다음부터 그 주소로 열어서, 앱이 지원하면 메인이 아닌 이벤트 화면으로 바로 감.
 */
class ShareActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val text = intent?.getStringExtra(Intent.EXTRA_TEXT) ?: ""
        val subject = intent?.getStringExtra(Intent.EXTRA_SUBJECT) ?: ""
        val link = Regex("https?://[^\\s\"'<>]+").find(text)?.value?.trimEnd('.', ',', ')', ']')
        if (link == null) { Toast.makeText(this, "공유한 내용에 링크가 없어요", Toast.LENGTH_LONG).show(); finish(); return }

        // 켜진 이벤트 먼저, 그다음 나머지
        val recs = Store.recipes(this)
        val list = (0 until recs.length()).mapNotNull { recs.optJSONObject(it) }
            .sortedBy { if (it.optBoolean("enabled", true)) 0 else 1 }
        val labels = arrayOf("＋ 새 이벤트로 추가") + list.map { (if (it.optBoolean("enabled", true)) "" else "(꺼짐) ") + it.optString("name") }.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("이 링크를 어느 이벤트에 붙일까요?")
            .setItems(labels) { _, w ->
                if (w == 0) {
                    val host = try { Uri.parse(link).host ?: "새 이벤트" } catch (e: Exception) { "새 이벤트" }
                    val name = subject.ifBlank { text.substringBefore(link).trim().take(30) }.ifBlank { host }
                    val arr = Store.recipes(this)
                    arr.put(JSONObject().put("id", "s" + System.currentTimeMillis().toString(36)).put("name", name.take(40))
                        .put("url", link).put("deepUrl", link).put("type", "attend").put("enabled", true).put("tosChecked", false))
                    Store.saveRecipes(this, arr.toString())
                    Toast.makeText(this, "새 이벤트로 추가했어요: $name (오늘 목록에 나와요)", Toast.LENGTH_LONG).show()
                } else {
                    val r = list[w - 1]
                    Store.updateRecipe(this, r.optString("id")) { it.put("deepUrl", link); it.put("enabled", true); it.remove("appOnly") }
                    Toast.makeText(this, "‘${r.optString("name")}’에 앱 화면 주소를 저장했어요. 다음부터 이 화면으로 바로 열어요", Toast.LENGTH_LONG).show()
                }
                Scheduler.rescheduleAll(this)
                finish()
            }
            .setOnCancelListener { finish() }
            .setNegativeButton("취소") { _, _ -> finish() }
            .show()
    }
}
