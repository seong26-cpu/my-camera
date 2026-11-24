package com.mycamera.eventhelper

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.ViewGroup.LayoutParams.MATCH_PARENT
import android.view.ViewGroup.LayoutParams.WRAP_CONTENT
import android.webkit.CookieManager
import android.webkit.JsResult
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import android.webkit.JavascriptInterface
import android.widget.Toast
import org.json.JSONObject

/**
 * 응모 화면: 이벤트 사이트를 앱 안 브라우저로 엶 (로그인 쿠키 유지).
 * - 바로 열기 + 정답 복사 + 결과 기록
 * - 자동 보조(engine/runner.js): 약관 확인 체크 + 약관 제한 아님 일 때만. 팝업 닫기·입력·버튼 강조까지
 * 원칙: 최종 제출·캡차·약관 동의는 사용자가 직접 누름.
 */
class SiteActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var status: TextView
    private var recipe: JSONObject = JSONObject()
    private var lastAlert = ""
    private var lastError = ""
    private var lastErrorCode = ""
    private var assist = false
    private var patterns = JSONObject()
    private var retried = false
    private val autoLogged = mutableSetOf<String>()
    private val handler = Handler(Looper.getMainLooper())
    private val timeoutMs = 30_000L
    private val timeoutCheck = Runnable {
        lastErrorCode = "TIMEOUT"
        lastError = "페이지가 ${timeoutMs / 1000}초 넘게 열리지 않음"
        showStatus("⚠ $lastError — 새로고침하거나 [실패]로 기록하세요")
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val id = intent.getStringExtra("id") ?: ""
        recipe = Store.recipe(this, id) ?: run {
            Toast.makeText(this, "이벤트를 찾을 수 없어요", Toast.LENGTH_SHORT).show(); finish(); return
        }

        val restricted = recipe.optString("tosStatus") == "restricted"
        assist = recipe.optBoolean("tosChecked", false) && !restricted
        patterns = Engine.patterns(this, recipe)

        val dp = resources.displayMetrics.density
        val root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val title = TextView(this).apply {
            text = recipe.optString("name")
            textSize = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#2E7D32"))
            setPadding((12 * dp).toInt(), (10 * dp).toInt(), (12 * dp).toInt(), (10 * dp).toInt())
        }
        status = TextView(this).apply {
            textSize = 13f
            setBackgroundColor(Color.parseColor("#FFF8E1"))
            setPadding((12 * dp).toInt(), (6 * dp).toInt(), (12 * dp).toInt(), (6 * dp).toInt())
            visibility = View.GONE
        }
        fun row() = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        val row1 = row(); val row2 = row()
        fun btn(parent: LinearLayout, label: String, onClick: () -> Unit) {
            parent.addView(Button(this).apply {
                text = label; textSize = 13f; isAllCaps = false
                setOnClickListener { onClick() }
            }, LinearLayout.LayoutParams(0, WRAP_CONTENT, 1f))
        }
        btn(row1, "✅ 성공") { record("SUCCESS") }
        btn(row1, "🔁 이미 참여") { record("ALREADY_DONE") }
        btn(row1, "⛔ 마감") { record("CLOSED") }
        btn(row2, "⏭ 건너뜀") { record("USER_SKIPPED") }
        btn(row2, "⚠ 실패") { record(lastErrorCode.ifEmpty { "FAILED" }) }
        btn(row2, "↻ 새로고침") { web.reload() }
        if (assist) btn(row2, "🎯 버튼 지정") { choosePick() }

        web = WebView(this)
        root.addView(title, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(status, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(web, LinearLayout.LayoutParams(MATCH_PARENT, 0, 1f))
        root.addView(row1, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        root.addView(row2, LinearLayout.LayoutParams(MATCH_PARENT, WRAP_CONTENT))
        setContentView(root)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.setSupportMultipleWindows(false) // 새 창 링크도 같은 화면에서 열기
        s.javaScriptCanOpenWindowsAutomatically = false
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url.toString()
                val scheme = request.url.scheme ?: ""
                if (scheme == "http" || scheme == "https") return false
                openNonWeb(url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                handler.removeCallbacks(timeoutCheck)
                handler.postDelayed(timeoutCheck, timeoutMs)
            }

            override fun onPageFinished(view: WebView, url: String) {
                handler.removeCallbacks(timeoutCheck)
                if (lastErrorCode == "TIMEOUT" || lastErrorCode == "NETWORK_ERROR") { lastErrorCode = ""; lastError = "" }
                if (assist && (url.startsWith("http://") || url.startsWith("https://"))) {
                    view.evaluateJavascript(Engine.script(this@SiteActivity, recipe), null)
                }
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                lastErrorCode = "NETWORK_ERROR"
                lastError = "네트워크 오류: ${error.description}"
                if (!retried) {
                    retried = true
                    showStatus("⚠ $lastError — 3초 뒤 한 번 다시 시도합니다")
                    handler.postDelayed({ if (!isFinishing) web.reload() }, 3000)
                } else showStatus("⚠ $lastError — 와이파이/데이터를 확인하고 [↻ 새로고침]")
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onJsAlert(view: WebView, url: String, message: String, result: JsResult): Boolean {
                lastAlert = message
                showStatus("💬 사이트 메시지: $message")
                judge(message, "알림창")
                return false // 기본 알림창 그대로 보여줌
            }

            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                lastAlert = message
                showStatus("💬 사이트 확인창: $message")
                judge(message, "확인창")
                return false
            }
        }

        // 퀴즈 정답이 있으면 클립보드에 복사 → 사이트에서 길게 눌러 붙여넣기
        val answer = recipe.optString("quizAnswer", "").trim()
        val notes = mutableListOf<String>()
        if (answer.isNotEmpty()) {
            val cm = getSystemService(ClipboardManager::class.java)
            cm.setPrimaryClip(ClipData.newPlainText("정답", answer))
            notes.add("📋 오늘 정답 '$answer' 복사됨 (붙여넣기 하세요)")
        }
        when {
            restricted -> notes.add("🔒 이 사이트는 이벤트 유의사항에 '비정상적 방법·프로그램 참여 금지' 문구가 있어 바로가기만 합니다")
            !assist -> notes.add("ℹ 약관 확인 전: 바로가기만 (자동 보조 꺼짐)")
            else -> notes.add("🤖 자동 보조 켜짐: 팝업 정리·입력·버튼 강조 (누르는 건 직접)")
        }
        if (assist) web.addJavascriptInterface(EngineBridge(), "EHBridge")
        if (notes.isNotEmpty()) showStatus(notes.joinToString("\n"))

        val url = recipe.optString("url")
        if (url.startsWith("http://") || url.startsWith("https://")) web.loadUrl(url) else openNonWeb(url)
    }

    /** intent://, 앱 전용 주소(예: 증권사 앱), package:앱이름 → 해당 앱 열기 */
    private fun openNonWeb(url: String) {
        if (url.startsWith("package:")) {
            val pkg = url.removePrefix("package:")
            val launch = packageManager.getLaunchIntentForPackage(pkg)
            if (launch != null) { startActivity(launch); showStatus("📱 앱을 열었어요. 참여 후 돌아와서 결과를 눌러 주세요") }
            else try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$pkg")))
            } catch (_: Exception) { showStatus("⚠ 앱이 설치돼 있지 않아요: $pkg") }
            return
        }
        try {
            val i = if (url.startsWith("intent:")) Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            else Intent(Intent.ACTION_VIEW, Uri.parse(url))
            i.addCategory(Intent.CATEGORY_BROWSABLE)
            i.component = null
            i.selector = null
            startActivity(i)
        } catch (e: Exception) {
            val fallback = try { Intent.parseUri(url, Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url") } catch (_: Exception) { null }
            if (!fallback.isNullOrEmpty() && ::web.isInitialized) web.loadUrl(fallback)
            else showStatus("⚠ 이 주소를 열 앱이 폰에 없어요: $url")
        }
    }

    /** 사이트 문구로 결과 판정 → 성공/이미참여/마감/오답은 자동 기록, 로그인·캡차는 안내 */
    private fun judge(text: String, from: String) {
        val (code, word) = Engine.classify(patterns, text) ?: return
        when (code) {
            "LOGIN_REQUIRED", "CAPTCHA" -> {
                lastErrorCode = code
                showStatus(if (code == "CAPTCHA") "🧩 캡차가 있어요. 직접 풀어 주세요" else "🔑 로그인이 필요해요. 직접 로그인해 주세요 (한 번 하면 유지)")
            }
            else -> autoRecord(code, "[자동·$from] \"$word\" / $text")
        }
    }

    private fun autoRecord(code: String, msg: String) {
        if (!autoLogged.add(code)) return
        Store.addLog(this, recipe.optString("id"), recipe.optString("name"), code, msg.take(300))
        val label = mapOf("SUCCESS" to "성공", "ALREADY_DONE" to "이미 참여", "CLOSED" to "마감", "FAILED" to "실패(오답 등)")[code] ?: code
        showStatus("📝 자동 판정: $label → 기록했어요. 다르면 아래 버튼으로 고쳐 주세요")
    }

    /** 버튼 톡 지정: 다음 톡 한 번을 가로채 그 버튼을 기억 (누른 동작은 사이트로 안 감) */
    private fun choosePick() {
        AlertDialog.Builder(this)
            .setTitle("무엇을 지정할까요?")
            .setItems(arrayOf("참여 버튼 (출석·응모·쿠폰 받기)", "들어갈 메뉴 (이벤트 모음 → 출석 메뉴)", "지정 지우기")) { _, which ->
                when (which) {
                    0 -> startPick("target")
                    1 -> startPick("nav")
                    else -> {
                        Store.updateRecipe(this, recipe.optString("id")) { r ->
                            r.remove("targetSelector"); r.remove("targetText"); r.remove("navText")
                        }
                        recipe.remove("targetSelector"); recipe.remove("targetText"); recipe.remove("navText")
                        showStatus("🧹 지정을 지웠어요. 기본 글자로 찾아요")
                    }
                }
            }
            .setNegativeButton("취소", null)
            .show()
    }

    private fun startPick(mode: String) {
        showStatus(if (mode == "nav") "🎯 들어갈 메뉴를 톡 하세요 (이번 톡은 사이트에 전달되지 않아요)" else "🎯 참여 버튼을 톡 하세요 (이번 톡은 사이트에 전달되지 않아요)")
        web.evaluateJavascript(Engine.pickerScript(this, mode), null)
    }

    private fun savePick(mode: String, selector: String, text: String) {
        if (text.isEmpty() && selector.isEmpty()) { showStatus("⚠ 지정할 수 없는 곳이에요. 버튼 글자 위를 톡 해 주세요"); return }
        Store.updateRecipe(this, recipe.optString("id")) { r ->
            if (mode == "nav") r.put("navText", text)
            else { r.put("targetSelector", selector); r.put("targetText", text) }
        }
        if (mode == "nav") recipe.put("navText", text) else { recipe.put("targetSelector", selector); recipe.put("targetText", text) }
        showStatus("✅ 지정했어요: \"${text.ifEmpty { "(글자 없음)" }}\" — 다음부터 이 " + (if (mode == "nav") "메뉴로 이동" else "버튼을 강조") + "해요")
    }

    /** runner.js → 안드로이드 보고 통로. 기록·안내만 가능 (다른 데이터 접근 없음) */
    inner class EngineBridge {
        @JavascriptInterface
        fun report(json: String) {
            val r = try { JSONObject(json) } catch (e: Exception) { return }
            val code = r.optString("code"); val msg = r.optString("msg")
            runOnUiThread {
                when (r.optString("type")) {
                    "result" -> if (code in setOf("SUCCESS", "ALREADY_DONE", "CLOSED", "FAILED")) autoRecord(code, "[자동·화면] $msg")
                        else if (code == "LOGIN_REQUIRED" || code == "CAPTCHA") { lastErrorCode = code; showStatus("⚠ $msg") }
                    "status" -> {
                        if (code in setOf("LOGIN_REQUIRED", "CAPTCHA", "POPUP_BLOCKED", "SELECTOR_NOT_FOUND")) lastErrorCode = code
                        showStatus((if (code == "READY") "👆 " else "⚠ ") + msg)
                    }
                    "info" -> if (code != "ENGINE_START") showStatus("🤖 $msg")
                    "picked" -> savePick(r.optString("mode"), r.optString("selector").take(300), r.optString("text").take(30))
                }
            }
        }
    }

    private fun showStatus(text: String) {
        runOnUiThread { status.text = text; status.visibility = View.VISIBLE }
    }

    private fun record(code: String) {
        val msg = listOf(lastAlert, lastError).filter { it.isNotEmpty() }.joinToString(" / ")
        Store.addLog(this, recipe.optString("id"), recipe.optString("name"), code, msg)
        Toast.makeText(this, "기록했어요", Toast.LENGTH_SHORT).show()
        finish()
    }

    override fun onPause() {
        super.onPause()
        CookieManager.getInstance().flush() // 로그인 유지
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        handler.removeCallbacks(timeoutCheck)
        if (::web.isInitialized) web.destroy()
        super.onDestroy()
    }
}
