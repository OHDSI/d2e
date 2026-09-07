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
  it("renders both rules", () => {
    renderChecklist("");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("marks satisfied rules as met", () => {
    renderChecklist("abcdefgh"); // long enough, but only one character category
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveClass("password-rules-checklist__item--met"); // length
    expect(items[1]).not.toHaveClass("password-rules-checklist__item--met"); // character types
  });

  it("marks unmet rules as errors only when showErrors is set", () => {
    renderChecklist("abcdefgh", true);
    const items = screen.getAllByRole("listitem");
    expect(items[1]).toHaveClass("password-rules-checklist__item--error");
    expect(items[0]).not.toHaveClass("password-rules-checklist__item--error");
  });
});
