package org.irgunshiuraitorah.qa;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.graphics.Rect;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.view.accessibility.AccessibilityWindowInfo;

/** Read the actual foreground hierarchy without requiring an idle media timer. */
public class WindowObserver extends Instrumentation {
    private boolean allWindows;
    @Override public void onCreate(Bundle arguments) {
        super.onCreate(arguments);
        allWindows = arguments != null && "true".equals(arguments.getString("allWindows"));
        start();
    }

    @Override public void onStart() {
        Bundle result = new Bundle();
        try {
            UiAutomation ui = getUiAutomation(UiAutomation.FLAG_DONT_SUPPRESS_ACCESSIBILITY_SERVICES);
            if (ui == null) throw new IllegalStateException("Accessibility connection unavailable");
            AccessibilityServiceInfo info = ui.getServiceInfo();
            info.flags |= AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS |
                AccessibilityServiceInfo.FLAG_INCLUDE_NOT_IMPORTANT_VIEWS;
            if (allWindows) info.flags |= AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS;
            ui.setServiceInfo(info);
            AccessibilityNodeInfo root = null;
            for (int attempt = 0; attempt < 12 && root == null; attempt++) {
                root = ui.getRootInActiveWindow();
                if (root == null) SystemClock.sleep(150);
            }
            if (root == null && !allWindows) throw new IllegalStateException("Actual active window has no accessibility root");
            StringBuilder xml = new StringBuilder("<hierarchy>");
            if (allWindows) {
                // Optional only for public video fullscreen guidance. Default
                // account and notification observers retain active-window scope.
                for (AccessibilityWindowInfo window : ui.getWindows()) {
                    AccessibilityNodeInfo windowRoot = window.getRoot();
                    if (windowRoot != null) { appendNode(xml, windowRoot, 0); windowRoot.recycle(); }
                }
            } else appendNode(xml, root, 0);
            if (root != null) root.recycle();
            xml.append("</hierarchy>");
            result.putString("hierarchy", xml.toString());
            finish(-1, result);
        } catch (Throwable error) {
            result.putString("error", error.toString());
            finish(0, result);
        }
    }

    private static void appendNode(StringBuilder xml, AccessibilityNodeInfo node, int depth) {
        if (depth > 80) throw new IllegalStateException("Native hierarchy depth exceeded");
        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        xml.append("<node text=\"").append(escape(node.getText()))
            .append("\" content-desc=\"").append(escape(node.getContentDescription()))
            .append("\" resource-id=\"").append(escape(node.getViewIdResourceName()))
            .append("\" class=\"").append(escape(node.getClassName()))
            .append("\" package=\"").append(escape(node.getPackageName()))
            .append("\" clickable=\"").append(node.isClickable())
            .append("\" visible=\"").append(node.isVisibleToUser())
            .append("\" bounds=\"[").append(bounds.left).append(',').append(bounds.top)
            .append("][").append(bounds.right).append(',').append(bounds.bottom).append("]\">");
        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            if (child != null) { appendNode(xml, child, depth + 1); child.recycle(); }
        }
        xml.append("</node>");
    }

    private static String escape(CharSequence value) {
        return value == null ? "" : value.toString().replaceAll("[\\x00-\\x1f]", " ")
            .replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
