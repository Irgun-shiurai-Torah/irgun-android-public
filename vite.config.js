import { defineConfig } from 'vite';

// Android 11 devices can still ship an older System WebView. Vite 8's default
// Chrome 111 target leaves syntax such as logical assignment in the bundle,
// which causes a blank app before our first render on those WebViews.
export default defineConfig({
  build: {
    target: 'chrome79',
    cssTarget: 'chrome79'
  }
});
