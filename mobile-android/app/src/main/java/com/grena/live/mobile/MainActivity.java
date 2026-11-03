package com.grena.live.mobile;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.widget.ImageView;
import android.widget.HorizontalScrollView;
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
    private TextView connectionView;
    private TextView chatPreview;
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
    private GradientDrawable pill(int fill,int edge,int radius){
        GradientDrawable b=new GradientDrawable();b.setColor(fill);
        b.setStroke(dp(1),edge);b.setCornerRadius(dp(radius));return b;
    }
    private Button button(String label, Runnable act){
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setOnClickListener(v->act.run());
        b.setTextColor(Color.WHITE);b.setTextSize(15);
        b.setBackground(pill(Color.rgb(29,25,66),Color.rgb(95,75,187),15));
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(51));lp.topMargin=dp(9);content.addView(b,lp);return b;
    }
    private void base(String subtitle){
        LinearLayout screen=new LinearLayout(this);screen.setOrientation(LinearLayout.VERTICAL);
        screen.setBackgroundColor(Color.rgb(12,9,33));
        ScrollView scroll=new ScrollView(this); scroll.setFillViewport(true);
        content=new LinearLayout(this);content.setPadding(dp(18),dp(19),dp(18),dp(26));
        content.setOrientation(LinearLayout.VERTICAL);
        scroll.addView(content);
        screen.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        LinearLayout top=new LinearLayout(this);top.setOrientation(LinearLayout.HORIZONTAL);
        top.setGravity(Gravity.CENTER_VERTICAL);
        ImageView logo=new ImageView(this);logo.setImageResource(R.drawable.grena_app_icon);
        top.addView(logo,new LinearLayout.LayoutParams(dp(53),dp(53)));
        LinearLayout names=new LinearLayout(this);names.setOrientation(LinearLayout.VERTICAL);
        names.setPadding(dp(12),0,0,0);
        names.addView(text("GREÑA LIVE PRO",21,true));
        TextView small=text("CREATOR CONTROL · ANDROID",11,true);
        small.setTextColor(Color.rgb(178,162,230));names.addView(small);
        top.addView(names,new LinearLayout.LayoutParams(0,-2,1));
        if(dashboard){
            TextView light=text("● BETA",12,true);
            light.setTextColor(Color.rgb(50,236,186));
            light.setBackground(pill(Color.rgb(12,48,43),Color.rgb(25,150,127),30));
            light.setPadding(dp(10),dp(9),dp(10),dp(9));top.addView(light);
        }
        content.addView(top);
        TextView subtitleView=text(subtitle,13,false);
        subtitleView.setTextColor(Color.rgb(189,187,218));content.addView(subtitleView);
        feedback=text("",13,false);feedback.setTextColor(Color.rgb(123,224,244));
        content.addView(feedback);
        if(dashboard)addNavigation(screen);
        setContentView(screen);
    }
    private void addNavigation(LinearLayout screen){
        LinearLayout nav=new LinearLayout(this);nav.setOrientation(LinearLayout.HORIZONTAL);
        nav.setBackgroundColor(Color.rgb(17,13,47));
        String[] labels={"⌂\nInicio","▣\nFlotante","♧\nAlertas","▦\nWidgets","···\nMás"};
        Runnable[] actions={
            this::showDashboard,this::showFloatingPanel,
            ()->openSettings("alerts"),this::showWidgetsPanel,this::showMorePanel
        };
        for(int i=0;i<labels.length;i++){
            final int index=i;
            TextView item=text(labels[i],12,index==0);
            item.setGravity(Gravity.CENTER);
            item.setTextColor(index==0?Color.WHITE:Color.rgb(165,151,212));
            item.setOnClickListener(v->actions[index].run());
            nav.addView(item,new LinearLayout.LayoutParams(0,dp(65),1));
        }
        screen.addView(nav,new LinearLayout.LayoutParams(-1,dp(67)));
    }
    private void showFloatingPanel(){
        dashboard=true;base("Control de superposiciones sobre juegos");
        content.addView(text("VENTANA FLOTANTE",21,true));
        content.addView(text("El botón circular se puede arrastrar a cualquier lugar. Tócalo para ocultar o mostrar el chat; las alertas son independientes.",14,false));
        button("Activar ventana flotante",this::startOverlay);
        button("Probar alerta original de GREÑA (DEMO)",this::testAlert);
        button("Detener ventana flotante",this::stopOverlay);
        button("← Inicio",this::showDashboard);
    }
    private void showWidgetsPanel(){
        dashboard=true;base("Widgets y herramientas para transmisiones móviles");
        content.addView(text("WIDGETS",21,true));
        content.addView(text("El chat y las alertas están disponibles como capas transparentes sobre el juego. Los demás widgets de PC necesitan adaptación por separado.",14,false));
        button("Activar chat y alertas flotantes",this::startOverlay);
        button("Configurar alertas",()->openSettings("alerts"));
        button("← Inicio",this::showDashboard);
    }
    private void showMorePanel(){
        dashboard=true;base("Cuenta y conexiones de GREÑA ID");
        content.addView(text("MÁS",21,true));
        button("Vincular y configurar canales",()->openSettings("channels"));
        button("Configurar alertas",()->openSettings("alerts"));
        button("Volver al inicio",this::showDashboard);
        button("Cerrar sesión en este teléfono",this::logout);
    }
    private void stopOverlay(){
        Intent stop=new Intent(this,OverlayService.class);
        stop.setAction(OverlayService.ACTION_STOP);
        startService(stop);
        say("Ventana flotante detenida.");
    }
    private void testAlert(){
        if(!Settings.canDrawOverlays(this)){startOverlay();return;}
        Intent i=new Intent(this,OverlayService.class);
        i.setAction(OverlayService.ACTION_UPDATE);
        i.putExtra("test",true);startForegroundService(i);
        say("Alerta de demostración de la plantilla GREÑA seleccionada.");
    }
    private void logout(){
        stopOverlay();
        SecureSession.clear(this);MobileRelayApi.clear();token="";showLogin();
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
        communityView.setTextSize(18);
        communityView.setBackground(pill(Color.rgb(34,31,94),Color.rgb(100,76,225),23));
        content.addView(communityView);
        content.addView(text("CANALES Y ESTADO DE TRANSMISIÓN",14,true));
        LinearLayout platforms=new LinearLayout(this);platforms.setOrientation(LinearLayout.HORIZONTAL);
        for(String name:new String[]{"TikTok","Twitch","Kick","YouTube"}){
            TextView chip=text("● "+name,13,true);
            chip.setTextColor(name.equals("TikTok")?Color.rgb(61,231,219):Color.rgb(196,179,249));
            chip.setBackground(pill(Color.rgb(27,19,67),Color.rgb(82,68,151),30));
            chip.setPadding(dp(10),dp(9),dp(10),dp(9));
            LinearLayout.LayoutParams cp=new LinearLayout.LayoutParams(-2,-2);cp.rightMargin=dp(7);
            platforms.addView(chip,cp);
        }
        HorizontalScrollView strip=new HorizontalScrollView(this);
        strip.setHorizontalScrollBarEnabled(false);strip.addView(platforms);
        content.addView(strip);
        content.addView(text("CHAT EN VIVO",17,true));
        chatPreview=text("Aún no se han recibido comentarios del LIVE.",14,false);
        chatPreview.setBackground(pill(Color.rgb(15,31,51),Color.rgb(20,166,164),16));
        chatPreview.setPadding(dp(12),dp(12),dp(12),dp(12));content.addView(chatPreview);
        button("Actualizar transmisiones",this::refreshCommunity);
        button("✨ Configurar alertas",()->openSettings("alerts"));
        button("🔗 Vincular y configurar canales",()->openSettings("channels"));
        button("🔴 Conectar TikTok LIVE",this::connectTikTok);
        button("⏹ Desconectar TikTok LIVE",this::disconnectTikTok);
        connectionView=text("TikTok LIVE: "+
            getSharedPreferences("grena_mobile_connection_v1",MODE_PRIVATE)
                .getString("status","Sin conexión confirmada"),13,true);
        connectionView.setTextColor(Color.rgb(115,229,207));content.addView(connectionView);
        updateLocalStatus();
        button("Activar ventana flotante",this::startOverlay);
        button("Probar alerta flotante (DEMO)",this::testAlert);
        button("Detener ventana flotante",this::stopOverlay);
        button("Cerrar sesión en este teléfono",this::logout);
        TextView note=text("BETA 0.3: alertas AFTERGLOW originales de PC incluidas en el APK. El chat flotante puede ocultarse y su botón moverse. Los eventos reales de TikTok requieren que GREÑA ID active el servidor móvil independiente; si está apagado, verás un error claro. Esta app no cambia la presencia ni las conexiones de PC.",12,false);
        note.setTextColor(Color.LTGRAY);content.addView(note);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=getPackageManager().PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},3);
        handler.removeCallbacks(refreshLoop);if(visible)handler.post(refreshLoop);
    }
    private void updateLocalStatus(){
        if(connectionView!=null)connectionView.setText("TikTok LIVE: "+
            getSharedPreferences("grena_mobile_connection_v1",MODE_PRIVATE)
                .getString("status","Sin conexión confirmada"));
        if(chatPreview!=null){
            JSONObject saved=MobileSettingsCache.read(this,token,"chat-preview");
            JSONObject data=saved==null?null:saved.optJSONObject("settings");
            JSONArray messages=data==null?null:data.optJSONArray("messages");
            if(messages!=null&&messages.length()>0){
                StringBuilder out=new StringBuilder();
                for(int i=Math.max(0,messages.length()-3);i<messages.length();i++){
                    JSONObject msg=messages.optJSONObject(i);
                    if(msg==null)continue;
                    if(out.length()>0)out.append("\n\n");
                    out.append(msg.optString("user","Usuario")).append(" · ")
                        .append(msg.optString("message",""));
                }
                chatPreview.setText(out.toString());
            }
        }
    }
    private void refreshCommunity(){
        if(!dashboard||loading||token.isEmpty())return;
        updateLocalStatus();
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
    private void connectTikTok(){
        if(!Settings.canDrawOverlays(this)){
            say("Necesitas el permiso Mostrar sobre otras apps. Actívalo en Ventana flotante.");
            startOverlay();return;
        }
        JSONObject cached=MobileSettingsCache.read(this,token,"channels");
        JSONObject stored=cached==null?null:cached.optJSONObject("settings");
        JSONObject tiktok=stored==null?null:stored.optJSONObject("tiktok");
        String url=tiktok==null?"":tiktok.optString("url","");
        if(url.isEmpty()||tiktok==null||!tiktok.optBoolean("enabled",false)){
            say("Primero añade y habilita tu enlace de TikTok en Canales.");
            openSettings("channels");return;
        }
        Intent connect=new Intent(this,OverlayService.class);
        connect.setAction(OverlayService.ACTION_CONNECT_TIKTOK);
        connect.putExtra("username",url);
        startForegroundService(connect);
        say("Solicitando conexión real a TikTok LIVE. La ventana flotante mostrará si el servidor la confirmó.");
    }
    private void disconnectTikTok(){
        Intent disconnect=new Intent(this,OverlayService.class);
        disconnect.setAction(OverlayService.ACTION_DISCONNECT_TIKTOK);
        startService(disconnect);
        say("Solicitud de desconexión enviada. El botón flotante sigue disponible.");
    }
    private void openSettings(String section){
        Intent settings=new Intent(this,SettingsActivity.class);
        settings.putExtra("section",section);
        startActivity(settings);
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
