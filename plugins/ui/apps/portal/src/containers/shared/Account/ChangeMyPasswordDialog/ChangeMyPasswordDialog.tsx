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
import { useFeedback, useTranslation } from "../../../../contexts";
import { api } from "../../../../axios/api";

interface ChangeMyPasswordDialogProps {
  open: boolean;
  onClose?: () => void;
}

interface FormData {
  oldPassword: string;
  password: string;
}

const EMPTY_FORM_DATA: FormData = { oldPassword: "", password: "" };

export const ChangeMyPasswordDialog: FC<ChangeMyPasswordDialogProps> = ({ open, onClose }) => {
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
    if (!passwordValid) {
      setShowErrors(true);
      return;
    }

    try {
      setLoading(true);
      await api.userMgmt.changeMyPassword(formData.oldPassword, formData.password);
      setFeedback({
        variant: "alert",
        type: "success",
        message: getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__PASSWORD_UPDATED),
        autoClose: 5000,
      });
      typeof onClose === "function" && onClose();
    } catch (err: any) {
      const message = err?.data?.message || err?.data?.error_description;
      if (message) {
        // Surface the server-side policy rejection returned by MeRouter PUT /password.
        setDialogFeedback({ type: "error", message });
      } else {
        console.log("There is an error in updating password", err);
        setDialogFeedback({
          type: "error",
          title: getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__PASSWORD_UPDATED_ERROR_MESSAGE),
          message: getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__PASSWORD_UPDATED_ERROR_DESCRIPTION),
        });
      }
    } finally {
      setLoading(false);
    }
  }, [formData.oldPassword, formData.password, passwordValid, getText, setFeedback, onClose, i18nKeys]);

  return (
    <Dialog
      title={getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__DIALOG_TITLE)}
      closable
      bodyPadded
      open={open}
      onClose={handleClose}
      feedback={dialogFeedback}
      footerSlots={{
        block: true,
        secondary: (
          <Button
            text={getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__BUTTON_CANCEL)}
            onClick={handleClose}
            variant="outlined"
            disabled={loading}
          />
        ),
        primary: (
          <Button
            text={getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__BUTTON_UPDATE)}
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
              type="password"
              variant="standard"
              label={getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__DIALOG_TEXT_FIELD_LABEL_1)}
              value={formData.oldPassword}
              onChange={(event) => setFormData((formData) => ({ ...formData, oldPassword: event.target.value }))}
              autoFocus
            />
          </div>
        </FormControl>
      </div>
      <div className="u-padding-vertical--normal">
        <FormControl fullWidth>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <TextField
              fullWidth
              type={passwordShown ? "text" : "password"}
              variant="standard"
              label={getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__DIALOG_TEXT_FIELD_LABEL_2)}
              value={formData.password}
              onChange={(event) => setFormData((formData) => ({ ...formData, password: event.target.value }))}
              error={showErrors && !passwordValid}
            />
            <Tooltip
              title={
                passwordShown
                  ? getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__DIALOG_TOOLTIP_TITLE_1)
                  : getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__DIALOG_TOOLTIP_TITLE_2)
              }
            >
              <IconButton
                startIcon={passwordShown ? <VisibilityOffIcon /> : <VisibilityOnIcon />}
                onClick={handleTogglePassword}
              />
            </Tooltip>
            <Button
              text={getText(i18nKeys.CHANGE_MY_PASSWORD_DIALOG__BUTTON_GENERATE)}
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
