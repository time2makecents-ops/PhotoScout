"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getCurrentUser } from "@/lib/api";
import { getStoredToken } from "@/lib/auth";

type Props = {
  slug: string;
  creatorHandle: string;
};

export function LocationEditLink({ slug, creatorHandle }: Props) {
  const [mounted, setMounted] = useState(false);
  const [canEdit, setCanEdit] = useState(false);

  useEffect(() => {
    setMounted(true);

    let cancelled = false;
    async function loadPermission() {
      const token = getStoredToken();
      if (!token) {
        if (!cancelled) {
          setCanEdit(false);
        }
        return;
      }
      try {
        const me = await getCurrentUser(token);
        if (!cancelled) {
          setCanEdit(me.role === "admin" || me.handle === creatorHandle);
        }
      } catch {
        if (!cancelled) {
          setCanEdit(false);
        }
      }
    }

    void loadPermission();
    window.addEventListener("photoscout-auth-changed", loadPermission);
    window.addEventListener("storage", loadPermission);
    return () => {
      cancelled = true;
      window.removeEventListener("photoscout-auth-changed", loadPermission);
      window.removeEventListener("storage", loadPermission);
    };
  }, [creatorHandle]);

  if (!mounted || !canEdit) {
    return null;
  }

  return (
    <Link className="button secondary" href={`/locations/${slug}/edit`}>
      Edit location
    </Link>
  );
}
