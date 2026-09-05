import { useState } from "react";
import { TopBar } from "../TopBar";
import { PrimaryButton } from "../PrimaryButton";
import { useOnboarding } from "@/lib/onboarding-context";
import {
  X,
  Check,
  Upload,
  FileText,
  Hourglass,
  ChevronDown,
  CheckCircle2,
  ShieldCheck,
} from "lucide-react";

const US_STATES = [
  "Texas",
  "Oklahoma",
  "California",
  "Arizona",
  "New Mexico",
  "Louisiana",
  "Florida",
  "Georgia",
  "Nevada",
  "Colorado",
  "Kansas",
  "Missouri",
];

const EQUIPMENT = [
  "Reflective Cones",
  "Warning Flashers",
  "Height Pole",
  "Strobe Lights",
  "Two-way Radio",
  "First Aid Kit",
  "Fire Extinguisher",
];

function StepShell({
  step,
  total,
  title,
  children,
  onNext,
  nextDisabled = false,
  nextLabel = "Next",
}: {
  step: number;
  total: number;
  title: string;
  children: React.ReactNode;
  onNext: () => void;
  nextDisabled?: boolean;
  nextLabel?: string;
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar progress={{ current: step, total }} />
      <div className="flex-1 px-6 pt-2 pb-4 overflow-y-auto">
        <h1 className="text-xl font-bold text-foreground mb-5">
          {step}- {title}
        </h1>
        {children}
      </div>
      <div className="px-6 pb-6 pt-2 border-t border-border bg-background">
        <PrimaryButton disabled={nextDisabled} onClick={onNext}>
          {nextLabel}
        </PrimaryButton>
      </div>
    </div>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  max,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-13 px-4 py-3 rounded-xl bg-surface border border-border flex items-center justify-between text-left"
      >
        <span className="text-muted-foreground">{label}</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-background">
          {options.map((o) => {
            const on = selected.includes(o);
            const disabled = !on && max !== undefined && selected.length >= max;
            return (
              <button
                key={o}
                disabled={disabled}
                onClick={() => {
                  onChange(on ? selected.filter((x) => x !== o) : [...selected, o]);
                }}
                className={`w-full flex items-center justify-between px-4 py-3 text-left hover:bg-surface ${disabled ? "opacity-40" : ""}`}
              >
                <span>{o}</span>
                {on && <Check className="h-4 w-4 text-primary" />}
              </button>
            );
          })}
        </div>
      )}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-sm font-medium"
            >
              {s}
              <button onClick={() => onChange(selected.filter((x) => x !== s))}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, ...p }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      <input
        {...p}
        className="w-full h-13 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary"
      />
    </div>
  );
}

function FileField({ label }: { label: string }) {
  const [file, setFile] = useState<string | null>(null);
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {file ? (
        <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-accent border border-primary/30">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{file}</span>
          </div>
          <button onClick={() => setFile(null)}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setFile("License.pdf")}
          className="w-full h-13 px-4 rounded-xl bg-surface border border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Upload className="h-4 w-4" />
          <span className="text-sm">+ Add a photo/file</span>
        </button>
      )}
    </div>
  );
}

// ───── STEP 1 ─────
export function PilotStep1() {
  const { go, states, setStates } = useOnboarding();
  return (
    <StepShell
      step={1}
      total={6}
      title="Area and states"
      onNext={() => go("pilot-step2")}
      nextDisabled={states.length === 0}
    >
      <p className="text-sm text-muted-foreground mb-4">
        choose the states/areas you can work on :
      </p>
      <MultiSelect
        label="Choose states/areas"
        options={US_STATES}
        selected={states}
        onChange={setStates}
        max={5}
      />
      <p className="text-xs text-muted-foreground mt-3">You can choose up to 5 states/areas.</p>
    </StepShell>
  );
}

// ───── STEP 2 ─────
export function PilotStep2() {
  const { go } = useOnboarding();
  const [pwd, setPwd] = useState("");
  const rules = [
    { ok: pwd.length >= 8, label: "+8 characters" },
    { ok: /[A-Z]/.test(pwd) && /[a-z]/.test(pwd), label: "1 uppercase & 1 lowercase letter" },
    { ok: /\d/.test(pwd), label: "1 number" },
    { ok: /[!@#$%^&*]/.test(pwd), label: "1 special character (!@#$% etc.)" },
  ];
  return (
    <StepShell step={2} total={6} title="Personal information" onNext={() => go("pilot-step3")}>
      <Field label="Full name" placeholder="Ex: John Carter" />
      <Field label="Phone number" placeholder="+1 ___ ___ ____" />
      <Field label="Email" type="email" placeholder="you@example.com" />
      <div className="mb-2">
        <label className="block text-sm font-medium text-foreground mb-1.5">Password</label>
        <input
          type="password"
          value={pwd}
          onChange={(e) => setPwd(e.target.value)}
          className="w-full h-13 px-4 py-3 rounded-xl bg-surface border border-border focus:border-primary"
        />
      </div>
      <ul className="mb-4 space-y-1">
        {rules.map((r) => (
          <li
            key={r.label}
            className={`flex items-center gap-2 text-xs ${r.ok ? "text-success" : "text-destructive"}`}
          >
            {r.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
            {r.label}
          </li>
        ))}
      </ul>
      <Field label="Confirm password" type="password" />
      <Field label="Referral code (optional)" />
      <Field label="Date of birth" type="date" />
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Government ID type
        </label>
        <select className="w-full h-13 px-4 rounded-xl bg-surface border border-border focus:border-primary">
          <option>Driver's License</option>
          <option>State ID</option>
          <option>Passport</option>
        </select>
      </div>
      <Field label="Government ID number" />
      <Field label="Driver's license number" />
    </StepShell>
  );
}

// ───── STEP 3 ─────
export function PilotStep3() {
  const { go } = useOnboarding();
  return (
    <StepShell step={3} total={6} title="Vehicle information" onNext={() => go("pilot-step4")}>
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-1.5">Vehicle type</label>
        <select className="w-full h-13 px-4 rounded-xl bg-surface border border-border focus:border-primary">
          <option>Sedan</option>
          <option>SUV</option>
          <option>Pickup</option>
          <option>Box truck</option>
        </select>
      </div>
      <FileField label="Vehicle license" />
      <Field label="Vehicle color" placeholder="Ex: White" />
      <FileField label="Vehicle insurance" />
      <FileField label="Vehicle picture" />
      <FileField label="Vehicle registration" />
    </StepShell>
  );
}

// ───── STEP 4 ─────
export function PilotStep4() {
  const { go } = useOnboarding();
  const [eq, setEq] = useState<string[]>([]);
  return (
    <StepShell
      step={4}
      total={6}
      title="Certification and equipment"
      onNext={() => go("pilot-step5")}
    >
      <p className="text-sm text-muted-foreground mb-3">
        choose the equipment that included in your vehicle :
      </p>
      <MultiSelect label="Choose equipment" options={EQUIPMENT} selected={eq} onChange={setEq} />
      <p className="text-xs text-muted-foreground mt-2 mb-4">You add unlimited no. of equipment.</p>
      <div className="mb-4">
        <label className="block text-sm font-medium text-foreground mb-1.5">
          Certification level
        </label>
        <select className="w-full h-13 px-4 rounded-xl bg-surface border border-border">
          <option>Basic</option>
          <option>Advanced</option>
          <option>Premium</option>
          <option>State-Certified</option>
        </select>
      </div>
      <Field label="Expiration date" type="date" />
      <FileField label="Certification document" />
      <FileField label="Equipment picture" />
    </StepShell>
  );
}

// ───── STEP 5 ─────
export function PilotStep5() {
  const { go } = useOnboarding();
  const [agree, setAgree] = useState(false);
  return (
    <StepShell
      step={5}
      total={6}
      title="Payment information"
      nextLabel="Save and continue"
      nextDisabled={!agree}
      onNext={() => go("pilot-step6")}
    >
      <p className="text-sm text-muted-foreground mb-4">
        Add your bank details to receive your payouts securely.
      </p>
      <Field label="Bank name" placeholder="Chase, Bank of America..." />
      <Field label="Account Holder Name" />
      <Field label="Account Number" inputMode="numeric" />
      <Field label="Routing Number" inputMode="numeric" placeholder="9-digit routing number" />
      <label className="flex gap-2 items-start mt-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-sm text-foreground">
          I authorize ACH payments and charges according to the{" "}
          <span className="text-primary underline">terms</span>.
        </span>
      </label>
      <div className="flex gap-2 p-3 rounded-xl bg-success/10 border border-success/30">
        <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <p className="text-xs text-foreground">
          Bank information is encrypted and used only for secure payments through our payment
          processor.
        </p>
      </div>
    </StepShell>
  );
}

// ───── STEP 6 + APPROVED ─────
export function PilotStep6() {
  const { go, contact } = useOnboarding();
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar progress={{ current: 6, total: 6 }} />
      <div className="flex-1 px-6 flex flex-col items-center justify-center text-center">
        <div className="h-24 w-24 rounded-full bg-accent flex items-center justify-center mb-6">
          <Hourglass className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-3">We're reviewing your account</h1>
        <p className="text-muted-foreground mb-2">
          This usually takes less than 24 hours. You'll receive a message once you're approved on:
        </p>
        <p className="text-primary font-medium">{contact || "you@example.com"}</p>
      </div>
      <div className="px-6 pb-8 flex flex-col gap-2">
        <PrimaryButton onClick={() => go("pilot-approved")}>
          Get started (simulate approval)
        </PrimaryButton>
      </div>
    </div>
  );
}

export function PilotApproved() {
  const { go } = useOnboarding();
  const [agreed, setAgreed] = useState([false, false, false]);
  const allOk = agreed.every(Boolean);
  const items = [
    "I confirm that all documents I provided (ID, driver's license, insurance, vehicle registration, equipment list) are accurate and valid, and understand that my account may be paused if credentials expire.",
    "I confirm that I will follow all state and federal DOT escort requirements, traffic laws, and safety procedures while operating as a pilot car.",
    "I acknowledge that my identity and documents were verified through the KYC process, and I agree to maintain truthful and updated information.",
  ];
  const toggle = (i: number) => setAgreed((p) => p.map((v, idx) => (idx === i ? !v : v)));

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <div className="flex-1 px-6 overflow-y-auto">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-success mb-2">Congratulations, You're Approved</h1>
          <p className="text-muted-foreground text-sm">
            Your pilot car account is now active. You're now ready to accept offers and operate as a
            certified pilot car.
          </p>
        </div>
        <div className="space-y-3">
          {items.map((it, i) => (
            <label
              key={i}
              className="flex gap-3 p-3 rounded-xl bg-surface border border-border cursor-pointer"
            >
              <input
                type="checkbox"
                checked={agreed[i]}
                onChange={() => toggle(i)}
                className="mt-1 h-4 w-4 accent-[var(--primary)] shrink-0"
              />
              <span className="text-sm text-foreground leading-relaxed">{it}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="px-6 py-6 border-t border-border">
        <PrimaryButton disabled={!allOk} onClick={() => go("home")}>
          Get started
        </PrimaryButton>
      </div>
    </div>
  );
}

// ───── DISPATCHER 4 STEPS (compact) ─────
export function DispatcherStep1() {
  const { go, states, setStates } = useOnboarding();
  return (
    <StepShell
      step={1}
      total={4}
      title="Area and states"
      onNext={() => go("dispatcher-step2")}
      nextDisabled={states.length === 0}
    >
      <p className="text-sm text-muted-foreground mb-4">
        choose the states/areas you may work on :
      </p>
      <MultiSelect
        label="Choose states/areas"
        options={US_STATES}
        selected={states}
        onChange={setStates}
        max={5}
      />
    </StepShell>
  );
}
export function DispatcherStep2() {
  const { go } = useOnboarding();
  return (
    <StepShell
      step={2}
      total={4}
      title="Personal information"
      onNext={() => go("dispatcher-step3")}
    >
      <Field label="Full name" placeholder="Ex: John Carter" />
      <Field label="Phone number" placeholder="+1 ___ ___ ____" />
      <Field label="Email" type="email" />
      <Field label="Password" type="password" />
      <Field label="Confirm password" type="password" />
      <Field label="Referral code (optional)" />
      <Field label="Date of birth" type="date" />
      <Field label="Government ID number" />
    </StepShell>
  );
}
export function DispatcherStep3() {
  const { go } = useOnboarding();
  const [agree, setAgree] = useState(false);
  return (
    <StepShell
      step={3}
      total={4}
      title="Payment information"
      nextLabel="Save and continue"
      nextDisabled={!agree}
      onNext={() => go("dispatcher-step4")}
    >
      <p className="text-sm text-muted-foreground mb-4">
        Connect your bank account to pay pilot cars and receive invoices securely.
      </p>
      <Field label="Bank name" />
      <Field label="Account Holder Name" />
      <Field label="Account Number" inputMode="numeric" />
      <Field label="Routing Number" inputMode="numeric" />
      <label className="flex gap-2 items-start mt-2 mb-4 cursor-pointer">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--primary)]"
        />
        <span className="text-sm">
          I authorize ACH payments and charges according to the{" "}
          <span className="text-primary underline">terms</span>.
        </span>
      </label>
      <div className="flex gap-2 p-3 rounded-xl bg-success/10 border border-success/30">
        <ShieldCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <p className="text-xs">Bank information is encrypted and used only for secure payments.</p>
      </div>
    </StepShell>
  );
}
export function DispatcherStep4() {
  const { go } = useOnboarding();
  const [agreed, setAgreed] = useState([false, false, false]);
  const items = [
    "I confirm that all load information I provide (dimensions, weight, permits, timing) is accurate and truthful.",
    "I understand that it is my responsibility to ensure OS/OW permits are valid for the route and state(s) selected.",
    "I agree to follow all local, state, and federal regulations related to oversized/overweight transport.",
  ];
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar progress={{ current: 4, total: 4 }} />
      <div className="flex-1 px-6 overflow-y-auto">
        <div className="flex flex-col items-center text-center mb-6 mt-4">
          <div className="h-20 w-20 rounded-full bg-success/15 flex items-center justify-center mb-4">
            <CheckCircle2 className="h-10 w-10 text-success" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">You're All Set!</h1>
          <p className="text-muted-foreground text-sm">
            Your dispatcher account is ready. You can now create loads and hire pilot cars anytime.
          </p>
        </div>
        <div className="space-y-3">
          {items.map((it, i) => (
            <label
              key={i}
              className="flex gap-3 p-3 rounded-xl bg-surface border border-border cursor-pointer"
            >
              <input
                type="checkbox"
                checked={agreed[i]}
                onChange={() => setAgreed((p) => p.map((v, idx) => (idx === i ? !v : v)))}
                className="mt-1 h-4 w-4 accent-[var(--primary)] shrink-0"
              />
              <span className="text-sm leading-relaxed">{it}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="px-6 py-6 border-t border-border">
        <PrimaryButton disabled={!agreed.every(Boolean)} onClick={() => go("home")}>
          Get started
        </PrimaryButton>
      </div>
    </div>
  );
}
