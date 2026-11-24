package com.mycamera.eventhelper

import android.content.Context
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.time.Duration
import java.time.LocalDateTime
import java.time.LocalTime
import java.util.concurrent.TimeUnit

/**
 * 알림 예약. WorkManager 사용 → 폰을 껐다 켜도 유지.
 * 주의: 안드로이드 절전(Doze) 때문에 몇 분 늦게 울릴 수 있음 (정확한 초 단위 아님).
 */
object Scheduler {
    const val MORNING = "morning"
    const val SUMMARY = "summary"
    private const val OPEN_PREFIX = "open_"
    const val OPEN_LEAD_MIN = 3L

    fun parseTime(s: String, def: LocalTime): LocalTime = try { LocalTime.parse(s) } catch (e: Exception) { def }

    /** 앱에서 설정을 바꿨을 때: 모두 새로 예약 */
    fun rescheduleAll(ctx: Context) {
        scheduleMorning(ctx, fromWorker = false)
        scheduleSummary(ctx, fromWorker = false)
        scheduleOpenTimes(ctx)
    }

    private fun scheduleDaily(ctx: Context, name: String, time: LocalTime, fromWorker: Boolean, build: (Long) -> androidx.work.OneTimeWorkRequest) {
        val now = LocalDateTime.now()
        var next = now.toLocalDate().atTime(time)
        if (!next.isAfter(now.plusSeconds(30))) next = next.plusDays(1)
        val req = build(Duration.between(now, next).toMillis())
        // 작업 안에서 다음 날 예약할 때는 지금 실행 중인 작업을 취소하지 않도록 이어 붙이기
        WorkManager.getInstance(ctx).enqueueUniqueWork(name, if (fromWorker) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.REPLACE, req)
    }

    /** 매일 아침 알림 */
    fun scheduleMorning(ctx: Context, fromWorker: Boolean) {
        val t = parseTime(Store.settings(ctx).optString("morningTime", "08:00"), LocalTime.of(8, 0))
        scheduleDaily(ctx, MORNING, t, fromWorker) { delay ->
            OneTimeWorkRequestBuilder<MorningWorker>().setInitialDelay(delay, TimeUnit.MILLISECONDS).build()
        }
    }

    /** 매일 저녁 요약 메일 */
    fun scheduleSummary(ctx: Context, fromWorker: Boolean) {
        val t = parseTime(Store.settings(ctx).optString("summaryTime", "21:00"), LocalTime.of(21, 0))
        scheduleDaily(ctx, SUMMARY, t, fromWorker) { delay ->
            OneTimeWorkRequestBuilder<SummaryWorker>().setInitialDelay(delay, TimeUnit.MILLISECONDS).build()
        }
    }

    /** 오늘 선착순 오픈 N분 전 알림 */
    fun scheduleOpenTimes(ctx: Context) {
        val wm = WorkManager.getInstance(ctx)
        val now = LocalDateTime.now()
        for (r in Store.pendingToday(ctx)) {
            val ot = r.optString("openTime", "")
            if (ot.isEmpty()) continue
            val open = parseTime(ot, LocalTime.MIDNIGHT)
            val at = now.toLocalDate().atTime(open).minusMinutes(OPEN_LEAD_MIN)
            if (!at.isAfter(now)) continue
            val w = OneTimeWorkRequestBuilder<OpenTimeWorker>()
                .setInitialDelay(Duration.between(now, at).toMillis(), TimeUnit.MILLISECONDS)
                .setInputData(workDataOf("id" to r.optString("id")))
                .build()
            wm.enqueueUniqueWork(OPEN_PREFIX + r.optString("id"), ExistingWorkPolicy.REPLACE, w)
        }
    }
}
