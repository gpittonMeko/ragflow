package com.meko.vitafocus;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;

import java.text.SimpleDateFormat;
import java.util.*;

public class MainActivity extends Activity {
    static final String PREF="vf", CHANNEL="vf_check", ACTION="com.meko.vitafocus.CHECK";
    static final int NAVY=Color.rgb(7,23,34), CARD=Color.rgb(16,40,56), TEAL=Color.rgb(47,213,196), MUTED=Color.rgb(174,198,211);
    SharedPreferences p; EditText interval; CheckBox enabled, noWork, noSleep; Button ws,we,ss,se; TextView stats;
    int wsm,wem,ssm,sem;

    @Override public void onCreate(Bundle b){ super.onCreate(b); getWindow().setStatusBarColor(NAVY); p=getSharedPreferences(PREF,MODE_PRIVATE); defaults(); requestNotify(); showHome(); if(getIntent().getBooleanExtra("check",false)) showCheck(); schedule(this, minutes()); }
    @Override protected void onNewIntent(Intent i){ super.onNewIntent(i); setIntent(i); if(i.getBooleanExtra("check",false)) showCheck(); }
    @Override protected void onResume(){ super.onResume(); if(stats!=null) refresh(); }

    void defaults(){ if(!p.contains("init")) p.edit().putBoolean("init",true).putBoolean("enabled",true).putInt("interval",60).putInt("ws",510).putInt("we",1080).putInt("ss",1380).putInt("se",420).putBoolean("nowork",true).putBoolean("nosleep",true).apply(); }
    int dp(int v){ return Math.round(v*getResources().getDisplayMetrics().density); }
    TextView text(String s,int sp,boolean bold){ TextView t=new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(Color.WHITE); if(bold)t.setTypeface(Typeface.DEFAULT,Typeface.BOLD); return t; }
    GradientDrawable bg(int color,int radius){ GradientDrawable g=new GradientDrawable(); g.setColor(color); g.setCornerRadius(dp(radius)); return g; }
    Button button(String s,boolean primary){ Button b=new Button(this); b.setText(s); b.setAllCaps(false); b.setTextSize(15); b.setTypeface(Typeface.DEFAULT,Typeface.BOLD); b.setTextColor(primary?NAVY:Color.WHITE); b.setBackground(bg(primary?TEAL:CARD,14)); LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2); lp.setMargins(0,dp(6),0,dp(6)); b.setLayoutParams(lp); b.setMinHeight(dp(52)); return b; }
    LinearLayout root(){ ScrollView sv=new ScrollView(this); sv.setFillViewport(true); sv.setBackgroundColor(NAVY); LinearLayout r=new LinearLayout(this); r.setOrientation(LinearLayout.VERTICAL); r.setPadding(dp(20),dp(20),dp(20),dp(30)); sv.addView(r,new ScrollView.LayoutParams(-1,-2)); setContentView(sv); return r; }
    LinearLayout card(){ LinearLayout c=new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setPadding(dp(16),dp(16),dp(16),dp(16)); c.setBackground(bg(CARD,18)); LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2); lp.setMargins(0,dp(8),0,dp(8)); c.setLayoutParams(lp); return c; }

    void showHome(){ LinearLayout r=root(); LinearLayout h=new LinearLayout(this); h.setGravity(Gravity.CENTER_VERTICAL); ImageView logo=new ImageView(this); logo.setImageResource(R.drawable.ic_logo); h.addView(logo,new LinearLayout.LayoutParams(dp(72),dp(72))); LinearLayout ht=new LinearLayout(this); ht.setOrientation(LinearLayout.VERTICAL); ht.setPadding(dp(10),0,0,0); ht.addView(text("VitaFocus",28,true)); TextView sub=text("Il tuo tempo. I tuoi obiettivi.",14,false); sub.setTextColor(MUTED); ht.addView(sub); h.addView(ht); r.addView(h);
        LinearLayout sc=card(); stats=text("",18,true); sc.addView(stats); TextView note=text("Ogni risposta rende visibile dove sta andando davvero il tuo tempo.",14,false); note.setTextColor(MUTED); note.setPadding(0,dp(6),0,dp(8)); sc.addView(note); Button now=button("Registra cosa sto facendo adesso",true); now.setOnClickListener(v->showCheck()); sc.addView(now); r.addView(sc); refresh();
        TextView title=text("PROMEMORIA",13,true); title.setTextColor(TEAL); title.setPadding(0,dp(14),0,0); r.addView(title);
        LinearLayout cfg=card(); enabled=new CheckBox(this); enabled.setText("Promemoria attivi"); enabled.setTextColor(Color.WHITE); enabled.setChecked(p.getBoolean("enabled",true)); cfg.addView(enabled);
        interval=new EditText(this); interval.setText(String.valueOf(minutes())); interval.setHint("Intervallo in minuti"); interval.setInputType(2); interval.setTextColor(Color.WHITE); interval.setHintTextColor(MUTED); cfg.addView(interval,new LinearLayout.LayoutParams(-1,-2));
        noWork=check("Non avvisarmi durante il lavoro (lun-ven)",p.getBoolean("nowork",true)); cfg.addView(noWork); wsm=p.getInt("ws",510); wem=p.getInt("we",1080); ssm=p.getInt("ss",1380); sem=p.getInt("se",420); ws=timeBtn("Inizio lavoro",wsm,0); we=timeBtn("Fine lavoro",wem,1); cfg.addView(ws); cfg.addView(we);
        noSleep=check("Non avvisarmi mentre dormo",p.getBoolean("nosleep",true)); cfg.addView(noSleep); ss=timeBtn("Ora di sonno",ssm,2); se=timeBtn("Ora di sveglia",sem,3); cfg.addView(ss); cfg.addView(se); r.addView(cfg);
        Button save=button("Salva e attiva",true); save.setOnClickListener(v->{ save(); Toast.makeText(this,"Impostazioni salvate",Toast.LENGTH_SHORT).show(); }); r.addView(save);
        Button test=button("Prova l'alert adesso",false); test.setOnClickListener(v->{ save(); ReminderReceiver.notifyNow(this); Toast.makeText(this,"Alert inviato",Toast.LENGTH_SHORT).show(); }); r.addView(test);
        Button ns=button("Apri impostazioni notifiche",false); ns.setOnClickListener(v->openNotificationSettings()); r.addView(ns);
        TextView foot=text("Versione ricostruita senza servizio di accessibilità. Gli alert sono gestiti direttamente da Android.",13,false); foot.setTextColor(MUTED); foot.setPadding(0,dp(12),0,0); r.addView(foot);
    }
    CheckBox check(String s,boolean val){ CheckBox c=new CheckBox(this); c.setText(s); c.setTextColor(Color.WHITE); c.setTextSize(15); c.setChecked(val); return c; }
    Button timeBtn(String label,int minute,int which){ Button b=button(label+": "+fmt(minute),false); b.setOnClickListener(v->{ int current=which==0?wsm:which==1?wem:which==2?ssm:sem; new TimePickerDialog(this,(d,h,m)->{ int x=h*60+m; if(which==0)wsm=x; else if(which==1)wem=x; else if(which==2)ssm=x; else sem=x; ((Button)v).setText(label+": "+fmt(x)); },current/60,current%60,true).show(); }); return b; }
    String fmt(int m){ return String.format(Locale.ITALY,"%02d:%02d",m/60,m%60); }
    int minutes(){ return Math.max(15,Math.min(240,p.getInt("interval",60))); }
    void save(){ int m=60; try{m=Integer.parseInt(interval.getText().toString().trim());}catch(Exception ignored){} m=Math.max(15,Math.min(240,m)); p.edit().putBoolean("enabled",enabled.isChecked()).putInt("interval",m).putBoolean("nowork",noWork.isChecked()).putBoolean("nosleep",noSleep.isChecked()).putInt("ws",wsm).putInt("we",wem).putInt("ss",ssm).putInt("se",sem).apply(); cancel(this); if(enabled.isChecked())schedule(this,m); }
    void refresh(){ int good=count("home")+count("work")+count("sax")+count("game")+count("swim"); stats.setText("Oggi: "+good+" attività utili · "+count("waste")+" momenti di cazzeggio"); }
    int count(String k){ return p.getInt(day()+":"+k,0); }
    String day(){ return new SimpleDateFormat("yyyy-MM-dd",Locale.ITALY).format(new Date()); }

    void showCheck(){ LinearLayout r=root(); Button back=button("← Torna alla configurazione",false); back.setOnClickListener(v->showHome()); r.addView(back); TextView t=text("Cosa stai facendo?",28,true); t.setPadding(0,dp(14),0,dp(4)); r.addView(t); TextView s=text("Segna l'attività reale del momento. Un controllo rapido e poi torni a quello che stavi facendo.",15,false); s.setTextColor(MUTED); s.setPadding(0,0,0,dp(14)); r.addView(s);
        addCat(r,"🏠  Famiglia e lavori a casa","home",true); addCat(r,"💼  Lavoro e miglioramento","work",true); addCat(r,"🎷  Sassofono, gruppo o composizione","sax",true); addCat(r,"🎮  Gamedev","game",true); addCat(r,"🏊  Nuoto","swim",true); addCat(r,"📺  Cazzeggio: videogame o telefilm","waste",false);
        Button snooze=button("Rimanda di 15 minuti",false); snooze.setOnClickListener(v->{ schedule(this,15); finishOrHome(); }); r.addView(snooze);
    }
    void addCat(LinearLayout r,String label,String key,boolean good){ Button b=button(label,good); if(!good)b.setTextColor(Color.rgb(255,130,120)); b.setOnClickListener(v->{ p.edit().putInt(day()+":"+key,count(key)+1).apply(); Toast.makeText(this,"Registrato",Toast.LENGTH_SHORT).show(); schedule(this,minutes()); finishOrHome(); }); r.addView(b); }
    void finishOrHome(){ if(isTaskRoot())showHome(); else finish(); }
    void requestNotify(){ if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},88); }
    void openNotificationSettings(){ try{ Intent i=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS); i.putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName()); startActivity(i);}catch(Exception e){startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,android.net.Uri.parse("package:"+getPackageName())));} }

    static PendingIntent pi(Context c){ Intent i=new Intent(c,ReminderReceiver.class).setAction(ACTION); int f=PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0); return PendingIntent.getBroadcast(c,5107,i,f); }
    static void schedule(Context c,int min){ SharedPreferences p=c.getSharedPreferences(PREF,MODE_PRIVATE); if(!p.getBoolean("enabled",true))return; AlarmManager a=(AlarmManager)c.getSystemService(ALARM_SERVICE); if(a==null)return; long when=System.currentTimeMillis()+Math.max(1,min)*60000L; try{ if(Build.VERSION.SDK_INT>=23)a.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,when,pi(c)); else a.set(AlarmManager.RTC_WAKEUP,when,pi(c)); }catch(Exception ignored){} }
    static void cancel(Context c){ AlarmManager a=(AlarmManager)c.getSystemService(ALARM_SERVICE); if(a!=null)a.cancel(pi(c)); }
    static boolean range(int v,int a,int b){ return a<b?v>=a&&v<b:v>=a||v<b; }

    public static class ReminderReceiver extends BroadcastReceiver {
        @Override public void onReceive(Context c,Intent i){ SharedPreferences p=c.getSharedPreferences(PREF,MODE_PRIVATE); if(!p.getBoolean("enabled",true))return; Calendar n=Calendar.getInstance(); int m=n.get(Calendar.HOUR_OF_DAY)*60+n.get(Calendar.MINUTE), d=n.get(Calendar.DAY_OF_WEEK); boolean quiet=(p.getBoolean("nowork",true)&&d>=Calendar.MONDAY&&d<=Calendar.FRIDAY&&range(m,p.getInt("ws",510),p.getInt("we",1080)))||(p.getBoolean("nosleep",true)&&range(m,p.getInt("ss",1380),p.getInt("se",420))); if(!quiet)notifyNow(c); schedule(c,Math.max(15,Math.min(240,p.getInt("interval",60)))); }
        static void notifyNow(Context c){ if(Build.VERSION.SDK_INT>=33&&c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return; NotificationManager nm=(NotificationManager)c.getSystemService(NOTIFICATION_SERVICE); if(nm==null)return; if(Build.VERSION.SDK_INT>=26){ NotificationChannel ch=new NotificationChannel(CHANNEL,"Controllo del tempo",NotificationManager.IMPORTANCE_HIGH); ch.setDescription("Ti chiede come stai usando il tempo libero"); ch.enableVibration(true); nm.createNotificationChannel(ch); }
            Intent open=new Intent(c,MainActivity.class).putExtra("check",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP); int f=PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=23?PendingIntent.FLAG_IMMUTABLE:0); PendingIntent content=PendingIntent.getActivity(c,5108,open,f); Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(c,CHANNEL):new Notification.Builder(c); b.setSmallIcon(R.drawable.ic_logo).setContentTitle("Cosa stai facendo?").setContentText("Casa, sassofono, gamedev, nuoto oppure cazzeggio?").setContentIntent(content).setAutoCancel(true).setPriority(Notification.PRIORITY_HIGH).setCategory(Notification.CATEGORY_REMINDER); nm.notify(5107,b.build()); }
    }
    public static class BootReceiver extends BroadcastReceiver { @Override public void onReceive(Context c,Intent i){ schedule(c,5); } }
}
