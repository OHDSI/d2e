import {
  registerApplication,
  start,
  unregisterApplication,
  getAppStatus,
  MOUNTED,
  NOT_LOADED,
  NOT_MOUNTED,
} from "single-spa";
import { RegisteredApp, SingleSpaPluginConfig } from "./types";
import { createActivityFunction, generateContainerId, matchesBasePath } from "./utils";
import { resolveModuleUrl } from "./overrideUtils";
import { preloadNow, preloadWhenIdle } from "./preloadScheduler";

const registeredApps: Map<string, RegisteredApp> = new Map();
const moduleCache: Map<string, Promise<any>> = new Map();
const propsStore: Map<string, Record<string, any>> = new Map();

export async function registerSingleSpaApp(config: SingleSpaPluginConfig): Promise<void> {
  if (registeredApps.has(config.id)) {
    console.warn(`[singleSpaRegistry] App ${config.id} is already registered`);
    return;
  }

  console.debug(`[singleSpaRegistry] ${config.id} - register`, { config });

  const initialProps = config.customProps || {};
  const activeWhen = createActivityFunction(config.basePath, config.customProps?.autoMount);

  propsStore.set(config.id, initialProps);

  const loadModule = (): Promise<any> => {
    if (moduleCache.has(config.id)) {
      return moduleCache.get(config.id)!;
    }
    console.debug(`[singleSpaRegistry] ${config.id} - loading module`);
    const resolvedUrl = resolveModuleUrl(config.url);
    const modulePromise = window.System.import(resolvedUrl).then((module: any) => {
      console.debug(`[singleSpaRegistry] ${config.id} - module loaded`);
      return module.default || module;
    });
    moduleCache.set(config.id, modulePromise);
    return modulePromise;
  };

  const registration = {
    name: config.id,
    app: loadModule,
    activeWhen,
    customProps: () => ({
      ...propsStore.get(config.id),
      containerId: generateContainerId(config.id),
    }),
  };

  registerApplication(registration);

  registeredApps.set(config.id, {
    config,
    registration,
    isActive: false,
  });

  // Kick off the bundle download so the module is cached in moduleCache by the
  // time activeWhen first fires. This eliminates the LOADING_SOURCE_CODE race
  // window where a portal switch can catch a heavy bundle (e.g. vue-mri)
  // mid-download.
  //
  // The researcher container registers every plugin on the same tick, so
  // preloading all of them at once put six bundles on the wire together and
  // starved whichever one the user had actually opened. Only the plugin on the
  // current route preloads straight away; the rest queue and download one at a
  // time in the background. See preloadScheduler.ts.
  if (matchesBasePath(config.basePath, window.location)) {
    preloadNow(config.id, loadModule);
  } else {
    preloadWhenIdle(config.id, loadModule);
  }
}

export function updateCustomProps(appId: string, customProps: Record<string, any>): void {
  if (!registeredApps.has(appId)) {
    console.warn(`[singleSpaRegistry] Cannot update props for unregistered app: ${appId}`);
    return;
  }

  console.debug(`[singleSpaRegistry] ${appId} - updating custom props`, customProps);

  const currentProps = propsStore.get(appId) || {};
  propsStore.set(appId, { ...currentProps, ...customProps });

  window.dispatchEvent(
    new CustomEvent("custom-props-changed", {
      detail: { appId, ...customProps },
    })
  );
}

export function startSingleSpa(options?: { urlRerouteOnly?: boolean }): void {
  start(options || { urlRerouteOnly: true });
  console.log("[singleSpaRegistry] Started monitoring URL changes");
}

export async function unloadSingleSpaApp(appId: string): Promise<void> {
  if (!registeredApps.has(appId)) {
    console.debug(`[singleSpaRegistry] App ${appId} is not registered, skipping unload`);
    return;
  }

  const status = getAppStatus(appId);
  console.debug(`[singleSpaRegistry] ${appId} - unregistering, current status: ${status}`);

  try {
    if (status === MOUNTED || status === NOT_MOUNTED || status === NOT_LOADED) {
      await unregisterApplication(appId);
      console.debug(`[singleSpaRegistry] ${appId} - unregistered successfully`);
      registeredApps.delete(appId);
      moduleCache.delete(appId);
      propsStore.delete(appId);
    } else {
      // App is mid-lifecycle (e.g. LOADING_SOURCE_CODE). single-spa still
      // owns it, so leave our Map entry intact to stay in sync — otherwise
      // the next register call would call registerApplication again and
      // single-spa would throw #21.
      console.warn(`[singleSpaRegistry] ${appId} in status ${status}, deferring cleanup`);
    }
  } catch (error) {
    console.error(`[singleSpaRegistry] Failed to unregister app ${appId}:`, error);
  }
}
