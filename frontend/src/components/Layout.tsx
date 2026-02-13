"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const THEME_KEY = "gvfx-theme";
type ThemeMode = "light" | "dark";

export default function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const pathname = usePathname();

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
        <nav className="header-nav" aria-label="Primary">
          <Link href="/">Dashboard</Link>
          <Link href="/controls">Controls</Link>
          <Link href="/ops">Ops</Link>
          <Link href="/insights">Insights</Link>
          <Link href="/library">Library</Link>
          <Link href="/ingestion">Ingestion</Link>
          <Link href="/rl-ops">RL Ops</Link>
          <Link href="/rl-evaluations">RL Evaluations</Link>
        </nav>
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
      <main className="app-main page-transition" key={pathname}>
        {children}
      </main>
    </div>
  );
}
