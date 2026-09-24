package org.irgunshiuraitorah.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Legacy receiver retained only for binary/source compatibility. Media3 owns media buttons now. */
public class IrgunMediaActionReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) { }
}
