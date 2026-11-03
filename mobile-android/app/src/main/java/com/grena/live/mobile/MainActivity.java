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
import java.util.LinkedHashMap;
import java.util.Map;
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
    private TextView linkedTikTokView;
    private final Map<String,TextView> platformRows=new LinkedHashMap<>();
    private TextView relayStatusView;
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
        button("Diagnóstico de las cinco plataformas",this::showPlatformsPanel);
        button("Configurar alertas",()->openSettings("alerts"));
        button("Volver al inicio",this::showDashboard);
        button("Cerrar sesión en este teléfono",this::logout);
    }
    private void showPlatformsPanel(){
        dashboard=true;
        base("Verificación real de cinco plataformas · Cloudflare + GREÑA ID");
        platformRows.clear();
        content.addView(text("CONEXIONES DE GREÑA LIVE MOBILE",21,true));
        TextView explanation=text("Enlace guardado NO significa LIVE conectado. Cada plataforma necesita su propio receptor, autorización y confirmación de eventos.",13,false);
        explanation.setTextColor(Color.rgb(220,194,163));
        content.addView(explanation);
        String[] platforms={"tiktok","twitch","kick","youtube","starvios"};
        String[] names={"TikTok","Twitch","Kick","YouTube","Starvios"};
        JSONObject cache=MobileSettingsCache.read(this,token,"channels");
        JSONObject settings=cache==null?null:cache.optJSONObject("settings");
        for(int i=0;i<platforms.length;i++){
            String platform=platforms[i];
            JSONObject channel=settings==null?null:settings.optJSONObject(platform);
            String url=channel==null?"":channel.optString("url","");
            boolean enabled=channel!=null&&channel.optBoolean("enabled",false);
            String label=names[i]+"\n"+
                (url.isEmpty()?"No vinculado":url)+"\n"+
                (url.isEmpty()?"Estado: falta canal":enabled?
                "Estado: enlace guardado · LIVE sin verificar":"Estado: canal desactivado");
            TextView card=text(label,14,true);
            card.setPadding(dp(13),dp(11),dp(13),dp(11));
            card.setBackground(pill(Color.rgb(19,26,52),Color.rgb(90,75,169),16));
            LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,-2);
            lp.topMargin=dp(9);
            content.addView(card,lp);
            platformRows.put(platform,card);
        }
        button("Comprobar receptores y permisos",this::checkPlatformEngines);
        button("Vincular / editar canales",()->openSettings("channels"));
        button("Conectar TikTok (cuando el servidor esté activo)",this::connectTikTok);
        button("← Inicio",this::showDashboard);
        checkPlatformEngines();
    }
    private void checkPlatformEngines(){
        if(token.isEmpty())return;
        final String activeToken=token;
        say("Comprobando servicios de eventos móviles...");
        executor.execute(()->{
            try{
                JSONObject data=MobileRelayApi.capabilities(activeToken);
                JSONObject all=data.optJSONObject("platforms");
                runOnUiThread(()->{
                    if(!activeToken.equals(token))return;
                    for(Map.Entry<String,TextView> entry:platformRows.entrySet()){
                        JSONObject config=all==null?null:all.optJSONObject(entry.getKey());
                        boolean hasAdapter=config!=null&&config.optBoolean("adapterImplemented",false);
                        boolean confirmed=config!=null&&config.optBoolean("liveConfirmed",false);
                        String next=confirmed?"LIVE confirmado por el receptor":
                            hasAdapter?"Receptor instalado; LIVE todavía no confirmado":
                            "RECEPTOR NO IMPLEMENTADO · falta integración real";
                        TextView card=entry.getValue();
                        String original=card.getText().toString();
                        int idx=original.indexOf("\nReceptor:");
                        if(idx>=0)original=original.substring(0,idx);
                        card.setText(original+"\nReceptor: "+next);
                        card.setTextColor(confirmed?Color.rgb(77,237,184):Color.WHITE);
                    }
                    say("Estado del servidor actualizado. Solo LIVE confirmado es conexión real.");
                });
            }catch(Exception e){
                runOnUiThread(()->{
                    if(!activeToken.equals(token))return;
                    say("Sin receptor central activo. Configurar canales NO detecta un LIVE.");
                    for(TextView card:platformRows.values()){
                        String original=card.getText().toString();
                        int idx=original.indexOf("\nReceptor:");
                        if(idx>=0)original=original.substring(0,idx);
                        card.setText(original+"\nReceptor: NO DISPONIBLE en Cloudflare");
                    }
                });
            }
        });
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
        base("Panel Android · transmisiones propias y comunidad se consultan por separado.");
        content.addView(text("MI TIKTOK VINCULADO",16,true));
        linkedTikTokView=text("Leyendo canal guardado...",15,true);
        linkedTikTokView.setTextColor(Color.rgb(64,224,210));
        linkedTikTokView.setPadding(dp(12),dp(10),dp(12),dp(10));
        linkedTikTokView.setBackground(pill(Color.rgb(15,31,51),Color.rgb(24,147,163),15));
        content.addView(linkedTikTokView);
        relayStatusView=text("Servidor TikTok LIVE: verificando disponibilidad...",13,false);
        relayStatusView.setTextColor(Color.rgb(245,184,132));
        content.addView(relayStatusView);
        content.addView(text("COMUNIDAD GREÑA · transmisiones compartidas",16,true));
        communityView=text("Consultando transmisiones de la comunidad...",14,false);
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
        button("Actualizar transmisiones de la comunidad",this::refreshCommunity);
        button("Comprobar conexión TikTok",()->checkRelayStatus(true));
        button("✨ Configurar alertas",()->openSettings("alerts"));
        button("🔗 Vincular y configurar canales",()->openSettings("channels"));
        button("🔴 Conectar TikTok LIVE",this::connectTikTok);
        button("Ver estado de TikTok, Twitch, Kick, YouTube y Starvios",this::showPlatformsPanel);
        button("⏹ Desconectar TikTok LIVE",this::disconnectTikTok);
        connectionView=text("TikTok LIVE: "+
            getSharedPreferences("grena_mobile_connection_v1",MODE_PRIVATE)
                .getString("status","Sin conexión confirmada"),13,true);
        connectionView.setTextColor(Color.rgb(115,229,207));content.addView(connectionView);
        updateLocalStatus();
        checkRelayStatus(false);
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
                    status="Servidor móvil configurado · pulsa Conectar TikTok LIVE";
                }else{
                    status="Servidor móvil no activado · los LIVE vinculados no se detectan";
                }
            }catch(Exception e){
                status="Servidor móvil no disponible · detector TikTok pendiente de activación";
            }
            final String output=status;
            runOnUiThread(()->{
                if(!myToken.equals(token)||!dashboard)return;
                if(relayStatusView!=null)relayStatusView.setText(output);
                if(notify)say(output);
            });
        });
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
                sb.append("COMUNIDAD EN VIVO (").append(count).append(")\n")
                    .append("Usuarios conectados a GREÑA: ").append(data.optInt("usersOnline",0)).append("\n")
                    .append("Espectadores de transmisiones compartidas: ").append(data.optInt("totalViewers",0)).append("\n\n");
                if(users.length()==0)sb.append("Nadie comparte un LIVE en la comunidad. Esto NO indica si tu TikTok vinculado está en directo.");
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
                    say("Solicitando conexión TikTok. Se confirmará solamente cuando el LIVE se conecte realmente.");
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
