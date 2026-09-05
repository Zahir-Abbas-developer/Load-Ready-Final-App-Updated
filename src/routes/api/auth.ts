import { createFileRoute } from "@tanstack/react-router";
import {
  authenticate,
  clearedCookie,
  decideAccount,
  endSession,
  isSecureRequest,
  listAccounts,
  readSessionCookie,
  sessionCookie,
  beginMfaEnrolment,
  confirmMfaEnrolment,
  disableMfa,
  mfaStatus,
  requestPasswordReset,
  resendSignupCode,
  verifyMfaChallenge,
  resetPassword,
  startSignup,
  userForToken,
  verifySignupCode,
  impersonationOf,
} from "@/server/auth-store.server";
import {
  mailerConfigured,
  sendOtpEmail,
  sendPasswordResetEmail,
  sendSignupOnExistingAccountEmail,
} from "@/server/mailer.server";
import { authorize, isDenied, killSwitchResponse, sameOrigin } from "@/server/authz.server";
import { currentVersion, recordAcceptance } from "@/server/legal-store.server";
import { LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import { recordAudit } from "@/server/audit-store.server";
import { settings } from "@/server/settings-store.server";
import { notify } from "@/server/notifier.server";
import {
  AUTH_LIMITS,
  callerKey,
  checkRateLimit,
  clearRateLimit,
  peekRateLimit,
  recordFailure,
} from "@/server/rate-limit.server";
import {
  firstError,
  requestPasswordResetSchema,
  resendOtpSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
  verifyOtpSchema,
} from "@/lib/auth-schemas";

/**
 * Every auth operation, behind one endpoint.
 *
 * A single route keeps the session cookie handling in one place. The action is
 * named in the body; anything that touches other people's accounts checks the
 * caller's role here on the server, never in the browser.
 */
export const Route = createFileRoute("/api/auth")({
  server: {
    handlers: {
      // Who am I? Called on page load to restore the session.
      GET: async ({ request }) => {
        const token = readSessionCookie(request);
        const user = await userForToken(token);
        /*
         * The app has to know it is being looked at rather than used, so it can
         * say so on every screen. An administrator who forgets they are inside
         * somebody else's account is the whole risk of the feature.
         */
        const viewingAs = user ? await impersonationOf(token) : null;
        /*
         * The announcement rides along on the call every screen already makes
         * on load, rather than adding a second request to every page for a
         * line that is almost always empty.
         */
        const announcement = settings().announcement;
        return Response.json({
          user,
          viewingAs: viewingAs ? true : undefined,
          announcement: announcement || undefined,
        });
      },

      POST: async ({ request }) => {
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Malformed request." }, { status: 400 });
        }

        const action = String(body.action ?? "");
        const secure = isSecureRequest(request);

        /*
         * Every action here changes something — a session, an account, a
         * password. The session cookie is SameSite=Lax, which already stops a
         * cross-site form post carrying it; this is the second lock, and the
         * one that survives a browser treating Lax loosely.
         */
        if (!sameOrigin(request)) {
          return Response.json({ error: "Request blocked." }, { status: 403 });
        }

        /*
         * A kill switch, checked here because this route gates its own actions
         * rather than going through `authorize` (F-100). The same function
         * `authorize` uses, so the two cannot drift — and this is exactly the
         * silent-no-op the settings test warns about, caught by running it.
         */
        const switched = killSwitchResponse(`auth:${action}`);
        if (switched) return switched;

        /*
         * Rate limit before doing any work. Sign-in was previously unlimited,
         * and the signup endpoint would send mail to any address as fast as it
         * was asked — the abuse lands in a stranger's inbox and on our sending
         * reputation, so the limits on anything that sends are the tightest.
         */
        const tooMany = (retryAfter: number) =>
          Response.json(
            { error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
            { status: 429, headers: { "retry-after": String(retryAfter) } },
          );

        /*
         * Sign-in is metered differently from everything else: the budget is
         * per address-and-account rather than per address, and only a wrong
         * password spends any of it.
         *
         * Charging every attempt to the IP alone meant a dispatch office of
         * fifteen people behind one connection shared ten sign-ins per quarter
         * hour — they lock each other out on a Monday morning while an attacker
         * is slowed by exactly the same amount either way.
         */
        const rule = AUTH_LIMITS[action];
        const loginKey =
          action === "login"
            ? `${callerKey(request, action)}:${String(body.email ?? "")
                .toLowerCase()
                .slice(0, 160)}`
            : null;

        if (rule && loginKey) {
          const { ok, retryAfter } = peekRateLimit(loginKey, rule);
          if (!ok) return tooMany(retryAfter);
        } else if (rule) {
          const { ok, retryAfter } = checkRateLimit(callerKey(request, action), rule);
          if (!ok) return tooMany(retryAfter);
        }

        /** Where this deployment lives, for links we put in emails. */
        const origin = new URL(request.url).origin;

        switch (action) {
          // Step one: hold the details and email a code. No account yet.
          case "signup": {
            const parsed = signUpSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: firstError(parsed) }, { status: 400 });
            }

            const { email, code, alreadyRegistered, error } = await startSignup(parsed.data);
            if (error || !email) {
              return Response.json({ error: error ?? "Could not start signup." }, { status: 400 });
            }

            /*
             * Both branches answer identically. Only the owner of an existing
             * address learns anything, and they learn it by email — see
             * startSignup for why (CLAUDE.md rule 8).
             */
            const sent = alreadyRegistered
              ? await sendSignupOnExistingAccountEmail(email, origin)
              : await sendOtpEmail(email, code!);

            return Response.json({
              email,
              codeSent: sent.delivered,
              deliveryNote: sent.delivered ? undefined : sent.reason,
              mailerConfigured: mailerConfigured(),
            });
          }

          // Step two: the right code creates the account, still unapproved.
          case "verify-otp": {
            const parsed = verifyOtpSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: firstError(parsed) }, { status: 400 });
            }
            const { user, error } = await verifySignupCode(parsed.data.email, parsed.data.code);
            if (error) return Response.json({ error }, { status: 400 });

            /*
             * Acceptance is recorded here rather than on the signup form,
             * because until the code is right there is no account to attach it
             * to. The version recorded is whatever the server is serving now,
             * so it always points at words that actually existed.
             */
            if (user && user.role !== "admin") {
              for (const doc of LEGAL_DOCUMENTS) {
                if (doc.acceptedAt !== "signup" || !doc.appliesTo.includes(user.role)) continue;
                const live = currentVersion(doc.kind);
                if (!live) continue;
                recordAcceptance({
                  userId: user.id,
                  kind: doc.kind,
                  version: live.version,
                  ip: callerKey(request, "signup").slice("signup:".length) || null,
                });
              }
            }
            // Deliberately no session — the account still waits for approval.
            return Response.json({ user });
          }

          case "resend-otp": {
            const parsed = resendOtpSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: firstError(parsed) }, { status: 400 });
            }
            const { email, code, error } = await resendSignupCode(parsed.data.email);
            if (error || !email || !code) {
              return Response.json({ error: error ?? "Could not resend." }, { status: 400 });
            }
            const sent = await sendOtpEmail(email, code);
            return Response.json({
              email,
              codeSent: sent.delivered,
              deliveryNote: sent.delivered ? undefined : sent.reason,
            });
          }

          /*
           * Forgot password. Answers the same whether or not the address has an
           * account, for the same reason signup does.
           */
          case "request-password-reset": {
            const parsed = requestPasswordResetSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: firstError(parsed) }, { status: 400 });
            }

            const { email, token, fullName } = await requestPasswordReset(parsed.data.email);
            if (token) {
              const resetUrl = `${origin}/?reset=${encodeURIComponent(token)}`;
              await sendPasswordResetEmail(email, resetUrl, fullName);
            }
            return Response.json({ ok: true });
          }

          case "reset-password": {
            const parsed = resetPasswordSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json({ error: firstError(parsed) }, { status: 400 });
            }
            const { error } = await resetPassword(parsed.data.token, parsed.data.password);
            if (error) return Response.json({ error }, { status: 400 });
            // Every session for that account was dropped; they sign in afresh.
            return Response.json({ ok: true });
          }

          case "login": {
            const parsed = signInSchema.safeParse(body);
            if (!parsed.success) {
              // Deliberately the same message the store gives for a bad
              // password: a malformed address must not read differently from
              // an unknown one.
              return Response.json({ error: "Wrong email or password." }, { status: 401 });
            }

            const { user, token, error, mfaRequired, challenge } = await authenticate(
              parsed.data.email,
              parsed.data.password,
            );

            // The password was right; the account wants a code as well. No
            // cookie is set, so nothing is reachable until the code arrives.
            if (mfaRequired && challenge) {
              if (loginKey) clearRateLimit(loginKey);
              return Response.json({ mfaRequired: true, challenge });
            }

            if (error || !token || !user) {
              // Only a failure costs budget.
              if (loginKey && rule) recordFailure(loginKey, rule);
              return Response.json({ error: error ?? "Sign in failed." }, { status: 401 });
            }

            // The right password clears the slate: someone who was fumbling
            // their password is not who the limit is for.
            if (loginKey) clearRateLimit(loginKey);

            return Response.json(
              { user },
              { headers: { "set-cookie": sessionCookie(token, secure) } },
            );
          }

          /*
           * Second factor. The challenge from `login` is exchanged here for a
           * session — a challenge on its own grants nothing at all.
           */
          case "verify-mfa": {
            const { user, token, error } = await verifyMfaChallenge(
              String(body.challenge ?? ""),
              String(body.code ?? ""),
            );
            if (error || !token || !user) {
              return Response.json({ error: error ?? "Sign in failed." }, { status: 401 });
            }
            return Response.json(
              { user },
              { headers: { "set-cookie": sessionCookie(token, secure) } },
            );
          }

          case "mfa-status": {
            const auth = await authorize(request, "auth:mfa-status");
            if (isDenied(auth)) return auth.response;
            return Response.json(await mfaStatus(auth.caller!.id));
          }

          case "mfa-begin": {
            const auth = await authorize(request, "auth:mfa-begin");
            if (isDenied(auth)) return auth.response;
            const { secret, uri, error } = await beginMfaEnrolment(auth.caller!.id);
            if (error) return Response.json({ error }, { status: 400 });
            return Response.json({ secret, uri });
          }

          case "mfa-confirm": {
            const auth = await authorize(request, "auth:mfa-confirm");
            if (isDenied(auth)) return auth.response;
            const { recoveryCodes, error } = await confirmMfaEnrolment(
              auth.caller!.id,
              String(body.code ?? ""),
            );
            if (error) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: auth.caller!.id,
              actorEmail: auth.caller!.email,
              action: "mfa.enabled",
              subject: auth.caller!.id,
              detail: "Second factor enrolled.",
            });
            // Shown once and never retrievable — they are stored as hashes.
            return Response.json({ recoveryCodes });
          }

          case "mfa-disable": {
            const auth = await authorize(request, "auth:mfa-disable");
            if (isDenied(auth)) return auth.response;
            const { error } = await disableMfa(
              auth.caller!.id,
              String(body.password ?? ""),
              String(body.code ?? ""),
            );
            if (error) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: auth.caller!.id,
              actorEmail: auth.caller!.email,
              action: "mfa.disabled",
              subject: auth.caller!.id,
              detail: "Second factor removed.",
            });
            return Response.json({ ok: true });
          }

          case "logout": {
            await endSession(readSessionCookie(request));
            return Response.json(
              { ok: true },
              { headers: { "set-cookie": clearedCookie(secure) } },
            );
          }

          case "list-accounts": {
            const auth = await authorize(request, "auth:list-accounts");
            if (isDenied(auth)) return auth.response;
            return Response.json({ accounts: await listAccounts() });
          }

          case "decide": {
            const auth = await authorize(request, "auth:decide");
            if (isDenied(auth)) return auth.response;
            const admin = auth.caller!;

            const { user, error } = await decideAccount(
              String(body.userId ?? ""),
              body.approve === true,
              typeof body.reason === "string" ? body.reason : undefined,
            );
            if (error) return Response.json({ error }, { status: 400 });

            recordAudit({
              actorId: admin.id,
              actorEmail: admin.email,
              action: body.approve === true ? "account.approved" : "account.rejected",
              subject: String(body.userId ?? ""),
              detail: typeof body.reason === "string" ? body.reason.slice(0, 200) : "",
            });

            await notify({
              event: body.approve === true ? "account.approved" : "account.rejected",
              userId: String(body.userId ?? ""),
              subject: String(body.userId ?? ""),
              vars: { reason: typeof body.reason === "string" ? body.reason : undefined },
              target: { screen: "account" },
            });

            return Response.json({ user });
          }

          default:
            return Response.json({ error: `Unknown action "${action}".` }, { status: 400 });
        }
      },
    },
  },
});
