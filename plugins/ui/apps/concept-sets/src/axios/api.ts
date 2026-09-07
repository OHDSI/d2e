import { Terminology } from "./terminology";
import { Portal } from "./portal";
import { D2eWebapi } from "./d2e-webapi";
import { Translation } from "./translation";
import { PublicWebapiProxyAPI } from "./public-webapi-proxy";

export const api = {
  terminology: new Terminology(),
  portal: new Portal(),
  d2eWebapi: new D2eWebapi(),
  translation: new Translation(),
  publicWebapiProxyAPI: new PublicWebapiProxyAPI(),
};
