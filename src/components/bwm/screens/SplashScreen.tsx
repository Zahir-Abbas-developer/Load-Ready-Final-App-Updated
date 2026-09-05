import { useEffect } from "react";
import logo from "@/assets/bwm-logo.png";
import { useOnboarding } from "@/lib/onboarding-context";

export function SplashScreen() {
  const { go } = useOnboarding();
  useEffect(() => {
    const t = setTimeout(() => go("slide1"), 1800);
    return () => clearTimeout(t);
  }, [go]);
  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 40%, #E5C158 0%, #C9A227 55%, #9C7A15 100%)",
      }}
    >
      <img
        src={logo}
        alt="BWM"
        className="h-40 w-40 object-contain drop-shadow-[0_8px_24px_rgba(0,0,0,0.25)] animate-in fade-in zoom-in-95 duration-700"
      />
    </div>
  );
}
