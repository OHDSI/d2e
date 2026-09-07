import React, { FC, useCallback, useMemo, useState } from "react";
import FormControl from "@mui/material/FormControl";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import FormHelperText from "@mui/material/FormHelperText";
import { Button, Dialog, Feedback, IconButton, Tooltip, VisibilityOffIcon, VisibilityOnIcon } from "@portal/components";
import { PasswordRulesChecklist } from "../../../../components";
import { CloseDialogType } from "../../../../types";
import { api } from "../../../../axios/api";
import { generateRandom } from "../../../../utils";
import { isPasswordValid, validateUsername, PASSWORD_MAX_LENGTH } from "../../../../utils/credential-validation";
import "./AddUserDialog.scss";
import { useTranslation, useFeedback } from "../../../../contexts";

interface AddUserDialogProps {
  open: boolean;
  onClose?: (type: CloseDialogType) => void;
}

interface FormData {
  username: string;
  password: string;
}

const EMPTY_FORM_DATA: FormData = { username: "", password: "" };

const AddUserDialog: FC<AddUserDialogProps> = ({ open, onClose }) => {
  const { getText, i18nKeys } = useTranslation();
  const { setFeedback: setPageFeedback } = useFeedback();
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [showErrors, setShowErrors] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>({});
  const [passwordShown, setPasswordShown] = useState(false);

  const usernameError = useMemo(() => validateUsername(formData.username), [formData.username]);
  const passwordTooLong = formData.password.length > PASSWORD_MAX_LENGTH;
  const passwordValid = isPasswordValid(formData.password) && !passwordTooLong;

  // Real-time feedback: show username errors as soon as the user types;
  // "required" errors only after a blocked submit.
  const usernameErrorVisible =
    usernameError != null && (showErrors || (formData.username !== "" && usernameError !== "required"));

  const usernameErrorText = useMemo(() => {
    switch (usernameError) {
      case "required":
        return getText(i18nKeys.ADD_USER_DIALOG__REQUIRED);
      case "tooShort":
        return getText(i18nKeys.ADD_USER_DIALOG__USERNAME_MIN_LENGTH);
      case "tooLong":
        return getText(i18nKeys.ADD_USER_DIALOG__USERNAME_MAX_LENGTH);
      case "invalidChars":
        return getText(i18nKeys.ADD_USER_DIALOG__USERNAME_HELPER);
      case "noLetterOrNumber":
        return getText(i18nKeys.ADD_USER_DIALOG__USERNAME_NO_LETTER);
      default:
        return "";
    }
  }, [usernameError, getText, i18nKeys]);

  const handleClose = useCallback(
    (type: CloseDialogType) => {
      setFormData(EMPTY_FORM_DATA);
      setShowErrors(false);
      setFeedback({});
      typeof onClose === "function" && onClose(type);
    },
    [onClose]
  );

  const handleAdd = useCallback(async () => {
    if (usernameError != null || !passwordValid) {
      // Dialog stays open; red inline indicators persist (design requirement).
      setShowErrors(true);
      return;
    }

    const username = formData.username.trim();

    try {
      setLoading(true);
      await api.userMgmt.addUser(username, formData.password);
      setPageFeedback({
        type: "success",
        message: getText(i18nKeys.ADD_USER_DIALOG__ADD_SUCCESS, [username]),
        autoClose: 6000,
      });
      handleClose("success");
    } catch (err: any) {
      const message: string | undefined = err?.data?.message;
      if (message && message.includes("already exist")) {
        // D3: user-fixable error — keep the dialog open with an inline banner.
        setFeedback({ type: "error", message });
      } else {
        // System/backend error: close the dialog, toast on the Users page (design requirement).
        setPageFeedback({
          type: "error",
          message: getText(i18nKeys.ADD_USER_DIALOG__ERROR_TOAST),
          description: getText(i18nKeys.ADD_USER_DIALOG__ERROR_TOAST_DESCRIPTION),
        });
        handleClose("cancelled");
      }
      console.error("err", err);
    } finally {
      setLoading(false);
    }
  }, [formData, usernameError, passwordValid, handleClose, setPageFeedback, getText, i18nKeys]);

  const handleTogglePassword = useCallback(() => {
    setPasswordShown((passwordShown) => !passwordShown);
  }, []);

  const handleGeneratePassword = useCallback(() => {
    setPasswordShown(true);
    setFormData((formData) => ({ ...formData, password: generateRandom(12) }));
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      handleAdd();
    },
    [handleAdd]
  );

  return (
    <Dialog
      className="add-user-dialog"
      title={getText(i18nKeys.ADD_USER_DIALOG__ADD_USER)}
      closable
      open={open}
      onClose={() => handleClose("cancelled")}
      feedback={feedback}
    >
      <form onSubmit={handleSubmit}>
        <Divider />
        <div className="add-user-dialog__content">
          <div className="u-padding-vertical--normal">
            <FormControl fullWidth>
              <TextField
                variant="standard"
                label={getText(i18nKeys.ADD_USER_DIALOG__USERNAME)}
                value={formData.username}
                onChange={(event) => setFormData((formData) => ({ ...formData, username: event.target.value }))}
                helperText={
                  usernameErrorVisible ? usernameErrorText : getText(i18nKeys.ADD_USER_DIALOG__USERNAME_HELPER)
                }
                error={usernameErrorVisible}
                autoFocus
              />
            </FormControl>
          </div>
          <div className="u-padding-vertical--normal">
            <FormControl fullWidth>
              <div style={{ display: "flex", alignItems: "flex-end" }}>
                <TextField
                  fullWidth
                  type={passwordShown ? "text" : "password"}
                  variant="standard"
                  label={getText(i18nKeys.ADD_USER_DIALOG__PASSWORD)}
                  value={formData.password}
                  onChange={(event) => setFormData((formData) => ({ ...formData, password: event.target.value }))}
                  error={showErrors && !passwordValid}
                />
                <Tooltip
                  title={
                    passwordShown
                      ? getText(i18nKeys.ADD_USER_DIALOG__HIDE_PASSWORD)
                      : getText(i18nKeys.ADD_USER_DIALOG__SHOW_PASSWORD)
                  }
                >
                  <IconButton
                    startIcon={passwordShown ? <VisibilityOffIcon /> : <VisibilityOnIcon />}
                    onClick={handleTogglePassword}
                  />
                </Tooltip>
                <Button
                  text={getText(i18nKeys.ADD_USER_DIALOG__GENERATE)}
                  variant="text"
                  onClick={handleGeneratePassword}
                />
              </div>
            </FormControl>
            {passwordTooLong && (
              <FormHelperText error={true}>{getText(i18nKeys.PASSWORD_RULES__MAX_LENGTH)}</FormHelperText>
            )}
            <PasswordRulesChecklist password={formData.password} showErrors={showErrors} />
          </div>
        </div>
        <Divider />
        <div className="button-group-actions">
          <Button
            text={getText(i18nKeys.ADD_USER_DIALOG__CANCEL)}
            onClick={() => handleClose("cancelled")}
            variant="outlined"
            block
            disabled={loading}
          />
          <Button
            text={getText(i18nKeys.ADD_USER_DIALOG__ADD)}
            onClick={handleAdd}
            block
            loading={loading}
            type="submit"
          />
        </div>
      </form>
    </Dialog>
  );
};

export default AddUserDialog;
