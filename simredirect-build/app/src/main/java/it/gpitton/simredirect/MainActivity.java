package it.gpitton.simredirect;

import android.Manifest;
import android.app.Activity;
import android.app.role.RoleManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.telecom.TelecomManager;
import android.telephony.SubscriptionInfo;
import android.telephony.SubscriptionManager;
import android.view.Gravity;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final int REQ_PERMISSIONS = 10;
    private static final int REQ_DIALER_ROLE = 11;

    private final ArrayList<Integer> simIds = new ArrayList<>();
    private final ArrayList<String> simNames = new ArrayList<>();

    private Spinner simSpinner;
    private ArrayAdapter<String> simAdapter;
    private EditText destinationInput;
    private CheckBox enabledCheck;
    private EditText dialInput;
    private TextView statusText;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        buildUi();
        ensurePermissions();
        loadSims();
        loadConfig();
        loadDialIntent();
        refreshStatus();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refreshStatus();
    }

    private void buildUi() {
        ScrollView scroll = new ScrollView(this);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(20), dp(20), dp(20), dp(28));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView title = new TextView(this);
        title.setText("SIM Redirect");
        title.setTextSize(28f);
        title.setGravity(Gravity.CENTER_HORIZONTAL);
        title.setPadding(0, 0, 0, dp(8));
        root.addView(title);

        TextView intro = new TextView(this);
        intro.setText("Devia solo le chiamate da numeri non presenti in rubrica che arrivano sulla SIM selezionata. Le altre chiamate restano normali.");
        intro.setTextSize(16f);
        intro.setPadding(0, 0, 0, dp(18));
        root.addView(intro);

        TextView simLabel = new TextView(this);
        simLabel.setText("SIM da filtrare");
        simLabel.setTextSize(17f);
        root.addView(simLabel);

        simSpinner = new Spinner(this);
        simAdapter = new ArrayAdapter<>(this, android.R.layout.simple_spinner_item, simNames);
        simAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        simSpinner.setAdapter(simAdapter);
        root.addView(simSpinner, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView destinationLabel = new TextView(this);
        destinationLabel.setText("Numero a cui deviare");
        destinationLabel.setTextSize(17f);
        destinationLabel.setPadding(0, dp(18), 0, 0);
        root.addView(destinationLabel);

        destinationInput = new EditText(this);
        destinationInput.setHint("+39...");
        destinationInput.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        root.addView(destinationInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        enabledCheck = new CheckBox(this);
        enabledCheck.setText("Attiva deviazione sconosciuti");
        enabledCheck.setTextSize(17f);
        enabledCheck.setPadding(0, dp(12), 0, dp(6));
        root.addView(enabledCheck);

        Button save = new Button(this);
        save.setText("SALVA CONFIGURAZIONE");
        save.setOnClickListener(v -> saveConfig());
        root.addView(save, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button role = new Button(this);
        role.setText("IMPOSTA COME APP TELEFONO");
        role.setOnClickListener(v -> requestDialerRole());
        LinearLayout.LayoutParams roleParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        roleParams.topMargin = dp(8);
        root.addView(role, roleParams);

        statusText = new TextView(this);
        statusText.setTextSize(14f);
        statusText.setPadding(0, dp(12), 0, dp(18));
        root.addView(statusText);

        TextView dialTitle = new TextView(this);
        dialTitle.setText("Tastiera minima");
        dialTitle.setTextSize(18f);
        root.addView(dialTitle);

        dialInput = new EditText(this);
        dialInput.setHint("Numero da chiamare");
        dialInput.setInputType(android.text.InputType.TYPE_CLASS_PHONE);
        root.addView(dialInput, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        Button call = new Button(this);
        call.setText("CHIAMA");
        call.setOnClickListener(v -> placeCall());
        root.addView(call, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView warning = new TextView(this);
        warning.setText("Nota: la deviazione della singola chiamata deve essere supportata da modem e operatore. Se non è supportata, l'app NON attiva l'inoltro globale della SIM. L'operatore può applicare costi di deviazione.");
        warning.setTextSize(13f);
        warning.setPadding(0, dp(18), 0, 0);
        root.addView(warning);

        setContentView(scroll);
    }

    private void ensurePermissions() {
        ArrayList<String> missing = new ArrayList<>();
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.READ_PHONE_STATE);
        }
        if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.READ_CONTACTS);
        }
        if (checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            missing.add(Manifest.permission.CALL_PHONE);
        }
        if (!missing.isEmpty()) {
            requestPermissions(missing.toArray(new String[0]), REQ_PERMISSIONS);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_PERMISSIONS) {
            loadSims();
            refreshStatus();
        }
    }

    private void loadSims() {
        simIds.clear();
        simNames.clear();
        if (checkSelfPermission(Manifest.permission.READ_PHONE_STATE) != PackageManager.PERMISSION_GRANTED) {
            simNames.add("Concedi il permesso Telefono");
            simAdapter.notifyDataSetChanged();
            return;
        }
        try {
            SubscriptionManager manager = getSystemService(SubscriptionManager.class);
            List<SubscriptionInfo> subscriptions = manager == null ? null : manager.getActiveSubscriptionInfoList();
            if (subscriptions != null) {
                for (SubscriptionInfo info : subscriptions) {
                    simIds.add(info.getSubscriptionId());
                    CharSequence display = info.getDisplayName();
                    String name = display == null ? "SIM" : display.toString();
                    simNames.add("SIM " + (info.getSimSlotIndex() + 1) + " — " + name);
                }
            }
        } catch (SecurityException e) {
            simNames.add("Permesso SIM non disponibile");
        }
        if (simNames.isEmpty()) {
            simNames.add("Nessuna SIM attiva rilevata");
        }
        simAdapter.notifyDataSetChanged();

        int saved = prefs().getInt("subId", -1);
        for (int i = 0; i < simIds.size(); i++) {
            if (simIds.get(i) == saved) {
                simSpinner.setSelection(i);
                break;
            }
        }
    }

    private void loadConfig() {
        SharedPreferences p = prefs();
        destinationInput.setText(p.getString("destination", ""));
        enabledCheck.setChecked(p.getBoolean("enabled", false));
    }

    private void saveConfig() {
        if (simIds.isEmpty()) {
            Toast.makeText(this, "Seleziona una SIM valida", Toast.LENGTH_LONG).show();
            return;
        }
        int pos = simSpinner.getSelectedItemPosition();
        if (pos < 0 || pos >= simIds.size()) {
            Toast.makeText(this, "Seleziona una SIM valida", Toast.LENGTH_LONG).show();
            return;
        }
        String destination = destinationInput.getText().toString().trim();
        if (enabledCheck.isChecked() && destination.length() < 3) {
            Toast.makeText(this, "Inserisci il numero di destinazione", Toast.LENGTH_LONG).show();
            return;
        }
        prefs().edit()
                .putInt("subId", simIds.get(pos))
                .putString("destination", destination)
                .putBoolean("enabled", enabledCheck.isChecked())
                .apply();
        Toast.makeText(this, "Configurazione salvata", Toast.LENGTH_SHORT).show();
        refreshStatus();
    }

    private void requestDialerRole() {
        RoleManager roleManager = getSystemService(RoleManager.class);
        if (roleManager == null || !roleManager.isRoleAvailable(RoleManager.ROLE_DIALER)) {
            Toast.makeText(this, "Ruolo Telefono non disponibile su questo dispositivo", Toast.LENGTH_LONG).show();
            return;
        }
        if (roleManager.isRoleHeld(RoleManager.ROLE_DIALER)) {
            Toast.makeText(this, "SIM Redirect è già l'app Telefono", Toast.LENGTH_SHORT).show();
            return;
        }
        startActivityForResult(roleManager.createRequestRoleIntent(RoleManager.ROLE_DIALER), REQ_DIALER_ROLE);
    }

    private void placeCall() {
        String number = dialInput.getText().toString().trim();
        if (number.isEmpty()) {
            return;
        }
        if (checkSelfPermission(Manifest.permission.CALL_PHONE) != PackageManager.PERMISSION_GRANTED) {
            ensurePermissions();
            return;
        }
        TelecomManager telecom = getSystemService(TelecomManager.class);
        if (telecom == null) {
            Toast.makeText(this, "Servizio telefonico non disponibile", Toast.LENGTH_LONG).show();
            return;
        }
        Uri uri = Uri.fromParts("tel", number, null);
        telecom.placeCall(uri, new Bundle());
    }

    private void loadDialIntent() {
        Intent intent = getIntent();
        if (Intent.ACTION_DIAL.equals(intent.getAction()) && intent.getData() != null) {
            String number = intent.getData().getSchemeSpecificPart();
            if (number != null) {
                dialInput.setText(number);
            }
        }
    }

    private void refreshStatus() {
        if (statusText == null) {
            return;
        }
        RoleManager roleManager = getSystemService(RoleManager.class);
        boolean dialer = roleManager != null && roleManager.isRoleHeld(RoleManager.ROLE_DIALER);
        SharedPreferences p = prefs();
        String last = p.getString("lastEvent", "Nessuna deviazione eseguita finora.");
        String active = p.getBoolean("enabled", false) ? "ATTIVO" : "DISATTIVATO";
        statusText.setText("Filtro: " + active + "\nApp Telefono predefinita: " + (dialer ? "SÌ" : "NO — necessaria per il filtro") + "\nUltimo evento: " + last);
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("sim_redirect_cfg", MODE_PRIVATE);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
