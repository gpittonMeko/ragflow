package it.gpitton.simredirect;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.telecom.Call;
import android.telecom.CallAudioState;
import android.telecom.InCallService;
import android.telecom.PhoneAccountHandle;
import android.telephony.TelephonyManager;
import android.widget.Toast;

public class RedirectInCallService extends InCallService {
    public static volatile Call currentCall;
    public static volatile RedirectInCallService instance;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public void onDestroy() {
        if (instance == this) {
            instance = null;
        }
        super.onDestroy();
    }

    @Override
    public void onCallAdded(Call call) {
        super.onCallAdded(call);
        if (tryDeflectUnknown(call)) {
            return;
        }
        currentCall = call;
        launchCallUi();
    }

    @Override
    public void onCallRemoved(Call call) {
        if (currentCall == call) {
            currentCall = null;
        }
        super.onCallRemoved(call);
    }

    private boolean tryDeflectUnknown(Call call) {
        SharedPreferences p = prefs();
        if (!p.getBoolean("enabled", false)) {
            return false;
        }

        Call.Details details = call.getDetails();
        if (details == null || call.getState() != Call.STATE_RINGING) {
            return false;
        }
        if (details.getCallDirection() != Call.Details.DIRECTION_INCOMING) {
            return false;
        }

        int selectedSubId = p.getInt("subId", -1);
        String destination = p.getString("destination", "");
        if (selectedSubId < 0 || destination == null || destination.trim().isEmpty()) {
            return false;
        }

        PhoneAccountHandle account = details.getAccountHandle();
        if (account == null) {
            record("SIM della chiamata non identificabile: nessuna deviazione");
            return false;
        }

        int incomingSubId;
        try {
            TelephonyManager telephony = getSystemService(TelephonyManager.class);
            if (telephony == null) {
                return false;
            }
            incomingSubId = telephony.getSubscriptionId(account);
        } catch (SecurityException | UnsupportedOperationException e) {
            record("Impossibile leggere la SIM della chiamata: nessuna deviazione");
            return false;
        }

        if (incomingSubId != selectedSubId) {
            return false;
        }

        Uri handle = details.getHandle();
        String number = handle == null ? null : handle.getSchemeSpecificPart();
        if (number != null && !number.trim().isEmpty() && isKnownContact(number)) {
            return false;
        }

        if (!details.can(Call.Details.CAPABILITY_SUPPORT_DEFLECT)) {
            record("Sconosciuto sulla SIM scelta, ma modem/operatore non supporta la deviazione singola");
            Toast.makeText(this, "Deviazione singola non supportata dall'operatore/modem", Toast.LENGTH_LONG).show();
            return false;
        }

        try {
            call.deflect(Uri.fromParts("tel", destination.trim(), null));
            record("Chiamata sconosciuta deviata a " + destination.trim());
            return true;
        } catch (RuntimeException e) {
            record("Errore durante la deviazione: " + e.getClass().getSimpleName());
            return false;
        }
    }

    private boolean isKnownContact(String number) {
        if (checkSelfPermission(Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            // Fail-safe: senza rubrica non deviare, per evitare di trattare un contatto come sconosciuto.
            return true;
        }
        Uri lookupUri = Uri.withAppendedPath(
                ContactsContract.PhoneLookup.CONTENT_FILTER_URI,
                Uri.encode(number));
        Cursor cursor = null;
        try {
            cursor = getContentResolver().query(
                    lookupUri,
                    new String[]{ContactsContract.PhoneLookup._ID},
                    null,
                    null,
                    null);
            return cursor != null && cursor.moveToFirst();
        } catch (RuntimeException e) {
            return true;
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    private void launchCallUi() {
        try {
            Intent intent = new Intent(this, CallUiActivity.class);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            startActivity(intent);
        } catch (RuntimeException e) {
            record("Chiamata non deviata; impossibile aprire UI chiamata");
        }
    }

    public void setSpeaker(boolean enabled) {
        try {
            setAudioRoute(enabled ? CallAudioState.ROUTE_SPEAKER : CallAudioState.ROUTE_EARPIECE);
        } catch (RuntimeException ignored) {
        }
    }

    public void setMuteState(boolean muted) {
        try {
            setMuted(muted);
        } catch (RuntimeException ignored) {
        }
    }

    private void record(String message) {
        prefs().edit().putString("lastEvent", message).apply();
    }

    private SharedPreferences prefs() {
        return getSharedPreferences("sim_redirect_cfg", MODE_PRIVATE);
    }
}
