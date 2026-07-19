package com.meko.vitafocus;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

public final class Ui {
    public static final int NAVY = Color.rgb(7, 23, 34);
    public static final int CARD = Color.rgb(16, 40, 56);
    public static final int CARD_ALT = Color.rgb(21, 51, 69);
    public static final int TEAL = Color.rgb(47, 213, 196);
    public static final int GREEN = Color.rgb(105, 210, 125);
    public static final int MUTED = Color.rgb(174, 198, 211);
    public static final int RED = Color.rgb(255, 112, 105);
    public static final int YELLOW = Color.rgb(255, 199, 74);
    public static final int BLUE = Color.rgb(75, 166, 255);
    public static final int PURPLE = Color.rgb(172, 120, 255);

    private Ui() {}

    public static int dp(Context c, int value) {
        return Math.round(value * c.getResources().getDisplayMetrics().density);
    }

    public static TextView text(Context c, String value, float sp, boolean bold) {
        TextView t = new TextView(c);
        t.setText(value);
        t.setTextSize(sp);
        t.setTextColor(Color.WHITE);
        if (bold) t.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        t.setLineSpacing(0, 1.08f);
        return t;
    }

    public static LinearLayout card(Context c) {
        LinearLayout card = new LinearLayout(c);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(c, 16), dp(c, 16), dp(c, 16), dp(c, 16));
        card.setBackground(rounded(c, CARD, 18, 0, 0));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, dp(c, 7), 0, dp(c, 7));
        card.setLayoutParams(p);
        return card;
    }

    public static Button button(Context c, String label, boolean primary) {
        Button b = new Button(c);
        b.setText(label);
        b.setTextSize(14);
        b.setAllCaps(false);
        b.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        b.setTextColor(primary ? NAVY : Color.WHITE);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(c, 12), dp(c, 9), dp(c, 12), dp(c, 9));
        b.setBackground(rounded(c, primary ? TEAL : CARD_ALT, 14, primary ? 0 : TEAL, primary ? 0 : 1));
        b.setMinHeight(dp(c, 50));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        p.setMargins(0, dp(c, 5), 0, dp(c, 5));
        b.setLayoutParams(p);
        return b;
    }

    public static Button smallButton(Context c, String label, boolean active) {
        Button b = button(c, label, active);
        b.setMinHeight(dp(c, 42));
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1);
        p.setMargins(dp(c, 3), dp(c, 4), dp(c, 3), dp(c, 4));
        b.setLayoutParams(p);
        return b;
    }

    public static ProgressBar progress(Context c, int percent, int color) {
        ProgressBar p = new ProgressBar(c, null, android.R.attr.progressBarStyleHorizontal);
        p.setMax(100);
        p.setProgress(Math.max(0, Math.min(100, percent)));
        p.setProgressTintList(ColorStateList.valueOf(color));
        p.setProgressBackgroundTintList(ColorStateList.valueOf(Color.rgb(43, 67, 82)));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 8));
        lp.setMargins(0, dp(c, 5), 0, dp(c, 3));
        p.setLayoutParams(lp);
        return p;
    }

    public static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(Color.rgb(44, 68, 82));
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, 1)));
        return v;
    }

    public static GradientDrawable rounded(Context c, int fill, int radiusDp, int strokeColor, int strokeDp) {
        GradientDrawable bg = new GradientDrawable();
        bg.setColor(fill);
        bg.setCornerRadius(dp(c, radiusDp));
        if (strokeDp > 0) bg.setStroke(dp(c, strokeDp), strokeColor);
        return bg;
    }

    public static int categoryColor(String key) {
        if (key == null) return RED;
        switch (key) {
            case "home": return GREEN;
            case "work": return BLUE;
            case "sax": return YELLOW;
            case "gamedev": return PURPLE;
            case "swim": return TEAL;
            case "distraction": return RED;
            case "other": return MUTED;
            default: return MUTED;
        }
    }
}
