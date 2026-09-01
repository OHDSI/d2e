import { AppLifecycles } from "./types";

export function isSingleSpaApp(module: any): module is AppLifecycles {
  return (
    module &&
    typeof module.bootstrap === "function" &&
    typeof module.mount === "function" &&
    typeof module.unmount === "function"
  );
}

/**
 * True when the browser is on this plugin's route.
 *
 * Deliberately ignores autoMount. An autoMount plugin is always "active" for
 * single-spa, but for preload ordering we want to know whether the user is
 * actually looking at it.
 */
export function matchesBasePath(basePath: string, location: Location): boolean {
  return location.pathname === basePath || location.pathname.startsWith(basePath + "/");
}

export function createActivityFunction(basePath: string, autoMount?: boolean): (location: Location) => boolean {
  return (location: Location) => {
    if (autoMount) {
      return true;
    }

    return matchesBasePath(basePath, location);
  };
}

export function generateContainerId(appName: string): string {
  return `single-spa-application:${appName}`;
}
