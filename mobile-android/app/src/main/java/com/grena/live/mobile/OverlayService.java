package com.grena.live.mobile;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.IBinder;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.ArrayDeque;
import java.util.Deque;

/**
 * GREÑA mobile native overlays:
 * - a non-touchable transparent chat window
 * - a non-touchable independent alert window
 * - a SMALL separately touchable movable hide/show button.
 * Only the circular handle intercepts touches. The game surface remains untouched.
 * Stored button X/Y never resets when the chat is hidden.
 */
public final class OverlayService extends Service {
    static final String ACTION_UPDATE="com.grena.live.mobile.UPDATE";
    static final String ACTION_STOP="com.grena.live.mobile.STOP";
    static final String ACTION_CHAT_EVENT="com.grena.live.mobile.CHAT_EVENT";
    static final String ACTION_ALERT_EVENT="com.grena.live.mobile.ALERT_EVENT";
    private static final String CHANNEL="grena_overlay";
    private static final String PREFS="grena_overlay_position_v2";
    private static final int MAX_MESSAGES=4;
    private final Deque<ChatItem> history=new ArrayDeque<>();
    private WindowManager wm;
    private LinearLayout chatRoot;
    private LinearLayout chatItems;
    private TextView toggleButton;
    private TextView alert;
    private WindowManager.LayoutParams buttonParams;
    private boolean chatVisible=true;

    private static final class ChatItem {
        final String platform,username,content;
        ChatItem(String platform,String username,String content){
            this.platform=platform;this.username=username;this.content=content;
        }
    }

    @Override public void onCreate(){
        super.onCreate();
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        nm.createNotificationChannel(new NotificationChannel(CHANNEL,"GREÑA · Ventana flotante",NotificationManager.IMPORTANCE_LOW));
        PendingIntent open=PendingIntent.getActivity(this,0,new Intent(this,MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification notification=new Notification.Builder(this,CHANNEL)
            .setSmallIcon(R.drawable.grena_notification_icon)
            .setContentTitle("GREÑA Live Mobile")
            .setContentText("Chat flotante · toca o arrastra el botón para ocultarlo")
            .setOngoing(true).setContentIntent(open).build();
        startForeground(42,notification);
        wm=(WindowManager)getSystemService(WINDOW_SERVICE);
        chatVisible=getSharedPreferences(PREFS,MODE_PRIVATE).getBoolean("chatVisible",true);
    }

    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&ACTION_STOP.equals(intent.getAction())){stopSelf();return START_NOT_STICKY;}
        if(!Settings.canDrawOverlays(this)){stopSelf();return START_NOT_STICKY;}
        if(buttonParams==null)createWindows();
        if(intent==null)return START_STICKY;
        if(intent.getBooleanExtra("test",false)){
            showAlert("DEMO · "+safe(intent.getStringExtra("theme"),24),"Alerta de prueba, no es un evento del LIVE",true);
        }
        if(ACTION_CHAT_EVENT.equals(intent.getAction())){
            appendChat(safe(intent.getStringExtra("platform"),12),
                safe(intent.getStringExtra("user"),45),safe(intent.getStringExtra("message"),240));
        }else if(ACTION_ALERT_EVENT.equals(intent.getAction())){
            showAlert(safe(intent.getStringExtra("user"),45),
                safe(intent.getStringExtra("message"),130),false);
        }
        return START_STICKY;
    }

    private static String safe(String value,int max){
        if(value==null)return "";
        return value.replaceAll("[\\p{Cntrl}&&[^\\n]]","").trim().substring(0,Math.min(max,value.trim().length()));
    }
    private int dp(float value){return(int)(value*getResources().getDisplayMetrics().density+0.5f);}
    private GradientDrawable rounded(int color,int stroke,int radius){
        GradientDrawable bg=new GradientDrawable();
        bg.setColor(color);bg.setCornerRadius(dp(radius));
        bg.setStroke(dp(1),stroke);
        return bg;
    }
    private TextView t(String str,int sp,int color,boolean bold){
        TextView view=new TextView(this);
        view.setText(str);view.setTextSize(sp);view.setTextColor(color);
        if(bold)view.setTypeface(null,Typeface.BOLD);
        return view;
    }
    private WindowManager.LayoutParams overlayParams(int width,int height,int flags){
        return new WindowManager.LayoutParams(width,height,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,flags,PixelFormat.TRANSLUCENT);
    }
    private void createWindows(){
        // Chat occupies only a transparent, noninteractive strip at the top left.
        chatRoot=new LinearLayout(this);chatRoot.setOrientation(LinearLayout.VERTICAL);
        chatRoot.setPadding(dp(3),dp(3),dp(3),dp(3));
        chatItems=new LinearLayout(this);chatItems.setOrientation(LinearLayout.VERTICAL);
        chatRoot.addView(chatItems);
        WindowManager.LayoutParams chatParams=overlayParams(dp(302),-2,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE |
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN);
        chatParams.gravity=Gravity.TOP|Gravity.START;
        chatParams.x=dp(14);chatParams.y=dp(42);
        chatParams.alpha=0.62f; // conservative for Android 12+ touch-obscuring threshold
        wm.addView(chatRoot,chatParams);
        chatRoot.setVisibility(chatVisible?View.VISIBLE:View.GONE);
        renderChat();

        // Independent, noninteractive alert on the other side of the game.
        alert=t("",13,Color.WHITE,true);
        alert.setPadding(dp(12),dp(10),dp(12),dp(10));
        alert.setBackground(rounded(Color.argb(218,24,28,55),Color.argb(180,120,95,255),20));
        WindowManager.LayoutParams alertParams=overlayParams(dp(188),-2,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE |
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN);
        alertParams.gravity=Gravity.TOP|Gravity.END;
        alertParams.x=dp(12);alertParams.y=dp(40);alertParams.alpha=0.65f;
        wm.addView(alert,alertParams);
        alert.setVisibility(View.GONE);

        // Exactly this small circular handle receives touch. It can be moved anywhere.
        toggleButton=t("",24,Color.rgb(207,249,251),true);
        toggleButton.setGravity(Gravity.CENTER);
        toggleButton.setBackground(rounded(Color.argb(228,20,32,56),Color.argb(220,55,237,211),100));
        buttonParams=overlayParams(dp(53),dp(53),
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE |
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN);
        buttonParams.gravity=Gravity.TOP|Gravity.START;
        buttonParams.alpha=0.94f; // only its OWN 53dp touch target, not the game
        SharedPreferences prefs=getSharedPreferences(PREFS,MODE_PRIVATE);
        buttonParams.x=prefs.getInt("x",Math.max(0,screenWidth()-dp(75)));
        buttonParams.y=prefs.getInt("y",Math.max(dp(24),screenHeight()/2));
        clampButton();
        toggleButton.setOnTouchListener(new View.OnTouchListener(){
            float startX,startY;
            int initialX,initialY;
            boolean dragging;
            @Override public boolean onTouch(View view,MotionEvent event){
                switch(event.getActionMasked()){
                    case MotionEvent.ACTION_DOWN:
                        startX=event.getRawX();startY=event.getRawY();
                        initialX=buttonParams.x;initialY=buttonParams.y;dragging=false;
                        return true;
                    case MotionEvent.ACTION_MOVE:{
                        int dx=Math.round(event.getRawX()-startX),dy=Math.round(event.getRawY()-startY);
                        if(Math.abs(dx)>dp(7)||Math.abs(dy)>dp(7))dragging=true;
                        if(dragging){
                            buttonParams.x=initialX+dx;buttonParams.y=initialY+dy;
                            clampButton();
                            try{wm.updateViewLayout(toggleButton,buttonParams);}catch(Exception ignored){}
                        }
                        return true;
                    }
                    case MotionEvent.ACTION_UP:
                        if(dragging)persistButton();
                        else toggleChat();
                        return true;
                    case MotionEvent.ACTION_CANCEL:
                        if(dragging)persistButton();
                        return true;
                    default:return false;
                }
            }
        });
        wm.addView(toggleButton,buttonParams);
        updateToggleLabel();
    }
    private int screenWidth(){
        DisplayMetrics metrics=new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);
        return metrics.widthPixels;
    }
    private int screenHeight(){
        DisplayMetrics metrics=new DisplayMetrics();
        wm.getDefaultDisplay().getRealMetrics(metrics);
        return metrics.heightPixels;
    }
    private void clampButton(){
        if(buttonParams==null)return;
        buttonParams.x=Math.max(0,Math.min(buttonParams.x,screenWidth()-dp(53)));
        buttonParams.y=Math.max(dp(12),Math.min(buttonParams.y,screenHeight()-dp(70)));
    }
    private void persistButton(){
        getSharedPreferences(PREFS,MODE_PRIVATE).edit()
            .putInt("x",buttonParams.x).putInt("y",buttonParams.y).apply();
    }
    private void toggleChat(){
        chatVisible=!chatVisible;
        getSharedPreferences(PREFS,MODE_PRIVATE).edit().putBoolean("chatVisible",chatVisible).apply();
        if(chatRoot!=null)chatRoot.setVisibility(chatVisible?View.VISIBLE:View.GONE);
        updateToggleLabel();
    }
    private void updateToggleLabel(){
        if(toggleButton==null)return;
        toggleButton.setText(chatVisible?"▣":"▢");
        toggleButton.setContentDescription(chatVisible?
            "Ocultar chat · arrastra para mover el botón":"Mostrar chat · arrastra para mover el botón");
    }
    private void appendChat(String platform,String username,String content){
        if(content.isEmpty())return;
        if(history.size()>=MAX_MESSAGES)history.removeFirst();
        history.addLast(new ChatItem(platform,username,content));
        renderChat();
    }
    private void renderChat(){
        if(chatItems==null)return;
        chatItems.removeAllViews();
        if(history.isEmpty()){
            TextView hint=t("CHAT · esperando mensajes del LIVE",12,Color.rgb(220,221,238),false);
            hint.setPadding(dp(10),dp(8),dp(10),dp(8));
            hint.setBackground(rounded(Color.argb(150,18,22,43),Color.argb(100,109,85,218),12));
            chatItems.addView(hint);
            return;
        }
        for(ChatItem msg:history){
            LinearLayout card=new LinearLayout(this);
            card.setOrientation(LinearLayout.VERTICAL);
            card.setPadding(dp(12),dp(9),dp(12),dp(10));
            int color="tiktok".equalsIgnoreCase(msg.platform)?Color.rgb(42,240,220):Color.rgb(182,157,255);
            card.setBackground(rounded(Color.argb(190,15,27,44),color,13));
            TextView label=t(msg.username+"  ·  "+msg.platform.toUpperCase(),12,color,true);
            TextView body=t(msg.content,13,Color.WHITE,false);
            body.setMaxLines(3);
            card.addView(label);card.addView(body);
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
            lp.bottomMargin=dp(7);
            chatItems.addView(card,lp);
        }
    }
    private void showAlert(String username,String message,boolean demo){
        if(alert==null)return;
        String prefix=demo?"● DEMO":"♥ ALERTA";
        alert.setText(prefix+"\n"+username+"\n"+message);
        alert.setVisibility(View.VISIBLE);
        alert.removeCallbacks(hideAlert);
        alert.postDelayed(hideAlert,5500);
    }
    private final Runnable hideAlert=()->{if(alert!=null)alert.setVisibility(View.GONE);};
    @Override public void onConfigurationChanged(Configuration newConfig){
        super.onConfigurationChanged(newConfig);
        if(buttonParams!=null&&toggleButton!=null){
            clampButton();
            wm.updateViewLayout(toggleButton,buttonParams);
            persistButton();
        }
    }
    @Override public void onDestroy(){
        if(alert!=null)alert.removeCallbacks(hideAlert);
        for(View v:new View[]{toggleButton,alert,chatRoot}){
            if(v!=null&&wm!=null)try{wm.removeView(v);}catch(Exception ignored){}
        }
        buttonParams=null;toggleButton=null;alert=null;chatRoot=null;chatItems=null;
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent){return null;}
}
