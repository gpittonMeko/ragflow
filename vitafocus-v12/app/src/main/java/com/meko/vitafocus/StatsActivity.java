package com.meko.vitafocus;

import android.app.Activity;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

public class StatsActivity extends Activity {
    private static final int DAY = 0;
    private static final int WEEK = 1;
    private static final int MONTH = 2;
    private int period = WEEK;
    private long anchor = System.currentTimeMillis();

    private static final String[] CATEGORY_KEYS = {"home", "work", "sax", "gamedev", "swim", "other", "distraction"};

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Ui.NAVY);
    }

    @Override
    protected void onResume() {
        super.onResume();
        setContentView(buildUi());
    }

    private View buildUi() {
        long start = periodStart();
        long end = periodEnd(start);
        long now = System.currentTimeMillis();
        long dataEnd = Math.min(end, now + 1);
        ActivityStore store = new ActivityStore(this);
        Map<Long, String> stored = store.getBetween(start, end);
        PeriodStats stats = calculate(start, dataEnd, stored);

        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(Ui.NAVY);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(Ui.dp(this, 18), Ui.dp(this, 16), Ui.dp(this, 18), Ui.dp(this, 30));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        Button back = Ui.smallButton(this, "‹", false);
        back.setOnClickListener(v -> finish());
        TextView title = Ui.text(this, "Statistiche", 24, true);
        title.setGravity(Gravity.CENTER);
        header.addView(back, new LinearLayout.LayoutParams(Ui.dp(this, 54), ViewGroup.LayoutParams.WRAP_CONTENT));
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 54), 1));
        root.addView(header);

        LinearLayout tabs = new LinearLayout(this);
        Button day = Ui.smallButton(this, "Giorno", period == DAY);
        Button week = Ui.smallButton(this, "Settimana", period == WEEK);
        Button month = Ui.smallButton(this, "Mese", period == MONTH);
        day.setOnClickListener(v -> {
            period = DAY;
            anchor = System.currentTimeMillis();
            setContentView(buildUi());
        });
        week.setOnClickListener(v -> {
            period = WEEK;
            anchor = System.currentTimeMillis();
            setContentView(buildUi());
        });
        month.setOnClickListener(v -> {
            period = MONTH;
            anchor = System.currentTimeMillis();
            setContentView(buildUi());
        });
        tabs.addView(day);
        tabs.addView(week);
        tabs.addView(month);
        root.addView(tabs);

        LinearLayout periodNav = new LinearLayout(this);
        periodNav.setGravity(Gravity.CENTER_VERTICAL);
        Button previous = Ui.smallButton(this, "←", false);
        previous.setOnClickListener(v -> {
            movePeriod(-1);
            setContentView(buildUi());
        });
        TextView periodLabel = Ui.text(this, labelForPeriod(start, end), 17, true);
        periodLabel.setGravity(Gravity.CENTER);
        Button next = Ui.smallButton(this, "→", false);
        boolean canNext = end <= System.currentTimeMillis();
        next.setEnabled(canNext);
        next.setAlpha(canNext ? 1f : .35f);
        next.setOnClickListener(v -> {
            movePeriod(1);
            setContentView(buildUi());
        });
        periodNav.addView(previous, new LinearLayout.LayoutParams(Ui.dp(this, 62), ViewGroup.LayoutParams.WRAP_CONTENT));
        periodNav.addView(periodLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        periodNav.addView(next, new LinearLayout.LayoutParams(Ui.dp(this, 62), ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(periodNav);

        LinearLayout summary = Ui.card(this);
        TextView useful = Ui.text(this, stats.productive + " h utili", 25, true);
        useful.setTextColor(Ui.GREEN);
        summary.addView(useful);
        TextView split = Ui.text(this,
                stats.distraction + " h cazzeggio  ·  " + stats.missing + " h non registrate",
                15, false);
        split.setTextColor(Ui.MUTED);
        split.setPadding(0, Ui.dp(this, 4), 0, Ui.dp(this, 8));
        summary.addView(split);
        int adherence = stats.answered + stats.missing == 0 ? 100 : Math.round(100f * stats.answered / (stats.answered + stats.missing));
        summary.addView(Ui.progress(this, adherence, adherence >= 80 ? Ui.GREEN : adherence >= 60 ? Ui.YELLOW : Ui.RED));
        TextView adherenceLabel = Ui.text(this, "Ore compilate: " + adherence + "%", 13, false);
        adherenceLabel.setTextColor(Ui.MUTED);
        summary.addView(adherenceLabel);
        root.addView(summary);

        TextView categoriesTitle = Ui.text(this, "DISTRIBUZIONE DEL TEMPO", 13, true);
        categoriesTitle.setTextColor(Ui.TEAL);
        categoriesTitle.setPadding(0, Ui.dp(this, 15), 0, Ui.dp(this, 3));
        root.addView(categoriesTitle);

        int denominator = Math.max(1, stats.answered);
        for (String key : CATEGORY_KEYS) {
            int hours = stats.counts.containsKey(key) ? stats.counts.get(key) : 0;
            LinearLayout card = Ui.card(this);
            LinearLayout line = new LinearLayout(this);
            line.setGravity(Gravity.CENTER_VERTICAL);
            TextView label = Ui.text(this, TimeUtils.categoryIcon(key) + "  " + TimeUtils.categoryLabel(key), 14, true);
            label.setTextColor(Ui.categoryColor(key));
            TextView value = Ui.text(this, hours + " h", 15, true);
            value.setGravity(Gravity.END);
            line.addView(label, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
            line.addView(value, new LinearLayout.LayoutParams(Ui.dp(this, 52), ViewGroup.LayoutParams.WRAP_CONTENT));
            card.addView(line);
            card.addView(Ui.progress(this, Math.round(100f * hours / denominator), Ui.categoryColor(key)));
            root.addView(card);
        }

        if (period != DAY) {
            TextView daysTitle = Ui.text(this, "ANDAMENTO GIORNO PER GIORNO", 13, true);
            daysTitle.setTextColor(Ui.TEAL);
            daysTitle.setPadding(0, Ui.dp(this, 15), 0, Ui.dp(this, 3));
            root.addView(daysTitle);
            long currentDay = start;
            int maxDays = period == WEEK ? 7 : 31;
            for (int i = 0; i < maxDays && currentDay < end && currentDay <= TimeUtils.startOfDay(now); i++) {
                long nextDay = TimeUtils.addDays(currentDay, 1);
                PeriodStats ds = calculate(currentDay, Math.min(nextDay, dataEnd), stored);
                LinearLayout row = Ui.card(this);
                TextView dayLabel = Ui.text(this, TimeUtils.shortDayLabel(currentDay), 15, true);
                row.addView(dayLabel);
                TextView dayValues = Ui.text(this,
                        ds.productive + " h utili · " + ds.distraction + " h cazzeggio · " + ds.missing + " mancanti",
                        13, false);
                dayValues.setTextColor(Ui.MUTED);
                dayValues.setPadding(0, Ui.dp(this, 4), 0, 0);
                row.addView(dayValues);
                int dayAdherence = ds.answered + ds.missing == 0 ? 100 : Math.round(100f * ds.answered / (ds.answered + ds.missing));
                row.addView(Ui.progress(this, dayAdherence, dayAdherence >= 80 ? Ui.GREEN : dayAdherence >= 60 ? Ui.YELLOW : Ui.RED));
                root.addView(row);
                currentDay = nextDay;
            }
        }
        return scroll;
    }

    private PeriodStats calculate(long start, long end, Map<Long, String> stored) {
        PeriodStats stats = new PeriodStats();
        long currentHour = TimeUtils.startOfHour(System.currentTimeMillis());
        for (long slot = TimeUtils.startOfHour(start); slot < end; slot += TimeUtils.HOUR_MS) {
            if (slot < start || !TimeUtils.isTrackedSlot(this, slot)) continue;
            String category = TimeUtils.resolvedCategory(this, stored, slot);
            if (category == null) {
                if (slot < currentHour) stats.missing++;
                continue;
            }
            stats.answered++;
            stats.counts.put(category, stats.counts.containsKey(category) ? stats.counts.get(category) + 1 : 1);
            if ("distraction".equals(category)) stats.distraction++;
            else stats.productive++;
        }
        return stats;
    }

    private long periodStart() {
        if (period == DAY) return TimeUtils.startOfDay(anchor);
        if (period == WEEK) return TimeUtils.startOfWeek(anchor);
        return TimeUtils.startOfMonth(anchor);
    }

    private long periodEnd(long start) {
        if (period == DAY) return TimeUtils.addDays(start, 1);
        if (period == WEEK) return TimeUtils.addDays(start, 7);
        return TimeUtils.addMonths(start, 1);
    }

    private void movePeriod(int direction) {
        if (period == DAY) anchor = TimeUtils.addDays(anchor, direction);
        else if (period == WEEK) anchor = TimeUtils.addDays(anchor, 7 * direction);
        else anchor = TimeUtils.addMonths(anchor, direction);
    }

    private String labelForPeriod(long start, long end) {
        if (period == DAY) return TimeUtils.dayLabel(start);
        if (period == WEEK) {
            return new SimpleDateFormat("d MMM", Locale.ITALY).format(new Date(start)) + " – " +
                    new SimpleDateFormat("d MMM", Locale.ITALY).format(new Date(end - 1));
        }
        return new SimpleDateFormat("MMMM yyyy", Locale.ITALY).format(new Date(start));
    }

    private static final class PeriodStats {
        int productive;
        int distraction;
        int missing;
        int answered;
        final Map<String, Integer> counts = new LinkedHashMap<>();
    }
}
