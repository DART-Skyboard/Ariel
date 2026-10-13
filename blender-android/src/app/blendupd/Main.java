package app.blendupd;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.provider.Settings;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Blender Tablet Updater: finds the newest tablet demo APK on mirror.blender.org, downloads it, installs it. */
public class Main extends Activity {
    static final String DIR = "https://mirror.blender.org/demo/tablet/";
    static final int BG = Color.parseColor("#06101A"), FG = Color.parseColor("#A9C9D9"), HI = Color.parseColor("#E8FBFF"),
            CY = Color.parseColor("#00E5FF"), GRN = Color.parseColor("#39FF7A"), AMB = Color.parseColor("#FFB300");
    final Handler ui = new Handler(Looper.getMainLooper());
    SharedPreferences sp;
    TextView status, latestTv, installedTv;
    ProgressBar bar;
    Button bCheck, bGet, bInstall, bOpen;
    String latestName = null, latestStamp = null; long latestSize = 0;
    long dlId = -1;
    boolean polling = false;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        sp = getSharedPreferences("u", MODE_PRIVATE);
        dlId = sp.getLong("dl", -1);
        ScrollView sv = new ScrollView(this); sv.setBackgroundColor(BG);
        LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (20 * getResources().getDisplayMetrics().density); root.setPadding(p, p * 2, p, p);
        sv.addView(root);
        TextView t = tv("BLENDER TABLET UPDATER", 20, HI, true); root.addView(t);
        root.addView(tv("Finds the newest Blender tablet demo on mirror.blender.org, downloads it and installs it.", 13, FG, false));
        root.addView(space(18));
        installedTv = tv("", 14, FG, false); root.addView(installedTv);
        root.addView(space(10));
        latestTv = tv("Checking mirror...", 14, FG, false); root.addView(latestTv);
        root.addView(space(14));
        bar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); bar.setMax(1000); bar.setVisibility(View.GONE); root.addView(bar);
        status = tv("", 13, AMB, false); root.addView(status);
        root.addView(space(14));
        bGet = btn("DOWNLOAD & INSTALL LATEST", true); bGet.setOnClickListener(v -> startDownload()); root.addView(bGet);
        bInstall = btn("INSTALL DOWNLOADED FILE", false); bInstall.setOnClickListener(v -> install()); root.addView(bInstall);
        bOpen = btn("OPEN BLENDER", false); bOpen.setOnClickListener(v -> openBlender()); root.addView(bOpen);
        bCheck = btn("CHECK FOR UPDATE", false); bCheck.setOnClickListener(v -> check()); root.addView(bCheck);
        Button web = btn("OPEN MIRROR FOLDER IN BROWSER", false); web.setOnClickListener(v -> startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(DIR)))); root.addView(web);
        root.addView(space(12));
        root.addView(tv("Needs about 5 GB free. Unofficial helper by DART-Skyboard; the Blender file comes straight from Blender's own mirror. Allow \"Install unknown apps\" for this app when asked.", 11, Color.parseColor("#5F8196"), false));
        setContentView(sv);
    }

    @Override protected void onResume() { super.onResume(); refreshInstalled(); check(); resumeDownload(); }

    TextView tv(String s, int sp, int c, boolean bold) { TextView t = new TextView(this); t.setText(s); t.setTextSize(sp); t.setTextColor(c); if (bold) t.setTypeface(Typeface.MONOSPACE, Typeface.BOLD); t.setLineSpacing(0, 1.15f); return t; }
    View space(int dp) { View v = new View(this); v.setLayoutParams(new LinearLayout.LayoutParams(1, (int) (dp * getResources().getDisplayMetrics().density))); return v; }
    Button btn(String s, boolean primary) {
        Button x = new Button(this); x.setText(s); x.setAllCaps(false); x.setTextColor(primary ? Color.parseColor("#04121C") : CY);
        x.setBackgroundColor(primary ? GRN : Color.parseColor("#0A1C2B"));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, (int) (52 * getResources().getDisplayMetrics().density));
        lp.topMargin = (int) (8 * getResources().getDisplayMetrics().density); x.setLayoutParams(lp); x.setGravity(Gravity.CENTER); return x;
    }

    String blenderPkg() {
        PackageManager pm = getPackageManager();
        for (PackageInfo pi : pm.getInstalledPackages(0)) if (pi.packageName.toLowerCase().contains("blender") && !pi.packageName.equals(getPackageName())) return pi.packageName;
        return null;
    }
    void refreshInstalled() {
        String pk = blenderPkg();
        if (pk == null) { installedTv.setText("Installed: Blender not found"); bOpen.setEnabled(false); return; }
        try { PackageInfo pi = getPackageManager().getPackageInfo(pk, 0); installedTv.setText("Installed: " + pk + "  v" + pi.versionName); bOpen.setEnabled(true); } catch (Exception e) { installedTv.setText("Installed: " + pk); }
    }
    void openBlender() { String pk = blenderPkg(); if (pk == null) return; Intent i = getPackageManager().getLaunchIntentForPackage(pk); if (i != null) startActivity(i); else toast("Blender has no launcher entry"); }
    void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }

    /** query the mirror: every .apk in the folder, pick the newest by Last-Modified (ties: greater name) */
    void check() {
        latestTv.setText("Checking mirror...");
        new Thread(() -> {
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(DIR).openConnection(); c.setConnectTimeout(15000); c.setReadTimeout(20000);
                BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream())); StringBuilder sb = new StringBuilder(); String ln; while ((ln = r.readLine()) != null) sb.append(ln);
                Matcher m = Pattern.compile("href=\"\\./([^\"?]+\\.apk)\"").matcher(sb); List<String> names = new ArrayList<>(); while (m.find()) if (!names.contains(m.group(1))) names.add(m.group(1));
                String best = null, bestStamp = null; long bestT = -1, bestSize = 0;
                for (String n : names) {
                    HttpURLConnection h = (HttpURLConnection) new URL(DIR + n).openConnection(); h.setRequestMethod("HEAD"); h.setConnectTimeout(15000); h.setReadTimeout(20000); h.setInstanceFollowRedirects(true);
                    long t = h.getLastModified(); long len = h.getContentLengthLong(); h.disconnect();
                    if (best == null || t > bestT || (t == bestT && n.compareTo(best) > 0)) { best = n; bestT = t; bestSize = len; bestStamp = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.US).format(new java.util.Date(t)); }
                }
                final String fb = best, fs = bestStamp; final long fsz = bestSize;
                ui.post(() -> { latestName = fb; latestStamp = fs; latestSize = fsz; showLatest(); });
            } catch (Exception e) { ui.post(() -> latestTv.setText("Could not reach the mirror: " + e.getMessage())); }
        }).start();
    }
    void showLatest() {
        if (latestName == null) { latestTv.setText("No tablet demo found on the mirror."); return; }
        String last = sp.getString("installedName", ""), lastStamp = sp.getString("installedStamp", "");
        boolean same = latestName.equals(last) && latestStamp.equals(lastStamp);
        latestTv.setText("Latest on mirror:\n" + latestName + "\n" + String.format("%.2f GB", latestSize / 1073741824.0) + " - " + latestStamp + " UTC-local\n" + (same ? "You installed this one already." : (last.isEmpty() ? "Not installed by this app yet." : "New version available (you have " + last + ").")));
        bGet.setEnabled(true);
        bInstall.setEnabled(downloadedFile() != null);
    }

    Uri downloadedFile() {
        if (dlId < 0) return null;
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        Cursor c = dm.query(new DownloadManager.Query().setFilterById(dlId));
        try { if (c != null && c.moveToFirst() && c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)) == DownloadManager.STATUS_SUCCESSFUL) return dm.getUriForDownloadedFile(dlId); } finally { if (c != null) c.close(); }
        return null;
    }

    void startDownload() {
        if (latestName == null) { toast("Still checking the mirror"); return; }
        StatFs fs = new StatFs(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS).getPath());
        long free = fs.getAvailableBytes();
        if (free < latestSize * 2) { status.setText("Low storage: " + String.format("%.1f", free / 1073741824.0) + " GB free. Free up about " + String.format("%.1f", latestSize * 2 / 1073741824.0) + " GB, then try again."); return; }
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        DownloadManager.Request rq = new DownloadManager.Request(Uri.parse(DIR + latestName));
        rq.setTitle("Blender tablet demo").setDescription(latestName).setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
          .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, latestName).setAllowedOverMetered(true).setAllowedOverRoaming(false)
          .setMimeType("application/vnd.android.package-archive");
        dlId = dm.enqueue(rq);
        sp.edit().putLong("dl", dlId).putString("dlName", latestName).putString("dlStamp", latestStamp).putBoolean("auto", true).apply();
        status.setText("Download started. You can leave this screen; it continues in the background.");
        resumeDownload();
    }

    void resumeDownload() {
        if (dlId < 0 || polling) return; polling = true; bar.setVisibility(View.VISIBLE);
        ui.post(new Poller());
    }
    class Poller implements Runnable { public void run() {
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            Cursor c = dm.query(new DownloadManager.Query().setFilterById(dlId));
            boolean again = true;
            try {
                if (c == null || !c.moveToFirst()) { polling = false; bar.setVisibility(View.GONE); return; }
                int st = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long got = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)), tot = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                if (st == DownloadManager.STATUS_RUNNING || st == DownloadManager.STATUS_PENDING || st == DownloadManager.STATUS_PAUSED) {
                    bar.setProgress(tot > 0 ? (int) (got * 1000 / tot) : 0);
                    status.setText((st == DownloadManager.STATUS_PAUSED ? "Paused (waiting for network)... " : "Downloading... ") + String.format("%.2f / %.2f GB", got / 1073741824.0, Math.max(tot, 0) / 1073741824.0));
                } else if (st == DownloadManager.STATUS_SUCCESSFUL) {
                    bar.setProgress(1000); status.setText("Download finished."); again = false; bInstall.setEnabled(true);
                    if (sp.getBoolean("auto", false)) { sp.edit().putBoolean("auto", false).apply(); install(); }
                } else { status.setText("Download failed (code " + c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)) + "). Check storage and network, then try again."); again = false; }
            } finally { if (c != null) c.close(); }
            if (again) ui.postDelayed(this, 800); else polling = false;
        } }

    void install() {
        Uri u = downloadedFile(); if (u == null) { toast("Nothing downloaded yet"); return; }
        if (Build.VERSION.SDK_INT >= 26 && !getPackageManager().canRequestPackageInstalls()) {
            toast("Allow \"Install unknown apps\" for this app, then come back and tap Install");
            startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); return;
        }
        sp.edit().putString("installedName", sp.getString("dlName", "")).putString("installedStamp", sp.getString("dlStamp", "")).apply();
        Intent i = new Intent(Intent.ACTION_VIEW); i.setDataAndType(u, "application/vnd.android.package-archive"); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try { startActivity(i); } catch (Exception e) { status.setText("Could not start the installer: " + e.getMessage()); }
    }
}
