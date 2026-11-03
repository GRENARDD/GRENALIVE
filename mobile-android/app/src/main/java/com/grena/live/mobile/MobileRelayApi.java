package com.grena.live.mobile;

import org.json.JSONObject;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.HttpsURLConnection;

/**
 * No embedded relay host or third-party token URL. GREÑA ID returns trusted
 * relay origin only when a verified independent server is explicitly enabled.
 * Never sends credentials, device keys or account secrets in URLs or logs.
 */
final class MobileRelayApi {
    private static volatile String baseUrl="";

    private MobileRelayApi(){}

    static String discover(String token) throws Exception {
        JSONObject response=GrenaApi.mobileRelay(token);
        if(!response.optBoolean("enabled",false))
            throw new Exception(response.optString("reason","Servidor de eventos Android pendiente de activación."));
        String raw=response.optString("baseUrl","");
        URI uri=new URI(raw);
        if(!"https".equalsIgnoreCase(uri.getScheme())||uri.getHost()==null||
                uri.getUserInfo()!=null||uri.getPort()!=-1||uri.getQuery()!=null||
                uri.getFragment()!=null||(!"".equals(uri.getPath())&& !"/".equals(uri.getPath())))
            throw new Exception("El servidor no proporcionó una dirección HTTPS segura.");
        baseUrl=uri.getScheme()+"://"+uri.getHost();
        return baseUrl;
    }

    static JSONObject capabilities(String token) throws Exception {
        discover(token);
        return request("GET","/api/mobile/capabilities",token,null);
    }

    static JSONObject connect(String token,String username) throws Exception {
        if(baseUrl.isEmpty())discover(token);
        JSONObject body=new JSONObject();
        body.put("username",username);
        return request("POST","/api/mobile/connect",token,body);
    }
    static JSONObject events(String token,long after) throws Exception {
        if(baseUrl.isEmpty())throw new Exception("No hay servidor móvil.");
        return request("GET","/api/mobile/events?after="+Math.max(0,after),token,null);
    }
    static JSONObject disconnect(String token) throws Exception {
        if(baseUrl.isEmpty())return new JSONObject().put("ok",true);
        return request("POST","/api/mobile/disconnect",token,new JSONObject());
    }
    static void clear(){baseUrl="";}

    private static JSONObject request(String method,String path,String token,JSONObject data) throws Exception {
        URL url=new URL(baseUrl+path);
        if(!"https".equalsIgnoreCase(url.getProtocol()))throw new Exception("Solo HTTPS.");
        HttpsURLConnection conn=(HttpsURLConnection)url.openConnection();
        conn.setInstanceFollowRedirects(false);
        conn.setConnectTimeout(10_000);
        conn.setReadTimeout(15_000);
        conn.setRequestMethod(method);
        conn.setRequestProperty("Accept","application/json");
        conn.setRequestProperty("Authorization","Bearer "+token);
        if(data!=null){
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type","application/json; charset=utf-8");
            try(OutputStream os=conn.getOutputStream()){
                os.write(data.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        int status=conn.getResponseCode();
        InputStream stream=status<400?conn.getInputStream():conn.getErrorStream();
        byte[] raw;
        try(InputStream in=stream;ByteArrayOutputStream buffer=new ByteArrayOutputStream()){
            if(in!=null){
                byte[] chunk=new byte[4096];int n;
                while((n=in.read(chunk))!=-1){
                    if(buffer.size()+n>262_144)throw new Exception("Respuesta de eventos demasiado grande.");
                    buffer.write(chunk,0,n);
                }
            }
            raw=buffer.toByteArray();
        } finally {conn.disconnect();}
        JSONObject result=new JSONObject(raw.length==0?"{}":new String(raw,StandardCharsets.UTF_8));
        if(status>=300||!result.optBoolean("ok",true))
            throw new Exception(result.optString("error","Servidor móvil HTTP "+status));
        return result;
    }
}
