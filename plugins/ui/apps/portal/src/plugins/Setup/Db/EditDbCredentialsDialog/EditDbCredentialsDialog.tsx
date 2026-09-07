import React, { FC, useCallback, useEffect, useState } from "react";
import FormControl from "@mui/material/FormControl";
import Divider from "@mui/material/Divider";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import { Button, Dialog, InputLabel, MenuItem, Select, TextField, Tooltip } from "@portal/components";
import {
  AUTHENTICATION_MODES,
  AuthenticationMode,
  CREDENTIAL_USER_SCOPES,
  CloseDialogType,
  DB_DIALECTS,
  Feedback,
  IDatabase,
  IDbCredential,
  IDbCredentialAdd,
  ITestConnection,
  SERVICE_SCOPE_TYPES,
  USER_SCOPE_TYPES,
} from "../../../../types";
import { api } from "../../../../axios/api";
import "./EditDbCredentialsDialog.scss";
import { DbCredentialProcessor } from "../CredentialProcessor";
import { validateCredentials } from "../CredentialValidator";
import { useTranslation } from "../../../../contexts";

interface EditDbCredentialDialogProps {
  open: boolean;
  onClose?: (type: CloseDialogType) => void;
  db: IDatabase;
}

const EMPTY_CREDENTIALS: IDbCredentialAdd[] = [
  {
    username: "",
    password: "",
    salt: "",
    userScope: USER_SCOPE_TYPES.ADMIN,
    serviceScope: SERVICE_SCOPE_TYPES.INTERNAL,
  },
  {
    username: "",
    password: "",
    salt: "",
    userScope: USER_SCOPE_TYPES.READ,
    serviceScope: SERVICE_SCOPE_TYPES.INTERNAL,
  },
  // {
  //   username: "",
  //   password: "",
  //   salt: "",
  //   userScope: USER_SCOPE_TYPES.READ,
  //   serviceScope: SERVICE_SCOPE_TYPES.DATA_PLATFORM,
  // },
];

interface FormData {
  authenticationMode: AuthenticationMode;
  credentials: IDbCredentialAdd[];
}

const EMPTY_FORM_DATA: FormData = {
  authenticationMode: AUTHENTICATION_MODES.PASSWORD,
  credentials: EMPTY_CREDENTIALS,
};

interface ITestingResult {
  [key: string]: boolean;
}

export const EditDbCredentialsDialog: FC<EditDbCredentialDialogProps> = ({ open, onClose, db }) => {
  const { getText, i18nKeys } = useTranslation();
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});
  const dbCredentialProcessor = new DbCredentialProcessor();

  const [testing, setTesting] = useState(false);
  const [testingResult, setTestingResult] = useState<ITestingResult>({});

  useEffect(() => {
    if (open) {
      setFormData({ ...EMPTY_FORM_DATA, authenticationMode: AUTHENTICATION_MODES.PASSWORD });
      setFeedback({});
      setLoading(false);
    }
  }, [open, db]);

  const handleFormDataChange = useCallback((updates: { [field: string]: any }) => {
    setTestingResult({});
    setFormData((formData) => ({ ...formData, ...updates }));
  }, []);

  const handleAuthenticationModeChange = useCallback(
    (authenticationMode: string) => {
      handleFormDataChange({
        authenticationMode,
        credentials: authenticationMode === AUTHENTICATION_MODES.PASSWORD ? EMPTY_CREDENTIALS : [],
      });
    },
    [handleFormDataChange]
  );

  const handleClose = useCallback(
    (type: CloseDialogType) => {
      setFormData(EMPTY_FORM_DATA);
      typeof onClose === "function" && onClose(type);
    },
    [onClose]
  );

  const handleTestConnection = useCallback(async () => {
    try {
      setTesting(true);
      setFeedback({});

      const credentials = formData.credentials.filter((x) => Boolean(x.username));
      if (credentials.length === 0) {
        setFeedback({ type: "error", message: getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__TEST_CONNECTION_VALIDATE) });
        return;
      }

      // Parse extra JSON from Extra (Internal) if present
      const internalExtra = db.extra?.find((ext) => ext.serviceScope === SERVICE_SCOPE_TYPES.INTERNAL);
      let extra: Record<string, any> | undefined;
      if (internalExtra?.value) {
        try {
          extra = JSON.parse(internalExtra.value);
        } catch (err) {
          console.error("Invalid extra JSON", err);
          setFeedback({
            type: "error",
            message: "Invalid Extra (Internal) JSON configuration. Please correct the JSON and try again.",
          });
          return;
        }
      }

      const testResult: ITestingResult = {};
      const errorMessages: string[] = [];
      for (const cred of credentials) {
        try {
          const params: ITestConnection = {
            host: db.host,
            port: db.port,
            database: db.name,
            user: cred.username,
            password: cred.password,
            ...(extra && { extra }),
          };
          const result = await api.dbCredentialsMgr.testConnection(params);

          testResult[cred.username] = result.success;
          setTestingResult((x) => ({ ...x, [cred.username]: result.success }));
          if (!result.success && result.error) {
            errorMessages.push(result.error);
          }
        } catch (err: any) {
          testResult[cred.username] = false;
          setTestingResult((x) => ({ ...x, [cred.username]: false }));
          const errMsg = err?.data?.error || err?.data?.message;
          if (errMsg) {
            errorMessages.push(errMsg);
          }
        }
      }

      if (Object.keys(testResult).length > 0) {
        if (Object.values(testResult).every((x) => x)) {
          setFeedback({
            type: "success",
            message: getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__CONNECTION_VERIFIED),
            autoClose: 5000,
          });
        } else {
          setFeedback({
            type: "error",
            message:
              errorMessages.length > 0
                ? [...new Set(errorMessages)].join("; ")
                : getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__CONNECTION_FAILED),
          });
        }
      }
    } finally {
      setTesting(false);
    }
  }, [db, formData]);

  const handleUpdate = useCallback(async () => {
    try {
      setLoading(true);

      if (formData.authenticationMode === AUTHENTICATION_MODES.PASSWORD) {
        if (!validateCredentials(formData.credentials, setFeedback)) {
          return;
        }
      }

      const encryptedCredentials = formData.credentials
        .filter((cred) => Boolean(cred.username))
        .map(async (cred: IDbCredential) => dbCredentialProcessor.encryptDbCredential(cred));
      const credentials = await Promise.all(encryptedCredentials);

      await api.dbCredentialsMgr.updateDbCredentials({
        id: db.id,
        authenticationMode: formData.authenticationMode,
        credentials,
      });
      setFeedback({
        type: "success",
        message: getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__SUCCESS, [db.code]),
      });

      handleClose("success");
    } catch (err: any) {
      const message = err?.data?.message || err?.data?.error_description;
      if (message) {
        setFeedback({ type: "error", message });
      } else {
        console.log("There is an error in updating password", err);
        setFeedback({
          type: "error",
          message: getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__ERROR),
          description: getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__ERROR_DESCRIPTION),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [formData.credentials, formData.authenticationMode, db, getText]);

  return (
    <Dialog
      className="edit-db-dialog"
      title={getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__EDIT_DATABASE_CREDENTIALS)}
      closable
      fullWidth
      maxWidth="md"
      open={open}
      onClose={() => handleClose("cancelled")}
      feedback={feedback}
    >
      <Divider />
      <div className="edit-db-dialog__content">
        <div style={{ marginBottom: "32px" }}>
          <label className="database-code__label">{getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__DATABASE_CODE)}</label>
          <label className="database-code-value__label">{db.code}</label>
        </div>
        <div style={{ marginBottom: "32px", width: "250px" }} hidden={db.dialect !== DB_DIALECTS.HANA}>
          <FormControl fullWidth variant="standard">
            <InputLabel id="authentication-mode-select-label">
              {getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__AUTHENTICATION_MODE)}
            </InputLabel>
            <Select
              labelId="authentication-mode-select-label"
              id="authentication-mode-select"
              value={formData.authenticationMode}
              onChange={(event) => handleAuthenticationModeChange(event.target?.value)}
            >
              {Object.values(AUTHENTICATION_MODES).map((authenticationMode) => (
                <MenuItem value={authenticationMode} key={authenticationMode}>
                  {authenticationMode}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
        <div style={{ marginBottom: "32px" }} hidden={formData.authenticationMode !== AUTHENTICATION_MODES.PASSWORD}>
          <div style={{ marginBottom: "16px" }}>
            <b>{getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__CREDENTIALS)}</b>
          </div>
          {formData?.credentials?.map((cred, index) => (
            <div key={index} style={{ display: "flex", gap: "24px", marginBottom: "8px" }}>
              <div style={{ width: "100px" }}>
                <FormControl fullWidth variant="standard">
                  <InputLabel id="user-scope-label">
                    {getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__PRIVILEGE)}
                  </InputLabel>
                  <Select
                    labelId="user-scope-label"
                    id="user-scope"
                    readOnly
                    inputProps={{
                      tabIndex: -1,
                    }}
                    sx={{
                      "::before, ::after": {
                        borderBottom: "0 !important",
                      },
                      ".MuiSvgIcon-root": {
                        display: "none",
                      },
                    }}
                    value={cred.userScope}
                    onChange={(event) =>
                      handleFormDataChange({
                        credentials: [
                          ...formData.credentials.slice(0, index),
                          {
                            ...formData.credentials[index],
                            userScope: event.target?.value,
                          } as IDbCredential,
                          ...formData.credentials.slice(index + 1, formData.credentials.length),
                        ],
                      })
                    }
                  >
                    {CREDENTIAL_USER_SCOPES.map((scope) => (
                      <MenuItem value={scope} key={scope}>
                        {scope}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </div>
              <div style={{ width: "100px", flex: 1 }}>
                <TextField
                  label={getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__USERNAME)}
                  variant="standard"
                  fullWidth
                  value={cred.username}
                  onChange={(event) =>
                    handleFormDataChange({
                      credentials: [
                        ...formData.credentials.slice(0, index),
                        {
                          ...formData.credentials[index],
                          username: event.target?.value,
                        } as IDbCredential,
                        ...formData.credentials.slice(index + 1, formData.credentials.length),
                      ],
                    })
                  }
                />
              </div>
              <div style={{ width: "200px" }}>
                <TextField
                  label={getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__PASSWORD)}
                  variant="standard"
                  type="password"
                  sx={{ width: "200px" }}
                  value={cred.password}
                  onChange={(event) =>
                    handleFormDataChange({
                      credentials: [
                        ...formData.credentials.slice(0, index),
                        {
                          ...formData.credentials[index],
                          password: event.target?.value,
                        } as IDbCredential,
                        ...formData.credentials.slice(index + 1, formData.credentials.length),
                      ],
                    })
                  }
                />
              </div>
              <div style={{ width: "50px", alignSelf: "flex-end" }}>
                {Object.keys(testingResult).includes(cred.username) && (
                  <Tooltip
                    title={
                      testingResult[cred.username]
                        ? getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__CONNECTION_VERIFIED)
                        : getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__CONNECTION_FAILED)
                    }
                    placement="top"
                  >
                    {testingResult[cred.username] ? (
                      <CheckCircleIcon sx={{ width: 28, height: 28, color: "green" }} />
                    ) : (
                      <WarningIcon sx={{ width: 28, height: 28, color: "red" }} />
                    )}
                  </Tooltip>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      <Divider />

      <div className="edit-db-dialog__footer">
        <div style={{ display: "flex", gap: "8px" }} className="edit-db-dialog__footer-actions">
          <Button
            text={getText(i18nKeys.SAVE_DB_DIALOG__TEST_CONNECTION)}
            variant="outlined"
            loading={testing}
            onClick={handleTestConnection}
            {...(!testing && Object.values(testingResult).length > 0 && Object.values(testingResult).every((x) => x)
              ? { startIcon: <CheckCircleIcon sx={{ width: 28, height: 28, color: "green" }} /> }
              : {})}
          />
          <Button
            text={getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__CANCEL)}
            variant="outlined"
            onClick={() => handleClose("cancelled")}
            disabled={loading}
          />
          <Button text={getText(i18nKeys.EDIT_DB_CREDENTIAL_DIALOG__UPDATE)} onClick={handleUpdate} loading={loading} />
        </div>
      </div>
    </Dialog>
  );
};
