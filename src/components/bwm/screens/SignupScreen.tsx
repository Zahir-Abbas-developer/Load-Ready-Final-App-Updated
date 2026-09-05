import { useState } from "react";
import { TopBar } from "../TopBar";
import { PrimaryButton } from "../PrimaryButton";
import { useOnboarding } from "@/lib/onboarding-context";
import { Apple, Mail } from "lucide-react";

export function SignupScreen() {
  const { go, setContact } = useOnboarding();
  const [val, setVal] = useState("");

  const SocialBtn = ({ icon: Icon, label }: any) => (
    <button
      onClick={() => {
        setContact("demo@bwm.test");
        go("otp");
      }}
      className="h-12 w-full rounded-full border border-border bg-background flex items-center justify-center gap-2 font-medium text-foreground hover:bg-surface"
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col min-h-screen">
      <TopBar />
      <div className="flex-1 px-6 pt-2">
        <h1 className="text-2xl font-bold text-primary">Welcome to BWM</h1>
        <p className="text-muted-foreground mt-1 mb-6">Create your account</p>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Enter your email or phone number"
          className="w-full h-13 px-4 py-3 rounded-xl bg-surface border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
        />
        <div className="mt-4">
          <PrimaryButton
            disabled={val.length < 3}
            onClick={() => {
              setContact(val);
              go("otp");
            }}
          >
            Continue
          </PrimaryButton>
        </div>
        <p className="text-center mt-4 text-sm text-muted-foreground">
          Already have an account ?{" "}
          <button
            onClick={() => {
              setContact("demo@bwm.test");
              go("otp");
            }}
            className="text-primary font-medium"
          >
            Log in
          </button>
        </p>

        <div className="flex items-center gap-3 my-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-sm text-muted-foreground">Or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="flex flex-col gap-3">
          <SocialBtn icon={Apple} label="Continue with Apple" />
          <SocialBtn icon={Mail} label="Continue with Google" />
          <SocialBtn icon={Mail} label="Continue with Facebook" />
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6 leading-relaxed">
          By proceeding, you consent to get calls, WhatsApp or SMS messages, including by automated
          means, from BWM and its affiliates to the number provided.
        </p>
      </div>
    </div>
  );
}
