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
    private TextView connectionView;
    private TextView linkedTikTokView;
    private TextView relayStatusView;
    private TextView chatPreview;
    private String token="";
    private boolean dashboard=false, visible=false;
    private final Runnable refreshLoop=new Runnable(){
        @Override public void run() {
            if(visible&&dashboard){
                updateLocalStatus();
                handler.postDelayed(this,3500);
            }
        }
    };

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        token=SecureSession.get(this);
        if(token.isEmpty()) showLogin(); else showDashboard();
    }
    @Override protected void onResume(){super.onResume(); visible=true; handler.removeCallbacks(refreshLoop); handler.post(refreshLoop); if(dashboard)updateLocalStatus();}
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
        content.addView(text("WIDGETS DE TIKTOK",21,true));
        content.addView(text("Solo TikTok LIVE: chat flotante y alertas originales de GREÑA Live PC. Los demás widgets no están disponibles en esta versión.",14,false));
        button("Activar chat y alertas TikTok flotantes",this::startOverlay);
        button("Configurar alertas",()->openSettings("alerts"));
        button("← Inicio",this::showDashboard);
    }
    private void showMorePanel(){
        dashboard=true;base("Cuenta y conexiones de GREÑA ID");
        content.addView(text("MÁS",21,true));
        button("Vincular mi TikTok LIVE",()->openSettings("channels"));
        button("Diagnóstico TikTok LIVE",this::showTikTokPanel);
        button("Configurar alertas",()->openSettings("alerts"));
        button("Volver al inicio",this::showDashboard);
        button("Cerrar sesión en este teléfono",this::logout);
    }
    private void showTikTokPanel(){
        dashboard=true;
        base("Modo solo TikTok · conexión y alertas");
        content.addView(text("MI TIKTOK LIVE",21,true));
        linkedTikTokView=text("Leyendo TikTok guardado...",16,true);
        linkedTikTokView.setPadding(dp(13),dp(11),dp(13),dp(11));
        linkedTikTokView.setTextColor(Color.rgb(55,232,213));
        linkedTikTokView.setBackground(pill(Color.rgb(14,32,54),Color.rgb(30,182,182),16));
        content.addView(linkedTikTokView);
        connectionView=text("TikTok LIVE · sin conexión confirmada",14,true);
        connectionView.setTextColor(Color.rgb(255,199,143));
        content.addView(connectionView);
        relayStatusView=text("Comprobando receptor TikTok...",13,false);
        relayStatusView.setTextColor(Color.rgb(255,199,143));
        content.addView(relayStatusView);
        content.addView(text("Guardado no significa conectado. El motor confirmará el LIVE cuando pueda acceder a TikTok; si el canal está apagado, podrá permanecer vigilándolo.",13,false));
        button("Vincular o editar TikTok",()->openSettings("channels"));
        button("Comprobar disponibilidad del motor",()->checkRelayStatus(true));
        button("Activar y vigilar mi TikTok LIVE",this::connectTikTok);
        button("Detener vigilancia TikTok",this::disconnectTikTok);
        button("← Inicio",this::showDashboard);
        updateLocalStatus();
        checkRelayStatus(false);
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
        base("Accede con GREÑA ID para usar TikTok LIVE y las alertas GREÑA.");
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
        base("Solo TikTok LIVE · chat flotante y alertas GREÑA");
        content.addView(text("MI TIKTOK LIVE",19,true));
        linkedTikTokView=text("Leyendo tu TikTok vinculado...",16,true);
        linkedTikTokView.setTextColor(Color.rgb(55,235,220));
        linkedTikTokView.setPadding(dp(13),dp(12),dp(13),dp(12));
        linkedTikTokView.setBackground(pill(Color.rgb(17,36,56),Color.rgb(17,176,188),19));
        content.addView(linkedTikTokView);

        relayStatusView=text("Servidor de eventos TikTok: comprobando...",13,false);
        relayStatusView.setTextColor(Color.rgb(255,190,140));
        content.addView(relayStatusView);

        connectionView=text("Estado LIVE: sin confirmar",16,true);
        connectionView.setTextColor(Color.rgb(233,209,167));
        connectionView.setPadding(dp(12),dp(11),dp(12),dp(11));
        connectionView.setBackground(pill(Color.rgb(28,26,66),Color.rgb(109,82,196),15));
        content.addView(connectionView);

        button("🔗 Vincular o cambiar TikTok",()->openSettings("channels"));
        button("🔴 Activar vigilancia TikTok LIVE",this::connectTikTok);
        button("⏹ Desconectar TikTok",this::disconnectTikTok);
        button("Comprobar conexión y receptor",this::showTikTokPanel);

        content.addView(text("CHAT TIKTOK EN VIVO",17,true));
        chatPreview=text("Todavía no se han recibido comentarios reales.",14,false);
        chatPreview.setPadding(dp(12),dp(13),dp(12),dp(13));
        chatPreview.setBackground(pill(Color.rgb(13,33,47),Color.rgb(15,180,182),16));
        content.addView(chatPreview);

        content.addView(text("ALERTAS Y VENTANAS FLOTANTES",17,true));
        button("✨ Plantillas originales GREÑA Live",()->openSettings("alerts"));
        button("Activar ventana flotante",this::startOverlay);
        button("Probar alerta GREÑA (DEMOSTRACIÓN)",this::testAlert);
        button("Detener ventanas flotantes",this::stopOverlay);

        TextView note=text("La app Android se limita a TikTok. Para recibir mensajes y regalos reales, el receptor TikTok debe estar publicado y confirmar un LIVE. No cambia las conexiones de PC.",12,false);
        note.setTextColor(Color.LTGRAY);
        content.addView(note);
        updateLocalStatus();
        checkRelayStatus(false);
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=getPackageManager().PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},3);
        handler.removeCallbacks(refreshLoop);
        if(visible)handler.post(refreshLoop);
    }
    private void updateLocalStatus(){
        if(connectionView!=null)connectionView.setText("Estado LIVE: "+
            getSharedPreferences("grena_mobile_connection_v1",MODE_PRIVATE)
                .getString("status","Todavía no confirmado"));
        if(linkedTikTokView!=null){
            JSONObject cache=MobileSettingsCache.read(this,token,"channels");
            JSONObject stored=cache==null?null:cache.optJSONObject("settings");
            JSONObject tiktok=stored==null?null:stored.optJSONObject("tiktok");
            String url=tiktok==null?"":tiktok.optString("url","");
            String state=tiktok==null?"Sin configurar":tiktok.optBoolean("enabled",false)?"Habilitado":"Desactivado";
            linkedTikTokView.setText(url.isEmpty()?"Ningún TikTok vinculado todavía":
                url+"\nEstado: "+state+" · enlace guardado, LIVE sin verificar");
        }
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
    private void checkRelayStatus(boolean notify){
        if(token.isEmpty())return;
        final String myToken=token;
        if(relayStatusView!=null)relayStatusView.setText("Servidor TikTok LIVE: comprobando...");
        executor.execute(()->{
            String status;
            try{
                JSONObject result=GrenaApi.mobileRelay(myToken);
                if(result.optBoolean("enabled",false)){
                    JSONObject actual=MobileRelayApi.capabilities(myToken);
                    JSONObject tiktok=actual.optJSONObject("platforms")==null?null:
                        actual.optJSONObject("platforms").optJSONObject("tiktok");
                    boolean ready=tiktok!=null&&tiktok.optBoolean("adapterImplemented",false);
                    status=ready?"Receptor TikTok disponible · puedes activar vigilancia":
                        "Servidor accesible, pero el receptor TikTok no está instalado";
                }else{
                    status="Motor TikTok pendiente de activación · el canal solo está guardado";
                }
            }catch(Exception e){
                status="Motor TikTok no disponible · no se pueden detectar transmisiones";
            }
            final String output=status;
            runOnUiThread(()->{
                if(!myToken.equals(token)||!dashboard)return;
                if(relayStatusView!=null)relayStatusView.setText(output);
                if(notify)say(output);
            });
        });
    }
    private void connectTikTok(){
        JSONObject cached=MobileSettingsCache.read(this,token,"channels");
        JSONObject stored=cached==null?null:cached.optJSONObject("settings");
        JSONObject tiktok=stored==null?null:stored.optJSONObject("tiktok");
        final String url=tiktok==null?"":tiktok.optString("url","");
        if(url.isEmpty()||!tiktok.optBoolean("enabled",false)){
            say("Guarda y habilita el enlace en Canales antes de conectar TikTok.");
            openSettings("channels");return;
        }
        if(!Settings.canDrawOverlays(this)){
            say("Necesitas el permiso Mostrar sobre otras apps para recibir alertas flotantes.");
            startOverlay();return;
        }
        final String myToken=token;
        say("Comprobando si el servidor móvil está activado...");
        executor.execute(()->{
            try{
                JSONObject status=GrenaApi.mobileRelay(myToken);
                if(!status.optBoolean("enabled",false)){
                    runOnUiThread(()->say("TikTok LIVE no puede conectarse: el servidor móvil aún no está publicado. Tu enlace sigue guardado."));
                    return;
                }
                runOnUiThread(()->{
                    if(!myToken.equals(token))return;
                    Intent connectIntent=new Intent(this,OverlayService.class);
                    connectIntent.setAction(OverlayService.ACTION_CONNECT_TIKTOK);
                    connectIntent.putExtra("username",url);
                    startForegroundService(connectIntent);
                    say("Solicitando vigilancia TikTok LIVE. Solo se mostrará EN DIRECTO tras confirmar la transmisión.");
                });
            }catch(Exception e){
                runOnUiThread(()->{
                    if(!myToken.equals(token))return;
                    say("TikTok LIVE sin conexión: el servidor móvil todavía no ofrece el servicio de eventos. El canal se guardó, pero no se detecta automáticamente.");
                });
            }
        });
    }
    private void disconnectTikTok(){
        Intent disconnect=new Intent(this,OverlayService.class);
        disconnect.setAction(OverlayService.ACTION_DISCONNECT_TIKTOK);
        startService(disconnect);
        say("Vigilancia TikTok detenida. El botón flotante sigue disponible.");
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
        intent.setAction(OverlayService.ACTION_UPDATE);
        startForegroundService(intent);
        say("Ventana flotante de prueba activada. Regresa al juego: no intercepta los toques.");
    }
}
