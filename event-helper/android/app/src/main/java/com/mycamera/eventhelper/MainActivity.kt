package com.mycamera.eventhelper

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.io.File

/** 앱 화면(목록·관리·기록·설정)은 앱 안에 들어있는 HTML(assets/ui)로 그림 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = true // 앱 내장 화면(file:///android_asset)만 엶
        web.addJavascriptInterface(Bridge(), "Android")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val u = request.url.toString()
                if (u.startsWith("file:///android_asset/")) return false
                // 앱 화면 안에서 외부 링크를 누르면 일반 브라우저로
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (_: Exception) {}
                return true
            }
        }
        web.loadUrl("file:///android_asset/ui/index.html")

        Notifier.ensureChannel(this)
        if (Build.VERSION.SDK_INT >= 33 && !Notifier.canNotify(this)) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
        }
        Scheduler.rescheduleAll(this)
    }

    /** 백업 파일 고르기 결과 → 화면(JS)으로 내용 전달 */
    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != PICK_BACKUP || resultCode != RESULT_OK) return
        val uri = data?.data ?: return
        val text = try {
            contentResolver.openInputStream(uri)?.use { s -> s.readBytes().takeIf { it.size <= 5_000_000 }?.toString(Charsets.UTF_8) }
        } catch (e: Exception) { null }
        if (text == null) { Toast.makeText(this, "파일을 읽지 못했어요 (5MB 이하 백업 파일만)", Toast.LENGTH_LONG).show(); return }
        web.evaluateJavascript("window.onBackupPicked && onBackupPicked(" + JSONObject.quote(text) + ")", null)
    }

    override fun onResume() {
        super.onResume()
        if (::web.isInitialized) web.evaluateJavascript("window.onAppResume && onAppResume()", null)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        web.evaluateJavascript("window.onAppBack ? onAppBack() : false") { handled ->
            if (handled != "true") finish()
        }
    }

    companion object { const val PICK_BACKUP = 42 }

    /** HTML 화면 ↔ 안드로이드 연결 (window.Android.xxx) */
    inner class Bridge {
        private val ctx get() = this@MainActivity

        @JavascriptInterface fun getRecipes(): String = Store.recipesText(ctx)
        @JavascriptInterface fun saveRecipes(json: String): Boolean = try {
            Store.saveRecipes(ctx, json); Scheduler.rescheduleAll(ctx); true
        } catch (e: Exception) { false }

        @JavascriptInterface fun getLogs(): String = Store.logsText(ctx)
        @JavascriptInterface fun addLog(json: String): Boolean = try {
            Store.addLogEntry(ctx, JSONObject(json)); true
        } catch (e: Exception) { false }

        @JavascriptInterface fun getSettings(): String = Store.settings(ctx).toString()
        @JavascriptInterface fun saveSettings(json: String): Boolean = try {
            Store.saveSettings(ctx, json); Scheduler.rescheduleAll(ctx); true
        } catch (e: Exception) { false }

        /** 프로필: 화면에는 저장 여부와 값(본인 확인용)만 보여줌 */
        @JavascriptInterface fun getProfile(): String = Profile.load(ctx).toString()
        @JavascriptInterface fun saveProfile(json: String): Boolean = try {
            Profile.save(ctx, JSONObject(json)); true
        } catch (e: Exception) { false }
        @JavascriptInterface fun clearProfile() = Profile.clear(ctx)

        /** Gmail 알림: 연결 시험 (결과는 window.onMailTest(결과) 로 돌려줌) */
        @JavascriptInterface fun mailTest() {
            Thread {
                val err = Mailer.post(ctx, "test", "연결 확인", "응모 도우미 메일 알림이 정상 연결됐어요.\n실패 알림과 저녁 요약이 이 주소로 옵니다.")
                val res = JSONObject().put("ok", err == null).put("error", err ?: "").toString()
                runOnUiThread { web.evaluateJavascript("window.onMailTest && onMailTest($res)", null) }
            }.start()
        }
        @JavascriptInterface fun mailStatus(): String = Mailer.status(ctx)
        @JavascriptInterface fun sendSummaryNow(): Boolean {
            if (!Mailer.configured(ctx)) return false
            val (subject, text) = Mailer.summaryText(ctx)
            Mailer.enqueue(ctx, "summary", subject, text); return true
        }

        /** 내보내기: 파일을 만들어 공유 창 열기 (Gmail·드라이브·내 파일 등에 저장) */
        @JavascriptInterface fun shareFile(name: String, mime: String, content: String): Boolean = try {
            val safe = name.replace(Regex("[^\\w.\\-가-힣]"), "_").take(80)
            val dir = File(cacheDir, "exports").apply { mkdirs(); listFiles()?.forEach { it.delete() } }
            val f = File(dir, safe)
            f.writeText(content, Charsets.UTF_8)
            val uri = FileProvider.getUriForFile(ctx, "$packageName.files", f)
            val send = Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_SUBJECT, safe).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            runOnUiThread { startActivity(Intent.createChooser(send, "저장하거나 보낼 곳 선택")) }
            true
        } catch (e: Exception) { false }

        /** 백업 파일 고르기 (결과는 window.onBackupPicked(내용)) */
        @JavascriptInterface fun pickBackup() {
            val i = Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
            runOnUiThread { @Suppress("DEPRECATION") startActivityForResult(i, PICK_BACKUP) }
        }

        @JavascriptInterface fun replaceLogs(json: String): Boolean = try { Store.replaceLogs(ctx, json); true } catch (e: Exception) { false }

        @JavascriptInterface fun today(): String = Store.today()
        @JavascriptInterface fun appVersion(): String =
            packageManager.getPackageInfo(packageName, 0).versionName ?: ""
        @JavascriptInterface fun notifyAllowed(): Boolean = Notifier.canNotify(ctx)

        @JavascriptInterface fun openSite(id: String) {
            startActivity(Intent(ctx, SiteActivity::class.java).putExtra("id", id))
        }

        @JavascriptInterface fun openExternal(url: String) {
            runOnUiThread {
                try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) {}
            }
        }

        @JavascriptInterface fun testNotify() {
            val n = Store.pendingToday(ctx).size
            Notifier.notify(ctx, 2, "알림 시험", "오늘 남은 응모 ${n}건. 이 알림이 보이면 정상입니다.")
            if (!Notifier.canNotify(ctx)) runOnUiThread {
                Toast.makeText(ctx, "알림 권한이 꺼져 있어요. 폰 설정 > 앱 > 응모 도우미 > 알림을 켜 주세요.", Toast.LENGTH_LONG).show()
            }
        }
    }
}
