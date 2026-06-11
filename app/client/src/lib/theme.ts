// Standalone theme context — kept in its own module so Vite's react-refresh
// (which doesn't fast-refresh hook-and-component combo files cleanly) can't
// instantiate two copies of the Context object across the Provider and the
// Consumer. The bug surfaced as: Provider state correctly set to "dark", but
// useTheme() in child components returning the default context value
// ("system") — classic two-instance Context split.

import { createContext, useContext } from "react";

export type ThemePref = "system" | "light" | "dark";

export interface ThemeContextValue {
  theme: ThemePref;
  resolved: "light" | "dark";
  setTheme: (t: ThemePref) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  theme: "system",
  resolved: "light",
  setTheme: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
