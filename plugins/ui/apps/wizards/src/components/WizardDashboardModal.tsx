import { useEffect, useRef } from "react";
import type { WizardDashboardState } from "../services/wizardDashboardState";
import { ShinyDashboardIframe } from "./ShinyDashboardIframe";
import styles from "./WizardDashboardModal.module.css";

const stageMessages = {
  "applying-filters": "Applying filters...",
  materializing: "Creating the cohort…",
  "opening-dashboard": "Opening the dashboard…",
} as const;

interface WizardDashboardModalProps {
  state: WizardDashboardState;
  onClose: () => void;
  onRetry: () => void;
  datasetId?: string;
  getToken?: () => Promise<string>;
}

export function WizardDashboardModal({ state, onClose, onRetry, datasetId, getToken }: WizardDashboardModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isWorking = state.status !== "error" && state.status !== "ready";

  useEffect(() => {
    if (!state.isOpen) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isWorking) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [isWorking, onClose, state.isOpen]);

  if (!state.isOpen) return null;

  return (
    <div className={styles.backdrop} role="presentation">
      <section
        className={`${styles.modal} ${isWorking ? styles.modalWorking : state.status === "ready" ? styles.modalReady : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wizard-dashboard-title"
        aria-busy={isWorking}
      >
        {!isWorking && (
          <div className={styles.header}>
            <h2 id="wizard-dashboard-title">Wizard dashboard</h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className={styles.closeButton}
              aria-label="Close dashboard"
            >
              ×
            </button>
          </div>
        )}
        <div className={styles.content} aria-live="polite">
          {isWorking && (
            <div className={styles.workingStatus}>
              <h2 id="wizard-dashboard-title" className={styles.workingTitle}>
                Generating dashboard
              </h2>
              <span className={styles.spinner} aria-hidden="true" />
              <p className={styles.workingMessage}>
                {stageMessages[state.status as keyof typeof stageMessages] ?? "Preparing the dashboard…"}
              </p>
            </div>
          )}
          {state.status === "error" && (
            <div className={styles.status}>
              <p className={styles.error}>{state.error}</p>
              <button type="button" onClick={onRetry} className={styles.actionButton}>
                Try again
              </button>
            </div>
          )}
          {state.status === "ready" && (
            <div className={styles.dashboard}>
              {datasetId && state.result ? (
                <ShinyDashboardIframe
                  datasetId={datasetId}
                  cohortId={state.result.cohortId}
                  wizardConfig={state.result.wizardConfig}
                  mriquery={state.result.mriquery}
                  getToken={getToken}
                />
              ) : (
                <p className={styles.error}>The dashboard context is incomplete.</p>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
