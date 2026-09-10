import React, { FC, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { Dialog, Button, Loader, Feedback } from "@portal/components";
import { api } from "../../../axios/api";
import { ConfigTypes } from "../../../constant";
import Divider from "@mui/material/Divider";
import { useDisclaimer, useTranslation } from "../../../contexts";
import { config } from "../../../config";
import { i18nKeys } from "../../../contexts/app-context/states";
import { LogResponseType } from "../../../constant";
import { setDisclaimerAccepted as saveDisclaimerToStorage } from "../../../utils/disclaimerStorage";
import env from "../../../env";
import "./DisclaimerDialog.scss";

const logUserResponse = async (logResponse: LogResponseType): Promise<void> => {
  if (typeof env.REACT_APP_LOG_DISCLAIMER === "string" && env.REACT_APP_LOG_DISCLAIMER.toLowerCase() === "true") {
    try {
      await api.systemPortal.logAuditResponse(logResponse);
    } catch {
      // Disclaimer auditing must not block a user's decision.
    }
  }
};

export const DisclaimerDialog: FC = () => {
  const navigate = useNavigate();
  const { disclaimer, setIsDisclaimerAccepted } = useDisclaimer();
  const { getText } = useTranslation();
  const [configs, setConfigs] = useState<{ [key: string]: string }>({});
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});

  const shouldOpen = disclaimer.shouldDisplay === true && !disclaimer.isDisclaimerAccepted;

  const handleAccept = useCallback(async () => {
    setFeedback({});
    setIsDisclaimerAccepted(true);
    // Persist acceptance to localStorage (only store when accepted)
    saveDisclaimerToStorage(true);
    void logUserResponse(LogResponseType.ACCEPTED);
  }, [setIsDisclaimerAccepted]);

  const handleLogout = useCallback(() => {
    void logUserResponse(LogResponseType.DECLINED);
    navigate(config.ROUTES.logout);
  }, [navigate]);

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const configs = await api.systemPortal.getConfigsByTypes([ConfigTypes.DISCLAIMER]);
      setConfigs({ ...configs });
    } catch (error: any) {
      console.error("err", error);
      if (error?.data?.message) {
        setFeedback({ type: "error", message: error?.data?.message });
      } else {
        setFeedback({
          type: "error",
          message: getText(i18nKeys.DISCLAIMER_DIALOG_DIALOG__ERROR),
          description: getText(i18nKeys.DISCLAIMER_DIALOG_DIALOG__DESCRIPTION),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [getText]);

  useEffect(() => {
    if (!shouldOpen) {
      return;
    }
    fetchConfigs();
  }, [shouldOpen, fetchConfigs]);

  return (
    <Dialog
      title={getText(i18nKeys.DISCLAIMER_DIALOG__TITLE)}
      className="disclaimer-dialog"
      open={shouldOpen}
      maxWidth="lg"
      feedback={feedback}
    >
      <div className="disclaimer-dialog__content">
        {loading ? <Loader /> : <ReactMarkdown>{configs[ConfigTypes.DISCLAIMER]}</ReactMarkdown>}
      </div>

      <Divider />
      <div className="button-group-actions">
        <Button variant="outlined" block onClick={handleLogout} text={getText(i18nKeys.ACCOUNT__LOGOUT)} />
        <Button block onClick={handleAccept} text={getText(i18nKeys.DISCLAIMER_DIALOG__ACCEPT)} />
      </div>
    </Dialog>
  );
};
