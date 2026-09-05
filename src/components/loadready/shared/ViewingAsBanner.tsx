import { Eye, LogOut, Megaphone } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

/**
 * A line an administrator has put up for everybody.
 *
 * Above everything, like the view-as banner, but in the ordinary accent rather
 * than the alarm colour — it is usually "we are down until nine", not an
 * emergency, and using the same red for both would make neither mean anything.
 */
export function AnnouncementBanner() {
  const { announcement } = useAuth();
  if (!announcement) return null;

  return (
    <div role="status" className="flex items-center gap-2 bg-accent px-4 py-2 text-primary">
      <Megaphone className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-xs font-semibold">{announcement}</span>
    </div>
  );
}

/**
 * The banner that says you are inside somebody else's account.
 *
 * An administrator who forgets they are viewing-as is the whole risk of the
 * feature: they read a screen, believe it is theirs, and act on it. So this
 * sits above everything, in a colour nothing else uses, and it does not close.
 *
 * The server refuses every mutating action on this session anyway (see
 * `authorize`) — this is so nobody has to find that out by trying.
 */
export function ViewingAsBanner() {
  const { user, viewingAs, signOut } = useAuth();
  if (!viewingAs || !user) return null;

  return (
    <div
      role="status"
      className="flex items-center gap-2 bg-destructive px-4 py-2 text-destructive-foreground"
    >
      <Eye className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-xs font-semibold">
        You are viewing {user.fullName || user.email}&apos;s account. Read-only, and they have been
        told.
      </span>
      <button
        onClick={() => void signOut()}
        className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-destructive-foreground/15 px-3 text-[11px] font-bold"
      >
        <LogOut className="h-3 w-3" aria-hidden /> Leave
      </button>
    </div>
  );
}
