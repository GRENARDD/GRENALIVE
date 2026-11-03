package com.grena.live.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.SeekBar;
import android.widget.Spinner;
import android.widget.ArrayAdapter;
import android.widget.TextView;
import org.json.JSONObject;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Android-native screens inside GREÑA Live Mobile.
 * A central GREÑA ID token protects each settings request. No passwords or OAuth secrets here.
 * Stored channel URLs identify public pages; actual OAuth/events require a later authorized connector.
 */
public final class SettingsActivity extends Activity {
    private static final int BACKGROUND=Color.rgb(12,15,27);
    private static final int PURPLE=Color.rgb(188,164,255);
    private static final int PANEL=Color.rgb(28,33,54);
    private static final String[] PLATFORMS={"tiktok","twitch","kick","youtube","starvios"};
    private static final String[] PLATFORM_NAMES={"TikTok","Twitch","Kick","YouTube","Starvios"};
    private static final String[] EVENTS={"follow","gift","sub","raid","share","likes"};
    private static final String[] EVENT_NAMES={"Seguidores","Regalos","Suscripciones","Raids","Compartidos","Tap Tap"};

    private static final String[] THEMES={
        "minecraft","domino","grena_grenito","grena_mascots","grena_catalog","grena_fullscreen",
        "ascension","celestial","sakura","comic","hologram","inferno","arcade","royal","void"
    };
    private static final String[] THEME_NAMES={
        "Minecraft Pixelcraft","Dominó","GREÑITO · Ajolote Mágico","Personajes Pixel",
        "Catálogo Premium","Pantalla completa","Ascensión Premium","Celestial","Sakura",
        "Cómic","Holográfico","Inferno","Arcade","Royal","Void"
    };
    private static final String[] ROUTES={"both","vertical","horizontal","muted"};
    private static final String[] ROUTE_NAMES={"Vertical y horizontal","Solo vertical","Solo horizontal","Silenciado"};
    private static final String[] CHARACTERS={"zp","pg","bm","sk","dg"};
    private static final String[] CHARACTER_NAMES={"Zorro Pixel","Cerdito Cúbico","Verdecito","Esqueleto","Dragón"};
    private static final String[] FONTS={"Inter","Segoe UI","Arial","Impact","Trebuchet MS"};

    private final ExecutorService executor=Executors.newSingleThreadExecutor();
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Map<String,CheckBox> eventChecks=new LinkedHashMap<>();
    private final Map<String,EditText> channelFields=new LinkedHashMap<>();
    private final Map<String,CheckBox> channelChecks=new LinkedHashMap<>();

    private LinearLayout body;
    private TextView message;
    private Button save;
    private JSONObject snapshot=new JSONObject();
    private String token="";
    private String section="alerts";
    private int revision=-1;
    private Spinner theme,character,route,font,accentMode;
    private SeekBar intensity,volume;
    private TextView intensityLabel,volumeLabel;
    private EditText textColor,accentColor;
    private CheckBox soundEnabled;
    private boolean requestBusy=false;

    @Override public void onCreate(Bundle state){
        super.onCreate(state);
        token=SecureSession.get(this);
        section="channels".equals(getIntent().getStringExtra("section"))?"channels":"alerts";
        if(token.isEmpty()){finish();return;}
        build();
        refresh();
    }
    @Override public void onDestroy(){
        executor.shutdownNow();
        super.onDestroy();
    }
    private int dp(float v){return(int)(v*getResources().getDisplayMetrics().density+0.5f);}
    private TextView title(String text,int size,boolean bold){
        TextView t=new TextView(this);
        t.setText(text);t.setTextSize(size);t.setTextColor(Color.WHITE);
        if(bold)t.setTypeface(null,Typeface.BOLD);
        t.setPadding(0,dp(5),0,dp(8));
        return t;
    }
    private void addSpace(int height){
        View v=new View(this);
        body.addView(v,new LinearLayout.LayoutParams(1,dp(height)));
    }
    private Button button(String title,View.OnClickListener action){
        Button b=new Button(this);b.setText(title);b.setAllCaps(false);
        b.setOnClickListener(action);
        LinearLayout.LayoutParams lp=new LinearLayout.LayoutParams(-1,dp(51));lp.topMargin=dp(6);
        body.addView(b,lp);return b;
    }
    private Spinner menu(String label,String[] values){
        body.addView(title(label,14,true));
        Spinner spinner=new Spinner(this);
        ArrayAdapter<String> adapter=new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,values);
        spinner.setAdapter(adapter);
        spinner.setBackgroundTintList(android.content.res.ColorStateList.valueOf(PURPLE));
        body.addView(spinner,new LinearLayout.LayoutParams(-1,dp(52)));
        return spinner;
    }
    private CheckBox toggle(String label){
        CheckBox b=new CheckBox(this);b.setText(label);b.setTextSize(14);b.setTextColor(Color.WHITE);
        b.setButtonTintList(android.content.res.ColorStateList.valueOf(PURPLE));
        body.addView(b,new LinearLayout.LayoutParams(-1,dp(49)));
        return b;
    }
    private EditText input(String title,String hint){
        body.addView(title(title,14,true));
        EditText field=new EditText(this);
        field.setSingleLine(true);field.setTextColor(Color.WHITE);
        field.setHintTextColor(Color.LTGRAY);field.setHint(hint);
        body.addView(field,new LinearLayout.LayoutParams(-1,dp(53)));
        return field;
    }
    private SeekBar range(String title,boolean isIntensity){
        TextView label=title(title,14,true);
        body.addView(label);
        if(isIntensity)intensityLabel=label;else volumeLabel=label;
        SeekBar bar=new SeekBar(this);bar.setMax(100);
        bar.setProgressTintList(android.content.res.ColorStateList.valueOf(PURPLE));
        body.addView(bar,new LinearLayout.LayoutParams(-1,dp(47)));
        bar.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener(){
            @Override public void onProgressChanged(SeekBar seek,int value,boolean user){
                label.setText(title+" · "+value+"%");
            }
            @Override public void onStartTrackingTouch(SeekBar seek){}
            @Override public void onStopTrackingTouch(SeekBar seek){}
        });
        return bar;
    }
    private void build(){
        ScrollView scroll=new ScrollView(this);
        scroll.setFillViewport(true);scroll.setBackgroundColor(BACKGROUND);
        body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(dp(18),dp(24),dp(18),dp(35));
        scroll.addView(body);
        setContentView(scroll);
        TextView header=title("GREÑA LIVE · ANDROID",23,true);
        header.setTextColor(PURPLE);body.addView(header);
        body.addView(title("channels".equals(section)?"🔗 Vincular y configurar canales":"✨ Configurar alertas",21,true));
        TextView info=title("Tus cambios se guardan en GREÑA ID. Los enlaces públicos no conceden acceso OAuth ni activan eventos automáticamente.",12,false);
        info.setTextColor(Color.LTGRAY);body.addView(info);
        message=title("Conectando...",13,false);
        message.setTextColor(Color.rgb(144,220,241));body.addView(message);
        if("alerts".equals(section))buildAlerts();else buildChannels();
        addSpace(12);
        save=button("💾 Guardar en GREÑA ID",v->save());
        save.setEnabled(false);
        button("↻ Recargar desde GREÑA ID",v->new AlertDialog.Builder(this)
            .setMessage("¿Descartar cambios sin guardar y cargar la configuración del servidor?")
            .setNegativeButton("Cancelar",null)
            .setPositiveButton("Recargar",(dialog,which)->refresh()).show());
        button("← Regresar al panel",v->finish());
    }
    private void buildAlerts(){
        theme=menu("Plantilla de alerta",THEME_NAMES);
        character=menu("Personaje de Mascot Alerts",CHARACTER_NAMES);
        intensity=range("Intensidad de animación",true);
        volume=range("Volumen de alertas",false);
        soundEnabled=toggle("Reproducir sonido de alertas");
        route=menu("Salida de audio del overlay",ROUTE_NAMES);
        body.addView(title("Sonidos por tipo de alerta",17,true));
        for(int i=0;i<EVENTS.length;i++)eventChecks.put(EVENTS[i],toggle(EVENT_NAMES[i]));
        font=menu("Tipografía",FONTS);
        accentMode=menu("Color principal",new String[]{"Colores por plataforma","Color personalizado"});
        textColor=input("Color del texto (hexadecimal)","#ffffff");
        accentColor=input("Color personalizado (hexadecimal)","#caff5f");
        TextView note=title("La vista de las animaciones completas se mostrará cuando el motor de eventos móvil esté conectado. No se alteran las alertas actuales de tu PC desde esta versión de prueba.",12,false);
        note.setTextColor(Color.LTGRAY);body.addView(note);
    }
    private void buildChannels(){
        TextView explanation=title("Introduce el usuario o el enlace público del canal. GREÑA lo guardará en tu cuenta. Para leer chat, seguidores y regalos reales todavía se necesita la conexión autorizada de cada plataforma.",13,false);
        explanation.setTextColor(Color.rgb(206,207,225));body.addView(explanation);
        for(int i=0;i<PLATFORMS.length;i++){
            String platform=PLATFORMS[i];
            addSpace(10);
            TextView platformName=title(PLATFORM_NAMES[i],17,true);
            platformName.setTextColor(PURPLE);body.addView(platformName);
            EditText url=input("Canal o enlace de "+PLATFORM_NAMES[i],"@usuario o https://...");
            CheckBox enabled=toggle("Usar este canal cuando el conector esté disponible");
            channelFields.put(platform,url);
            channelChecks.put(platform,enabled);
        }
    }
    private void setBusy(boolean value){
        requestBusy=value;
        if(save!=null)save.setEnabled(!value&&revision>=0);
    }
    private void showMessage(String text){if(message!=null)message.setText(text);}
    private static int choose(String[] values,String selected){
        for(int i=0;i<values.length;i++)if(values[i].equals(selected))return i;
        return 0;
    }
    private static String trimmed(EditText input){return input.getText().toString().trim();}
    private void populate(JSONObject saved){
        snapshot=saved;
        if("alerts".equals(section)){
            theme.setSelection(choose(THEMES,saved.optString("theme","minecraft")));
            character.setSelection(choose(CHARACTERS,saved.optString("mascotCharacter","zp")));
            intensity.setProgress(saved.optInt("intensity",65));
            volume.setProgress(saved.optInt("volume",54));
            soundEnabled.setChecked(saved.optBoolean("soundEnabled",true));
            route.setSelection(choose(ROUTES,saved.optString("audioRoute","both")));
            font.setSelection(choose(FONTS,saved.optString("fontFamily","Inter")));
            accentMode.setSelection("custom".equals(saved.optString("accentMode","platform"))?1:0);
            textColor.setText(saved.optString("textColor","#ffffff"));
            accentColor.setText(saved.optString("accent","#caff5f"));
            JSONObject sounds=saved.optJSONObject("sounds");
            for(Map.Entry<String,CheckBox> event:eventChecks.entrySet())
                event.getValue().setChecked(sounds==null||sounds.optBoolean(event.getKey(),true));
        }else{
            for(String platform:PLATFORMS){
                JSONObject c=saved.optJSONObject(platform);
                String url=c==null?"":c.optString("url","");
                channelFields.get(platform).setText(url);
                channelChecks.get(platform).setChecked(c!=null&&c.optBoolean("enabled",true));
            }
        }
    }
    private void refresh(){
        if(requestBusy)return;
        setBusy(true);showMessage("Leyendo ajustes compartidos...");
        final String requestToken=token;
        executor.execute(()->{
            try{
                JSONObject response=GrenaApi.readMobileSettings(requestToken,section);
                JSONObject data=response.optJSONObject("settings");
                if(data==null)data=new JSONObject();
                final JSONObject result=data;
                final int rev=response.optInt("revision",0);
                runOnUiThread(()->{
                    if(isFinishing()||!token.equals(requestToken))return;
                    revision=rev;populate(result);setBusy(false);
                    showMessage("✓ Ajustes cargados · revisión "+revision);
                });
            }catch(Exception e){runOnUiThread(()->{
                setBusy(false);showMessage("No se pudo leer del servidor: "+e.getMessage());
            });}
        });
    }
    private static String color(String value) throws Exception{
        if(!value.matches("(?i)#[0-9a-f]{6}"))throw new Exception("Escribe colores como #ffffff.");
        return value;
    }
    private static String channelUrl(String platform,String input) throws Exception{
        if(input.isEmpty())return "";
        String value=input;
        if(!input.contains("://")&&!input.contains("/")){
            String handle=input.replaceFirst("^@","");
            if(!handle.matches("[A-Za-z0-9_.-]{2,64}"))throw new Exception("Usuario inválido para "+platform+".");
            switch(platform){
                case "tiktok":value="https://www.tiktok.com/@"+handle+"/live";break;
                case "twitch":value="https://www.twitch.tv/"+handle;break;
                case "kick":value="https://kick.com/"+handle;break;
                case "youtube":value="https://www.youtube.com/@"+handle+"/live";break;
                case "starvios":value="https://www.starvios.com/"+handle;break;
                default:throw new Exception("Plataforma desconocida.");
            }
        }
        if(!value.startsWith("https://"))throw new Exception("Usa enlaces HTTPS para "+platform+".");
        return value;
    }
    private JSONObject collect() throws Exception{
        JSONObject data=new JSONObject();
        if("alerts".equals(section)){
            data.put("theme",THEMES[theme.getSelectedItemPosition()]);
            data.put("mascotCharacter",CHARACTERS[character.getSelectedItemPosition()]);
            data.put("intensity",intensity.getProgress());
            data.put("volume",volume.getProgress());
            data.put("soundEnabled",soundEnabled.isChecked());
            data.put("audioRoute",ROUTES[route.getSelectedItemPosition()]);
            JSONObject sounds=new JSONObject();
            for(Map.Entry<String,CheckBox> e:eventChecks.entrySet())sounds.put(e.getKey(),e.getValue().isChecked());
            data.put("sounds",sounds);
            data.put("fontFamily",FONTS[font.getSelectedItemPosition()]);
            data.put("accentMode",accentMode.getSelectedItemPosition()==1?"custom":"platform");
            data.put("textColor",color(trimmed(textColor)));
            data.put("accent",color(trimmed(accentColor)));
        }else{
            for(String platform:PLATFORMS){
                String url=channelUrl(platform,trimmed(channelFields.get(platform)));
                if(url.isEmpty())continue;
                JSONObject entry=new JSONObject();
                entry.put("url",url);entry.put("enabled",channelChecks.get(platform).isChecked());
                data.put(platform,entry);
            }
        }
        return data;
    }
    private void save(){
        if(requestBusy||revision<0)return;
        final JSONObject outgoing;
        try{outgoing=collect();}
        catch(Exception e){showMessage("Corrige los datos: "+e.getMessage());return;}
        final int expectedRevision=revision;
        final String requestToken=token;
        setBusy(true);showMessage("Guardando ajustes en GREÑA ID...");
        executor.execute(()->{
            try{
                JSONObject response=GrenaApi.writeMobileSettings(requestToken,section,expectedRevision,outgoing);
                JSONObject persisted=response.optJSONObject("settings");
                final JSONObject result=persisted==null?outgoing:persisted;
                final int nextRevision=response.optInt("revision",expectedRevision+1);
                runOnUiThread(()->{
                    if(isFinishing()||!token.equals(requestToken))return;
                    revision=nextRevision;populate(result);setBusy(false);
                    showMessage("✓ Guardado en GREÑA ID · revisión "+nextRevision);
                });
            }catch(Exception e){runOnUiThread(()->{
                setBusy(false);showMessage("No se guardó: "+e.getMessage()+". Recarga si hubo cambios en otro dispositivo.");
            });}
        });
    }
}
