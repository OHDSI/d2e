# Username & Password Validation via Logto Policy (Issue #2713) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use devx:subagent-driven-development (recommended) or devx:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time username/password validation (with a live rules checklist) to the Add User and change-password dialogs, enforcing password rules server-side through Logto's built-in password policy and username rules in `alp-usermgmt`.

**Architecture:** The portal UI gets a small pure validation module plus a reusable `PasswordRulesChecklist` component wired into three dialogs; submission is blocked until all rules pass. Backend enforcement is split per the approved Option B: password policy is configured once in Logto (seeded by `alp-logto/post-init`, so it protects *every* password flow: add user, admin change, self-service change), while username rules (which Logto does not cover) are enforced in `alp-usermgmt`'s `MemberRouter`.

**Tech Stack:** React 18 + MUI 5 + custom `@portal/components` (portal app, CRA/jest), Express-style routers in the `alp-usermgmt` edge function, Logto Management API (`sign-in-exp` seeding in `services/alp-logto/post-init`).

**References:**
- Issue: https://github.com/OHDSI/Data2Evidence/issues/2713
- Design requirement (authoritative acceptance criteria + Figma link): https://github.com/OHDSI/Data2Evidence/issues/2713#issuecomment-4965859493
- Base commit: `c6479368` (`origin/develop`, fetched 2026-07-23)

---

## Pending team decisions (resolve during plan review — plan uses the stated defaults)

The team asked not to assume. The plan is executable as written using these defaults, but each item below should be confirmed (or overridden) during plan review **before implementation starts**:

| # | Question | Default used by this plan |
|---|----------|---------------------------|
| D1 | **Password max length** — issue says max 64, the design comment specifies no max. | Enforce max **64** in the Logto policy; UI shows an inline error only if exceeded (max is *not* part of the 4-item checklist, matching the Figma checklist). |
| D2 | **Logto policy granularity** — Logto expresses composition as "at least N of 4 character types (lower/upper/digit/symbol)", not "letter AND number AND special". | Set `characterTypes: { min: 3 }` (closest server-side approximation; accepts e.g. `Abcdefg1` without a symbol). The UI checklist enforces the exact letter+number+special rule, so all portal flows meet the spec; only direct API callers can exploit the gap. This is the accepted Option B trade-off. |
| D3 | **"User already exists" (HTTP 400)** — spec says backend errors close the dialog with a page toast, but this error is user-fixable. | Keep the dialog **open** with the in-dialog error banner for the "already exists" message; close + page toast for all *other* backend errors. |
| D4 | **Change-password dialogs** — the comment mandates the checklist there; it does not mandate toast/close behavior changes. | Add checklist + submit gating only; keep their existing in-dialog success/error feedback. |
| D5 | **Generate button** — spec says "no changes on the Generate button functionality", but the current generator (`generateRandom`) produces a password with no digit ~14% and no special char ~47% of the time, which the new checklist would then block. | Keep the button and its UX identical, but make the generator retry until the generated password satisfies the checklist (treated as a bugfix, not a functionality change). |
| D6 | **Logto `rejects` options** (pwned-password list, repetition/sequence, user-info) — these would cause backend rejections the UI checklist cannot predict. | Leave them all **off** for UI/backend consistency. Team may prefer `pwned: true` for security; if so, the surfaced Logto error message is shown in the dialog banner. |
| D7 | **Figma styling** — exact colors/spacing of the checklist need the linked Figma frame. | Approximate from the screenshot attached to the design comment (grey unmet / green met / red unmet-after-submit). |

**Known risk (verified during Task 8):** the pinned Logto image (`ghcr.io/data2evidence/logto-with-logto-schema@sha256:0660c0bc…`) must support `passwordPolicy` on the sign-in-experience API (Logto ≥ 1.10). Task 8 verifies this against the running stack; if unsupported, STOP and escalate — an image bump is a separate decision.

---

## Current behavior (verified at `c6479368`)

- `AddUserDialog.tsx` validates only on submit: username against `/^\w+$/` (a single `_` passes), password only for presence. No lengths, no trim, no checklist. Backend errors render inside the dialog.
- `ChangeUserPasswordDialog.tsx` / `ChangeMyPasswordDialog.tsx`: no rule validation at all.
- Backend `MemberRouter` `POST /member/tenant/add`: username presence + `/^\w+$/` only; password not validated; a Logto `ERR_BAD_REQUEST` is mapped to a generic message revealing Logto's own constraint that usernames must not start with a digit.
- `UserRouter` `PUT /user/:id/password` and the `me/password` route forward the password to Logto unvalidated — whitespace-only passwords currently reach the IdP.
- Logto sign-in experience is seeded in `services/alp-logto/post-init/src/main.ts` (object at ~line 476, pushed via `update("sign-in-exp", …)` at line 503) and contains **no** `passwordPolicy`.
- `UserOverview.tsx` refetches the list when the dialog closes with `"success"` and already uses the page-level `useFeedback()` toast mechanism.
- `getText(key, params?)` supports `{0}` placeholders (see `SHARED_DRILLDOWN__ERROR_MESSAGE`).
- Portal unit tests: CRA jest (`react-scripts test`), wrapping components in `AppProvider` and mocking `api` (pattern: `src/contexts/app-context/translation.test.tsx`). `alp-usermgmt` has no test runner — backend changes are verified with `curl` against the local stack.

## File structure

| File | Responsibility |
|---|---|
| Create `plugins/ui/apps/portal/src/utils/credential-validation.ts` | Pure rule definitions: `PASSWORD_RULES`, `isPasswordValid`, `validateUsername`, `PASSWORD_MAX_LENGTH` |
| Create `plugins/ui/apps/portal/src/utils/credential-validation.test.ts` | Unit tests for the rules |
| Create `plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.tsx` + `.scss` | Reusable live checklist (green tick when met; red when unmet after a blocked submit) |
| Create `plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.test.tsx` | Component test |
| Modify `plugins/ui/apps/portal/src/components/index.ts` | Export the new component |
| Modify `plugins/ui/apps/portal/src/contexts/app-context/states/translation-state.ts` | New i18n keys |
| Modify `plugins/ui/apps/portal/src/plugins/SystemAdmin/UserOverview/AddUserDialog/AddUserDialog.tsx` | Live validation, checklist, submit gating, success/error toasts per spec |
| Modify `plugins/ui/apps/portal/src/plugins/SystemAdmin/UserOverview/ChangeUserPasswordDialog/ChangeUserPasswordDialog.tsx` | Checklist + gating |
| Modify `plugins/ui/apps/portal/src/containers/shared/Account/ChangeMyPasswordDialog/ChangeMyPasswordDialog.tsx` | Checklist + gating |
| Modify `plugins/ui/apps/portal/src/utils/utils.ts` (`generateRandom`, lines 78–89) | Guarantee generated passwords satisfy the checklist (D5) |
| Modify `plugins/functions/alp-usermgmt/src/routes/MemberRouter.ts` (lines 24–40) | Username trim + length + composition rules; password presence |
| Modify `services/alp-logto/post-init/src/main.ts` (~line 476) | Add `passwordPolicy` to the seeded sign-in experience |

## Conventions for every task

- Work in the prepared worktree (`origin/develop`, `c6479368`). Before starting, create the working branch: `git checkout -b <github-username>/2713-user-password-validation` where `<github-username>` is the connected GitHub account (`gh api user --jq .login`).
- UI test command (from `plugins/ui/apps/portal/`): `npx react-scripts test --watchAll=false --testPathPattern=<pattern>`
- Type check (from `plugins/ui/apps/portal/`): `npx tsc --noEmit`
- Commit after each task with the message given in the task.

---

### Task 1: UI validation module (TDD)

**Files:**
- Create: `plugins/ui/apps/portal/src/utils/credential-validation.ts`
- Create: `plugins/ui/apps/portal/src/utils/credential-validation.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// plugins/ui/apps/portal/src/utils/credential-validation.test.ts
import { PASSWORD_RULES, isPasswordValid, validateUsername, PASSWORD_MAX_LENGTH } from "./credential-validation";

describe("PASSWORD_RULES", () => {
  const byId = Object.fromEntries(PASSWORD_RULES.map((r) => [r.id, r]));

  it("defines exactly the four checklist rules", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["minLength", "letter", "number", "special"]);
  });

  it("minLength requires 8 characters", () => {
    expect(byId.minLength.test("Ab1!efg")).toBe(false);
    expect(byId.minLength.test("Ab1!efgh")).toBe(true);
  });

  it("letter / number / special detect their character class", () => {
    expect(byId.letter.test("12345678!")).toBe(false);
    expect(byId.number.test("Abcdefg!")).toBe(false);
    expect(byId.special.test("Abcdefg1")).toBe(false);
    expect(byId.special.test("Abcdefg1_")).toBe(true); // underscore counts as special
  });

  it("whitespace is not a special character", () => {
    expect(byId.special.test("Abcdef 1")).toBe(false);
  });
});

describe("isPasswordValid", () => {
  it("rejects whitespace-only, short, and single-class passwords", () => {
    expect(isPasswordValid("        ")).toBe(false);
    expect(isPasswordValid("a1!")).toBe(false);
    expect(isPasswordValid("abcdefgh")).toBe(false);
  });
  it("accepts a compliant password", () => {
    expect(isPasswordValid("Passw0rd!")).toBe(true);
  });
});

describe("validateUsername", () => {
  it("trims before validating", () => {
    expect(validateUsername("  alice  ")).toBeNull();
    expect(validateUsername("   ")).toBe("required");
  });
  it("enforces length 3-32", () => {
    expect(validateUsername("ab")).toBe("tooShort");
    expect(validateUsername("a".repeat(33))).toBe("tooLong");
    expect(validateUsername("abc")).toBeNull();
    expect(validateUsername("a".repeat(32))).toBeNull();
  });
  it("rejects invalid characters and leading digits (Logto constraint)", () => {
    expect(validateUsername("ali ce")).toBe("invalidChars");
    expect(validateUsername("ali-ce")).toBe("invalidChars");
    expect(validateUsername("1alice")).toBe("invalidChars");
  });
  it("rejects underscore-only usernames", () => {
    expect(validateUsername("___")).toBe("noLetterOrNumber");
  });
});

describe("PASSWORD_MAX_LENGTH", () => {
  it("is 64 (D1)", () => {
    expect(PASSWORD_MAX_LENGTH).toBe(64);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `plugins/ui/apps/portal/`): `npx react-scripts test --watchAll=false --testPathPattern=credential-validation`
Expected: FAIL — cannot resolve `./credential-validation`

- [ ] **Step 3: Write the implementation**

```ts
// plugins/ui/apps/portal/src/utils/credential-validation.ts
export const PASSWORD_MAX_LENGTH = 64; // D1: mirrors the Logto policy length.max

export interface PasswordRule {
  id: "minLength" | "letter" | "number" | "special";
  i18nKey: "PASSWORD_RULES__MIN_LENGTH" | "PASSWORD_RULES__LETTER" | "PASSWORD_RULES__NUMBER" | "PASSWORD_RULES__SPECIAL";
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { id: "minLength", i18nKey: "PASSWORD_RULES__MIN_LENGTH", test: (p) => p.length >= 8 },
  { id: "letter", i18nKey: "PASSWORD_RULES__LETTER", test: (p) => /[A-Za-z]/.test(p) },
  { id: "number", i18nKey: "PASSWORD_RULES__NUMBER", test: (p) => /[0-9]/.test(p) },
  { id: "special", i18nKey: "PASSWORD_RULES__SPECIAL", test: (p) => /[^A-Za-z0-9\s]/.test(p) },
];

export const isPasswordValid = (password: string): boolean => PASSWORD_RULES.every((rule) => rule.test(password));

export type UsernameError = "required" | "tooShort" | "tooLong" | "invalidChars" | "noLetterOrNumber";

// Validates the trimmed username. Callers must also submit the trimmed value.
// The leading-digit rejection mirrors Logto's own username constraint (today it
// surfaces as an opaque ERR_BAD_REQUEST after submit — see MemberRouter's catch block).
export const validateUsername = (raw: string): UsernameError | null => {
  const username = raw.trim();
  if (!username) return "required";
  if (username.length < 3) return "tooShort";
  if (username.length > 32) return "tooLong";
  if (!/^\w+$/.test(username) || /^[0-9]/.test(username)) return "invalidChars";
  if (!/[A-Za-z0-9]/.test(username)) return "noLetterOrNumber";
  return null;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test --watchAll=false --testPathPattern=credential-validation`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add plugins/ui/apps/portal/src/utils/credential-validation.ts plugins/ui/apps/portal/src/utils/credential-validation.test.ts
git commit -m "feat(portal): add username/password validation rules for add-user flows"
```

---

### Task 2: i18n keys

**Files:**
- Modify: `plugins/ui/apps/portal/src/contexts/app-context/states/translation-state.ts` (default/en block; ADD_USER_DIALOG keys start ~line 121)

- [ ] **Step 1: Add the new keys**

Insert alphabetically into the default translations object (same block that contains `ADD_USER_DIALOG__ERROR` at line 121):

```ts
    ADD_USER_DIALOG__ADD_SUCCESS: "{0} added successfully",
    ADD_USER_DIALOG__ERROR_TOAST: "User cannot be added.",
    ADD_USER_DIALOG__ERROR_TOAST_DESCRIPTION: "Something went wrong while adding user. Please try again.",
    ADD_USER_DIALOG__USERNAME_MAX_LENGTH: "Username must be at most 32 characters.",
    ADD_USER_DIALOG__USERNAME_MIN_LENGTH: "Username must be at least 3 characters.",
    ADD_USER_DIALOG__USERNAME_NO_LETTER: "Username cannot consist of underscores only.",
    PASSWORD_RULES__LETTER: "At least one letter",
    PASSWORD_RULES__MAX_LENGTH: "Password must be at most 64 characters.",
    PASSWORD_RULES__MIN_LENGTH: "At least 8 characters",
    PASSWORD_RULES__NUMBER: "At least one number",
    PASSWORD_RULES__SPECIAL: "At least one special character",
```

Also update the existing helper text (line 130) to include the new constraints:

```ts
    ADD_USER_DIALOG__USERNAME_HELPER: "3-32 characters; letters, numbers, or underscore; must not start with a number.",
```

Note: `ADD_USER_DIALOG__USERNAME_INVALID` is intentionally *not* added — the existing `ADD_USER_DIALOG__USERNAME_HELPER` doubles as the invalid-characters message (it turns red via the TextField `error` prop, matching current behavior).

- [ ] **Step 2: Type check**

Run (from `plugins/ui/apps/portal/`): `npx tsc --noEmit`
Expected: no errors (keys are inferred from the state object; no separate key registry exists)

- [ ] **Step 3: Commit**

```bash
git add plugins/ui/apps/portal/src/contexts/app-context/states/translation-state.ts
git commit -m "feat(portal): i18n keys for credential validation messages"
```

---

### Task 3: PasswordRulesChecklist component (TDD)

**Files:**
- Create: `plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.tsx`
- Create: `plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.scss`
- Create: `plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.test.tsx`
- Modify: `plugins/ui/apps/portal/src/components/index.ts`

- [ ] **Step 1: Write the failing test**

Follow the provider/mocking pattern of `src/contexts/app-context/translation.test.tsx` (wrap in `AppProvider`, mock the translation api):

```tsx
// plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.test.tsx
import React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AppProvider } from "../../contexts/app-context/AppContext";
import { PasswordRulesChecklist } from "./PasswordRulesChecklist";

jest.mock("../../axios/api", () => ({
  api: {
    translation: {
      getTranslation: jest.fn(),
    },
  },
}));

const renderChecklist = (password: string, showErrors = false) =>
  render(
    <AppProvider>
      <PasswordRulesChecklist password={password} showErrors={showErrors} />
    </AppProvider>
  );

describe("PasswordRulesChecklist", () => {
  it("renders all four rules", () => {
    renderChecklist("");
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });

  it("marks satisfied rules as met", () => {
    renderChecklist("abcdefgh"); // meets minLength + letter only
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("password-rules-checklist__item--met"); // min length
    expect(items[1]).toHaveClass("password-rules-checklist__item--met"); // letter
    expect(items[2]).not.toHaveClass("password-rules-checklist__item--met"); // number
    expect(items[3]).not.toHaveClass("password-rules-checklist__item--met"); // special
  });

  it("marks unmet rules as errors only when showErrors is set", () => {
    renderChecklist("abcdefgh", true);
    const items = screen.getAllByRole("listitem");
    expect(items[2]).toHaveClass("password-rules-checklist__item--error");
    expect(items[0]).not.toHaveClass("password-rules-checklist__item--error");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test --watchAll=false --testPathPattern=PasswordRulesChecklist`
Expected: FAIL — cannot resolve `./PasswordRulesChecklist`

- [ ] **Step 3: Write the component**

```tsx
// plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.tsx
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
```

```scss
// plugins/ui/apps/portal/src/components/PasswordRulesChecklist/PasswordRulesChecklist.scss
.password-rules-checklist {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  font-size: 13px;

  &__item {
    display: flex;
    align-items: center;
    gap: 6px;
    color: rgba(0, 0, 0, 0.6); // neutral: not yet met (D7: approximated from screenshot)

    &--met {
      color: #2e7d32; // green: rule satisfied
    }

    &--error {
      color: #d32f2f; // red: unmet after a blocked submit
    }
  }
}
```

Add to `plugins/ui/apps/portal/src/components/index.ts` (alphabetical position among the existing `export * from` lines):

```ts
export * from "./PasswordRulesChecklist/PasswordRulesChecklist";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test --watchAll=false --testPathPattern=PasswordRulesChecklist`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/ui/apps/portal/src/components/PasswordRulesChecklist plugins/ui/apps/portal/src/components/index.ts
git commit -m "feat(portal): live password rules checklist component"
```

---

### Task 4: Rework AddUserDialog

**Files:**
- Modify: `plugins/ui/apps/portal/src/plugins/SystemAdmin/UserOverview/AddUserDialog/AddUserDialog.tsx` (full rewrite of validation/submit logic; keep Dialog frame, Generate button, visibility toggle untouched)

- [ ] **Step 1: Rewrite the component logic**

Replace the `FormError`-based logic with live validation. The complete new component:

```tsx
import React, { FC, useCallback, useMemo, useState } from "react";
import FormControl from "@mui/material/FormControl";
import Divider from "@mui/material/Divider";
import TextField from "@mui/material/TextField";
import FormHelperText from "@mui/material/FormHelperText";
import {
  Button,
  Dialog,
  Feedback,
  IconButton,
  Tooltip,
  VisibilityOffIcon,
  VisibilityOnIcon,
} from "@portal/components";
import { PasswordRulesChecklist } from "../../../../components";
import { CloseDialogType } from "../../../../types";
import { api } from "../../../../axios/api";
import { generateRandom } from "../../../../utils";
import {
  isPasswordValid,
  validateUsername,
  PASSWORD_MAX_LENGTH,
} from "../../../../utils/credential-validation";
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
                helperText={usernameErrorVisible ? usernameErrorText : getText(i18nKeys.ADD_USER_DIALOG__USERNAME_HELPER)}
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
```

Implementation notes:
- `UserOverview.tsx` needs **no change**: it already refetches on `"success"`, and page-level toasts are dispatched from the dialog via `useFeedback()` (same mechanism `UserOverview` itself uses at line 80).
- If `Feedback` has no `autoClose` field (check `plugins/ui/apps/portal/src/types/index.ts`), drop that property — do not extend the type.

- [ ] **Step 2: Type check + existing tests**

Run: `npx tsc --noEmit` then `npx react-scripts test --watchAll=false`
Expected: no type errors; all suites pass

- [ ] **Step 3: Commit**

```bash
git add plugins/ui/apps/portal/src/plugins/SystemAdmin/UserOverview/AddUserDialog/AddUserDialog.tsx
git commit -m "feat(portal): real-time username/password validation in Add User dialog"
```

---

### Task 5: Checklist + gating in both change-password dialogs

**Files:**
- Modify: `plugins/ui/apps/portal/src/plugins/SystemAdmin/UserOverview/ChangeUserPasswordDialog/ChangeUserPasswordDialog.tsx`
- Modify: `plugins/ui/apps/portal/src/containers/shared/Account/ChangeMyPasswordDialog/ChangeMyPasswordDialog.tsx`

Per D4: add the checklist and submit gating only; keep the existing in-dialog success/error feedback of both dialogs.

- [ ] **Step 1: ChangeUserPasswordDialog**

Apply exactly these changes (the rest of the file stays as-is):

1. Add imports:

```tsx
import FormHelperText from "@mui/material/FormHelperText";
import { PasswordRulesChecklist } from "../../../../components";
import { isPasswordValid, PASSWORD_MAX_LENGTH } from "../../../../utils/credential-validation";
```

2. Add state + derived values inside the component (next to the existing `useState` calls):

```tsx
const [showErrors, setShowErrors] = useState(false);
const passwordTooLong = formData.password.length > PASSWORD_MAX_LENGTH;
const passwordValid = isPasswordValid(formData.password) && !passwordTooLong;
```

3. Reset `showErrors` in the existing `useEffect` on `open`:

```tsx
setShowErrors(false);
```

4. Guard `handleUpdate` (first lines of the callback, before the api call; add `passwordValid` to its dependency array):

```tsx
if (!passwordValid) {
  setShowErrors(true);
  return;
}
```

5. Set `error={showErrors && !passwordValid}` on the password `TextField`, and render directly under the `FormControl` that wraps it:

```tsx
{passwordTooLong && (
  <FormHelperText error={true}>{getText(i18nKeys.PASSWORD_RULES__MAX_LENGTH)}</FormHelperText>
)}
<PasswordRulesChecklist password={formData.password} showErrors={showErrors} />
```

- [ ] **Step 2: ChangeMyPasswordDialog**

Apply the same five changes to `ChangeMyPasswordDialog.tsx`, with the import paths unchanged (the file already sits at the same depth: `../../../../`). The checklist goes under the **new** password field (the second `TextField`, bound to `formData.password`), not the old-password field. The old-password field keeps its current behavior (required-ness is enforced by Logto's verify call).

- [ ] **Step 3: Type check + tests**

Run: `npx tsc --noEmit` then `npx react-scripts test --watchAll=false`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add plugins/ui/apps/portal/src/plugins/SystemAdmin/UserOverview/ChangeUserPasswordDialog/ChangeUserPasswordDialog.tsx plugins/ui/apps/portal/src/containers/shared/Account/ChangeMyPasswordDialog/ChangeMyPasswordDialog.tsx
git commit -m "feat(portal): password rules checklist in change-password dialogs"
```

---

### Task 6: Make generated passwords satisfy the rules (gated on D5)

**Files:**
- Modify: `plugins/ui/apps/portal/src/utils/utils.ts:78-89`
- Modify: `plugins/ui/apps/portal/src/utils/credential-validation.test.ts` (append a describe block)

**Do not start this task until D5 is confirmed at plan review.** If the team insists on a byte-identical Generate button, skip this task and accept that roughly half of generated passwords will be blocked by the checklist until regenerated.

- [ ] **Step 1: Write the failing test** (append to `credential-validation.test.ts`)

```ts
import { generateRandom } from "./utils";

describe("generateRandom (D5: must satisfy password rules)", () => {
  it("always produces a checklist-compliant password", () => {
    for (let i = 0; i < 50; i++) {
      expect(isPasswordValid(generateRandom(12))).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx react-scripts test --watchAll=false --testPathPattern=credential-validation`
Expected: FAIL — with the current generator the probability that all 50 samples pass is ≈ 0 (a single sample lacks a special char ~47% of the time)

- [ ] **Step 3: Change the generator**

Replace `generateRandom` in `plugins/ui/apps/portal/src/utils/utils.ts` (lines 78–89) with:

```ts
export const generateRandom = (length: number) => {
  const pattern = /[a-zA-Z0-9_\-\+\.]/;
  const generate = () =>
    Array.from({ length }, () => {
      let result;
      while (true) {
        result = String.fromCharCode(getRandomByte());
        if (pattern.test(result)) {
          return result;
        }
      }
    }).join("");

  // Retry until the password satisfies the checklist rules (letter, number,
  // special char, min length) so the Generate button never produces a value
  // the Add/Update buttons would reject. Expected retries: ~2.
  let candidate = generate();
  while (!isPasswordValid(candidate)) {
    candidate = generate();
  }
  return candidate;
};
```

Add the import at the top of `utils.ts`:

```ts
import { isPasswordValid } from "./credential-validation";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx react-scripts test --watchAll=false --testPathPattern=credential-validation`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add plugins/ui/apps/portal/src/utils/utils.ts plugins/ui/apps/portal/src/utils/credential-validation.test.ts
git commit -m "fix(portal): generated passwords always satisfy validation rules"
```

---

### Task 7: Backend username validation in MemberRouter

**Files:**
- Modify: `plugins/functions/alp-usermgmt/src/routes/MemberRouter.ts:24-40`

`alp-usermgmt` has no unit-test runner; this task is verified by `curl` in Task 9. Do not invent a test framework for it.

- [ ] **Step 1: Replace the validation block**

Replace lines 25–38 (from `const { username, password } = req.body || {}` through the existing regex check) with:

```ts
      const { password } = req.body || {}
      let { tenantId } = req.body || {}
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''

      if (!username) {
        this.logger.warn(`Param 'username' is required`)
        return res.status(400).send({ message: `Param 'username' is required` })
      }

      if (username.length < 3 || username.length > 32) {
        this.logger.warn(`Username must be between 3 and 32 characters`)
        return res.status(400).send({ message: `Username must be between 3 and 32 characters.` })
      }

      if (!/^\w+$/.test(username) || /^[0-9]/.test(username)) {
        this.logger.warn(`username should only contain letters, numbers, or underscore, and must not start with a number`)
        return res
          .status(400)
          .send({ message: `Username should only contain letters, numbers, or underscore, and must not start with a number.` })
      }

      if (!/[A-Za-z0-9]/.test(username)) {
        this.logger.warn(`username cannot consist of underscores only`)
        return res.status(400).send({ message: `Username cannot consist of underscores only.` })
      }

      if (typeof password !== 'string' || !password.trim()) {
        this.logger.warn(`Param 'password' is required`)
        return res.status(400).send({ message: `Param 'password' is required` })
      }
```

Notes:
- The trimmed `username` const is used by the whole route body (existing lookups at lines 71+ pick it up unchanged because the variable name is the same).
- Password *content* rules are deliberately NOT duplicated here — that is Logto's job under Option B (Task 8). The presence/whitespace check only rejects payloads Logto would reject anyway, with a clearer message.
- The `let { tenantId }` line already exists at line 26 — keep it; only the destructuring of `username`/`password` changes.

- [ ] **Step 2: Type check**

Run (from `plugins/functions/alp-usermgmt/`): `npx tsc --noEmit` (or the package's build script if `tsc` is not configured standalone)
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add plugins/functions/alp-usermgmt/src/routes/MemberRouter.ts
git commit -m "feat(usermgmt): enforce username rules on member add"
```

---

### Task 8: Seed Logto password policy

**Files:**
- Modify: `services/alp-logto/post-init/src/main.ts` (~line 476, the `signinExperience` object)

- [ ] **Step 1: Add the policy to the seeded sign-in experience**

Inside the `signinExperience` object (after the `privacyPolicyUrl` line, before the closing brace):

```ts
    // Issue #2713 / Option B: Logto is the single server-side enforcement
    // point for password rules across all flows (add user, admin change,
    // self-service change).
    // D2: characterTypes.min counts categories (lower/upper/digit/symbol);
    // min 3 is the closest server-side approximation of the UI checklist's
    // "letter + number + special char" rule.
    // D6: rejects are all off so the backend never rejects a password the
    // UI checklist has approved.
    passwordPolicy: {
      length: { min: 8, max: 64 }, // D1
      characterTypes: { min: 3 },
      rejects: {
        pwned: false,
        repetitionAndSequence: false,
        userInfo: false,
        words: [],
      },
    },
```

- [ ] **Step 2: Verify the seeding against a running stack**

Bring up the local stack (docker compose per repo README), let `alp-logto-post-init` run, then check its container logs:

Run: `docker logs <alp-logto-post-init-container> 2>&1 | grep -A2 "SIGN-IN EXPERIENCES"`
Expected: the update completes without error.

Then confirm the policy is active end-to-end (this also verifies the pinned Logto image supports `passwordPolicy`):

Run: `POST /usermgmt/member/tenant/add` (via the portal API gateway, authenticated as an admin) with body `{"username": "policyprobe", "password": "weakpass"}`
Expected: request FAILS (Logto rejects `weakpass` — no digit/symbol); the error surfaces through `MemberRouter`'s catch block.
Then repeat with `{"username": "policyprobe", "password": "Str0ng!Pass"}` → expected 201, user created.

**If the sign-in-exp update rejects the `passwordPolicy` field: STOP — the pinned Logto image is too old. Escalate to the team (image bump is a separate decision); do not work around it.**

- [ ] **Step 3: Commit**

```bash
git add services/alp-logto/post-init/src/main.ts
git commit -m "feat(logto): seed password policy (min 8, 3 char types, max 64)"
```

---

### Task 9: Full verification pass

No new files. Run after all prior tasks are complete.

- [ ] **Step 1: Unit tests + type checks**

Run (from `plugins/ui/apps/portal/`): `npx react-scripts test --watchAll=false` and `npx tsc --noEmit`
Expected: all PASS

- [ ] **Step 2: Backend negative tests (curl, against the local stack)**

Each `POST /usermgmt/member/tenant/add` below must behave as stated (messages from Task 7):

| Payload | Expected |
|---|---|
| `{"username": "_", "password": "Str0ng!Pass"}` | 400 — too short (3–32) |
| `{"username": "___", "password": "Str0ng!Pass"}` | 400 — underscores only |
| `{"username": "ab", "password": "Str0ng!Pass"}` | 400 — too short (3–32) |
| `{"username": "1abc", "password": "Str0ng!Pass"}` | 400 — invalid characters / leading number |
| `{"username": "  alice  ", "password": "Str0ng!Pass"}` | 201 — created as trimmed `alice` |
| `{"username": "bob", "password": "        "}` | 400 — password required |
| `{"username": "bob", "password": "weakpass"}` | rejected via Logto policy (Task 8) |

- [ ] **Step 3: UI end-to-end (use the devx `testing-d2e-ui` skill at execution time)**

Drive the real portal with Playwright + Logto login and capture screenshots:
1. Users page → Add user → type `_` in Username → red inline error appears while typing.
2. Type a weak password → checklist shows unmet rules; click **Add** → dialog stays open, unmet rules turn red.
3. Fix both fields (`testuser2713` / `Str0ng!Pass`) → checklist all green → **Add** → dialog closes, toast "testuser2713 added successfully", user visible in list.
4. Change password (admin dialog) and Account → change my password: checklist visible, weak password blocked, strong password succeeds.
5. Click **Generate** → checklist is fully green immediately (D5).

- [ ] **Step 4: Commit the plan file with the work** (this document ships on the same branch)

```bash
git add docs/plans/2026-07-23-2713-username-password-validation-logto.md
git commit -m "docs: implementation plan for username/password validation (#2713)"
```

---

## Out of scope

- Any change to the Generate button's UX (only its output composition, Task 6, gated on D5).
- Password rules duplication in `UserRouter`/`MeRouter` — Logto enforces password content for those flows (Option B).
- Logto image/version bump (escalate if Task 8 reveals it is needed).
- Localization of the new strings beyond the default (English) block — other locales fall back to default per `getText`.
