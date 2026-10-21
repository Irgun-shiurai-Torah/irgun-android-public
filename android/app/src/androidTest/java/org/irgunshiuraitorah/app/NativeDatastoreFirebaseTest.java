package org.irgunshiuraitorah.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;

import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.installations.FirebaseInstallations;
import com.google.firebase.messaging.FirebaseMessaging;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * PR-only runtime proof that omitting DataStore's JNI library does not break
 * Firebase Installations or FCM registration in a fresh emulator install.
 * Do not print installation IDs or FCM tokens to CI logs.
 */
@RunWith(AndroidJUnit4.class)
public class NativeDatastoreFirebaseTest {
    private void requireFirebase() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertNotNull("Firebase options must be configured", FirebaseApp.initializeApp(context));
    }

    @Test
    public void firebaseInstallationIdResolvesWithoutDatastoreJNI() throws Exception {
        requireFirebase();
        String id = Tasks.await(FirebaseInstallations.getInstance().getId(), 45, TimeUnit.SECONDS);
        assertNotNull("Firebase Installations returned no ID", id);
        assertFalse("Firebase Installations returned an empty ID", id.isEmpty());
    }

    @Test
    public void firebaseMessagingTokenResolvesWithoutDatastoreJNI() throws Exception {
        requireFirebase();
        String token = Tasks.await(FirebaseMessaging.getInstance().getToken(), 75, TimeUnit.SECONDS);
        assertNotNull("FCM returned no token", token);
        assertFalse("FCM returned an empty token", token.isEmpty());
    }
}
