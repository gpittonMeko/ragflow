package com.meko.vitafocus;

import android.content.Context;
import android.content.SharedPreferences;

public final class AppPrefs {
    private static final String FILE = "vitafocus";
    private AppPrefs() {}

    private static SharedPreferences p(Context c) {
        return c.getSharedPreferences(FILE, Context.MODE_PRIVATE);
    }

    public static boolean enabled(Context c) { return p(c).getBoolean("enabled", true); }
    public static int intervalMinutes(Context c) { return clamp(p(c).getInt("interval", 60), 15, 240); }
    public static int workStart(Context c) { return p(c).getInt("work_start", 8 * 60 + 30); }
    public static int workEnd(Context c) { return p(c).getInt("work_end", 18 * 60); }
    public static int sleepStart(Context c) { return p(c).getInt("sleep_start", 23 * 60); }
    public static int sleepEnd(Context c) { return p(c).getInt("sleep_end", 7 * 60); }
    public static boolean excludeWork(Context c) { return p(c).getBoolean("exclude_work", true); }
    public static boolean excludeSleep(Context c) { return p(c).getBoolean("exclude_sleep", true); }
    public static boolean autoWork(Context c) { return p(c).getBoolean("auto_work", true); }

    public static void saveSchedule(Context c, int interval, int workStart, int workEnd,
                                    int sleepStart, int sleepEnd, boolean excludeWork,
                                    boolean excludeSleep, boolean autoWork, boolean enabled) {
        p(c).edit()
                .putInt("interval", clamp(interval, 15, 240))
                .putInt("work_start", normalizeMinute(workStart))
                .putInt("work_end", normalizeMinute(workEnd))
                .putInt("sleep_start", normalizeMinute(sleepStart))
                .putInt("sleep_end", normalizeMinute(sleepEnd))
                .putBoolean("exclude_work", excludeWork)
                .putBoolean("exclude_sleep", excludeSleep)
                .putBoolean("auto_work", autoWork)
                .putBoolean("enabled", enabled)
                .apply();
    }

    private static int clamp(int v, int min, int max) { return Math.max(min, Math.min(max, v)); }
    private static int normalizeMinute(int value) {
        int result = value % (24 * 60);
        return result < 0 ? result + 24 * 60 : result;
    }
}
