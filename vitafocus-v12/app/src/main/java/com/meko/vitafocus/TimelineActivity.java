package com.meko.vitafocus;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Map;

public class TimelineActivity extends Activity {
    private long selectedDay;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Ui.NAVY);
        selectedDay = TimeUtils.startOfDay(getIntent().getLongExtra("day", System.currentTimeMillis()));
    }

    @Override
    protected void onResume() {
        super.onResume();
        setContentView(buildUi());
    }

    private View buildUi() {
        long today = TimeUtils.startOfDay(System.currentTimeMillis());
        ActivityStore store = new ActivityStore(this);
        Map<Long, String> stored = store.getBetween(selectedDay, TimeUtils.addDays(selectedDay, 1));

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
        TextView title = Ui.text(this, "Timeline giornaliera", 23, true);
        title.setGravity(Gravity.CENTER);
        header.addView(back, new LinearLayout.LayoutParams(Ui.dp(this, 54), ViewGroup.LayoutParams.WRAP_CONTENT));
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 54), 1));
        root.addView(header);

        LinearLayout dateNav = new LinearLayout(this);
        dateNav.setGravity(Gravity.CENTER_VERTICAL);
        Button previous = Ui.smallButton(this, "←", false);
        previous.setOnClickListener(v -> {
            selectedDay = TimeUtils.addDays(selectedDay, -1);
            setContentView(buildUi());
        });
        TextView date = Ui.text(this, TimeUtils.dayLabel(selectedDay), 17, true);
        date.setGravity(Gravity.CENTER);
        Button next = Ui.smallButton(this, "→", false);
        next.setEnabled(selectedDay < today);
        next.setAlpha(selectedDay < today ? 1f : .35f);
        next.setOnClickListener(v -> {
            selectedDay = TimeUtils.addDays(selectedDay, 1);
            setContentView(buildUi());
        });
        dateNav.addView(previous, new LinearLayout.LayoutParams(Ui.dp(this, 62), ViewGroup.LayoutParams.WRAP_CONTENT));
        dateNav.addView(date, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        dateNav.addView(next, new LinearLayout.LayoutParams(Ui.dp(this, 62), ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(dateNav);

        int missing = 0;
        long now = System.currentTimeMillis();
        long currentHour = TimeUtils.startOfHour(now);
        for (long slot = selectedDay; slot < TimeUtils.addDays(selectedDay, 1); slot += TimeUtils.HOUR_MS) {
            if (!TimeUtils.isTrackedSlot(this, slot)) continue;
            if (slot > currentHour) continue;
            String category = TimeUtils.resolvedCategory(this, stored, slot);
            if (category == null && slot < currentHour) missing++;
        }
        LinearLayout info = Ui.card(this);
        TextView infoText = Ui.text(this,
                missing == 0 ? "Tutte le ore trascorse sono compilate." : missing + " ore trascorse non sono ancora registrate.",
                16, true);
        infoText.setTextColor(missing == 0 ? Ui.GREEN : Ui.YELLOW);
        info.addView(infoText);
        TextView help = Ui.text(this, "Tocca qualsiasi riga per registrare o correggere l'attività.", 13, false);
        help.setTextColor(Ui.MUTED);
        info.addView(help);
        root.addView(info);

        boolean any = false;
        for (long slot = selectedDay; slot < TimeUtils.addDays(selectedDay, 1); slot += TimeUtils.HOUR_MS) {
            if (!TimeUtils.isTrackedSlot(this, slot)) continue;
            if (slot > currentHour) continue;
            any = true;
            String category = TimeUtils.resolvedCategory(this, stored, slot);
            boolean autoWork = stored.get(slot) == null && "work".equals(category);
            boolean ended = slot < currentHour;
            root.addView(buildSlot(slot, category, autoWork, ended));
        }
        if (!any) {
            TextView empty = Ui.text(this, "Nessuna ora tracciabile per questa giornata.", 15, false);
            empty.setTextColor(Ui.MUTED);
            empty.setPadding(0, Ui.dp(this, 20), 0, 0);
            root.addView(empty);
        }
        return scroll;
    }

    private View buildSlot(long slot, String category, boolean autoWork, boolean ended) {
        LinearLayout card = Ui.card(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        TextView time = Ui.text(this, TimeUtils.hourLabel(slot), 14, true);
        time.setTextColor(Ui.MUTED);
        card.addView(time, new LinearLayout.LayoutParams(Ui.dp(this, 98), ViewGroup.LayoutParams.WRAP_CONTENT));
        LinearLayout details = new LinearLayout(this);
        details.setOrientation(LinearLayout.VERTICAL);
        String label = category == null ? (ended ? "NON REGISTRATO" : "In corso") : TimeUtils.categoryLabel(category);
        TextView activity = Ui.text(this, label, 15, true);
        activity.setTextColor(category == null ? (ended ? Ui.RED : Ui.YELLOW) : Ui.categoryColor(category));
        details.addView(activity);
        if (autoWork) {
            TextView auto = Ui.text(this, "Inserito automaticamente dall'orario di lavoro", 12, false);
            auto.setTextColor(Ui.MUTED);
            details.addView(auto);
        } else if (category == null) {
            TextView hint = Ui.text(this, "Tocca per compilare", 12, false);
            hint.setTextColor(Ui.MUTED);
            details.addView(hint);
        }
        card.addView(details, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        card.setOnClickListener(v -> {
            Intent intent = new Intent(this, CheckInActivity.class);
            intent.putExtra(CheckInActivity.EXTRA_SLOT_START, slot);
            startActivity(intent);
        });
        return card;
    }
}
