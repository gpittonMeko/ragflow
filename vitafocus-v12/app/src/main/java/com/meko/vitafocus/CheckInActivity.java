package com.meko.vitafocus;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

public class CheckInActivity extends Activity {
    public static final String EXTRA_SLOT_START = "slot_start";
    private long slotStart;
    private ActivityStore store;

    private static final String[][] CATEGORIES = {
            {"home", "⌂  Famiglia e lavori a casa"},
            {"work", "▣  Lavoro e miglioramento"},
            {"sax", "♫  Sassofono, gruppo o composizione"},
            {"gamedev", "⌘  Gamedev"},
            {"swim", "≈  Nuoto"},
            {"other", "•  Altro, commissioni o spostamenti"},
            {"distraction", "▶  Cazzeggio: videogame o telefilm"}
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Ui.NAVY);
        slotStart = getIntent().getLongExtra(EXTRA_SLOT_START, TimeUtils.startOfHour(System.currentTimeMillis()));
        slotStart = TimeUtils.startOfHour(slotStart);
        store = new ActivityStore(this);
        setContentView(buildUi());
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(ReminderReceiver.NOTIFICATION_ID);
    }

    private View buildUi() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(Ui.NAVY);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(Ui.dp(this, 20), Ui.dp(this, 24), Ui.dp(this, 20), Ui.dp(this, 30));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        root.addView(Ui.text(this, "Cosa hai fatto?", 28, true));
        TextView slot = Ui.text(this, TimeUtils.dayLabel(slotStart) + " · " + TimeUtils.hourLabel(slotStart), 16, true);
        slot.setTextColor(Ui.TEAL);
        slot.setPadding(0, Ui.dp(this, 5), 0, Ui.dp(this, 5));
        root.addView(slot);
        TextView subtitle = Ui.text(this, "Scegli l'attività prevalente di quest'ora. Puoi correggerla in seguito dalla timeline.", 15, false);
        subtitle.setTextColor(Ui.MUTED);
        subtitle.setPadding(0, 0, 0, Ui.dp(this, 14));
        root.addView(subtitle);

        String existing = store.getCategory(slotStart);
        if (existing == null && AppPrefs.autoWork(this) && TimeUtils.isWorkSlot(this, slotStart)) existing = "work";

        for (String[] item : CATEGORIES) {
            String key = item[0];
            Button button = Ui.button(this, item[1] + (key.equals(existing) ? "  ✓" : ""), !"distraction".equals(key));
            button.setTextColor("distraction".equals(key) ? Ui.RED : (key.equals(existing) ? Ui.NAVY : android.graphics.Color.WHITE));
            button.setOnClickListener(v -> {
                store.setCategory(slotStart, key);
                Toast.makeText(this, "Registrato: " + TimeUtils.categoryLabel(key), Toast.LENGTH_SHORT).show();
                finish();
            });
            root.addView(button);
        }

        if (store.getCategory(slotStart) != null) {
            Button delete = Ui.button(this, "Cancella questa registrazione", false);
            delete.setTextColor(Ui.RED);
            delete.setOnClickListener(v -> {
                store.delete(slotStart);
                Toast.makeText(this, "Registrazione cancellata", Toast.LENGTH_SHORT).show();
                finish();
            });
            root.addView(delete);
        }

        if (slotStart == TimeUtils.startOfHour(System.currentTimeMillis())) {
            Button snooze = Ui.button(this, "Ricordamelo tra 15 minuti", false);
            snooze.setOnClickListener(v -> {
                ReminderScheduler.scheduleAfter(this, 15);
                finish();
            });
            root.addView(snooze);
        }
        return scroll;
    }
}
