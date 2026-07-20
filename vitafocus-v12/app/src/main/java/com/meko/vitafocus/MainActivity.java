package com.meko.vitafocus;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Map;

public class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION = 902;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Ui.NAVY);
        requestNotificationPermission();
        if (AppPrefs.enabled(this)) ReminderScheduler.scheduleNext(this);
    }

    @Override
    protected void onResume() {
        super.onResume();
        setContentView(buildUi());
    }

    private View buildUi() {
        long now = System.currentTimeMillis();
        long dayStart = TimeUtils.startOfDay(now);
        long dayEnd = TimeUtils.addDays(dayStart, 1);
        ActivityStore store = new ActivityStore(this);
        Map<Long, String> stored = store.getBetween(dayStart, dayEnd);
        DayStats stats = calculateDay(dayStart, Math.min(dayEnd, now), stored);

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Ui.NAVY);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(Ui.dp(this, 18), Ui.dp(this, 16), Ui.dp(this, 18), Ui.dp(this, 30));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo = new ImageView(this);
        logo.setImageResource(R.drawable.ic_logo);
        header.addView(logo, new LinearLayout.LayoutParams(Ui.dp(this, 66), Ui.dp(this, 66)));
        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setPadding(Ui.dp(this, 10), 0, 0, 0);
        titles.addView(Ui.text(this, "VitaFocus", 27, true));
        TextView date = Ui.text(this, TimeUtils.dayLabel(now), 14, false);
        date.setTextColor(Ui.MUTED);
        titles.addView(date);
        header.addView(titles, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        root.addView(header);

        LinearLayout summary = Ui.card(this);
        TextView title = Ui.text(this, stats.missing > 0 ? "Hai " + stats.missing + " ore da completare" : "Giornata aggiornata", 21, true);
        title.setTextColor(stats.missing > 0 ? Ui.YELLOW : Ui.GREEN);
        summary.addView(title);
        TextView totals = Ui.text(this,
                stats.productive + " h utili  ·  " + stats.distraction + " h cazzeggio  ·  " + stats.missing + " h non registrate",
                15, false);
        totals.setTextColor(Ui.MUTED);
        totals.setPadding(0, Ui.dp(this, 5), 0, Ui.dp(this, 8));
        summary.addView(totals);
        int adherence = stats.answered + stats.missing == 0 ? 100 : Math.round(100f * stats.answered / (stats.answered + stats.missing));
        summary.addView(Ui.progress(this, adherence, adherence >= 75 ? Ui.GREEN : Ui.YELLOW));
        TextView adherenceText = Ui.text(this, "Completezza registrazioni: " + adherence + "%", 13, false);
        adherenceText.setTextColor(Ui.MUTED);
        summary.addView(adherenceText);

        Button nowButton = Ui.button(this, "Registra cosa sto facendo adesso", true);
        nowButton.setOnClickListener(v -> openCheckIn(TimeUtils.startOfHour(System.currentTimeMillis())));
        summary.addView(nowButton);
        if (stats.missing > 0) {
            Button missing = Ui.button(this, "Completa le ore mancanti", false);
            missing.setOnClickListener(v -> startActivity(new Intent(this, TimelineActivity.class)));
            summary.addView(missing);
        }
        root.addView(summary);

        LinearLayout nav = new LinearLayout(this);
        nav.setOrientation(LinearLayout.HORIZONTAL);
        Button timeline = Ui.smallButton(this, "Giornata", false);
        timeline.setOnClickListener(v -> startActivity(new Intent(this, TimelineActivity.class)));
        Button statistics = Ui.smallButton(this, "Statistiche", false);
        statistics.setOnClickListener(v -> startActivity(new Intent(this, StatsActivity.class)));
        Button settings = Ui.smallButton(this, "Impostazioni", false);
        settings.setOnClickListener(v -> startActivity(new Intent(this, SettingsActivity.class)));
        nav.addView(timeline);
        nav.addView(statistics);
        nav.addView(settings);
        root.addView(nav);

        TextView recentTitle = Ui.text(this, "ULTIME ORE", 13, true);
        recentTitle.setTextColor(Ui.TEAL);
        recentTitle.setPadding(0, Ui.dp(this, 16), 0, Ui.dp(this, 4));
        root.addView(recentTitle);

        int shown = 0;
        long currentHour = TimeUtils.startOfHour(now);
        for (long slot = currentHour; slot >= dayStart && shown < 7; slot -= TimeUtils.HOUR_MS) {
            if (!TimeUtils.isTrackedSlot(this, slot)) continue;
            String category = TimeUtils.resolvedCategory(this, stored, slot);
            boolean ended = slot + TimeUtils.HOUR_MS <= now;
            root.addView(hourCard(slot, category, ended));
            shown++;
        }
        return scroll;
    }

    private View hourCard(long slot, String category, boolean ended) {
        LinearLayout card = Ui.card(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        TextView time = Ui.text(this, TimeUtils.hourLabel(slot), 14, true);
        time.setTextColor(Ui.MUTED);
        card.addView(time, new LinearLayout.LayoutParams(Ui.dp(this, 96), ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout text = new LinearLayout(this);
        text.setOrientation(LinearLayout.VERTICAL);
        String label = category == null ? (ended ? "NON REGISTRATO" : "In corso") : TimeUtils.categoryLabel(category);
        TextView labelView = Ui.text(this, label, 15, true);
        labelView.setTextColor(category == null ? (ended ? Ui.RED : Ui.YELLOW) : Ui.categoryColor(category));
        text.addView(labelView);
        if (category == null) {
            TextView hint = Ui.text(this, "Tocca per compilarla", 12, false);
            hint.setTextColor(Ui.MUTED);
            text.addView(hint);
        }
        card.addView(text, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        card.setOnClickListener(v -> openCheckIn(slot));
        return card;
    }

    private DayStats calculateDay(long start, long end, Map<Long, String> stored) {
        DayStats s = new DayStats();
        long currentHour = TimeUtils.startOfHour(System.currentTimeMillis());
        for (long slot = start; slot < end; slot += TimeUtils.HOUR_MS) {
            if (!TimeUtils.isTrackedSlot(this, slot)) continue;
            String category = TimeUtils.resolvedCategory(this, stored, slot);
            if (category == null) {
                if (slot < currentHour) s.missing++;
                continue;
            }
            s.answered++;
            if ("distraction".equals(category)) s.distraction++;
            else s.productive++;
        }
        return s;
    }

    private void openCheckIn(long slot) {
        Intent intent = new Intent(this, CheckInActivity.class);
        intent.putExtra(CheckInActivity.EXTRA_SLOT_START, slot);
        startActivity(intent);
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION);
        }
    }

    private static final class DayStats {
        int productive;
        int distraction;
        int missing;
        int answered;
    }
}
