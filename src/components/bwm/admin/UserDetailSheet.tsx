import { useMemo, useState } from "react";
import {
  X, Star, Mail, Phone, MapPin, Calendar, Building2, FileText, ShieldCheck,
  CheckCircle2, XCircle, Clock, AlertTriangle, Flag, Trash2, UserCheck, UserX,
  StickyNote, Download, ChevronLeft, ChevronRight, History, IdCard,
} from "lucide-react";
import {
  setUserStatus, flagUser, unflagUser, removeUser, addAdminNote,
  setUserVerification,
  type AdminState, type AdminUser, type FlagReason, type UserVerificationField,
} from "@/lib/admin/demo-store";

type TabId = "overview" | "personal" | "business" | "verifications" | "documents" | "activity";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "personal", label: "Personal" },
  { id: "business", label: "Business" },
  { id: "verifications", label: "Verifications" },
  { id: "documents", label: "Documents" },
  { id: "activity", label: "Activity" },
];

const FLAG_REASONS: FlagReason[] = [
  "Suspicious activity",
  "Fake documents",
  "Payment issue",
  "Customer complaint",
  "Policy violation",
  "Other",
];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try { return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); } catch { return d; }
}
function fmtRel(d?: string | null) {
  if (!d) return "—";
  const t = new Date(d).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d2 = Math.floor(h / 24);
  if (d2 < 30) return `${d2}d ago`;
  return fmtDate(d);
}

function StatusBadge({ status }: { status: AdminUser["status"] }) {
  const map: Record<AdminUser["status"], string> = {
    active: "bg-success/15 text-success",
    pending: "bg-warning/15 text-warning",
    suspended: "bg-destructive/15 text-destructive",
    flagged: "bg-purple-500/15 text-purple-600 dark:text-purple-400",
    removed: "bg-muted text-muted-foreground",
  };
  return <span className={`inline-flex items-center text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize ${map[status]}`}>{status}</span>;
}

function VerifPill({ value }: { value?: AdminUser["kyc_verified"] }) {
  const v = value ?? "not_started";
  const cfg: Record<string, { c: string; Icon: any; label: string }> = {
    approved: { c: "bg-success/15 text-success", Icon: CheckCircle2, label: "Approved" },
    pending: { c: "bg-warning/15 text-warning", Icon: Clock, label: "Pending" },
    rejected: { c: "bg-destructive/15 text-destructive", Icon: XCircle, label: "Rejected" },
    not_started: { c: "bg-muted text-muted-foreground", Icon: AlertTriangle, label: "Not started" },
  };
  const { c, Icon, label } = cfg[v];
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold ${c}`}>
      <Icon className="h-3 w-3" /> {label}
    </span>
  );
}

function Field({ icon: Icon, label, value }: { icon?: any; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 py-2 border-b border-border/60 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="text-sm font-medium break-words">{value || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-background border border-border p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">{title}</div>
      {children}
    </div>
  );
}

function ConfirmDialog({
  open, onClose, onConfirm, title, message, confirmLabel, destructive, withNote, withReason,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (data: { note?: string; reason?: FlagReason }) => void;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  withNote?: boolean;
  withReason?: boolean;
}) {
  const [note, setNote] = useState("");
  const [reason, setReason] = useState<FlagReason>("Suspicious activity");
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[90] bg-black/50 flex items-end sm:items-center justify-center p-3 animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-background border border-border shadow-xl p-4 animate-in slide-in-from-bottom-4 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-3">
          {destructive && <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />}
          <div>
            <h3 className="font-bold text-base">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{message}</p>
          </div>
        </div>
        {withReason && (
          <div className="mb-3">
            <label className="text-xs font-semibold text-muted-foreground">Reason</label>
            <select value={reason} onChange={(e) => setReason(e.target.value as FlagReason)} className="mt-1 w-full h-10 rounded-lg bg-surface border border-border px-3 text-sm">
              {FLAG_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        {withNote && (
          <div className="mb-3">
            <label className="text-xs font-semibold text-muted-foreground">Note (optional)</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1 w-full rounded-lg bg-surface border border-border px-3 py-2 text-sm" placeholder="Add context for the audit log…" />
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm font-semibold hover:bg-surface">Cancel</button>
          <button
            onClick={() => { onConfirm({ note: note.trim() || undefined, reason: withReason ? reason : undefined }); setNote(""); }}
            className={`flex-1 h-10 rounded-lg text-sm font-semibold text-white ${destructive ? "bg-destructive hover:bg-destructive/90" : "bg-primary hover:bg-primary/90"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function UserDetailSheet({
  user, state, setState, onClose,
}: {
  user: AdminUser;
  state: AdminState;
  setState: (s: AdminState) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [noteDraft, setNoteDraft] = useState("");
  const [confirm, setConfirm] = useState<null | {
    title: string; message: string; confirmLabel: string;
    destructive?: boolean; withNote?: boolean; withReason?: boolean;
    run: (data: { note?: string; reason?: FlagReason }) => void;
  }>(null);

  const docs = useMemo(
    () => state.verifications.filter((v) => v.applicant_id === user.id),
    [state.verifications, user.id],
  );

  const initials = user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const update = (s: AdminState) => setState(s);

  const actSuspend = () => setConfirm({
    title: "Suspend user",
    message: `Suspend ${user.name}? They will lose access to the marketplace until reactivated.`,
    confirmLabel: "Suspend",
    destructive: true,
    withNote: true,
    run: ({ note }) => update(setUserStatus(state, user.id, "suspended", note)),
  });
  const actReactivate = () => update(setUserStatus(state, user.id, "active"));
  const actRemove = () => setConfirm({
    title: "Remove user",
    message: `This marks ${user.name} as removed. Their data is retained for audit but they can no longer sign in.`,
    confirmLabel: "Remove",
    destructive: true,
    withNote: true,
    run: ({ note }) => { update(removeUser(state, user.id, note)); onClose(); },
  });
  const actFlag = () => setConfirm({
    title: "Flag user",
    message: `Add a flag to ${user.name} for review.`,
    confirmLabel: "Flag user",
    destructive: false,
    withReason: true,
    withNote: true,
    run: ({ reason, note }) => update(flagUser(state, user.id, reason ?? "Other", note)),
  });
  const actUnflag = () => update(unflagUser(state, user.id));
  const actVerif = (field: UserVerificationField, status: "approved" | "rejected") => {
    if (status === "rejected") {
      setConfirm({
        title: `Reject ${field.replace("_verified", "")} verification`,
        message: `Reject ${user.name}'s verification.`,
        confirmLabel: "Reject",
        destructive: true,
        withNote: true,
        run: ({ note }) => update(setUserVerification(state, user.id, field, "rejected", note)),
      });
    } else {
      update(setUserVerification(state, user.id, field, "approved"));
    }
  };
  const submitNote = () => {
    if (!noteDraft.trim()) return;
    update(addAdminNote(state, user.id, noteDraft));
    setNoteDraft("");
  };

  const refreshedUser = state.users.find((u) => u.id === user.id) ?? user;

  return (
    <div className="absolute inset-0 z-[80] bg-black/50 animate-in fade-in duration-150 flex" onClick={onClose}>
      <aside
        className="ml-auto h-full w-full sm:max-w-[560px] bg-background border-l border-border flex flex-col animate-in slide-in-from-right duration-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-2">
            <button onClick={onClose} className="inline-flex items-center gap-1 hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" /> Admin
            </button>
            <ChevronRight className="h-3 w-3" />
            <button onClick={onClose} className="hover:text-foreground">Users</button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium truncate">{refreshedUser.name}</span>
            <button onClick={onClose} className="ml-auto h-8 w-8 rounded-lg hover:bg-surface flex items-center justify-center" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-14 w-14 rounded-full bg-accent flex items-center justify-center font-bold text-primary text-lg shrink-0">
              {refreshedUser.photo_url ? (
                <img src={refreshedUser.photo_url} alt={refreshedUser.name} className="h-full w-full rounded-full object-cover" />
              ) : initials}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-bold text-base truncate">{refreshedUser.name}</h2>
                <StatusBadge status={refreshedUser.status} />
                {refreshedUser.flag_reason && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400">
                    <Flag className="h-3 w-3" /> {refreshedUser.flag_reason}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground truncate">{refreshedUser.role} · {refreshedUser.email}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2">
                {refreshedUser.rating != null && (
                  <span className="inline-flex items-center gap-0.5"><Star className="h-3 w-3 fill-current text-amber-500" /> {refreshedUser.rating}</span>
                )}
                <span>{refreshedUser.trips} trips</span>
                <span>· Last active {fmtRel(refreshedUser.last_active)}</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mt-3 -mx-1 px-1 flex gap-1 overflow-x-auto no-scrollbar">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`shrink-0 px-3 h-8 rounded-full text-xs font-semibold transition-colors ${
                  tab === t.id ? "bg-primary text-primary-foreground" : "bg-surface text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {tab === "overview" && (
            <>
              <SectionCard title="Account">
                <Field icon={Mail} label="Email" value={refreshedUser.email} />
                <Field icon={Phone} label="Phone" value={refreshedUser.phone} />
                <Field icon={ShieldCheck} label="Role" value={refreshedUser.role} />
                <Field icon={Calendar} label="Joined" value={fmtDate(refreshedUser.joined_at)} />
                <Field icon={Clock} label="Last active" value={fmtRel(refreshedUser.last_active)} />
              </SectionCard>
              <SectionCard title="Performance">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-surface p-3">
                    <div className="text-[11px] text-muted-foreground">Total trips</div>
                    <div className="text-xl font-bold">{refreshedUser.trips}</div>
                  </div>
                  <div className="rounded-xl bg-surface p-3">
                    <div className="text-[11px] text-muted-foreground">Rating</div>
                    <div className="text-xl font-bold flex items-center gap-1">
                      {refreshedUser.rating ?? "—"}
                      {refreshedUser.rating != null && <Star className="h-4 w-4 fill-current text-amber-500" />}
                    </div>
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {tab === "personal" && (
            <SectionCard title="Personal details">
              <Field icon={Calendar} label="Date of birth" value={fmtDate(refreshedUser.date_of_birth)} />
              <Field icon={IdCard} label="Nationality" value={refreshedUser.nationality} />
              <Field icon={MapPin} label="Address" value={refreshedUser.address} />
              <Field icon={Phone} label="Emergency contact" value={refreshedUser.emergency_contact} />
            </SectionCard>
          )}

          {tab === "business" && (
            <SectionCard title="Business details">
              <Field icon={Building2} label="Company name" value={refreshedUser.company_name} />
              <Field icon={Mail} label="Business email" value={refreshedUser.business_email} />
              <Field icon={Phone} label="Business phone" value={refreshedUser.business_phone} />
              <Field icon={MapPin} label="Business address" value={refreshedUser.business_address} />
              <Field icon={FileText} label="Trade license #" value={refreshedUser.trade_license_number} />
              <Field icon={Calendar} label="License expiry" value={fmtDate(refreshedUser.trade_license_expiry)} />
              <Field icon={FileText} label="Tax / VAT" value={refreshedUser.tax_number} />
            </SectionCard>
          )}

          {tab === "verifications" && (
            <>
              <SectionCard title="Channel verification">
                <div className="flex items-center justify-between py-2 border-b border-border/60">
                  <span className="text-sm font-medium flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> Email</span>
                  {refreshedUser.email_verified
                    ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-success/15 text-success"><CheckCircle2 className="h-3 w-3" /> Verified</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground"><Clock className="h-3 w-3" /> Unverified</span>}
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm font-medium flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> Phone</span>
                  {refreshedUser.phone_verified
                    ? <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-success/15 text-success"><CheckCircle2 className="h-3 w-3" /> Verified</span>
                    : <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold bg-muted text-muted-foreground"><Clock className="h-3 w-3" /> Unverified</span>}
                </div>
              </SectionCard>

              {(["kyc_verified", "business_verified", "license_verified"] as UserVerificationField[]).map((field) => {
                const label = field === "kyc_verified" ? "Identity (KYC)" : field === "business_verified" ? "Business" : "Trade license";
                const value = refreshedUser[field];
                return (
                  <SectionCard key={field} title={label}>
                    <div className="flex items-center justify-between mb-3">
                      <VerifPill value={value} />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => actVerif(field, "approved")}
                        disabled={value === "approved"}
                        className="flex-1 h-9 rounded-lg bg-success/10 text-success text-xs font-semibold disabled:opacity-50 hover:bg-success/20 transition-colors inline-flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                      </button>
                      <button
                        onClick={() => actVerif(field, "rejected")}
                        disabled={value === "rejected"}
                        className="flex-1 h-9 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold disabled:opacity-50 hover:bg-destructive/20 transition-colors inline-flex items-center justify-center gap-1"
                      >
                        <XCircle className="h-3.5 w-3.5" /> Reject
                      </button>
                    </div>
                  </SectionCard>
                );
              })}
            </>
          )}

          {tab === "documents" && (
            <SectionCard title="Uploaded documents">
              {docs.length === 0 ? (
                <div className="text-sm text-muted-foreground py-6 text-center">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No documents uploaded yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {docs.map((d) => (
                    <div key={d.id} className="rounded-xl bg-surface border border-border p-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold truncate">{d.doc_type}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {d.document_number ?? "—"} · {d.issuing_authority ?? "—"} · {fmtDate(d.submitted_at)}
                        </div>
                        {d.rejection_reason && (
                          <div className="text-[11px] text-destructive mt-0.5">Rejected: {d.rejection_reason}</div>
                        )}
                      </div>
                      <VerifPill value={d.status === "approved" ? "approved" : d.status === "rejected" ? "rejected" : "pending"} />
                      <button
                        onClick={() => alert(`Demo: preview ${d.doc_type}`)}
                        className="h-8 w-8 rounded-lg hover:bg-background flex items-center justify-center text-muted-foreground"
                        aria-label="Download"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          {tab === "activity" && (
            <>
              <SectionCard title="Admin notes">
                <div className="flex gap-2 mb-3">
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={2}
                    placeholder="Add an internal note…"
                    className="flex-1 rounded-lg bg-surface border border-border px-3 py-2 text-sm"
                  />
                  <button
                    onClick={submitNote}
                    disabled={!noteDraft.trim()}
                    className="h-10 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 self-start inline-flex items-center gap-1"
                  >
                    <StickyNote className="h-3.5 w-3.5" /> Save
                  </button>
                </div>
                {(refreshedUser.notes ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">No notes yet.</div>
                ) : (
                  <div className="space-y-2">
                    {refreshedUser.notes!.map((n) => (
                      <div key={n.id} className="rounded-lg bg-surface p-3">
                        <div className="text-[11px] text-muted-foreground mb-1">{n.by} · {fmtRel(n.at)}</div>
                        <div className="text-sm">{n.body}</div>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Activity timeline">
                {(refreshedUser.activity ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground py-2">No activity recorded.</div>
                ) : (
                  <div className="space-y-2">
                    {refreshedUser.activity!.map((a) => (
                      <div key={a.id} className="flex items-start gap-2 py-1.5 border-b border-border/60 last:border-0">
                        <History className="h-3.5 w-3.5 text-muted-foreground mt-1 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm">{a.label}</div>
                          <div className="text-[11px] text-muted-foreground">{fmtRel(a.at)}</div>
                        </div>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{a.kind}</span>
                      </div>
                    ))}
                  </div>
                )}
              </SectionCard>
            </>
          )}
        </div>

        {/* Footer admin actions */}
        <div className="border-t border-border p-3 bg-background space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {refreshedUser.status === "suspended" || refreshedUser.status === "removed" ? (
              <button onClick={actReactivate} className="h-10 rounded-lg bg-success/10 text-success text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-success/20">
                <UserCheck className="h-4 w-4" /> Reactivate
              </button>
            ) : (
              <button onClick={actSuspend} className="h-10 rounded-lg bg-destructive/10 text-destructive text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-destructive/20">
                <UserX className="h-4 w-4" /> Suspend
              </button>
            )}
            {refreshedUser.flag_reason || refreshedUser.status === "flagged" ? (
              <button onClick={actUnflag} className="h-10 rounded-lg bg-surface text-foreground text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-accent">
                <Flag className="h-4 w-4" /> Unflag
              </button>
            ) : (
              <button onClick={actFlag} className="h-10 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-purple-500/20">
                <Flag className="h-4 w-4" /> Flag
              </button>
            )}
          </div>
          <button onClick={actRemove} className="w-full h-10 rounded-lg border border-destructive/40 text-destructive text-xs font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-destructive/10">
            <Trash2 className="h-4 w-4" /> Remove user
          </button>
        </div>

        <ConfirmDialog
          open={!!confirm}
          onClose={() => setConfirm(null)}
          onConfirm={(data) => { confirm?.run(data); setConfirm(null); }}
          title={confirm?.title ?? ""}
          message={confirm?.message ?? ""}
          confirmLabel={confirm?.confirmLabel ?? "Confirm"}
          destructive={confirm?.destructive}
          withNote={confirm?.withNote}
          withReason={confirm?.withReason}
        />
      </aside>
    </div>
  );
}
