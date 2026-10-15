"use client";

import { useEffect } from "react";

import { ensureLocalSession } from "@/lib/auth";

export function LocalSessionBootstrap() {
  useEffect(() => {
    void ensureLocalSession().catch(() => {
      // Public discovery remains available if the local session cannot be created.
    });
  }, []);

  return null;
}
