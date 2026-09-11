import React, { FC, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Loader } from "@portal/components";
import { PortalType, User } from "../../../types";
import { useDialogHelper } from "../../../hooks";
import { useToken, useTranslation, useUser } from "../../../contexts";
import env from "../../../env";
import { config, FEATURE_ATLAS } from "../../../config";
import { FeatureGate } from "../../../config/FeatureGate";
import { api } from "../../../axios/api";
import { ChangeMyPasswordDialog } from "./ChangeMyPasswordDialog/ChangeMyPasswordDialog";
import DeleteAccountDialog from "./DeleteAccountDialog/DeleteAccountDialog";
import { ChangeLanguageDialog } from "./ChangeLanguageDialog/ChangeLanguageDialog";
import { LegalCard } from "../Legal/LegalCard";
import "./Account.scss";
import { resolveIdTokenName } from "../../../utils/idTokenName";

interface AccountProps {
  portalType: PortalType;
}

const subProp = env.REACT_APP_IDP_SUBJECT_PROP;

const EMPTY_MY_USER: User = { id: "", name: "" };

export const Account: FC<AccountProps> = ({ portalType }) => {
  const { getText, i18nKeys } = useTranslation();
  const navigate = useNavigate();
  const { idTokenClaims } = useToken();
  const [myUser, setMyUser] = useState(EMPTY_MY_USER);
  const [showDeleteAccount, openDeleteAccount, closeDeleteAccount] = useDialogHelper(false);
  const [showPwd, openPwdDialog, closePwdDialog] = useDialogHelper(false);
  const [showLanguage, openLanguageDialog, closeLanguageDialog] = useDialogHelper(false);
  const { user, setUserGroup } = useUser();
  const [loading, setLoading] = useState(false);

  const fetchUserGroups = useCallback(async () => {
    setLoading(true);
    const userGroups = await api.userMgmt.getUserGroupList(idTokenClaims[subProp]);
    setUserGroup(idTokenClaims[subProp], userGroups);
    setLoading(false);
  }, [idTokenClaims, setUserGroup]);

  useEffect(() => {
    if (idTokenClaims) {
      fetchUserGroups();
      setMyUser({
        id: idTokenClaims[subProp],
        name: resolveIdTokenName(idTokenClaims) ?? "",
      });
    }
  }, [idTokenClaims, fetchUserGroups]);

  const handleSwitchToResearcher = useCallback(() => {
    navigate(config.ROUTES.researcher);
  }, [navigate]);

  const handleSwitchToAdmin = useCallback(() => {
    navigate(config.ROUTES.systemadmin);
  }, [navigate]);

  const handleSwitchToEtl = useCallback(() => {
    navigate(config.ROUTES.etl);
  }, [navigate]);

  const handleSwitchToAtlas = useCallback(() => {
    // Atlas is served outside the portal SPA, so do a full-page redirect.
    window.location.href = `${window.location.origin}/atlas/`;
  }, []);

  const handleLogout = useCallback(() => {
    navigate(config.ROUTES.logout);
  }, [navigate]);

  return (
    <div className="account">
      <div className="account__container">
        <div className="account__content">
          <div className="account__content_account">
            <Card title={getText(i18nKeys.ACCOUNT__ACCOUNT)}>
              <div className="account__content_account_details">
                <div>
                  <span>{getText(i18nKeys.ACCOUNT__NAME)}</span>
                  <span>{myUser?.name || "-"}</span>
                </div>
                <div>
                  <span>{getText(i18nKeys.ACCOUNT__EMAIL)}</span>
                  <span>{idTokenClaims.email || "-"}</span>
                </div>
              </div>
            </Card>
            <div className="account__content_actions">
              {loading ? (
                <Loader />
              ) : (
                <>
                  {portalType === "system_admin" && user.canAccessResearcherPortal && (
                    <Button
                      block
                      text={getText(i18nKeys.ACCOUNT__SWITCH_TO_RESEARCHER_PORTAL)}
                      onClick={handleSwitchToResearcher}
                    />
                  )}
                  {portalType === "researcher" && user.canAccessSystemAdminPortal && (
                    <Button block text={getText(i18nKeys.ACCOUNT__SWITCH_TO_ADMIN_PORTAL)} onClick={handleSwitchToAdmin} />
                  )}
                  {(portalType === "system_admin" || portalType === "researcher") && user.canAccessEtlPortal && (
                    <Button block text={getText(i18nKeys.ACCOUNT__SWITCH_TO_ETL_PORTAL)} onClick={handleSwitchToEtl} />
                  )}
                  {portalType === "etl" && user.canAccessSystemAdminPortal && (
                    <Button
                      block
                      text={getText(i18nKeys.ACCOUNT__SWITCH_TO_ADMIN_PORTAL)}
                      onClick={handleSwitchToAdmin}
                    />
                  )}
                  {portalType === "etl" && user.canAccessResearcherPortal && (
                    <Button
                      block
                      text={getText(i18nKeys.ACCOUNT__SWITCH_TO_RESEARCHER_PORTAL)}
                      onClick={handleSwitchToResearcher}
                    />
                  )}
                  <FeatureGate featureFlags={[FEATURE_ATLAS]}>
                    <Button block text={getText(i18nKeys.ACCOUNT__SWITCH_TO_ATLAS)} onClick={handleSwitchToAtlas} />
                  </FeatureGate>
                  <Button block text={getText(i18nKeys.ACCOUNT__LOGOUT)} onClick={handleLogout} />
                  <Button
                    block
                    variant="outlined"
                    text={getText(i18nKeys.ACCOUNT__CHANGE_PASSWORD)}
                    onClick={openPwdDialog}
                  />
                  <Button
                    block
                    variant="outlined"
                    text={getText(i18nKeys.ACCOUNT__CHANGE_LANGUAGE)}
                    onClick={openLanguageDialog}
                  />
                  <Button
                    block
                    variant="outlined"
                    text={getText(i18nKeys.ACCOUNT__DELETE_ACCOUNT)}
                    onClick={openDeleteAccount}
                  />
                </>
              )}
            </div>
          </div>
          <div className="account__content_legal">
            <LegalCard />
          </div>
        </div>
      </div>
      <DeleteAccountDialog open={showDeleteAccount} onClose={closeDeleteAccount} />
      <ChangeMyPasswordDialog open={showPwd} onClose={closePwdDialog} />
      <ChangeLanguageDialog open={showLanguage} onClose={closeLanguageDialog} />
    </div>
  );
};
