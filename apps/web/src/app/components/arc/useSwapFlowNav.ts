"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  mergeSwapSearchParams,
  parseStep,
  type FlowStep,
} from "./swapUrl";

/** Read / write /swap URL params (flow step, etc.). */
export function useSwapFlowNav() {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const step = parseStep(searchParams.get("step"));

  // `push: true` adds a history entry so the browser/device back button steps
  // back through the flow (chooser → form → review) instead of leaving the app.
  // Forward moves push; in-place corrections and restores replace (the default).
  const patchUrl = useCallback(
    (
      patch: Parameters<typeof mergeSwapSearchParams>[1],
      opts?: { push?: boolean }
    ) => {
      const qs = mergeSwapSearchParams(searchParams, patch);
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (opts?.push) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setStep = useCallback(
    (next: FlowStep, opts?: { push?: boolean }) => {
      patchUrl({ step: next === "review" ? "review" : null }, opts);
    },
    [patchUrl]
  );

  return { step, patchUrl, setStep };
}
