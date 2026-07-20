package com.meko.vitafocus;

import android.content.Context;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

public final class TimeUtils {
    public static final long HOUR_MS = 60L * 60L * 1000L;
    private TimeUtils() {}

    public static long startOfHour(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    public static long startOfDay(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }

    public static long addDays(long millis, int days) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        c.add(Calendar.DAY_OF_YEAR, days);
        return c.getTimeInMillis();
    }

    public static long addMonths(long millis, int months) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        c.add(Calendar.MONTH, months);
        return c.getTimeInMillis();
    }

    public static long startOfWeek(long millis) {
        Calendar c = Calendar.getInstance(Locale.ITALY);
        c.setTimeInMillis(startOfDay(millis));
        int dow = c.get(Calendar.DAY_OF_WEEK);
        int delta = dow == Calendar.SUNDAY ? -6 : Calendar.MONDAY - dow;
        c.add(Calendar.DAY_OF_YEAR, delta);
        return c.getTimeInMillis();
    }

    public static long startOfMonth(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(startOfDay(millis));
        c.set(Calendar.DAY_OF_MONTH, 1);
        return c.getTimeInMillis();
    }

    public static String dayLabel(long millis) {
        return new SimpleDateFormat("EEEE d MMMM", Locale.ITALY).format(new Date(millis));
    }

    public static String shortDayLabel(long millis) {
        return new SimpleDateFormat("EEE d MMM", Locale.ITALY).format(new Date(millis));
    }

    public static String hourLabel(long slotStart) {
        return new SimpleDateFormat("HH:mm", Locale.ITALY).format(new Date(slotStart)) + "–" +
                new SimpleDateFormat("HH:mm", Locale.ITALY).format(new Date(slotStart + HOUR_MS));
    }

    public static int minuteOfDay(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        return c.get(Calendar.HOUR_OF_DAY) * 60 + c.get(Calendar.MINUTE);
    }

    public static boolean isWeekday(long millis) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(millis);
        int day = c.get(Calendar.DAY_OF_WEEK);
        return day >= Calendar.MONDAY && day <= Calendar.FRIDAY;
    }

    public static boolean inRange(int value, int start, int end) {
        if (start == end) return false;
        if (start < end) return value >= start && value < end;
        return value >= start || value < end;
    }

    public static boolean isSleepSlot(Context c, long slotStart) {
        if (!AppPrefs.excludeSleep(c)) return false;
        return inRange(minuteOfDay(slotStart), AppPrefs.sleepStart(c), AppPrefs.sleepEnd(c));
    }

    public static boolean isWorkSlot(Context c, long slotStart) {
        return isWeekday(slotStart) &&
                inRange(minuteOfDay(slotStart), AppPrefs.workStart(c), AppPrefs.workEnd(c));
    }

    public static boolean isTrackedSlot(Context c, long slotStart) {
        if (isSleepSlot(c, slotStart)) return false;
        return !(AppPrefs.excludeWork(c) && isWorkSlot(c, slotStart) && !AppPrefs.autoWork(c));
    }

    public static String resolvedCategory(Context c, Map<Long, String> stored, long slotStart) {
        String value = stored.get(slotStart);
        if (value != null) return value;
        if (AppPrefs.autoWork(c) && isWorkSlot(c, slotStart)) return "work";
        return null;
    }

    public static String categoryLabel(String key) {
        if (key == null) return "Non registrato";
        switch (key) {
            case "home": return "Famiglia e lavori a casa";
            case "work": return "Lavoro e miglioramento";
            case "sax": return "Sassofono / gruppo / composizione";
            case "gamedev": return "Gamedev";
            case "swim": return "Nuoto";
            case "distraction": return "Cazzeggio: videogame / telefilm";
            case "other": return "Altro / commissioni / spostamenti";
            default: return key;
        }
    }

    public static String categoryIcon(String key) {
        if (key == null) return "?";
        switch (key) {
            case "home": return "⌂";
            case "work": return "▣";
            case "sax": return "♫";
            case "gamedev": return "⌘";
            case "swim": return "≈";
            case "distraction": return "▶";
            case "other": return "•";
            default: return "•";
        }
    }
}
