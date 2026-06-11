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

  const patchUrl = useCallback(
    (patch: Parameters<typeof mergeSwapSearchParams>[1]) => {
      const qs = mergeSwapSearchParams(searchParams, patch);
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const setStep = useCallback(
    (next: FlowStep) => {
      patchUrl({ step: next === "review" ? "review" : null });
    },
    [patchUrl]
  );

  return { step, patchUrl, setStep };
}
