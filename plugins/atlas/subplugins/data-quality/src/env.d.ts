/// <reference types="vite/client" />

interface Window {
  System: {
    import: (id: string) => Promise<unknown>;
  };
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export default component;
}
