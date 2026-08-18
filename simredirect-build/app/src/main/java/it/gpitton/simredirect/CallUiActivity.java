package it.gpitton.simredirect;

import android.app.Activity;
import android.net.Uri;
import android.os.Bundle;
import android.telecom.Call;
import android.telecom.VideoProfile;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public class CallUiActivity extends Activity {
    private TextView callerText;
    private TextView stateText;
    private Button answerButton;
    private Button rejectButton;
    private Button hangupButton;
    private Button speakerButton;
    private Button muteButton;
    private boolean speaker;
    private boolean muted;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        buildUi();
        refresh();
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(24), dp(40), dp(24), dp(32));

        TextView title = new TextView(this);
        title.setText("Chiamata");
        title.setTextSize(25f);
        root.addView(title);

        callerText = new TextView(this);
        callerText.setTextSize(30f);
        callerText.setGravity(Gravity.CENTER);
        callerText.setPadding(0, dp(24), 0, dp(10));
        root.addView(callerText, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        stateText = new TextView(this);
        stateText.setTextSize(17f);
        stateText.setGravity(Gravity.CENTER);
        stateText.setPadding(0, 0, 0, dp(26));
        root.addView(stateText);

        answerButton = new Button(this);
        answerButton.setText("RISPONDI");
        answerButton.setOnClickListener(v -> {
            Call call = RedirectInCallService.currentCall;
            if (call != null) {
                call.answer(VideoProfile.STATE_AUDIO_ONLY);
                refresh();
            }
        });
        root.addView(answerButton, fullWidth());

        rejectButton = new Button(this);
        rejectButton.setText("RIFIUTA");
        rejectButton.setOnClickListener(v -> {
            Call call = RedirectInCallService.currentCall;
            if (call != null) {
                call.reject(false, null);
                finish();
            }
        });
        root.addView(rejectButton, fullWidthWithTop());

        hangupButton = new Button(this);
        hangupButton.setText("CHIUDI CHIAMATA");
        hangupButton.setOnClickListener(v -> {
            Call call = RedirectInCallService.currentCall;
            if (call != null) {
                call.disconnect();
            }
            finish();
        });
        root.addView(hangupButton, fullWidthWithTop());

        speakerButton = new Button(this);
        speakerButton.setText("VIVAVOCE: OFF");
        speakerButton.setOnClickListener(v -> {
            speaker = !speaker;
            RedirectInCallService service = RedirectInCallService.instance;
            if (service != null) {
                service.setSpeaker(speaker);
            }
            speakerButton.setText(speaker ? "VIVAVOCE: ON" : "VIVAVOCE: OFF");
        });
        root.addView(speakerButton, fullWidthWithTop());

        muteButton = new Button(this);
        muteButton.setText("MUTO: OFF");
        muteButton.setOnClickListener(v -> {
            muted = !muted;
            RedirectInCallService service = RedirectInCallService.instance;
            if (service != null) {
                service.setMuteState(muted);
            }
            muteButton.setText(muted ? "MUTO: ON" : "MUTO: OFF");
        });
        root.addView(muteButton, fullWidthWithTop());

        setContentView(root);
    }

    private void refresh() {
        Call call = RedirectInCallService.currentCall;
        if (call == null) {
            callerText.setText("Nessuna chiamata");
            stateText.setText("");
            answerButton.setEnabled(false);
            rejectButton.setEnabled(false);
            hangupButton.setEnabled(false);
            return;
        }

        String caller = "Numero privato / sconosciuto";
        Call.Details details = call.getDetails();
        if (details != null) {
            Uri handle = details.getHandle();
            if (handle != null && handle.getSchemeSpecificPart() != null && !handle.getSchemeSpecificPart().isEmpty()) {
                caller = handle.getSchemeSpecificPart();
            }
        }
        callerText.setText(caller);

        int state = call.getState();
        stateText.setText(stateName(state));
        boolean ringing = state == Call.STATE_RINGING;
        answerButton.setEnabled(ringing);
        rejectButton.setEnabled(ringing);
        hangupButton.setEnabled(state != Call.STATE_DISCONNECTED);
    }

    private String stateName(int state) {
        switch (state) {
            case Call.STATE_RINGING:
                return "In arrivo";
            case Call.STATE_DIALING:
                return "Chiamata in uscita";
            case Call.STATE_CONNECTING:
                return "Connessione...";
            case Call.STATE_ACTIVE:
                return "In corso";
            case Call.STATE_HOLDING:
                return "In attesa";
            case Call.STATE_DISCONNECTED:
                return "Terminata";
            default:
                return "Stato chiamata: " + state;
        }
    }

    private LinearLayout.LayoutParams fullWidth() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    private LinearLayout.LayoutParams fullWidthWithTop() {
        LinearLayout.LayoutParams p = fullWidth();
        p.topMargin = dp(8);
        return p;
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }
}
