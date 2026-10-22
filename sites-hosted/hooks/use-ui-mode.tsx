"use client";

import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";

export type UIMode = "professional" | "minimal";

export interface UiPreference {
  mode: UIMode;
  updatedAt: string;
}

const PREFERENCE_KEY = "digmo.ui.mode";

interface UiModeContextValue {
  mode: UIMode;
  setMode: (mode: UIMode) => void;
  toggleMode: () => void;
}

const UiModeContext = createContext<UiModeContextValue | undefined>(undefined);

function readPreference(): UiPreference | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(PREFERENCE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as UiPreference;
    if (parsed.mode === "professional" || parsed.mode === "minimal") {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

function persistPreference(mode: UIMode): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: UiPreference = {
    mode,
    updatedAt: new Date().toISOString()
  };
  window.localStorage.setItem(PREFERENCE_KEY, JSON.stringify(payload));
}

function applyDocumentMode(mode: UIMode): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.uiMode = mode;
}

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UIMode>("professional");

  useEffect(() => {
    const preference = readPreference();
    if (preference) {
      setModeState(preference.mode);
      applyDocumentMode(preference.mode);
      return;
    }
    applyDocumentMode("professional");
    persistPreference("professional");
  }, []);

  const value = useMemo<UiModeContextValue>(
    () => ({
      mode,
      setMode: (nextMode: UIMode) => {
        setModeState(nextMode);
        applyDocumentMode(nextMode);
        persistPreference(nextMode);
      },
      toggleMode: () => {
        const nextMode: UIMode = mode === "professional" ? "minimal" : "professional";
        setModeState(nextMode);
        applyDocumentMode(nextMode);
        persistPreference(nextMode);
      }
    }),
    [mode]
  );

  return <UiModeContext.Provider value={value}>{children}</UiModeContext.Provider>;
}

export function useUiMode(): UiModeContextValue {
  const context = useContext(UiModeContext);
  if (!context) {
    throw new Error("useUiMode must be used within UiModeProvider");
  }
  return context;
}
