import { useEffect } from "react";
import { useOnboarding } from "@/lib/onboarding-context";
import { LoadReadyMark } from "@/components/loadready/brand/Brand";

/**
 * The first screen anybody sees.
 *
 * It used to show `loadready-logo.png`, which was the **previous brand's
 * letter B** — the file was renamed during the de-branding in B1 and the
 * artwork inside it never was. The name is now set as type rather than
 * shipped as a picture, so it is sharp at any size and reads as a company
 * rather than an initial.
 */
export function SplashScreen() {
  const { go } = useOnboarding();

  useEffect(() => {
    const t = setTimeout(() => go("slide1"), 1800);
    return () => clearTimeout(t);
  }, [go]);

  return (
    <div
      className="fixed inset-0 flex flex-col items-center justify-center px-8"
      style={{
        /*
         * Their gradient, exactly as their site draws it. The writing on it is
         * near-black rather than white — 7.7:1 against the darker end, where
         * white would have been 2.4:1.
         */
        background: "linear-gradient(135deg, #C9A227 0%, #E0B83A 100%)",
      }}
    >
      <div className="flex flex-col items-center animate-in fade-in zoom-in-95 duration-700">
        <LoadReadyMark className="h-24 w-24 drop-shadow-[0_8px_24px_rgba(0,0,0,0.28)]" />

        {/*
         * Tight tracking and one weight. Two weights or two colours in a
         * wordmark reads as a consumer app, and this is sold to dispatchers
         * moving permitted oversize freight.
         */}
        <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground">LoadReady</h1>

        <p className="mt-2 text-sm font-medium tracking-wide text-foreground/75">
          Pilot cars for oversize loads
        </p>
      </div>
    </div>
  );
}
