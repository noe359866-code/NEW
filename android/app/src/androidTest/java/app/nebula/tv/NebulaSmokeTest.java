package app.nebula.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NebulaSmokeTest {
    private String evaluate(ActivityScenario<MainActivity> scenario, String js) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>("");
        scenario.onActivity(activity -> {
            WebView webView = activity.getBridge().getWebView();
            webView.evaluateJavascript(js, value -> { result.set(value); latch.countDown(); });
        });
        assertTrue("WebView no respondió", latch.await(10, TimeUnit.SECONDS));
        return result.get();
    }

    @Test
    public void appCargaCatalogoConHttpNativo() throws Exception {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            boolean loaded = false;
            for (int attempt = 0; attempt < 90; attempt++) {
                String state = evaluate(scenario, "Boolean(window.Capacitor && window.Capacitor.isNativePlatform() && document.querySelector('.home .card'))");
                if ("true".equals(state)) { loaded = true; break; }
                Thread.sleep(1000);
            }
            assertTrue("La app no cargó el catálogo real de Cinemeta mediante HTTP nativo", loaded);
            assertEquals("true", evaluate(scenario, "Boolean(document.querySelector('.topbar-brand') && document.querySelector('.tabs'))"));
        }
    }
}
