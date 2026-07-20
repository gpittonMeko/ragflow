package com.meko.vitafocus;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (AppPrefs.enabled(context)) ReminderScheduler.scheduleAfter(context, 5);
    }
}
