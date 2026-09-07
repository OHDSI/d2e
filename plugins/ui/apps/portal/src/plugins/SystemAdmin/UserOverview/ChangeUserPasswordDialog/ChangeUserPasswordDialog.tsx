import React, { FC, useCallback, useEffect, useState } from "react";
import FormHelperText from "@mui/material/FormHelperText";
import {
  Button,
  Dialog,
  Feedback,
  FormControl,
  IconButton,
  TextField,
  Tooltip,
  VisibilityOffIcon,
  VisibilityOnIcon,
} from "@portal/components";
import { PasswordRulesChecklist } from "../../../../components";
import { generateRandom } from "../../../../utils";
import { isPasswordValid, PASSWORD_MAX_LENGTH } from "../../../../utils/credential-validation";
import { api } from "../../../../axios/api";
import { useFeedback, useTranslation } from "../../../../contexts";

interface ChangeUserPasswordDialogProps {
  userId: string;
  userName?: string;
  open: boolean;
  onClose?: () => void;
}

interface FormData {
  password: string;
}

const EMPTY_FORM_DATA: FormData = { password: "" };

export const ChangeUserPasswordDialog: FC<ChangeUserPasswordDialogProps> = ({ userId, userName, open, onClose }) => {
  const { getText, i18nKeys } = useTranslation();
  const { setFeedback } = useFeedback();
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [loading, setLoading] = useState(false);
  const [passwordShown, setPasswordShown] = useState(false);
  const [dialogFeedback, setDialogFeedback] = useState<Feedback>({});
  const [showErrors, setShowErrors] = useState(false);

  const passwordTooLong = formData.password.length > PASSWORD_MAX_LENGTH;
  const passwordValid = isPasswordValid(formData.password) && !passwordTooLong;

  useEffect(() => {
    setFormData(EMPTY_FORM_DATA);
    setDialogFeedback({});
    setPasswordShown(false);
    setLoading(false);
    setShowErrors(false);
  }, [open]);

  const handleClose = useCallback(() => {
    setDialogFeedback({});
    typeof onClose === "function" && onClose();
  }, [onClose]);

  const handleTogglePassword = useCallback(() => {
    setPasswordShown((passwordShown) => !passwordShown);
  }, []);

  const handleGeneratePassword = useCallback(() => {
    setPasswordShown(true);
    setFormData((formData) => ({ ...formData, password: generateRandom(12) }));
  }, []);

  const handleUpdate = useCallback(async () => {
    if (!userId) return;

    if (!passwordValid) {
      setShowErrors(true);
      return;
    }

    try {
      setLoading(true);
      await api.userMgmt.changeUserPassword(userId, formData.password);
      setFeedback({
        variant: "alert",
        type: "success",
        message: getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__PASSWORD_UPDATED, [userName ?? ""]),
        autoClose: 5000,
      });
      typeof onClose === "function" && onClose();
    } catch (err: any) {
      if (err?.data?.message) {
        // Surface the server-side policy rejection returned by UserRouter PUT /:id/password.
        setDialogFeedback({ type: "error", message: err?.data?.message });
      } else {
        console.log("There is an error in updating user's password", err);
        setDialogFeedback({
          type: "error",
          title: getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__ERROR),
          message: getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__ERROR_DESCRIPTION),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [userId, userName, formData.password, passwordValid, getText, setFeedback, onClose, i18nKeys]);

  return (
    <Dialog
      title={getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__CHANGE_USER_PASSWORD)}
      closable
      bodyPadded
      open={open}
      onClose={handleClose}
      feedback={dialogFeedback}
      footerSlots={{
        block: true,
        secondary: (
          <Button
            text={getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__CANCEL)}
            onClick={handleClose}
            variant="outlined"
            disabled={loading}
          />
        ),
        primary: (
          <Button
            text={getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__UPDATE)}
            onClick={handleUpdate}
            loading={loading}
          />
        ),
      }}
    >
      <div className="u-padding-vertical--normal">
        <FormControl fullWidth>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <TextField
              fullWidth
              type={passwordShown ? "text" : "password"}
              variant="standard"
              label={getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__PASSWORD)}
              value={formData.password}
              onChange={(event) => setFormData((formData) => ({ ...formData, password: event.target.value }))}
              error={showErrors && !passwordValid}
              autoFocus
            />
            <Tooltip
              title={
                passwordShown
                  ? getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__HIDE_PASSWORD)
                  : getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__SHOW_PASSWORD)
              }
            >
              <IconButton
                startIcon={passwordShown ? <VisibilityOffIcon /> : <VisibilityOnIcon />}
                onClick={handleTogglePassword}
              />
            </Tooltip>
            <Button
              text={getText(i18nKeys.CHANGE_USER_PASSWORD_DIALOG__GENERATE)}
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
    </Dialog>
  );
};
