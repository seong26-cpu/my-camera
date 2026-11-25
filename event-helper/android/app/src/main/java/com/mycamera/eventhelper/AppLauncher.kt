package com.mycamera.eventhelper

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import org.json.JSONObject

/**
 * 앱 전용 이벤트 보완:
 *  - 사용자가 한 번 고른 쇼핑몰 앱(또는 기본 브라우저)으로 바로 열기 (앱 이름을 추측해 넣지 않음)
 *  - 열 때 '앱 안 경로 메모' + [성공][이미 참여][실패] 버튼이 있는 알림 → 돌아오지 않고 결과 기록
 * 다른 앱 안의 버튼을 대신 누르지는 않음 (안드로이드 앱 분리 · 계정 안전)
 */
object AppLauncher {
    data class App(val label: String, val pkg: String)

    /** 설치된 앱 목록 (실행 가능한 앱만, 이 앱 제외, 이름순) */
    fun installedApps(ctx: Context): List<App> {
        val pm = ctx.packageManager
        val q = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
        @Suppress("DEPRECATION")
        return pm.queryIntentActivities(q, 0)
            .map { App(it.loadLabel(pm).toString(), it.activityInfo.packageName) }
            .filter { it.pkg != ctx.packageName }
            .distinctBy { it.pkg }
            .sortedBy { it.label }
    }

    /** 레시피 설정대로 열기: 연결 앱 → 그 앱(이벤트 주소를 그 앱이 열 수 있으면 이벤트 화면으로), 아니면 기본 브라우저 */
    fun open(ctx: Context, r: JSONObject, urlOverride: String? = null): Boolean {
        // 공유로 저장한 앱 화면 주소(deepUrl)가 있으면 그걸 우선 (앱이 지원하면 이벤트 화면으로 직행)
        val url = urlOverride ?: r.optString("deepUrl").ifEmpty { r.optString("url") }
        val pkg = r.optString("appPackage").ifEmpty { if (url.startsWith("package:")) url.removePrefix("package:") else "" }
        val ok = if (pkg.isNotEmpty()) openApp(ctx, pkg, url) else openBrowser(ctx, url)
        if (ok) recordPrompt(ctx, r)
        return ok
    }

    private fun openApp(ctx: Context, pkg: String, url: String): Boolean {
        if (url.startsWith("http")) {
            try { // 쇼핑몰 앱이 이 주소를 직접 열 수 있으면 이벤트 화면으로 바로 감
                ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return true
            } catch (_: Exception) {}
        }
        val launch = ctx.packageManager.getLaunchIntentForPackage(pkg) ?: return false
        ctx.startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        return true
    }

    fun openBrowser(ctx: Context, url: String): Boolean = try {
        ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        true
    } catch (e: Exception) { false }

    fun notifId(id: String) = 3000 + (id.hashCode() and 0xFFFF)

    /** 다른 앱에 있는 동안 보는 알림: 경로 메모 + 결과 버튼 */
    fun recordPrompt(ctx: Context, r: JSONObject) {
        Notifier.ensureChannel(ctx)
        if (!Notifier.canNotify(ctx)) return
        val id = r.optString("id"); val name = r.optString("name"); val nid = notifId(id)
        fun action(code: String, label: String, req: Int): NotificationCompat.Action {
            val i = Intent(ctx, RecordReceiver::class.java).putExtra("id", id).putExtra("name", name)
                .putExtra("code", code).putExtra("nid", nid)
            val pi = PendingIntent.getBroadcast(ctx, nid * 4 + req, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
            return NotificationCompat.Action(0, label, pi)
        }
        val path = r.optString("appPath").trim()
        val text = (if (path.isNotEmpty()) "📍 $path\n" else "") + "참여한 뒤 아래 버튼으로 결과를 남기세요 (앱으로 돌아올 필요 없어요)"
        val open = PendingIntent.getActivity(ctx, nid, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val n = NotificationCompat.Builder(ctx, "daily")
            .setSmallIcon(R.drawable.ic_stat)
            .setContentTitle("응모 중: $name")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(open)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .addAction(action("SUCCESS", "✅ 성공", 1))
            .addAction(action("ALREADY_DONE", "🔁 이미 참여", 2))
            .addAction(action("FAILED", "⚠ 실패", 3))
            .build()
        try { NotificationManagerCompat.from(ctx).notify(nid, n) } catch (_: SecurityException) {}
    }
}

/** 알림의 결과 버튼 → 기록 저장 후 알림 닫기 */
class RecordReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = intent.getStringExtra("id") ?: return
        val code = intent.getStringExtra("code") ?: return
        if (code !in setOf("SUCCESS", "ALREADY_DONE", "FAILED")) return
        Store.addLog(ctx, id, intent.getStringExtra("name") ?: "", code, "[알림에서 기록]")
        NotificationManagerCompat.from(ctx).cancel(intent.getIntExtra("nid", 0))
    }
}
