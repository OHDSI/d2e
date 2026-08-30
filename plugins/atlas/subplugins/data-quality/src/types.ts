import type { Ref } from 'vue';

/**
 * Context Atlas3 passes to a plugin mounted as a *parcel* on a mount surface
 * (for us: `datasource-sidebar`). Delivered NESTED under `props.hostContext` —
 * both at mount (`mountPluginParcel(id, el, { hostContext })`) and on change
 * (`parcel.update({ hostContext })`). See @ohdsi/atlas3
 * src/plugins/components/PluginParcelOutlet.vue.
 */
export interface PluginHostContext {
  surface: string;
  itemId: string;
  locale: string;
  permissions: string[];
  /** WebAPI sourceKey of the source selected in the Data Sources header. */
  sourceKey?: string;
}

// Props Atlas3 passes to a plugin. Two shapes, because Atlas mounts plugins two
// different ways and they do NOT carry the same props:
//
//   routed app (declared via `menuItems`, mounted by PluginLoader)
//     -> flat `datasetId`, plus `uiFilesUrl`, `containerId`, `idpUserId`
//   parcel     (declared via `mountPoints`, mounted by PluginParcelOutlet)
//     -> nested `hostContext.sourceKey`, plus `t`; NO datasetId, NO uiFilesUrl
//
// Everything optional below is "present in one mode only". Resolve the selected
// source through resolveSourceKey() rather than reading either field directly.
export interface PluginProps {
  name: string;
  appId: string;
  /** Routed-app only. */
  containerId?: string;
  domElement?: HTMLElement;
  /**
   * Routed-app only. Its absence is the signal that we are a parcel — in that
   * mode Atlas's parcelLoader injects our style.css itself, so injecting again
   * would duplicate the <link>.
   */
  uiFilesUrl?: string;
  /** Parcel only: nested host context carrying the selected sourceKey. */
  hostContext?: PluginHostContext;
  /** Parcel only: the host's i18n lookup, `t(key, defaultValue)`. */
  t?: (key: string, defaultValue?: string) => string;
  /** Resolves the host's Logto access token; may return "" before login settles. */
  getToken: () => Promise<string>;
  username?: string;
  idpUserId?: string;
  /**
   * Routed-app only. The WebAPI sourceKey of the source selected in the Atlas
   * header. d2e creates every WebAPI source with sourceKey = dataset.id, so this
   * is already the dataset UUID the /jobplugins/dqd endpoints expect — no
   * translation needed. The parcel equivalent is `hostContext.sourceKey`.
   */
  datasetId?: string;
  locale?: string;
  isAtlas?: boolean;
  autoMount?: boolean;
  authContext?: {
    user: { id: string; username: string; email?: string; permissions: string[] } | null;
    token: string | null;
    isAuthenticated: boolean;
    hasPermission: (permission: string) => boolean;
  };
  messageBus?: {
    send: <T = unknown>(type: string, payload: T) => void;
    request: <TReq = unknown, TRes = unknown>(type: string, payload: TReq) => Promise<TRes>;
    subscribe: <T = unknown>(type: string, callback: (payload: T) => void) => () => void;
  };
}

/** Injected into the component tree by main.ts under the `dqHostCtx` key. */
export interface DqHostCtx {
  getToken: () => Promise<string>;
  /**
   * The host's i18n lookup, `t(key, fallback)`. Atlas hands `t` to parcels only,
   * so main.ts substitutes a pass-through returning the fallback — which is what
   * the routed-app path, the vite dev harness and the unit tests run on.
   */
  t: (key: string, fallback?: string) => string;
  /**
   * Reactive because Atlas mutates it in place rather than remounting us when
   * the header's source changes: `parcel.update` as a parcel, a
   * `custom-props-changed` window event as a routed app.
   */
  datasetId: Ref<string>;
  appId: string;
  locale: string;
  uiFilesUrl: string;
  /**
   * Which of the two mount modes above we are in. Derived from `uiFilesUrl`,
   * the same signal bootstrap() uses to decide whether to inject our CSS, so
   * the mode is read off one prop rather than guessed twice.
   *
   * It matters because the two modes learn about a source change through
   * different channels, and only the routed one may listen to the window event
   * (see useHostContext).
   */
  isRoutedApp: boolean;
}

/**
 * Payload Atlas3 dispatches on `window` when the selected data source changes.
 * `appId` identifies which plugin the update is for — a plugin must ignore
 * events addressed to its siblings.
 */
export interface CustomPropsChangedDetail {
  appId?: string;
  datasetId?: string;
}

export const DQ_HOST_CTX = 'dqHostCtx';

/**
 * The selected data source, wherever Atlas put it for the mount mode we're in.
 * Parcel wins because in parcel mode `datasetId` is simply absent; keeping both
 * means the plugin works unchanged if it is ever also routed via `menuItems`.
 */
export function resolveSourceKey(props: PluginProps): string {
  return props.hostContext?.sourceKey ?? props.datasetId ?? '';
}
