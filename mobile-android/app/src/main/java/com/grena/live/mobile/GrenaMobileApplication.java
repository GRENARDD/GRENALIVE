package com.grena.live.mobile;

import android.app.Activity;
import android.app.Application;
import android.os.Bundle;

/**
 * Tracks whether any GREÑA Activity is visible. Floating windows must only
 * appear above games/other apps, not cover our own controls in landscape mode.
 */
public final class GrenaMobileApplication extends Application {
    private static volatile boolean screenVisible=false;
    private int started=0;

    static boolean isScreenVisible(){return screenVisible;}

    @Override public void onCreate(){
        super.onCreate();
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks(){
            @Override public void onActivityStarted(Activity activity){
                started++;
                if(!screenVisible){
                    screenVisible=true;
                    OverlayService.refreshForActivityVisibility();
                }
            }
            @Override public void onActivityStopped(Activity activity){
                started=Math.max(0,started-1);
                if(started==0){
                    screenVisible=false;
                    OverlayService.refreshForActivityVisibility();
                }
            }
            @Override public void onActivityCreated(Activity a, Bundle b){}
            @Override public void onActivityResumed(Activity a){}
            @Override public void onActivityPaused(Activity a){}
            @Override public void onActivitySaveInstanceState(Activity a, Bundle b){}
            @Override public void onActivityDestroyed(Activity a){}
        });
    }
}
