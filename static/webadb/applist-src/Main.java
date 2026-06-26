import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.content.res.Resources;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.os.UserHandle;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.List;

/**
 * Dumps installed-app metadata, read straight from the framework PackageManager
 * inside ART via app_process — no per-APK pull, no aapt.
 *
 *   CLASSPATH=/data/local/tmp/applist.dex app_process / Main [icons] [userId]
 *
 * labels: one line per app, tab-separated  package \t label \t version \t system
 * icons:  one line per app, tab-separated  package \t base64-png   (96x96)
 *
 * Optional userId (default 0) targets a specific profile (e.g. the work
 * profile) via createContextAsUser — shell holds INTERACT_ACROSS_USERS_FULL.
 *
 * Uses ActivityThread (hidden API, via reflection) to obtain a system Context,
 * then the public PackageManager. getApplicationIcon() rasterizes adaptive
 * icons correctly, which APK parsing cannot.
 */
public class Main {
    private static final int ICON_PX = 96;

    public static void main(String[] args) {
        try {
            boolean iconsMode = false;
            int userId = 0;
            for (String a : args) {
                if ("icons".equals(a)) iconsMode = true;
                else if ("labels".equals(a)) iconsMode = false;
                else { try { userId = Integer.parseInt(a); } catch (NumberFormatException ignored) {} }
            }

            Looper.prepareMainLooper();
            Class<?> at = Class.forName("android.app.ActivityThread");
            Method systemMain = at.getMethod("systemMain");
            Object thread = systemMain.invoke(null);
            Method getSystemContext = at.getMethod("getSystemContext");
            Context ctx = (Context) getSystemContext.invoke(thread);
            if (userId != 0) {
                // Target another profile's PackageManager (API 30+).
                // UserHandle.of(int) is hidden, so reach it via reflection.
                Class<?> uh = Class.forName("android.os.UserHandle");
                UserHandle handle = (UserHandle) uh.getMethod("of", int.class).invoke(null, userId);
                ctx = (Context) Context.class
                    .getMethod("createContextAsUser", UserHandle.class, int.class)
                    .invoke(ctx, handle, 0);
            }
            PackageManager pm = ctx.getPackageManager();
            List<ApplicationInfo> apps = pm.getInstalledApplications(0);
            StringBuilder sb = new StringBuilder(apps.size() * (iconsMode ? 4096 : 48));

            for (ApplicationInfo ai : apps) {
                if (iconsMode) {
                    String b64 = iconBase64(pm, ai);
                    if (b64.isEmpty()) continue;
                    sb.append(ai.packageName).append('\t').append(b64).append('\n');
                } else {
                    String label;
                    try { label = String.valueOf(pm.getApplicationLabel(ai)); }
                    catch (Throwable t) { label = ai.packageName; }

                    String ver = "";
                    try {
                        PackageInfo pi = pm.getPackageInfo(ai.packageName, 0);
                        if (pi.versionName != null) ver = pi.versionName;
                    } catch (Throwable ignored) {}

                    int sys = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 ? 1 : 0;
                    label = label.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ');
                    sb.append(ai.packageName).append('\t')
                      .append(label).append('\t')
                      .append(ver).append('\t')
                      .append(sys).append('\n');
                }
                // Flush periodically to bound memory on large icon dumps.
                if (sb.length() > (1 << 20)) { System.out.print(sb); sb.setLength(0); }
            }
            System.out.print(sb);
            System.out.flush();
        } catch (Throwable t) {
            System.err.println("applist error: " + t);
        }
        System.exit(0);   // app_process would otherwise block on the looper
    }

    private static String iconBase64(PackageManager pm, ApplicationInfo ai) {
        Drawable d = null;
        // Preferred path.
        try { d = pm.getApplicationIcon(ai); } catch (Throwable ignored) {}
        // Cross-user fallback: load the APK's own resources directly (works
        // even when getApplicationIcon fails in a createContextAsUser context).
        if (d == null && ai.icon != 0) {
            try {
                Resources res = pm.getResourcesForApplication(ai);
                d = res.getDrawableForDensity(ai.icon, 480 /* xxhdpi */, null);
            } catch (Throwable ignored) {}
        }
        if (d == null) return "";
        try {
            Bitmap bmp = Bitmap.createBitmap(ICON_PX, ICON_PX, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, ICON_PX, ICON_PX);
            d.draw(c);
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, baos);
            bmp.recycle();
            return Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
        } catch (Throwable t) {
            return "";
        }
    }
}
