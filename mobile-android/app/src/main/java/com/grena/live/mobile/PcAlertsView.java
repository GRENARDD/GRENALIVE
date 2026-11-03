package com.grena.live.mobile;

import android.content.Context;
import android.graphics.Color;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;

/**
 * Exact GREÑA Live PC AFTERGLOW renderer, packaged under app assets.
 * Android provides authenticated, sanitized event payloads and settings.
 * This WebView never connects to PC localhost /api or /ws.
 * Assets are served only from the app package over a fake HTTPS origin to support
 * original absolute /assets references, same-origin iframe events, and CSS.
 */
public final class PcAlertsView extends WebView {
    private static final String ASSET_HOST="appassets.androidplatform.net";
    private static final String BASE_URL="https://"+ASSET_HOST+"/afterglow-overlay.html?layout=vertical";
    private final Deque<String> waiting=new ArrayDeque<>();
    private boolean ready=false;

    public PcAlertsView(Context context){
        super(context);
        setBackgroundColor(Color.TRANSPARENT);
        setLayerType(LAYER_TYPE_HARDWARE,null);
        WebSettings settings=getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        setWebViewClient(new WebViewClient(){
            @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
                return !ASSET_HOST.equalsIgnoreCase(request.getUrl().getHost());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){
                Uri uri=req.getUrl();
                if(!ASSET_HOST.equalsIgnoreCase(uri.getHost()))return null;
                final String path=uri.getPath();
                if(path==null||!path.startsWith("/")||path.contains("..")||
                        !path.matches("/[A-Za-z0-9_./-]+")){
                    return response("text/plain",new byte[0]);
                }
                try{
                    InputStream input=getContext().getAssets().open("pc-alerts"+path);
                    return new WebResourceResponse(mime(path),"UTF-8",input);
                }catch(Exception ignored){return response("text/plain",new byte[0]);}
            }
            @Override public void onPageFinished(WebView web,String url){
                ready=true;
                while(!waiting.isEmpty())evaluateJavascript(waiting.removeFirst(),null);
            }
        });
        loadUrl(BASE_URL);
    }
    private static WebResourceResponse response(String mime,byte[] data){
        return new WebResourceResponse(mime,"UTF-8",new java.io.ByteArrayInputStream(data));
    }
    private static String mime(String path){
        String p=path.toLowerCase(Locale.ROOT);
        if(p.endsWith(".js"))return "application/javascript";
        if(p.endsWith(".css"))return "text/css";
        if(p.endsWith(".svg"))return "image/svg+xml";
        if(p.endsWith(".png"))return "image/png";
        if(p.endsWith(".jpg")||p.endsWith(".jpeg"))return "image/jpeg";
        if(p.endsWith(".webp"))return "image/webp";
        if(p.endsWith(".gif"))return "image/gif";
        if(p.endsWith(".mp3"))return "audio/mpeg";
        if(p.endsWith(".wav"))return "audio/wav";
        if(p.endsWith(".html"))return "text/html";
        if(p.endsWith(".json"))return "application/json";
        return "application/octet-stream";
    }
    private void script(String script){
        if(ready)evaluateJavascript(script,null);
        else if(waiting.size()<20)waiting.addLast(script);
    }
    public void configure(JSONObject settings){
        if(settings==null)settings=new JSONObject();
        script("window.GRENA_ANDROID_SETTINGS&&window.GRENA_ANDROID_SETTINGS("+settings.toString()+");");
    }
    public void play(JSONObject event){
        if(event==null)return;
        script("window.GRENA_ANDROID_ENQUEUE&&window.GRENA_ANDROID_ENQUEUE("+event.toString()+");");
    }
    @Override public void destroy(){
        waiting.clear();
        ready=false;
        super.destroy();
    }
}
