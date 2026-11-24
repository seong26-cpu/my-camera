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
    private const val OPEN_PREFIX = "open_"
    const val OPEN_LEAD_MIN = 3L

    fun parseTime(s: String, def: LocalTime): LocalTime = try { LocalTime.parse(s) } catch (e: Exception) { def }

    fun rescheduleAll(ctx: Context, fromWorker: Boolean = false) {
        val wm = WorkManager.getInstance(ctx)
        val now = LocalDateTime.now()

        // 1) 매일 아침 알림
        val morning = parseTime(Store.settings(ctx).optString("morningTime", "08:00"), LocalTime.of(8, 0))
        var next = now.toLocalDate().atTime(morning)
        if (!next.isAfter(now.plusSeconds(30))) next = next.plusDays(1)
        val req = OneTimeWorkRequestBuilder<MorningWorker>()
            .setInitialDelay(Duration.between(now, next).toMillis(), TimeUnit.MILLISECONDS)
            .build()
        // 작업 안에서 다음 날 예약 시: 지금 실행 중인 작업을 취소하지 않도록 이어 붙이기
        wm.enqueueUniqueWork(MORNING, if (fromWorker) ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.REPLACE, req)

        // 2) 오늘 선착순 오픈 N분 전 알림
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
