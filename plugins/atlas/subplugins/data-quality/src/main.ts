/**
 * Single-spa entry for the Atlas3 shell, served as
 * /atlas/plugins/data-quality/index.system.js and registered in
 * plugins/atlas/plugins.standalone.json.
 *
 * Modelled on trex-notebook/plugins/studies/src/main.ts. One deliberate
 * difference: studies exchanges the host's Logto token for a trex-native one via
 * /trex-token, because trex CORE's auth middleware is HS256-only. This plugin
 * talks to /jobplugins/*, which is scope-checked by the gateway and accepts the
 * Logto RS256 token directly — the same token the d2e portal sends. Adding the
 * exchange here would be wrong.
 */
import "./style.css";
import { h, createApp, ref } from "vue";
import { createVuetify } from "vuetify";
import { aliases, mdi } from "vuetify/iconsets/mdi";
import singleSpaVue from "single-spa-vue";
import DataQualityApp from "./DataQualityApp.vue";
import {
  DQ_HOST_CTX,
  resolveSourceKey,
  type DqHostCtx,
  type PluginProps,
} from "./types";

/**
 * The selected data source, shared between the lifecycles and the component
 * tree. Module-scoped because `update()` receives props but no handle to the Vue
 * instance, and Atlas mounts at most one instance of a given plugin at a time.
 */
const selectedSourceKey = ref("");

const CSS_LINK_ID = "data-quality-plugin-styles";

function injectPluginCss(uiFilesUrl: string): Promise<void> {
  const existing = document.getElementById(
    CSS_LINK_ID,
  ) as HTMLLinkElement | null;
  if (existing) {
    return existing.dataset.loaded === "true"
      ? Promise.resolve()
      : new Promise<void>((resolve) => {
          existing.addEventListener("load", () => resolve(), { once: true });
          existing.addEventListener("error", () => resolve(), { once: true });
        });
  }
  // uiFilesUrl is the plugin's public directory, e.g. "/atlas/plugins/data-quality/".
  const base = uiFilesUrl
    ? uiFilesUrl.replace(/\/$/, "")
    : `${window.location.origin}/atlas/plugins/data-quality`;
  return new Promise<void>((resolve) => {
    const link = document.createElement("link");
    link.id = CSS_LINK_ID;
    link.rel = "stylesheet";
    link.href = `${base}/style.css`;
    // Resolve on load so mount() never paints before CSS applies; resolve (not
    // reject) on error so a missing file can't hang the parcel forever. Mark it
    // settled either way so a remount doesn't await a dead listener.
    link.addEventListener(
      "load",
      () => {
        link.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    link.addEventListener(
      "error",
      () => {
        link.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    document.head.appendChild(link);
  });
}

/**
 * Reuse the host's own Vuetify defaults so density, rounding and variants match
 * the surrounding Atlas chrome. Hand-mirroring them would drift silently the
 * next time the host's theme changes.
 */
function getSharedDefaults(): Record<string, Record<string, unknown>> {
  const config =
    typeof window !== "undefined"
      ? (
          window as unknown as {
            __atlasUiConfig?: {
              defaults?: Record<string, Record<string, unknown>>;
            };
          }
        ).__atlasUiConfig
      : undefined;
  if (config?.defaults) return config.defaults;
  // Fallback for running outside the Atlas3 host (vite dev, unit tests).
  return {
    VBtn: { variant: "flat", color: "primary", rounded: "lg" },
    VCard: { variant: "flat", rounded: "lg" },
    VTextField: { variant: "outlined", density: "compact", rounded: "md" },
    VSelect: { variant: "outlined", density: "compact", rounded: "md" },
    VChip: { variant: "tonal", rounded: "md", density: "compact" },
    VAlert: { variant: "tonal", rounded: "md" },
  };
}

const vuetify = createVuetify({
  theme: false as never, // the host's :root tokens already provide the theme
  icons: { defaultSet: "mdi", aliases, sets: { mdi } },
  defaults: getSharedDefaults(),
});

const vueLifecycles = singleSpaVue({
  createApp,
  appOptions: {
    render() {
      return h(DataQualityApp);
    },
  },
  handleInstance(app, props) {
    const pluginProps = props as PluginProps;
    app.use(vuetify);

    const hostCtx: DqHostCtx = {
      getToken:
        pluginProps.getToken ??
        (async () => pluginProps.authContext?.token ?? ""),
      // Reactive: Atlas never remounts us when the header's data source changes.
      // As a parcel it calls update({ hostContext }); as a routed app it fires a
      // `custom-props-changed` window event (see useHostContext).
      datasetId: selectedSourceKey,
      appId: pluginProps.appId,
      t: pluginProps.t ?? ((_key: string, fallback?: string) => fallback ?? _key),
      locale: pluginProps.locale ?? "en",
      uiFilesUrl: pluginProps.uiFilesUrl ?? "",
    };
    app.provide(DQ_HOST_CTX, hostCtx);
  },
});

export const bootstrap = async (props: PluginProps) => {
  // Only the routed-app path needs this: PluginLoader does not inject plugin
  // CSS, but parcelLoader does (it appends a <link> to style.css next to the JS
  // entry). uiFilesUrl is present in routed mode only, so it doubles as the
  // mode discriminator — injecting in parcel mode would duplicate the <link>.
  if (props.uiFilesUrl) {
    await injectPluginCss(props.uiFilesUrl);
  }
  return vueLifecycles.bootstrap(props);
};

export const mount = async (props: PluginProps) => {
  selectedSourceKey.value = resolveSourceKey(props);
  return vueLifecycles.mount(props);
};

/**
 * Called by PluginParcelOutlet whenever its `hostContext` computed changes —
 * i.e. when the user picks a different data source. Declaring it is what makes
 * `parcel.update` exist at all; without it the outlet silently skips updates and
 * the page would keep showing the previous source's results.
 *
 * We deliberately do NOT delegate to vueLifecycles.update: its implementation
 * assigns every prop onto the mounted root instance (`i[u] = a[u]`), which in
 * Vue 3 writes unknown keys onto the public instance proxy and warns. Driving
 * our own ref is both quieter and the thing the components actually read.
 */
export const update = async (props: PluginProps) => {
  selectedSourceKey.value = resolveSourceKey(props);
};

export const unmount = async (props: PluginProps) => {
  const result = await vueLifecycles.unmount(props);
  selectedSourceKey.value = "";
  return result;
};
