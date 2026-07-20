package com.meko.vitafocus;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {
    private static final String CHANNEL_ID = "vitafocus_checkin_v3";
    public static final int NOTIFICATION_ID = 5107;

    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            if (!AppPrefs.enabled(context)) {
                ReminderScheduler.cancel(context);
                return;
            }
            if (!isQuietTime(context)) {
                showReminder(context, TimeUtils.startOfHour(System.currentTimeMillis()));
            }
        } finally {
            if (AppPrefs.enabled(context)) ReminderScheduler.scheduleNext(context);
        }
    }

    public static boolean isQuietTime(Context context) {
        long nowMillis = System.currentTimeMillis();
        int minute = TimeUtils.minuteOfDay(nowMillis);
        if (AppPrefs.excludeWork(context) && TimeUtils.isWeekday(nowMillis)
                && TimeUtils.inRange(minute, AppPrefs.workStart(context), AppPrefs.workEnd(context))) {
            return true;
        }
        return AppPrefs.excludeSleep(context)
                && TimeUtils.inRange(minute, AppPrefs.sleepStart(context), AppPrefs.sleepEnd(context));
    }

    public static void showReminder(Context context, long slotStart) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (Build.VERSION.SDK_INT >= 33
                && context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID, "Controllo del tempo", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Ti chiede periodicamente come stai usando il tempo libero");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }

        Intent open = new Intent(context, CheckInActivity.class);
        open.putExtra(CheckInActivity.EXTRA_SLOT_START, slotStart);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) flags |= PendingIntent.FLAG_IMMUTABLE;
        PendingIntent content = PendingIntent.getActivity(context, 5108, open, flags);

        android.app.Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new android.app.Notification.Builder(context, CHANNEL_ID)
                : new android.app.Notification.Builder(context);

        builder.setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("Cosa stai facendo in quest'ora?")
                .setContentText("Tocca e registra: le ore saltate resteranno da completare.")
                .setStyle(new android.app.Notification.BigTextStyle().bigText(
                        "Registra l'attività prevalente dell'ora " + TimeUtils.hourLabel(slotStart) +
                                ". Se non rispondi, l'ora apparirà come NON REGISTRATA nella timeline."))
                .setContentIntent(content)
                .setAutoCancel(true)
                .setCategory(android.app.Notification.CATEGORY_REMINDER)
                .setPriority(android.app.Notification.PRIORITY_HIGH)
                .setVisibility(android.app.Notification.VISIBILITY_PRIVATE);

        manager.notify(NOTIFICATION_ID, builder.build());
    }
}
