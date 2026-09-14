"use client";

import { useEffect } from "react";
import { clearJobDraft } from "@/lib/jobDraft";

/**
 * Forget the half-written call once it has been published. On the
 * confirmation screen rather than in the form, because only arriving here
 * proves the publish succeeded — clearing on submit would throw away a draft
 * the server then refused.
 */
export function ClearJobDraft() {
  useEffect(() => clearJobDraft(), []);
  return null;
}
