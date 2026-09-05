import { useState } from "react";
import { TopBar } from "../TopBar";
import { PrimaryButton } from "../PrimaryButton";
import { useOnboarding, type Role } from "@/lib/onboarding-context";
import { Truck, Briefcase, Check } from "lucide-react";

export function RoleScreen() {
  const { go, setRole } = useOnboarding();
  const [selected, setSelected] = useState<Role>(null);

  const Card = ({ value, icon: Icon, title, body }: any) => {
    const active = selected === value;
    return (
      <button
        onClick={() => setSelected(value)}
        className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex gap-3 items-start ${
          active ? "border-primary bg-accent" : "border-border bg-surface"
        }`}
      >
        <div className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center ${active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-foreground">{title}</div>
          <div className="text-sm text-muted-foreground mt-1">{body}</div>
        </div>
        <div className={`mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center ${active ? "border-primary bg-primary" : "border-border"}`}>
          {active && <Check className="h-3 w-3 text-primary-foreground" />}
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <div className="flex-1 px-6 pt-2">
        <h1 className="text-2xl font-bold text-foreground mb-6">Please choose your role :</h1>
        <div className="flex flex-col gap-3">
          <Card
            value="pilot"
            icon={Truck}
            title="I'm a pilot car driver"
            body="If you escort oversize/overweight loads with your certified pilot vehicle."
          />
          <Card
            value="dispatcher"
            icon={Briefcase}
            title="I'm a fleet dispatcher"
            body="If you manage OS/OW loads and need pilot cars for your shipments."
          />
        </div>
      </div>
      <div className="px-6 pb-8">
        <PrimaryButton
          disabled={!selected}
          onClick={() => {
            setRole(selected);
            go("signup");
          }}
        >
          Next
        </PrimaryButton>
      </div>
    </div>
  );
}
