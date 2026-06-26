import android.content.Context;
import android.content.Intent;
import android.content.RestrictionEntry;
import android.content.RestrictionsManager;
import android.content.pm.ApplicationInfo;
import android.content.pm.ComponentInfo;
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
import java.io.File;
import java.io.FileInputStream;
import java.lang.reflect.Method;
import java.security.KeyStore;
import java.security.cert.Certificate;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.Enumeration;
import java.util.List;

import org.json.JSONArray;
import org.json.JSONObject;

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
            boolean iconsMode = false, certsMode = false, detailMode = false;
            int userId = 0; String pkg = null;
            for (String a : args) {
                if ("icons".equals(a)) iconsMode = true;
                else if ("labels".equals(a)) iconsMode = false;
                else if ("certs".equals(a)) certsMode = true;
                else if ("detail".equals(a)) detailMode = true;
                else if (a.matches("\\d+")) userId = Integer.parseInt(a);
                else pkg = a;
            }

            Looper.prepareMainLooper();

            Class<?> at = Class.forName("android.app.ActivityThread");
            Method systemMain = at.getMethod("systemMain");
            Object thread = systemMain.invoke(null);
            Method getSystemContext = at.getMethod("getSystemContext");
            Context ctx = (Context) getSystemContext.invoke(thread);

            if (certsMode) {
                dumpCerts(ctx);
                System.exit(0);
                return;
            }
            if (userId != 0) {
                // Target another profile's PackageManager (API 30+).
                // UserHandle.of(int) is hidden, so reach it via reflection.
                Class<?> uh = Class.forName("android.os.UserHandle");
                UserHandle handle = (UserHandle) uh.getMethod("of", int.class).invoke(null, userId);
                ctx = (Context) Context.class
                    .getMethod("createContextAsUser", UserHandle.class, int.class)
                    .invoke(ctx, handle, 0);
            }

            if (detailMode) {
                dumpDetail(ctx, pkg);
                System.exit(0);
                return;
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

    // Enumerate trusted CA certificates across all profiles. One line per cert:
    //   source \t subject \t issuer \t serialHex \t notBeforeMs \t notAfterMs
    // source = system | user-<id>  (user-0 = personal, others = work profile…).
    private static void dumpCerts(Context ctx) {
        StringBuilder sb = new StringBuilder();
        CertificateFactory cf;
        try { cf = CertificateFactory.getInstance("X.509"); }
        catch (Throwable t) { System.err.println("cf: " + t); return; }

        // 1) System trusted CAs (Android 14+/Pixel use the conscrypt APEX path).
        parseCertDir(sb, cf, "/system/etc/security/cacerts/", "system");
        parseCertDir(sb, cf, "/apex/com.android.conscrypt/cacerts/", "system");

        // 2) User 0 (personal) user-added CAs.
        parseCertDir(sb, cf, "/data/misc/keychain/cacerts-added/", "user-0");

        // 3) Other users' (work profile) added CA dirs, if readable.
        try {
            File[] users = new File("/data/misc/user").listFiles();
            if (users != null) for (File u : users) {
                String uid = u.getName();
                if (!uid.matches("\\d+") || uid.equals("0")) continue;
                parseCertDir(sb, cf, new File(u, "cacerts-added").getPath() + "/", "user-" + uid);
            }
        } catch (Throwable ignored) {}

        // 4) Work profile via per-user KeyChain service (no root; shell holds
        //    INTERACT_ACROSS_USERS_FULL) — covers what file perms block above.
        try {
            Object um = ctx.getSystemService("user");
            @SuppressWarnings("unchecked")
            List<UserHandle> profiles = (List<UserHandle>) um.getClass().getMethod("getUserProfiles").invoke(um);
            for (UserHandle h : profiles) {
                int uid = (Integer) UserHandle.class.getMethod("getIdentifier").invoke(h);
                if (uid == 0) continue;
                dumpUserKeyChainCerts(sb, ctx, h, uid);
            }
        } catch (Throwable t) { System.err.println("profiles: " + t); }

        System.out.print(sb);
        System.out.flush();
    }

    private static void parseCertDir(StringBuilder sb, CertificateFactory cf, String dir, String source) {
        try {
            File[] files = new File(dir).listFiles();
            if (files == null) return;
            for (File f : files) {
                FileInputStream fis = null;
                try {
                    fis = new FileInputStream(f);
                    Certificate c = cf.generateCertificate(fis);
                    if (c instanceof X509Certificate) emitCert(sb, source, (X509Certificate) c);
                } catch (Throwable ignored) {
                } finally { if (fis != null) try { fis.close(); } catch (Throwable ignored) {} }
            }
        } catch (Throwable ignored) {}
    }

    // Bind the KeyChain service for a profile and dump its user-added CA certs.
    // Runs on a worker thread because KeyChain.bind() blocks on a connection
    // callback dispatched to the main looper.
    private static void dumpUserKeyChainCerts(final StringBuilder sb, final Context ctx, final UserHandle handle, final int uid) {
        try {
            Thread th = new Thread(new Runnable() {
                public void run() {
                    Object conn = null;
                    try {
                        Class<?> kc = Class.forName("android.security.KeyChain");
                        // Prefer the cross-user bind; fall back to per-user context bind.
                        try {
                            conn = kc.getMethod("bindAsUser", Context.class, UserHandle.class).invoke(null, ctx, handle);
                        } catch (NoSuchMethodException nsme) {
                            Context uctx = (Context) Context.class
                                .getMethod("createContextAsUser", UserHandle.class, int.class)
                                .invoke(ctx, handle, 0);
                            conn = kc.getMethod("bind", Context.class).invoke(null, uctx);
                        }
                        Object svc = conn.getClass().getMethod("getService").invoke(conn);
                        Object slice = svc.getClass().getMethod("getUserCaAliases").invoke(svc);
                        @SuppressWarnings("unchecked")
                        List<String> aliases = (List<String>) slice.getClass().getMethod("getList").invoke(slice);
                        CertificateFactory cf = CertificateFactory.getInstance("X.509");
                        Method getEnc = svc.getClass().getMethod("getEncodedCaCertificate", String.class, boolean.class);
                        for (String alias : aliases) {
                            try {
                                byte[] der = (byte[]) getEnc.invoke(svc, alias, true);
                                X509Certificate x = (X509Certificate) cf.generateCertificate(new java.io.ByteArrayInputStream(der));
                                synchronized (sb) { emitCert(sb, "user-" + uid, x); }
                            } catch (Throwable ignored) {}
                        }
                    } catch (Throwable t) {
                        Throwable cause = (t instanceof java.lang.reflect.InvocationTargetException && t.getCause() != null) ? t.getCause() : t;
                        System.err.println("keychain u" + uid + ": " + cause);
                    } finally {
                        if (conn != null) try { conn.getClass().getMethod("close").invoke(conn); } catch (Throwable ignored) {}
                    }
                }
            });
            th.start();
            th.join(15000);
        } catch (Throwable t) { System.err.println("keychain-bind u" + uid + ": " + t); }
    }

    private static void emitCert(StringBuilder sb, String source, X509Certificate x) {
        sb.append(source).append('\t')
          .append(clean(x.getSubjectX500Principal().getName())).append('\t')
          .append(clean(x.getIssuerX500Principal().getName())).append('\t')
          .append(x.getSerialNumber().toString(16)).append('\t')
          .append(x.getNotBefore().getTime()).append('\t')
          .append(x.getNotAfter().getTime()).append('\n');
    }

    // Full detail for one package as a JSON object on stdout.
    private static void dumpDetail(Context ctx, String pkg) {
        if (pkg == null) { System.err.println("detail: no package"); return; }
        try {
            PackageManager pm = ctx.getPackageManager();
            int flags = PackageManager.GET_PERMISSIONS | PackageManager.GET_ACTIVITIES
                | PackageManager.GET_SERVICES | PackageManager.GET_RECEIVERS | PackageManager.GET_PROVIDERS;
            PackageInfo pi = pm.getPackageInfo(pkg, flags);
            ApplicationInfo ai = pi.applicationInfo;
            JSONObject o = new JSONObject();
            o.put("package", pkg);
            o.put("label", String.valueOf(pm.getApplicationLabel(ai)));
            o.put("versionName", pi.versionName);
            o.put("versionCode", pi.getLongVersionCode());
            o.put("minSdk", ai.minSdkVersion);
            o.put("targetSdk", ai.targetSdkVersion);
            o.put("uid", ai.uid);
            o.put("enabled", ai.enabled);
            o.put("system", (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0);
            o.put("debuggable", (ai.flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
            o.put("firstInstall", pi.firstInstallTime);
            o.put("lastUpdate", pi.lastUpdateTime);
            o.put("dataDir", ai.dataDir);
            o.put("sourceDir", ai.sourceDir);
            try { o.put("installer", pm.getInstallerPackageName(pkg)); } catch (Throwable ignored) {}
            Intent li = pm.getLaunchIntentForPackage(pkg);
            o.put("launchActivity", (li != null && li.getComponent() != null) ? li.getComponent().flattenToShortString() : JSONObject.NULL);

            JSONArray perms = new JSONArray();
            if (pi.requestedPermissions != null) {
                for (int i = 0; i < pi.requestedPermissions.length; i++) {
                    JSONObject p = new JSONObject();
                    p.put("name", pi.requestedPermissions[i]);
                    boolean g = pi.requestedPermissionsFlags != null
                        && (pi.requestedPermissionsFlags[i] & PackageInfo.REQUESTED_PERMISSION_GRANTED) != 0;
                    p.put("granted", g);
                    perms.put(p);
                }
            }
            o.put("permissions", perms);

            // Managed-configuration schema the APP declares (whether or not an
            // MDM has set values) — via RestrictionsManager.getManifestRestrictions.
            JSONArray schema = new JSONArray();
            try {
                RestrictionsManager rm = (RestrictionsManager) ctx.getSystemService(Context.RESTRICTIONS_SERVICE);
                List<RestrictionEntry> entries = rm.getManifestRestrictions(pkg);
                if (entries != null) for (RestrictionEntry e : entries) schema.put(restrEntry(e));
            } catch (Throwable ignored) {}
            o.put("appConfigSchema", schema);
            o.put("supportsAppConfig", schema.length() > 0);

            o.put("activities", comps(pi.activities));
            o.put("services", comps(pi.services));
            o.put("receivers", comps(pi.receivers));
            o.put("providers", comps(pi.providers));

            System.out.print(o.toString());
            System.out.flush();
        } catch (Throwable t) {
            System.err.println("detail error: " + t);
        }
    }

    // Build a schema entry, recursing into bundle / bundle-array children.
    private static JSONObject restrEntry(RestrictionEntry e) throws Exception {
        JSONObject j = new JSONObject();
        j.put("key", e.getKey());
        j.put("type", restrType(e.getType()));
        j.put("title", e.getTitle());
        j.put("description", e.getDescription());
        if (e.getType() == RestrictionEntry.TYPE_BUNDLE || e.getType() == RestrictionEntry.TYPE_BUNDLE_ARRAY) {
            RestrictionEntry[] nested = e.getRestrictions();
            JSONArray arr = new JSONArray();
            if (nested != null) for (RestrictionEntry ne : nested) arr.put(restrEntry(ne));
            j.put("children", arr);
        }
        return j;
    }

    private static String restrType(int t) {
        switch (t) {
            case RestrictionEntry.TYPE_BOOLEAN: return "boolean";
            case RestrictionEntry.TYPE_CHOICE: return "choice";
            case RestrictionEntry.TYPE_MULTI_SELECT: return "multi-select";
            case RestrictionEntry.TYPE_INTEGER: return "integer";
            case RestrictionEntry.TYPE_STRING: return "string";
            case RestrictionEntry.TYPE_BUNDLE: return "bundle";
            case RestrictionEntry.TYPE_BUNDLE_ARRAY: return "bundle-array";
            default: return "value";
        }
    }

    private static JSONArray comps(ComponentInfo[] arr) throws Exception {
        JSONArray a = new JSONArray();
        if (arr != null) for (ComponentInfo c : arr) {
            JSONObject j = new JSONObject();
            j.put("name", c.name);
            j.put("exported", c.exported);
            j.put("enabled", c.enabled);
            a.put(j);
        }
        return a;
    }

    private static String clean(String s) {
        return s == null ? "" : s.replace('\t', ' ').replace('\n', ' ').replace('\r', ' ');
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
