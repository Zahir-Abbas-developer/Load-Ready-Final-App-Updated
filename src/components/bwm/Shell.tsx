import { type ReactNode } from "react";

/** Mobile-first frame centered on larger screens. */
export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full bg-neutral-100 flex justify-center">
      <div className="w-full max-w-[420px] min-h-screen bg-background relative flex flex-col shadow-xl">
        {children}
      </div>
    </div>
  );
}
