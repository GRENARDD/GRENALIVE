package com.grena.live.mobile;

import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** Read-only community client plus GREÑA ID login; never submits LIVE presence. */
final class GrenaApi {
    static final String BASE = "https://grena-live-licenses.omelicolon18.workers.dev";
    private GrenaApi() {}

    static JSONObject login(String username, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("username", username); body.put("password", password);
        return call("POST", "/api/license/identity/login", "", body);
    }
    static JSONObject community(String token) throws Exception {
        return call("GET", "/api/license/community", token, null);
    }
    static JSONObject readMobileSettings(String token, String section) throws Exception {
        if(!"alerts".equals(section)&&!"channels".equals(section))throw new Exception("Sección inválida.");
        return call("GET", "/api/license/mobile-settings?section=" + section, token, null);
    }
    static JSONObject writeMobileSettings(String token, String section, int revision, JSONObject settings) throws Exception {
        if(!"alerts".equals(section)&&!"channels".equals(section))throw new Exception("Sección inválida.");
        JSONObject payload=new JSONObject();
        payload.put("revision",revision);
        payload.put("settings",settings);
        return call("POST", "/api/license/mobile-settings?section=" + section, token, payload);
    }
    private static JSONObject call(String method, String path, String token, JSONObject body) throws Exception {
        HttpURLConnection conn = (HttpURLConnection)new URL(BASE + path).openConnection();
        conn.setRequestMethod(method);
        conn.setConnectTimeout(10000); conn.setReadTimeout(15000);
        conn.setRequestProperty("Accept", "application/json");
        if (token != null && !token.isEmpty()) conn.setRequestProperty("Authorization", "Bearer " + token);
        if (body != null) {
            conn.setDoOutput(true);
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = conn.getResponseCode();
        InputStream is = status < 400 ? conn.getInputStream() : conn.getErrorStream();
        String raw;
        try (InputStream stream = is) {
            if (stream == null) raw = "{}";
            else {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[4096]; int n;
                while ((n = stream.read(chunk)) != -1) buffer.write(chunk, 0, n);
                raw = new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            }
        } finally { conn.disconnect(); }
        JSONObject result = new JSONObject(raw.isEmpty() ? "{}" : raw);
        if (status >= 400 || !result.optBoolean("ok", true)) {
            throw new ApiException(status, result.optString("error", "Error del servidor (HTTP " + status + ")"));
        }
        return result;
    }
    static final class ApiException extends Exception {
        final int status;
        ApiException(int status, String message) { super(message); this.status=status; }
    }
}
