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
import org.json.JSONObject

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
