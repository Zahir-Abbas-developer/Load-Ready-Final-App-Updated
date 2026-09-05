import { useEffect, useRef, useState } from "react";
import { TopBar } from "../TopBar";
import { PrimaryButton } from "../PrimaryButton";
import { useOnboarding } from "@/lib/onboarding-context";

export function OtpScreen() {
  const { go, role, contact, back } = useOnboarding();
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [seconds, setSeconds] = useState(120);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (seconds <= 0) return;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const filled = digits.every((d) => d.length === 1);
  const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
  const secs = String(seconds % 60).padStart(2, "0");

  const handleChange = (i: number, v: string) => {
    if (!/^\d?$/.test(v)) return;
    const next = [...digits];
    next[i] = v;
    setDigits(next);
    if (v && i < 3) refs.current[i + 1]?.focus();
  };

  const submit = () => {
    if (!filled) return;
    if (role === "pilot") go("pilot-step1");
    else if (role === "dispatcher") go("dispatcher-step1");
    else go("role");
  };

  useEffect(() => {
    if (filled) submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filled]);

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <div className="flex-1 px-6 pt-2">
        <h1 className="text-2xl font-bold text-primary">Welcome to BWM</h1>
        <p className="text-muted-foreground mt-1 mb-4">
          Enter the 4-digit code sent to you at:{" "}
          <span className="text-primary font-medium">{contact || "you@example.com"}</span>
        </p>

        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wider font-bold text-primary mb-1">
            Demo / Testing Mode
          </p>
          <p className="text-xs text-foreground leading-relaxed">
            Email delivery is disabled in this preview build. Use any 4-digit
            code to continue — for example{" "}
            <code className="font-mono font-bold text-primary">0000</code>,{" "}
            <code className="font-mono font-bold text-primary">1111</code>, or{" "}
            <code className="font-mono font-bold text-primary">1234</code>.
            No code is invalid.
          </p>
        </div>

        <div className="flex justify-between gap-3 mb-4">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { refs.current[i] = el; }}
              value={d}
              inputMode="numeric"
              maxLength={1}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Backspace" && !d && i > 0) refs.current[i - 1]?.focus();
              }}
              className="h-16 w-16 text-center text-2xl font-bold rounded-xl bg-surface border border-border focus:outline-none focus:border-primary"
            />
          ))}
        </div>

        {seconds > 0 ? (
          <p className="text-center text-muted-foreground">
            00:{mins}:{secs}
          </p>
        ) : (
          <p className="text-center">
            Did receive code ?{" "}
            <button onClick={() => setSeconds(120)} className="text-primary font-semibold">
              Resend code
            </button>
          </p>
        )}

        <p className="text-center mt-4">
          <button onClick={back} className="text-primary font-medium">
            Wrong {contact.includes("@") ? "email" : "number"} ? Change it
          </button>
        </p>
      </div>
      <div className="px-6 pb-8">
        <PrimaryButton disabled={!filled} onClick={submit}>
          Next
        </PrimaryButton>
      </div>
    </div>
  );
}
