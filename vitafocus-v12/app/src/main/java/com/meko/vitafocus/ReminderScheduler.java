package com.meko.vitafocus;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public final class ReminderScheduler {
    private static final int REQUEST_CODE = 5107;
    private ReminderScheduler() {}

    public static void scheduleNext(Context context) {
        scheduleAfter(context, AppPrefs.intervalMinutes(context));
    }

    public static void scheduleAfter(Context context, int minutes) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager == null) return;
        PendingIntent pending = pendingIntent(context);
        long trigger = System.currentTimeMillis() + Math.max(1, minutes) * 60_000L;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, trigger, pending);
            } else {
                manager.set(AlarmManager.RTC_WAKEUP, trigger, pending);
            }
        } catch (RuntimeException ignored) {
            manager.set(AlarmManager.RTC_WAKEUP, trigger, pending);
        }
    }

    public static void cancel(Context context) {
        AlarmManager manager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (manager != null) manager.cancel(pendingIntent(context));
    }

    private static PendingIntent pendingIntent(Context context) {
        Intent intent = new Intent(context, ReminderReceiver.class);
        intent.setAction("com.meko.vitafocus.REMIND");
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        return PendingIntent.getBroadcast(context, REQUEST_CODE, intent, flags);
    }
}
