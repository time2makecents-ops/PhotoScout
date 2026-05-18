"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PropsWithChildren } from "react";

import { AccountButton } from "@/components/account-button";

export function AppShell({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const showChrome = pathname !== "/" && pathname !== "/login";

  return (
    <div className="app-shell">
      {showChrome ? (
        <header className="topbar">
          <Link href="/home" className="brand">
            <span className="brand-mark">PS</span>
            <span>
              <strong>PhotoScout</strong>
              <small>Discovery and marketplace</small>
            </span>
          </Link>
          <nav className="top-links">
            <Link href="/home">Home</Link>
            <Link href="/search">Search</Link>
            <Link href="/challenges">Challenges</Link>
            <Link href="/profile">Profile</Link>
          </nav>
          <div className="topbar-account">
            <AccountButton />
          </div>
        </header>
      ) : null}
      <main className="page">{children}</main>
      {showChrome ? (
        <nav className="mobile-nav">
          <Link href="/home">Home</Link>
          <Link href="/search">Search</Link>
          <Link href="/locations/new">Add Pin</Link>
          <Link href="/challenges">Challenges</Link>
          <Link href="/dashboard">Dashboard</Link>
        </nav>
      ) : null}
    </div>
  );
}


export function SectionHeading({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) {
  return (
    <div className="section-heading">
      <p>{eyebrow}</p>
      <h2>{title}</h2>
      {body ? <span>{body}</span> : null}
    </div>
  );
}


export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}
