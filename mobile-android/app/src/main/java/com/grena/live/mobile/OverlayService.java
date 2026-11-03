package com.grena.live.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.IBinder;
import android.provider.Settings;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Non-interactive preview overlay: it NEVER steals touch events from the game. */
public final class OverlayService extends Service {
    static final String ACTION_UPDATE = "com.grena.live.mobile.UPDATE";
    static final String ACTION_STOP = "com.grena.live.mobile.STOP";
    private static final String CHANNEL = "grena_overlay";
    private WindowManager wm;
    private LinearLayout root;
    private TextView status;
    private TextView alert;

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager nm = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL, "GREÑA · Overlay", NotificationManager.IMPORTANCE_LOW));
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("GREÑA Live Mobile")
            .setContentText("Vista flotante activada · no bloquea los toques")
            .setOngoing(true).setContentIntent(open).build();
        startForeground(42, notification);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopSelf(); return START_NOT_STICKY;
        }
        if (!Settings.canDrawOverlays(this)) { stopSelf(); return START_NOT_STICKY; }
        if (root == null) showWindow();
        if (status != null && intent != null && intent.hasExtra("count")) {
            status.setText("● GREÑA LIVE  ·  " + intent.getIntExtra("count",0) + " canales en directo");
        }
        if (alert != null && intent != null && intent.getBooleanExtra("test", false)) {
            alert.setText("🎁 ALERTA DE PRUEBA\nEsta no es una alerta real del LIVE");
        }
        return START_STICKY;
    }
    private void showWindow() {
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(dp(12),dp(9),dp(12),dp(9));
        GradientDrawable bg=new GradientDrawable();
        bg.setColor(Color.argb(155,15,19,42)); bg.setCornerRadius(dp(14));
        bg.setStroke(dp(1), Color.argb(105,146,110,244));
        root.setBackground(bg);
        status=new TextView(this);
        status.setTextColor(Color.rgb(210,195,255)); status.setTextSize(12);
        status.setText("● GREÑA LIVE  ·  vista de prueba");
        root.addView(status);
        alert=new TextView(this);
        alert.setTextColor(Color.WHITE); alert.setTextSize(12);
        alert.setText("Chat y alertas reales: pendientes de conexión");
        alert.setPadding(0,dp(5),0,0);
        root.addView(alert);
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            dp(280), WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE |
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.TRANSLUCENT);
        params.gravity=Gravity.TOP|Gravity.END;
        params.x=dp(12); params.y=dp(86);
        // Android 12+ may block pass-through touches when overlays are too opaque.
        // Keep the effective opacity below the default obscuring threshold (0.8).
        params.alpha=0.65f;
        wm=(WindowManager)getSystemService(WINDOW_SERVICE);
        wm.addView(root,params);
    }
    private int dp(float v) {return (int)(v*getResources().getDisplayMetrics().density+0.5f);}
    @Override public void onDestroy() {
        if (wm!=null&&root!=null) { try { wm.removeView(root); } catch(Exception ignored) {} }
        root=null; super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) {return null;}
}
