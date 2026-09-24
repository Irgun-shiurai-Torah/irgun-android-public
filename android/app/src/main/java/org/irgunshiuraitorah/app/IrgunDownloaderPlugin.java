package org.irgunshiuraitorah.app;

import android.content.ContentResolver;
import android.content.ActivityNotFoundException;
import android.content.ContentValues;
import android.content.Intent;
import android.app.Activity;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "IrgunDownloader")
public class IrgunDownloaderPlugin extends Plugin {
    private final Map<String, DownloadTask> tasks = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Missing URL");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException error) {
            call.reject("No app is available to open this link.");
        } catch (Exception error) {
            call.reject("Could not open this link.");
        }
    }

    @PluginMethod
    public void openSecureFile(PluginCall call) {
        String url = call.getString("url");
        String filename = call.getString("filename", "Irgun-material.pdf");
        String mimeType = call.getString("mimeType", "application/pdf");
        String token = call.getString("token", "");
        Boolean appHeaderValue = call.getBoolean("appHeader");
        boolean appHeader = appHeaderValue == null || appHeaderValue;
        if (url == null || url.trim().isEmpty()) {
            call.reject("Missing file URL");
            return;
        }
        final String safeName = filename.replaceAll("[\\\\/:*?\"<>|\\r\\n]+", "_");
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                File folder = new File(getContext().getCacheDir(), "irgun-secure-open");
                if (!folder.exists() && !folder.mkdirs()) throw new IOException("Could not create secure file cache");
                File[] oldFiles = folder.listFiles();
                if (oldFiles != null) {
                    long cutoff = System.currentTimeMillis() - 24L * 60L * 60L * 1000L;
                    for (File old : oldFiles) if (old.isFile() && old.lastModified() < cutoff) old.delete();
                }
                File destination = new File(folder, System.currentTimeMillis() + "-" + safeName);
                connection = (HttpURLConnection) new URL(url).openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept", mimeType + ",*/*");
                if (appHeader) connection.setRequestProperty("X-Irgun-App", "1");
                if (token != null && !token.trim().isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token.trim());
                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 400) throw new IOException("HTTP " + code);
                try (BufferedInputStream in = new BufferedInputStream(connection.getInputStream(), 128 * 1024);
                     BufferedOutputStream out = new BufferedOutputStream(new FileOutputStream(destination), 128 * 1024)) {
                    byte[] buffer = new byte[128 * 1024];
                    int read;
                    while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                    out.flush();
                }
                Activity activity = getActivity();
                if (activity == null) throw new IOException("App window is not available");
                activity.runOnUiThread(() -> {
                    try {
                        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", destination);
                        Intent intent = new Intent(Intent.ACTION_VIEW);
                        intent.setDataAndType(uri, mimeType);
                        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        Intent chooser = Intent.createChooser(intent, "Open file");
                        activity.startActivity(chooser);
                        JSObject result = new JSObject();
                        result.put("opened", true);
                        call.resolve(result);
                    } catch (ActivityNotFoundException error) {
                        call.reject("No app is available to open this file.");
                    } catch (Exception error) {
                        call.reject("Could not open this file.");
                    }
                });
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Could not open this file." : error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @PluginMethod
    public void start(PluginCall call) {
        String id = call.getString("id");
        String url = call.getString("url");
        String filename = call.getString("filename");
        String title = call.getString("title", filename == null ? "Download" : filename);
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String token = call.getString("token", "");
        Boolean appHeaderValue = call.getBoolean("appHeader");
        boolean appHeader = appHeaderValue != null && appHeaderValue;
        if (id == null || id.isEmpty() || url == null || url.isEmpty() || filename == null || filename.isEmpty()) {
            call.reject("Missing download information");
            return;
        }
        DownloadTask existing = tasks.get(id);
        if (existing != null && !existing.isTerminal()) {
            call.resolve();
            return;
        }
        File folder = new File(getContext().getCacheDir(), "irgun-downloads");
        if (!folder.exists() && !folder.mkdirs()) {
            call.reject("Could not create download folder");
            return;
        }
        DownloadTask task = new DownloadTask(id, url, filename, title, mimeType, token, appHeader, new File(folder, id + ".part"));
        tasks.put(id, task);
        executor.execute(task);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        DownloadTask task = tasks.get(call.getString("id", ""));
        if (task != null) task.pause();
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        DownloadTask task = tasks.get(call.getString("id", ""));
        if (task != null && task.paused) {
            task.paused = false;
            task.cancelled = false;
            executor.execute(task);
        }
        call.resolve();
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        DownloadTask task = tasks.get(call.getString("id", ""));
        if (task != null) task.cancel();
        call.resolve();
    }

    private void emitProgress(DownloadTask task, String status) {
        JSObject data = new JSObject();
        data.put("id", task.id);
        data.put("status", status);
        data.put("bytes", task.downloaded);
        data.put("total", task.total);
        double percent = task.total > 0 ? (task.downloaded * 100.0 / task.total) : 0;
        data.put("percent", Math.min(100, Math.max(0, percent)));
        notifyListeners("downloadProgress", data);
    }

    private void emitState(DownloadTask task, String status, String message, String uri) {
        JSObject data = new JSObject();
        data.put("id", task.id);
        data.put("status", status);
        data.put("percent", task.total > 0 ? Math.min(100, task.downloaded * 100.0 / task.total) : 0);
        if (message != null) data.put("message", message);
        if (uri != null) data.put("uri", uri);
        notifyListeners("downloadState", data);
    }

    private String publishToDownloads(DownloadTask task) throws IOException {
        ContentResolver resolver = getContext().getContentResolver();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, task.filename);
            values.put(MediaStore.Downloads.MIME_TYPE, task.mimeType);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Irgun Shiurai Torah");
            values.put(MediaStore.Downloads.IS_PENDING, 1);
            Uri uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IOException("Could not create download file");
            try (OutputStream out = resolver.openOutputStream(uri); FileInputStream in = new FileInputStream(task.partFile)) {
                if (out == null) throw new IOException("Could not open download file");
                byte[] buffer = new byte[128 * 1024];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                out.flush();
            } catch (IOException error) {
                resolver.delete(uri, null, null);
                throw error;
            }
            ContentValues complete = new ContentValues();
            complete.put(MediaStore.Downloads.IS_PENDING, 0);
            resolver.update(uri, complete, null, null);
            return uri.toString();
        }

        File downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        File folder = new File(downloads, "Irgun Shiurai Torah");
        if (!folder.exists() && !folder.mkdirs()) throw new IOException("Could not create public download folder");
        File destination = new File(folder, task.filename);
        try (FileInputStream in = new FileInputStream(task.partFile); FileOutputStream out = new FileOutputStream(destination)) {
            byte[] buffer = new byte[128 * 1024];
            int read;
            while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
        }
        return Uri.fromFile(destination).toString();
    }

    private class DownloadTask implements Runnable {
        final String id;
        final String url;
        final String filename;
        final String title;
        final String mimeType;
        final String token;
        final boolean appHeader;
        final File partFile;
        volatile boolean paused = false;
        volatile boolean cancelled = false;
        volatile boolean completed = false;
        volatile long downloaded = 0;
        volatile long total = 0;
        volatile HttpURLConnection connection;

        DownloadTask(String id, String url, String filename, String title, String mimeType, String token, boolean appHeader, File partFile) {
            this.id = id;
            this.url = url;
            this.filename = filename;
            this.title = title;
            this.mimeType = mimeType;
            this.token = token == null ? "" : token;
            this.appHeader = appHeader;
            this.partFile = partFile;
        }

        boolean isTerminal() { return completed || cancelled; }

        void pause() {
            paused = true;
            HttpURLConnection current = connection;
            if (current != null) current.disconnect();
        }

        void cancel() {
            cancelled = true;
            paused = false;
            HttpURLConnection current = connection;
            if (current != null) current.disconnect();
            if (partFile.exists()) partFile.delete();
            emitState(this, "cancelled", "Download cancelled", null);
        }

        @Override
        public void run() {
            if (completed || cancelled) return;
            emitState(this, "running", "Downloading", null);
            RandomAccessFile output = null;
            BufferedInputStream input = null;
            try {
                long existing = partFile.exists() ? partFile.length() : 0;
                URL source = new URL(url);
                connection = (HttpURLConnection) source.openConnection();
                connection.setConnectTimeout(20000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept-Encoding", "identity");
                if (appHeader) connection.setRequestProperty("X-Irgun-App", "1");
                if (!token.trim().isEmpty()) connection.setRequestProperty("Authorization", "Bearer " + token.trim());
                if (existing > 0) connection.setRequestProperty("Range", "bytes=" + existing + "-");
                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 400) throw new IOException("HTTP " + code);

                boolean resumed = code == HttpURLConnection.HTTP_PARTIAL && existing > 0;
                if (!resumed && existing > 0) {
                    existing = 0;
                    try (RandomAccessFile truncate = new RandomAccessFile(partFile, "rw")) { truncate.setLength(0); }
                }
                long length = connection.getContentLengthLong();
                total = length > 0 ? existing + length : 0;
                downloaded = existing;
                input = new BufferedInputStream(connection.getInputStream(), 128 * 1024);
                output = new RandomAccessFile(partFile, "rw");
                output.seek(existing);
                byte[] buffer = new byte[128 * 1024];
                long lastEmit = 0;
                while (!paused && !cancelled) {
                    int read = input.read(buffer);
                    if (read == -1) break;
                    output.write(buffer, 0, read);
                    downloaded += read;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 350) {
                        lastEmit = now;
                        emitProgress(this, "running");
                    }
                }

                if (cancelled) return;
                if (paused) {
                    emitState(this, "paused", "Download paused", null);
                    return;
                }
                emitProgress(this, "running");
                String uri = publishToDownloads(this);
                completed = true;
                downloaded = total > 0 ? total : partFile.length();
                partFile.delete();
                emitState(this, "completed", "Saved to Downloads / Irgun Shiurai Torah", uri);
            } catch (Exception error) {
                if (cancelled) return;
                if (paused) {
                    emitState(this, "paused", "Download paused", null);
                } else {
                    emitState(this, "error", error.getMessage() == null ? "Download failed" : error.getMessage(), null);
                }
            } finally {
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                try { if (output != null) output.close(); } catch (Exception ignored) {}
                if (connection != null) connection.disconnect();
                connection = null;
            }
        }
    }
}
