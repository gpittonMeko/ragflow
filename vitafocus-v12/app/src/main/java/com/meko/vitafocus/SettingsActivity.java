package com.meko.vitafocus;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.TimePickerDialog;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.Locale;

public class SettingsActivity extends Activity {
    private EditText interval;
    private Button workStart, workEnd, sleepStart, sleepEnd;
    private CheckBox enabled, excludeWork, excludeSleep, autoWork;
    private int workStartMinute, workEndMinute, sleepStartMinute, sleepEndMinute;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Ui.NAVY);
        setContentView(buildUi());
        loadSettings();
    }

    private View buildUi() {
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
        TextView title = Ui.text(this, "Impostazioni", 24, true);
        title.setGravity(Gravity.CENTER);
        header.addView(back, new LinearLayout.LayoutParams(Ui.dp(this, 54), ViewGroup.LayoutParams.WRAP_CONTENT));
        header.addView(title, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        header.addView(new View(this), new LinearLayout.LayoutParams(Ui.dp(this, 54), 1));
        root.addView(header);

        LinearLayout reminder = Ui.card(this);
        enabled = checkbox("Promemoria attivi");
        reminder.addView(enabled);
        TextView intervalLabel = Ui.text(this, "Intervallo tra gli alert (minuti)", 14, true);
        intervalLabel.setPadding(0, Ui.dp(this, 8), 0, 0);
        reminder.addView(intervalLabel);
        interval = new EditText(this);
        interval.setHint("60");
        interval.setTextColor(android.graphics.Color.WHITE);
        interval.setHintTextColor(Ui.MUTED);
        interval.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);
        interval.setSingleLine(true);
        reminder.addView(interval, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(reminder);

        LinearLayout work = Ui.card(this);
        TextView workTitle = Ui.text(this, "ORARIO DI LAVORO", 13, true);
        workTitle.setTextColor(Ui.TEAL);
        work.addView(workTitle);
        excludeWork = checkbox("Non inviare alert durante il lavoro (lun–ven)");
        autoWork = checkbox("Segna automaticamente queste ore come Lavoro");
        work.addView(excludeWork);
        work.addView(autoWork);
        workStart = timeButton("Inizio lavoro");
        workEnd = timeButton("Fine lavoro");
        work.addView(workStart);
        work.addView(workEnd);
        root.addView(work);

        LinearLayout sleep = Ui.card(this);
        TextView sleepTitle = Ui.text(this, "SONNO", 13, true);
        sleepTitle.setTextColor(Ui.TEAL);
        sleep.addView(sleepTitle);
        excludeSleep = checkbox("Non inviare alert e non contare le ore di sonno");
        sleep.addView(excludeSleep);
        sleepStart = timeButton("Ora di sonno");
        sleepEnd = timeButton("Ora di sveglia");
        sleep.addView(sleepStart);
        sleep.addView(sleepEnd);
        root.addView(sleep);

        Button save = Ui.button(this, "Salva impostazioni", true);
        save.setOnClickListener(v -> saveSettings());
        root.addView(save);

        Button test = Ui.button(this, "Prova alert adesso", false);
        test.setOnClickListener(v -> {
            saveSettingsQuietly();
            ReminderReceiver.showReminder(this, TimeUtils.startOfHour(System.currentTimeMillis()));
            Toast.makeText(this, "Alert inviato", Toast.LENGTH_SHORT).show();
        });
        root.addView(test);

        Button notifications = Ui.button(this, "Apri impostazioni notifiche", false);
        notifications.setOnClickListener(v -> openNotificationSettings());
        root.addView(notifications);

        Button clear = Ui.button(this, "Cancella tutte le statistiche", false);
        clear.setTextColor(Ui.RED);
        clear.setOnClickListener(v -> new AlertDialog.Builder(this)
                .setTitle("Cancellare tutti i dati?")
                .setMessage("Verranno eliminate definitivamente tutte le ore registrate.")
                .setNegativeButton("Annulla", null)
                .setPositiveButton("Cancella", (d, w) -> {
                    new ActivityStore(this).clearAll();
                    Toast.makeText(this, "Statistiche cancellate", Toast.LENGTH_SHORT).show();
                }).show());
        root.addView(clear);
        return scroll;
    }

    private CheckBox checkbox(String text) {
        CheckBox c = new CheckBox(this);
        c.setText(text);
        c.setTextColor(android.graphics.Color.WHITE);
        c.setTextSize(15);
        c.setPadding(0, Ui.dp(this, 7), 0, Ui.dp(this, 4));
        return c;
    }

    private Button timeButton(String label) {
        Button b = Ui.button(this, label, false);
        b.setTag(label);
        b.setOnClickListener(v -> {
            int current;
            if (v == workStart) current = workStartMinute;
            else if (v == workEnd) current = workEndMinute;
            else if (v == sleepStart) current = sleepStartMinute;
            else current = sleepEndMinute;
            new TimePickerDialog(this, (view, hour, minute) -> {
                int value = hour * 60 + minute;
                if (v == workStart) workStartMinute = value;
                else if (v == workEnd) workEndMinute = value;
                else if (v == sleepStart) sleepStartMinute = value;
                else sleepEndMinute = value;
                updateTimeButtons();
            }, current / 60, current % 60, true).show();
        });
        return b;
    }

    private void loadSettings() {
        enabled.setChecked(AppPrefs.enabled(this));
        interval.setText(String.valueOf(AppPrefs.intervalMinutes(this)));
        excludeWork.setChecked(AppPrefs.excludeWork(this));
        excludeSleep.setChecked(AppPrefs.excludeSleep(this));
        autoWork.setChecked(AppPrefs.autoWork(this));
        workStartMinute = AppPrefs.workStart(this);
        workEndMinute = AppPrefs.workEnd(this);
        sleepStartMinute = AppPrefs.sleepStart(this);
        sleepEndMinute = AppPrefs.sleepEnd(this);
        updateTimeButtons();
    }

    private void updateTimeButtons() {
        workStart.setText("Inizio lavoro: " + formatTime(workStartMinute));
        workEnd.setText("Fine lavoro: " + formatTime(workEndMinute));
        sleepStart.setText("Ora di sonno: " + formatTime(sleepStartMinute));
        sleepEnd.setText("Ora di sveglia: " + formatTime(sleepEndMinute));
    }

    private void saveSettings() {
        saveSettingsQuietly();
        Toast.makeText(this, "Impostazioni salvate", Toast.LENGTH_SHORT).show();
    }

    private void saveSettingsQuietly() {
        int value = 60;
        try {
            value = Integer.parseInt(interval.getText().toString().trim());
        } catch (Exception ignored) {}
        value = Math.max(15, Math.min(240, value));
        interval.setText(String.valueOf(value));
        AppPrefs.saveSchedule(this, value, workStartMinute, workEndMinute, sleepStartMinute, sleepEndMinute,
                excludeWork.isChecked(), excludeSleep.isChecked(), autoWork.isChecked(), enabled.isChecked());
        ReminderScheduler.cancel(this);
        if (enabled.isChecked()) ReminderScheduler.scheduleNext(this);
    }

    private String formatTime(int minute) {
        return String.format(Locale.ITALY, "%02d:%02d", minute / 60, minute % 60);
    }

    private void openNotificationSettings() {
        try {
            Intent intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(intent);
        } catch (Exception e) {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                    android.net.Uri.parse("package:" + getPackageName())));
        }
    }
}
