package com.grena.live.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

/**
 * Only public channel URLs and alert appearance settings are cached on-device.
 * No bearer tokens, OAuth secrets, password, Fish keys, or data from other users.
 * The cache is partitioned by a one-way digest of the per-device GREÑA ID session.
 */
final class MobileSettingsCache {
    private static final String PREFS="grena_mobile_settings_v1";

    private MobileSettingsCache(){}

    private static String key(String token,String section) throws Exception {
        MessageDigest md=MessageDigest.getInstance("SHA-256");
        byte[] bytes=md.digest(token.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex=new StringBuilder();
        for(int i=0;i<16;i++)hex.append(String.format(java.util.Locale.ROOT,"%02x",bytes[i]&255));
        return section+":"+hex;
    }
    static JSONObject read(Context ctx,String token,String section) {
        try {
            String raw=ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
                .getString(key(token,section),"");
            return raw.isEmpty()?null:new JSONObject(raw);
        } catch(Exception ignored){return null;}
    }
    static void write(Context ctx,String token,String section,JSONObject settings,int revision,boolean pending) {
        try {
            JSONObject content=new JSONObject();
            content.put("settings",settings);
            content.put("revision",revision);
            content.put("pending",pending);
            content.put("savedAt",System.currentTimeMillis());
            ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE)
                .edit().putString(key(token,section),content.toString()).apply();
        } catch(Exception ignored){}
    }
    static void clear(Context ctx,String token) {
        SharedPreferences.Editor e=ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit();
        try {
            e.remove(key(token,"alerts"));
            e.remove(key(token,"channels"));
            e.apply();
        } catch(Exception ignored){}
    }
}
