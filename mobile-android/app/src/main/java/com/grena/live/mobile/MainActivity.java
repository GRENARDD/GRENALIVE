package com.grena.live.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * GREÑA Live Mobile v0.1: independent Android client.
 * Authenticates with the exact existing Cloudflare GREÑA ID service.
 * Reads the SAME central live-community snapshot as desktop.
 * No writes to production presence until multi-device presence is implemented.
 */
public final class MainActivity extends Activity {
    private static final int PURPLE=Color.rgb(180,155,250);
    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private LinearLayout content;
    private TextView feedback;
    private TextView communityView;
    private String token="";
    private int liveCount=0;
    private boolean dashboard=false, visible=false, loading=false;
    private final Runnable refreshLoop=new Runnable(){
        @Override public void run() {
            if(visible&&dashboard) { refreshCommunity(); handler.postDelayed(this,15000); }
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        token=SecureSession.get(this);
        if(token.isEmpty()) showLogin(); else showDashboard();
    }
    @Override protected void onResume(){super.onResume(); visible=true; handler.removeCallbacks(refreshLoop); handler.post(refreshLoop);}
    @Override protected void onPause(){visible=false; handler.removeCallbacks(refreshLoop); super.onPause();}
    @Override protected void onDestroy(){executor.shutdownNow(); super.onDestroy();}
    private int dp(float n){return(int)(n*getResources().getDisplayMetrics().density+.5f);}
    private TextView text(String s,int size,boolean bold){
        TextView t=new TextView(this); t.setText(s);t.setTextSize(size);t.setTextColor(Color.WHITE);
        if(bold)t.setTypeface(null,Typeface.BOLD);t.setPadding(0,dp(4),0,dp(7));return t;
    }
    private Button button(String label, Runnable act){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setOnClickListener(v->act.run());
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(51));lp.topMargin=dp(8);content.addView(b,lp);return b;
    }
    private void base(String subtitle){
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true);scroll.setBackgroundColor(Color.rgb(12,15,27));
        content=new LinearLayout(this);content.setPadding(dp(18),dp(28),dp(18),dp(30));content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);setContentView(scroll);
        TextView brand=text("GREÑA LIVE  ·  MOBILE",23,true); brand.setTextColor(PURPLE);content.addView(brand);
        content.addView(text(subtitle,14,false));
        feedback=text("",13,false);feedback.setTextColor(Color.rgb(162,216,250));content.addView(feedback);
    }
    private void say(String message){if(feedback!=null)feedback.setText(message);}
    private EditText field(String label, boolean password){
        TextView hint=text(label,14,true);content.addView(hint);
        EditText input=new EditText(this);input.setSingleLine(true);input.setTextSize(16);
        input.setTextColor(Color.WHITE);input.setHintTextColor(Color.LTGRAY);
        input.setHint(label);
        if(password) input.setInputType(129); // textPassword
        content.addView(input,new LinearLayout.LayoutParams(-1,dp(52)));
        return input;
    }
    private void showLogin(){
        dashboard=false;handler.removeCallbacks(refreshLoop);
        base("Accede con tu cuenta GREÑA ID. Mismas transmisiones en PC y Android.");
        EditText user=field("Usuario GREÑA ID",false);
        EditText pass=field("Contraseña",true);
        button("Entrar a GREÑA",()->{
            String name=user.getText().toString().trim(),password=pass.getText().toString();
            if(name.isEmpty()||password.isEmpty()){say("Introduce tu usuario y contraseña.");return;}
            say("Conectando con GREÑA ID...");
            executor.execute(()->{
                try{
                    JSONObject response=GrenaApi.login(name,password);
                    String received=response.optString("token","");
                    if(received.isEmpty())throw new Exception("El servidor no devolvió una sesión.");
                    SecureSession.put(this,received);
                    runOnUiThread(()->{token=received;pass.setText("");showDashboard();});
                }catch(Exception e){runOnUiThread(()->say("No se pudo entrar: "+e.getMessage()));}
            });
        });
        TextView note=text("Tu contraseña no se guarda en el teléfono. El token de sesión se protege con Android Keystore.",12,false);
        note.setTextColor(Color.LTGRAY);content.addView(note);
    }
    private void showDashboard(){
        dashboard=true;
        base("Panel independiente · sincronizado con la comunidad central de GREÑA Live.");
        communityView=text("Conectando a Canales en vivo...",14,false);
        communityView.setPadding(dp(10),dp(10),dp(10),dp(10));
        communityView.setBackgroundColor(Color.rgb(28,33,57));content.addView(communityView);
        button("Actualizar transmisiones",this::refreshCommunity);
        button("Activar ventana flotante",this::startOverlay);
        button("Probar alerta flotante (DEMO)",()->{
            if(!Settings.canDrawOverlays(this)){say("Primero concede el permiso de superposición.");return;}
            Intent i=new Intent(this,OverlayService.class);i.setAction(OverlayService.ACTION_UPDATE);
            i.putExtra("count",liveCount);i.putExtra("test",true);startForegroundService(i);
            say("Alerta de prueba enviada. No representa un evento real del LIVE.");
        });
        button("Detener ventana flotante",()->{
            Intent stop=new Intent(this,OverlayService.class);stop.setAction(OverlayService.ACTION_STOP);startService(stop);
            say("Ventana flotante detenida.");
        });
        button("Cerrar sesión en este teléfono",()->{
            SecureSession.clear(this);token="";stopService(new Intent(this,OverlayService.class));showLogin();
        });
        TextView note=text("BETA 0.1: lista real de Canales en vivo y overlay de demostración. El chat y las alertas reales se conectarán después al servicio de eventos multi-dispositivo. La app aún NO publica tu LIVE ni modifica presencia de tu cuenta.",12,false);
        note.setTextColor(Color.LTGRAY);content.addView(note);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=getPackageManager().PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},3);
        handler.removeCallbacks(refreshLoop);if(visible)handler.post(refreshLoop);
    }
    private void refreshCommunity(){
        if(!dashboard||loading||token.isEmpty())return;
        loading=true;
        final String myToken=token;
        executor.execute(()->{
            try{
                JSONObject data=GrenaApi.community(myToken);
                JSONArray users=data.optJSONArray("users");
                if(users==null)users=new JSONArray();
                int count=data.optInt("liveCount",users.length());
                StringBuilder sb=new StringBuilder();
                sb.append("📡 CANALES EN VIVO (").append(count).append(")\n")
                    .append("Usuarios en GREÑA: ").append(data.optInt("usersOnline",0)).append("\n")
                    .append("Espectadores: ").append(data.optInt("totalViewers",0)).append("\n\n");
                if(users.length()==0)sb.append("No hay transmisiones compartidas en este momento.");
                for(int i=0;i<users.length();i++){
                    JSONObject u=users.optJSONObject(i);if(u==null)continue;
                    sb.append("🔴 ").append(u.optString("name","Streamer"))
                        .append("  ·  👁 ").append(u.optInt("viewers",0));
                    JSONArray pl=u.optJSONArray("platforms");
                    if(pl!=null){sb.append("  · ");for(int j=0;j<pl.length();j++){
                        if(j>0)sb.append(" + ");sb.append(pl.optString(j));}}
                    sb.append("\n");
                }
                String output=sb.toString();
                runOnUiThread(()->{
                    loading=false;if(!dashboard||!myToken.equals(token))return;
                    liveCount=count; if(communityView!=null)communityView.setText(output);
                    if(Settings.canDrawOverlays(this)){
                        // Update an existing overlay only; do not start one unexpectedly.
                        // The user must explicitly enable it first.
                    }
                });
            }catch(Exception e){
                runOnUiThread(()->{
                    loading=false;if(!dashboard)return;
                    say("Lista sin conexión: "+e.getMessage());
                    if(e instanceof GrenaApi.ApiException && ((GrenaApi.ApiException)e).status==401){
                        SecureSession.clear(this);token="";showLogin();
                    }
                });
            }
        });
    }
    private void startOverlay(){
        if(!Settings.canDrawOverlays(this)){
            say("Permite ‘Mostrar sobre otras apps’ y vuelve aquí para activarla.");
            Intent intent=new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:"+getPackageName()));
            startActivity(intent);return;
        }
        Intent intent=new Intent(this,OverlayService.class);
        intent.setAction(OverlayService.ACTION_UPDATE);intent.putExtra("count",liveCount);
        startForegroundService(intent);
        say("Ventana flotante de prueba activada. Regresa al juego: no intercepta los toques.");
    }
}
