package com.grena.live.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Session token only. Credentials are never stored. Android Keystore AES/GCM. */
final class SecureSession {
    private static final String ALIAS = "grena_mobile_session_aes_v1";
    private static final String PREF = "grena_mobile_auth_v1";
    private static final String KEY = "session";

    private SecureSession() {}
    private static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
        return generator.generateKey();
    }
    static void put(Context ctx, String token) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] payload = cipher.doFinal(token.getBytes(StandardCharsets.UTF_8));
        String value = Base64.encodeToString(iv, Base64.NO_WRAP) + "." +
            Base64.encodeToString(payload, Base64.NO_WRAP);
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().putString(KEY, value).apply();
    }
    static String get(Context ctx) {
        SharedPreferences prefs = ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE);
        String saved = prefs.getString(KEY, "");
        try {
            String[] parts = saved.split("\\.", -1);
            if (parts.length != 2) return "";
            byte[] iv = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] cipherText = Base64.decode(parts[1], Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, iv));
            return new String(cipher.doFinal(cipherText), StandardCharsets.UTF_8);
        } catch (Exception ignored) { clear(ctx); return ""; }
    }
    static void clear(Context ctx) {
        ctx.getSharedPreferences(PREF, Context.MODE_PRIVATE).edit().remove(KEY).apply();
    }
}
