import { useCallback, useEffect, useState } from "react";
import { Eye, KeyRound, Loader2, LogOut, ShieldOff, UserX, Users } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/loadready/states/StateBlock";

/**
 * The accounts, and the four things an administrator can do to one.
 *
 * What is deliberately not here: phone numbers and addresses. Whether somebody
 * can work is an administrator's business; how to reach them is the business
 * of whoever hired them (ADR-8). The console has held that line since J1 and
 * a user list is exactly where it would be easiest to give it up.
 *
 * Every action asks for a reason before it will run, because every one of them
 * either stops somebody working or lowers their security — and the reason is
 * what makes the audit entry worth having.
 */

interface Person {
  id: string;
  email: string;
  fullName: string;
  role: string;
  approval: string;
  builtIn: boolean;
  mfaEnabled: boolean;
  createdAt: string;
  suspendedAt: string | null;
  suspensionReason: string | null;
  deletionRequestedAt: string | null;
  verification: string | null;
  profileComplete: number | null;
  subscription: { status: string; override: string } | null;
}

type ActionId = "suspend" | "reactivate" | "revoke-sessions" | "clear-mfa" | "view-as";

const ACTIONS: Record<
  ActionId,
  { label: string; icon: typeof Eye; needsReason: boolean; confirm: string }
> = {
  suspend: {
    label: "Suspend",
    icon: UserX,
    needsReason: true,
    confirm: "They cannot sign in, every session they hold ends now, and they are told why.",
  },
  reactivate: {
    label: "Reactivate",
    icon: Users,
    needsReason: false,
    confirm: "They can sign in and take work again, and they are told.",
  },
  "revoke-sessions": {
    label: "Sign out everywhere",
    icon: LogOut,
    needsReason: true,
    confirm: "Ends every session. They sign in again as normal — this is not a password reset.",
  },
  "clear-mfa": {
    label: "Remove second factor",
    icon: ShieldOff,
    needsReason: true,
    confirm:
      "For a lost phone. It lowers their security, ends their sessions, and they are emailed about it.",
  },
  "view-as": {
    label: "View as",
    icon: Eye,
    needsReason: true,
    confirm:
      "Read-only, 15 minutes, and nothing can be changed. They are told that you looked and why.",
  },
};

function Pill({ label, tone }: { label: string; tone: "warn" | "good" | "muted" }) {
  const cls =
    tone === "warn"
      ? "bg-destructive/10 text-destructive"
      : tone === "good"
        ? "bg-success/10 text-success"
        : "bg-surface text-muted-foreground";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>
  );
}

export function PeoplePanel() {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Person | null>(null);
  const [pending, setPending] = useState<ActionId | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async (term: string) => {
    try {
      const res = await fetch(`/api/admin?view=people&q=${encodeURIComponent(term)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Could not load the accounts.");
      setPeople(((await res.json()) as { people: Person[] }).people);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the accounts.");
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void refresh(query), 250);
    return () => clearTimeout(timer);
  }, [query, refresh]);

  const run = async (person: Person, action: ActionId) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action, userId: person.id, reason }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; minutes?: number };
      if (!res.ok) throw new Error(data.error ?? "That did not work.");

      if (action === "view-as") {
        /*
         * The administrator's own session has been replaced by a read-only one
         * belonging to the person they are looking at, so the whole app has to
         * reload as them. Signing out is how they come back.
         */
        window.location.href = "/";
        return;
      }

      setPending(null);
      setReason("");
      setOpen(null);
      await refresh(query);
      setNote(`${ACTIONS[action].label} — done, and recorded in the audit log.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "That did not work.");
    }
    setBusy(false);
  };

  if (error) return <ErrorState message={error} onRetry={() => void refresh(query)} />;
  if (!people) return <LoadingState message="Loading accounts…" />;

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="sr-only">Search accounts</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or email"
          className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
        />
      </label>

      {note && (
        <div role="status" className="rounded-xl border border-border bg-background p-3 text-xs">
          {note}
        </div>
      )}

      {people.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-background p-6 text-center">
          <Users className="mx-auto mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
          <p className="text-sm font-semibold">Nobody matches that</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {people.map((person) => (
            <li key={person.id} className="rounded-xl border border-border bg-background p-3">
              <button
                onClick={() => {
                  setOpen(open?.id === person.id ? null : person);
                  setPending(null);
                  setReason("");
                }}
                className="flex w-full items-start justify-between gap-3 text-left"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{person.fullName}</div>
                  <div className="truncate text-[11px] text-muted-foreground">{person.email}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Pill label={person.role} tone="muted" />
                    {person.suspendedAt && <Pill label="Suspended" tone="warn" />}
                    {person.approval === "pending" && (
                      <Pill label="Awaiting approval" tone="warn" />
                    )}
                    {person.deletionRequestedAt && <Pill label="Deleting" tone="warn" />}
                    {person.mfaEnabled && <Pill label="2FA" tone="good" />}
                    {person.builtIn && <Pill label="Built-in" tone="muted" />}
                    {person.subscription?.override === "comped" && (
                      <Pill label="Comped" tone="good" />
                    )}
                  </div>
                </div>
              </button>

              {open?.id === person.id && (
                <div className="mt-3 border-t border-border pt-3">
                  {person.suspensionReason && (
                    <p className="mb-2 text-[11px] text-destructive">
                      Suspended: {person.suspensionReason}
                    </p>
                  )}
                  {person.verification && (
                    <p className="mb-2 text-[11px] text-muted-foreground">
                      Verification: {person.verification.replace(/_/g, " ")}
                      {person.profileComplete !== null
                        ? ` · ${person.profileComplete}% complete`
                        : ""}
                    </p>
                  )}

                  {person.builtIn ? (
                    <p className="text-[11px] text-muted-foreground">
                      This is a built-in team account. It cannot be suspended or removed from here.
                    </p>
                  ) : pending ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        {ACTIONS[pending].confirm}
                      </p>
                      {ACTIONS[pending].needsReason && (
                        <label className="block">
                          <span className="sr-only">Reason</span>
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Reason — it goes on the record"
                            className="h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-xs"
                          />
                        </label>
                      )}
                      <div className="flex gap-2">
                        <button
                          disabled={
                            busy || (ACTIONS[pending].needsReason && reason.trim().length < 3)
                          }
                          onClick={() => void run(person, pending)}
                          className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive text-[11px] font-semibold text-destructive-foreground disabled:opacity-50"
                        >
                          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          {ACTIONS[pending].label}
                        </button>
                        <button
                          onClick={() => {
                            setPending(null);
                            setReason("");
                          }}
                          className="h-9 flex-1 rounded-lg border border-border text-[11px] font-semibold"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          person.suspendedAt ? "reactivate" : "suspend",
                          "revoke-sessions",
                          person.mfaEnabled ? "clear-mfa" : null,
                          "view-as",
                        ].filter(Boolean) as ActionId[]
                      ).map((id) => {
                        const Icon = ACTIONS[id].icon;
                        return (
                          <button
                            key={id}
                            onClick={() => setPending(id)}
                            className="flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-[11px] font-semibold"
                          >
                            <Icon className="h-3.5 w-3.5" aria-hidden /> {ACTIONS[id].label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
        <KeyRound className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
        There is no way to set somebody&apos;s password from here, on purpose: an administrator who
        could would be able to sign in as them with nothing on the record. &quot;Sign out
        everywhere&quot; plus their own forgot-password link is the safe version of the same thing.
      </p>
    </div>
  );
}
