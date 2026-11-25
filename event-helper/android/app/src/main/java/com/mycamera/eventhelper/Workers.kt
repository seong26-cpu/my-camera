package com.mycamera.eventhelper

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters

/** 매일 아침: 오늘 응모할 이벤트 알림 → 다음 날 다시 예약 */
class MorningWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val list = Store.pendingToday(ctx)
        if (list.isNotEmpty()) {
            val names = list.sortedBy { it.optString("openTime", "99:99") }
                .joinToString(", ") { r ->
                    val ot = r.optString("openTime", "")
                    if (ot.isEmpty()) r.optString("name") else "${r.optString("name")}($ot)"
                }
            Notifier.notify(ctx, 1, "오늘 응모할 이벤트 ${list.size}건 — 누르면 ▶ 연속 응모 시작", names, action = "queue")
        }
        Scheduler.scheduleMorning(ctx, fromWorker = true)
        Scheduler.scheduleOpenTimes(ctx)
        return Result.success()
    }
}

/** 선착순 오픈 몇 분 전 알림 */
class OpenTimeWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val id = inputData.getString("id") ?: return Result.success()
        val r = Store.recipe(ctx, id) ?: return Result.success()
        if (Store.doneToday(ctx, id)) return Result.success()
        Notifier.notify(
            ctx, 1000 + (id.hashCode() and 0xFFFF),
            "곧 오픈: ${r.optString("name")}",
            "${r.optString("openTime")} 오픈 예정 — 앱에서 [응모하기]를 눌러 미리 열어 두세요."
        )
        return Result.success()
    }
}
