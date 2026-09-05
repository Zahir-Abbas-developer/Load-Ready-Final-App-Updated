import { X } from "lucide-react";
import { useProfile } from "@/lib/profile/use-profile";
import { DocumentsPanel } from "./DocumentsPanel";

// ───────── Reusable sheet ─────────
function Sheet({
  children,
  onClose,
  title,
  footer,
}: {
  children: React.ReactNode;
  onClose: () => void;
  title: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-background rounded-t-3xl max-h-[90vh] flex flex-col"
      >
        <div className="sticky top-0 bg-background z-10 flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <h3 className="font-bold">{title}</h3>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full bg-surface flex items-center justify-center"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-3 border-t border-border bg-background">{footer}</div>}
      </div>
    </div>
  );
}

// ───────── 2) Documents standalone sheet ─────────
/**
 * Documents and certifications now live on the server, so this is a thin shell
 * around DocumentsPanel. The old localStorage version could not be reviewed by
 * anyone and had no file input at all.
 */
export function DocumentsSheet({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Documents & certifications" onClose={onClose}>
      <DocumentsPanel />
    </Sheet>
  );
}

// ───────── Verification status badge for pilot home ─────────
/**
 * The pilot's verification state, from the server.
 *
 * Was a localStorage read with a `storage` event listener, which only ever
 * fired for *other* tabs — so the dashboard's own banner never updated after
 * the pilot changed something in front of them.
 */
export function useVerificationStatus() {
  const { record, completion } = useProfile();
  return {
    verification_status: record?.profile.verificationStatus ?? "not_started",
    verification_note: record?.profile.verificationNote ?? null,
    completion_pct: completion,
  };
}
