"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/controls", label: "Command controls" },
  { href: "/ops", label: "Ops telemetry" },
  { href: "/insights", label: "Signal insights" },
  { href: "/library", label: "Signal library" },
];

export default function HeroActions() {
  const pathname = usePathname();

  return (
    <div className="hero-actions" role="navigation" aria-label="Dashboard sections">
      {LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={isActive ? "primary-button" : "ghost-button"}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </div>
  );
}
