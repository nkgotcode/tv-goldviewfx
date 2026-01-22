"use client";

import { useEffect, useState, type ReactNode } from "react";

const THEME_KEY = "gvfx-theme";
type ThemeMode = "light" | "dark";

export default function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored =
      typeof window !== "undefined" && typeof window.localStorage?.getItem === "function"
        ? (window.localStorage.getItem(THEME_KEY) as ThemeMode | null)
        : null;
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    const preferred = prefersDark ? "dark" : "light";
    const next = stored ?? preferred;
    setTheme(next);
    document.documentElement.dataset.theme = next;
  }, []);

  const toggleTheme = () => {
    const next: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (typeof window !== "undefined" && typeof window.localStorage?.setItem === "function") {
      window.localStorage.setItem(THEME_KEY, next);
    }
    document.documentElement.dataset.theme = next;
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span>Goldviewfx Intelligence</span>
          <strong>Operator Command Deck</strong>
        </div>
        <div className="header-actions">
          <div className="status-pill">Live Signal Console</div>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-pressed={theme === "dark"}
          >
            {theme === "dark" ? "Dark Mode" : "Light Mode"}
          </button>
        </div>
      </header>
      <main className="app-main">{children}</main>
    </div>
  );
}
