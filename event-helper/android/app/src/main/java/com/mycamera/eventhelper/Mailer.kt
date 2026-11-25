package com.mycamera.eventhelper

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.concurrent.TimeUnit

/**
 * Gmail 알림: 내 Apps Script 웹 앱(…/exec)에 요청 → 그 스크립트가 '나'에게 메일 발송.
 * 앱에는 Gmail 비밀번호가 없음. 설정에 URL + 앱 연결 비밀번호(토큰)만 저장.
 */
object Mailer {
    val FAIL_CODES = setOf("FAILED", "NETWORK_ERROR", "TIMEOUT", "LOGIN_REQUIRED", "CAPTCHA", "POPUP_BLOCKED", "SELECTOR_NOT_FOUND")
    private const val STATUS = "mail_status.json"

    fun configured(ctx: Context): Boolean {
        val s = Store.settings(ctx)
        return s.optString("mailUrl").startsWith("https://script.google.com/") && s.optString("mailToken").isNotBlank()
    }

    /** 보내기 예약 (인터넷 연결될 때 발송, 실패하면 최대 3번 다시 시도) */
    fun enqueue(ctx: Context, kind: String, subject: String, text: String) {
        if (!configured(ctx)) return
        val req = OneTimeWorkRequestBuilder<MailWorker>()
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .setInputData(workDataOf("kind" to kind, "subject" to subject, "text" to text.take(8000)))
            .build()
        WorkManager.getInstance(ctx).enqueue(req)
    }

    /** 결과 기록이 추가될 때 호출 → 실패면 즉시 알림 */
    fun onLog(ctx: Context, e: JSONObject) {
        val code = e.optString("code")
        if (code !in FAIL_CODES) return
        if (!Store.settings(ctx).optBoolean("mailFail", true)) return
        val text = "이벤트: ${e.optString("name")}\n결과: ${label(code)} ($code)\n시각: ${e.optString("ts").replace('T', ' ').take(16)}\n" +
            (if (e.optString("message").isNotBlank()) "내용: ${e.optString("message")}\n" else "") +
            "\n앱에서 다시 열어 직접 확인해 주세요."
        enqueue(ctx, "fail", "${e.optString("name")} · ${label(code)}", text)
    }

    fun label(code: String) = mapOf(
        "SUCCESS" to "성공", "ALREADY_DONE" to "이미 참여", "CLOSED" to "마감", "USER_SKIPPED" to "건너뜀",
        "FAILED" to "실패", "NETWORK_ERROR" to "네트워크 오류", "TIMEOUT" to "시간 초과", "LOGIN_REQUIRED" to "로그인 필요",
        "CAPTCHA" to "캡차", "POPUP_BLOCKED" to "팝업 방해", "SELECTOR_NOT_FOUND" to "버튼 못 찾음", "APP_ONLY" to "앱 전용"
    )[code] ?: code

    /** 오늘 하루 요약 글 만들기 */
    fun summaryText(ctx: Context): Pair<String, String> {
        val today = Store.today()
        val logs = Store.logs(ctx)
        val last = LinkedHashMap<String, JSONObject>() // 이벤트별 오늘 마지막 결과
        val fails = mutableListOf<JSONObject>()
        for (i in 0 until logs.length()) {
            val l = logs.optJSONObject(i) ?: continue
            if (l.optString("date") != today) continue
            last[l.optString("recipeId")] = l
            if (l.optString("code") in FAIL_CODES) fails.add(l)
        }
        val done = last.values.filter { it.optString("code") in Store.DONE_CODES }
        val pending = Store.pendingToday(ctx)
        val sb = StringBuilder()
        sb.append("📅 $today\n완료 ${done.size} · 실패 기록 ${fails.size} · 아직 안 함 ${pending.size}\n\n")
        if (done.isNotEmpty()) {
            sb.append("✅ 완료\n"); done.forEach { sb.append("· ${it.optString("name")} — ${label(it.optString("code"))}\n") }; sb.append('\n')
        }
        if (fails.isNotEmpty()) {
            sb.append("⚠ 실패 기록\n"); fails.forEach {
                sb.append("· ${it.optString("name")} — ${label(it.optString("code"))}")
                if (it.optString("message").isNotBlank()) sb.append(" (${it.optString("message").take(80)})")
                sb.append('\n')
            }; sb.append('\n')
        }
        if (pending.isNotEmpty()) {
            sb.append("⏳ 아직 안 함 (오늘 자정 전까지)\n"); pending.forEach { sb.append("· ${it.optString("name")}\n") }
        }
        val recs = Store.recipes(ctx)
        val autoOff = (0 until recs.length()).mapNotNull { recs.optJSONObject(it) }
            .filter { it.optJSONObject("autoOff")?.optString("date") == today }
        if (autoOff.isNotEmpty()) {
            sb.append("\n🧹 자동으로 끈 이벤트 (앱 이벤트 탭에서 다시 켤 수 있어요)\n")
            autoOff.forEach { sb.append("· ${it.optString("name")} — ${it.optJSONObject("autoOff")?.optString("reason")}\n") }
        }
        val subject = "$today 완료 ${done.size} / 실패 ${fails.size} / 남음 ${pending.size}"
        return subject to sb.toString()
    }

    /** 실제 전송 (백그라운드 스레드에서). 성공 시 null, 실패 시 이유 */
    fun post(ctx: Context, kind: String, subject: String, text: String): String? =
        send(ctx, kind, subject, text).also { saveStatus(ctx, kind, it) }

    private fun send(ctx: Context, kind: String, subject: String, text: String): String? {
        val s = Store.settings(ctx)
        val url = s.optString("mailUrl")
        if (!url.startsWith("https://script.google.com/")) return "URL이 https://script.google.com/… 이 아니에요"
        val body = JSONObject().put("token", s.optString("mailToken")).put("kind", kind).put("subject", subject).put("text", text).toString()
        return try {
            var c = URL(url).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.requestMethod = "POST"
            c.connectTimeout = 15000; c.readTimeout = 20000
            c.doOutput = true
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            c.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            var code = c.responseCode
            // Apps Script 웹 앱은 결과를 다른 주소로 넘겨줌(302) → 그 주소를 GET 으로 읽음
            var hops = 0
            while (code in 300..399 && hops++ < 3) {
                val loc = c.getHeaderField("Location") ?: break
                c.disconnect()
                c = URL(loc).openConnection() as HttpURLConnection
                c.instanceFollowRedirects = false
                c.connectTimeout = 15000; c.readTimeout = 20000
                code = c.responseCode
            }
            val resp = (if (code in 200..299) c.inputStream else c.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
            c.disconnect()
            if (code !in 200..299) return "서버 응답 $code"
            val j = try { JSONObject(resp) } catch (e: Exception) { return "응답 형식 오류 (배포 설정 '액세스: 모든 사용자' 확인)" }
            if (j.optBoolean("ok")) null else when (j.optString("error")) {
                "unauthorized" -> "비밀번호(토큰)가 맞지 않아요"
                "daily limit" -> "오늘 발송 한도(20통)를 넘었어요"
                else -> "오류: ${j.optString("error")}"
            }
        } catch (e: Exception) {
            "연결 실패: ${e.javaClass.simpleName}"
        }
    }

    private fun saveStatus(ctx: Context, kind: String, err: String?) {
        val now = LocalDateTime.now().format(DateTimeFormatter.ofPattern("MM-dd HH:mm"))
        File(ctx.filesDir, STATUS).writeText(JSONObject().put("at", now).put("kind", kind).put("ok", err == null).put("error", err ?: "").toString())
    }

    fun status(ctx: Context): String = File(ctx.filesDir, STATUS).let { if (it.exists()) it.readText() else "{}" }
}

class MailWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val err = Mailer.post(applicationContext, inputData.getString("kind") ?: "fail",
            inputData.getString("subject") ?: "", inputData.getString("text") ?: "")
        return when {
            err == null -> Result.success()
            err.startsWith("연결 실패") || err.startsWith("서버 응답 5") -> if (runAttemptCount < 3) Result.retry() else Result.failure()
            else -> Result.failure() // 비밀번호 오류 등은 다시 시도해도 같음
        }
    }
}

/** 매일 저녁: 하루 요약 메일 → 다음 날 다시 예약 */
class SummaryWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val s = Store.settings(ctx)
        if (s.optBoolean("mailSummary", true) && Mailer.configured(ctx)) {
            val (subject, text) = Mailer.summaryText(ctx)
            Mailer.enqueue(ctx, "summary", subject, text)
        }
        Scheduler.scheduleSummary(ctx, fromWorker = true)
        return Result.success()
    }
}
