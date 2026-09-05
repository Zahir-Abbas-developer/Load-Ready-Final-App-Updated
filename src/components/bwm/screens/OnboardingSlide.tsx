import { TopBar } from "../TopBar";
import { PrimaryButton } from "../PrimaryButton";
import { useOnboarding, type OnboardingStep } from "@/lib/onboarding-context";
import onboard1 from "@/assets/onboard-1.png";
import onboard2 from "@/assets/onboard-2.png";
import onboard3 from "@/assets/onboard-3.png";

const slides = [
  {
    img: onboard1,
    title: "Plan & Dispatch Oversize Loads Easily",
    body: "Create load requests in minutes, set your route, and get matched with certified pilot car operators across the USA & Canada.",
    next: "slide2" as OnboardingStep,
  },
  {
    img: onboard2,
    title: "Real-Time Tracking & Safety",
    body: "Track trips in real time, receive route updates, and stay informed about delays, weather risks, or road restrictions.",
    next: "slide3" as OnboardingStep,
  },
  {
    img: onboard3,
    title: "Simple Payments & Compliance",
    body: "Secure payments, transparent pricing, and verified pilot profiles. Upload and manage required permits, certifications, and documents—all in one place.",
    next: "role" as OnboardingStep,
  },
];

export function OnboardingSlide({ index }: { index: 0 | 1 | 2 }) {
  const { go } = useOnboarding();
  const s = slides[index];
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar rightLabel="Skip" onRight={() => go("role")} />
      <div className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <img src={s.img} alt="" className="w-72 h-56 object-contain mb-8" />
        <h1 className="text-2xl font-bold text-primary mb-3">{s.title}</h1>
        <p className="text-muted-foreground leading-relaxed">{s.body}</p>
      </div>
      <div className="px-6 pb-8">
        <div className="flex justify-center gap-2 mb-6">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === index ? "w-8 bg-primary" : "w-2 bg-border"
              }`}
            />
          ))}
        </div>
        <PrimaryButton onClick={() => go(s.next)}>Next</PrimaryButton>
      </div>
    </div>
  );
}
