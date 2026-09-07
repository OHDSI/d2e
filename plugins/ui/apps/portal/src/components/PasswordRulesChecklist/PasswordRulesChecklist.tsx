import React, { FC } from "react";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import { PASSWORD_RULES } from "../../utils/credential-validation";
import { useTranslation } from "../../contexts";
import "./PasswordRulesChecklist.scss";

interface PasswordRulesChecklistProps {
  password: string;
  // After a blocked submit, unmet rules render red instead of neutral grey.
  showErrors?: boolean;
}

export const PasswordRulesChecklist: FC<PasswordRulesChecklistProps> = ({ password, showErrors = false }) => {
  const { getText, i18nKeys } = useTranslation();
  return (
    <ul className="password-rules-checklist">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        const modifier = met
          ? " password-rules-checklist__item--met"
          : showErrors
          ? " password-rules-checklist__item--error"
          : "";
        return (
          <li key={rule.id} className={`password-rules-checklist__item${modifier}`}>
            {met ? <CheckCircleIcon fontSize="inherit" /> : <RadioButtonUncheckedIcon fontSize="inherit" />}
            <span>{getText(i18nKeys[rule.i18nKey])}</span>
          </li>
        );
      })}
    </ul>
  );
};
