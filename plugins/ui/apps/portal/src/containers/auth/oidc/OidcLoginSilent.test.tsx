import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { OidcLoginSilent } from "./OidcLoginSilent";
import { AppProvider, useUser } from "../../../contexts";
import { config } from "../../../config";

/**
 * Covers two `OidcLoginSilent` behaviors: recovering when the first bootstrap
 * races a stale token (previously stuck on NoAccess until a hard reload), and
 * re-syncing userGroup/WebAPI roles on every token renewal, not just login.
 */

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => mockNavigate,
}));

let mockIdToken = "id-token-1";
let mockIdTokenPayload: any = { sub: "user-1" };
let mockAccessTokenPayload: any = { roles: ["role.researcher.demo"], iat: 1000 };

jest.mock("@axa-fr/react-oidc", () => ({
  useOidc: () => ({ login: jest.fn() }),
  useOidcAccessToken: () => ({ accessTokenPayload: mockAccessTokenPayload }),
  useOidcIdToken: () => ({ idToken: mockIdToken, idTokenPayload: mockIdTokenPayload }),
}));

jest.mock("../../../env", () => ({
  __esModule: true,
  default: { REACT_APP_IDP_SUBJECT_PROP: "sub" },
}));

const mockGetUserGroupList = jest.fn();
const mockSyncWebApiRoles = jest.fn();
jest.mock("../../../axios/api", () => ({
  api: {
    userMgmt: {
      getUserGroupList: (...args: any[]) => mockGetUserGroupList(...args),
      syncWebApiRoles: (...args: any[]) => mockSyncWebApiRoles(...args),
    },
    systemPortal: {
      getConfigsByTypes: () => Promise.resolve({}),
    },
  },
}));

jest.mock("../../../utils/disclaimerStorage", () => ({
  hasDisclaimerBeenAccepted: () => true,
}));

const Probe = () => {
  const { user } = useUser();
  return <div data-testid="probe">{JSON.stringify(user)}</div>;
};

const readProbe = () => JSON.parse(screen.getByTestId("probe").textContent || "{}");

describe("OidcLoginSilent - NoAccess after token refresh during tab inactivity", () => {
  const onReady = jest.fn();

  beforeEach(() => {
    // react-scripts' jest config runs with `resetMocks: true`, so every mock
    // implementation (not just call history) must be (re)configured here,
    // not at module scope, or it gets wiped before the test body runs.
    mockSyncWebApiRoles.mockResolvedValue({ ok: true });
    localStorage.clear();
    sessionStorage.clear();
    mockIdToken = "id-token-1";
    mockIdTokenPayload = { sub: "user-1" };
    mockAccessTokenPayload = { roles: ["role.researcher.demo"], iat: 1000 };
  });

  it("recovers access once a fresh token/session becomes available after the initial bootstrap raced a stale token", async () => {
    mockGetUserGroupList.mockRejectedValueOnce({ status: 403 });

    const { rerender } = render(
      <AppProvider>
        <OidcLoginSilent onReady={onReady} />
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(config.ROUTES.noAccess));
    expect(mockGetUserGroupList).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(readProbe().canAccessResearcherPortal).toBe(false));

    mockGetUserGroupList.mockResolvedValue({
      userId: "user-1",
      groups: [],
      alpRoleMap: {},
      alp_tenant_id: [],
      alp_role_study_researcher: ["study-1"],
      alp_role_tenant_viewer: [],
      alp_role_user_admin: false,
      alp_role_system_admin: false,
      alp_role_dashboard_viewer: false,
      alp_role_etl_mapping_contributor: false,
    });
    mockIdToken = "id-token-2";
    mockIdTokenPayload = { sub: "user-1", iat: 12345 };
    mockAccessTokenPayload = { roles: ["role.researcher.demo"], iat: 2000 };

    rerender(
      <AppProvider>
        <OidcLoginSilent onReady={onReady} />
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(mockGetUserGroupList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readProbe().canAccessResearcherPortal).toBe(true));
  });

  it("re-syncs userGroup/WebAPI roles on every token renewal, not just the first bootstrap", async () => {
    mockGetUserGroupList.mockResolvedValueOnce({
      userId: "user-1",
      groups: [],
      alpRoleMap: {},
      alp_tenant_id: [],
      alp_role_study_researcher: [],
      alp_role_tenant_viewer: [],
      alp_role_user_admin: false,
      alp_role_system_admin: false,
      alp_role_dashboard_viewer: false,
      alp_role_etl_mapping_contributor: false,
    });

    const { rerender } = render(
      <AppProvider>
        <OidcLoginSilent onReady={onReady} />
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(mockGetUserGroupList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSyncWebApiRoles).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readProbe().canAccessResearcherPortal).toBe(false));

    mockGetUserGroupList.mockResolvedValueOnce({
      userId: "user-1",
      groups: [],
      alpRoleMap: {},
      alp_tenant_id: [],
      alp_role_study_researcher: ["study-1"],
      alp_role_tenant_viewer: [],
      alp_role_user_admin: false,
      alp_role_system_admin: false,
      alp_role_dashboard_viewer: false,
      alp_role_etl_mapping_contributor: false,
    });
    mockIdToken = "id-token-2";
    mockIdTokenPayload = { sub: "user-1", iat: 12345 };
    mockAccessTokenPayload = { roles: ["role.researcher.demo", "role.researcher.study-1"], iat: 2000 };

    rerender(
      <AppProvider>
        <OidcLoginSilent onReady={onReady} />
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(mockGetUserGroupList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSyncWebApiRoles).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readProbe().canAccessResearcherPortal).toBe(true));
  });

  it("re-syncs on a silent token refresh even when the OIDC provider leaves the id_token unchanged", async () => {
    mockGetUserGroupList.mockResolvedValueOnce({
      userId: "user-1",
      groups: [],
      alpRoleMap: {},
      alp_tenant_id: [],
      alp_role_study_researcher: [],
      alp_role_tenant_viewer: [],
      alp_role_user_admin: false,
      alp_role_system_admin: false,
      alp_role_dashboard_viewer: false,
      alp_role_etl_mapping_contributor: false,
    });

    const { rerender } = render(
      <AppProvider>
        <OidcLoginSilent onReady={onReady} />
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(mockGetUserGroupList).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockSyncWebApiRoles).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(readProbe().canAccessResearcherPortal).toBe(false));

    mockGetUserGroupList.mockResolvedValueOnce({
      userId: "user-1",
      groups: [],
      alpRoleMap: {},
      alp_tenant_id: [],
      alp_role_study_researcher: ["study-1"],
      alp_role_tenant_viewer: [],
      alp_role_user_admin: false,
      alp_role_system_admin: false,
      alp_role_dashboard_viewer: false,
      alp_role_etl_mapping_contributor: false,
    });
    // id_token and its payload are untouched here — only the access token was
    // renewed, mirroring an OIDC provider that doesn't reissue id_token on a
    // refresh_token grant.
    mockAccessTokenPayload = { roles: ["role.researcher.demo"], iat: 2000 };

    rerender(
      <AppProvider>
        <OidcLoginSilent onReady={onReady} />
        <Probe />
      </AppProvider>
    );

    await waitFor(() => expect(mockGetUserGroupList).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mockSyncWebApiRoles).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(readProbe().canAccessResearcherPortal).toBe(true));
  });
});
