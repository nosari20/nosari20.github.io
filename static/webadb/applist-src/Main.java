import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.os.Looper;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.lang.reflect.Method;
import java.util.List;

/**
 * Dumps installed-app metadata, read straight from the framework PackageManager
 * inside ART via app_process — no per-APK pull, no aapt.
 *
 *   CLASSPATH=/data/local/tmp/applist.dex app_process / Main          (labels)
 *   CLASSPATH=/data/local/tmp/applist.dex app_process / Main icons    (icons)
 *
 * labels: one line per app, tab-separated  package \t label \t version \t system
 * icons:  one line per app, tab-separated  package \t base64-png   (96x96)
 *
 * Uses ActivityThread (hidden API, via reflection) to obtain a system Context,
 * then the public PackageManager. getApplicationIcon() rasterizes adaptive
 * icons correctly, which APK parsing cannot.
 */
public class Main {
    private static final int ICON_PX = 96;

    public static void main(String[] args) {
        try {
            Looper.prepareMainLooper();
            Class<?> at = Class.forName("android.app.ActivityThread");
            Method systemMain = at.getMethod("systemMain");
            Object thread = systemMain.invoke(null);
            Method getSystemContext = at.getMethod("getSystemContext");
            Context ctx = (Context) getSystemContext.invoke(thread);
            PackageManager pm = ctx.getPackageManager();

            boolean iconsMode = args.length > 0 && "icons".equals(args[0]);
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
        try {
            Drawable d = pm.getApplicationIcon(ai);
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
