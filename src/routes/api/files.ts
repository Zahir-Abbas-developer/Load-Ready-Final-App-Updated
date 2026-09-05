import { createFileRoute } from "@tanstack/react-router";
import { authorize, isDenied } from "@/server/authz.server";
import { checkRateLimit } from "@/server/rate-limit.server";
import {
  MAX_FILE_BYTES,
  fileMeta,
  readFileBytes,
  saveFile,
  signFileToken,
  verifyFileToken,
} from "@/server/file-store.server";
import { ownsFile } from "@/server/profile-store.server";

/**
 * Upload and download for private documents.
 *
 * POST (raw body)                  → store a file, return its id
 * POST {"action":"sign","fileId"}  → a short-lived link for a file you may see
 * GET  ?id=…&token=…               → the bytes
 *
 * Three checks stand between a request and a pilot's driving licence: a
 * session, an authorisation check that the caller owns the file or is an
 * administrator, and a signed token bound to that caller. The token is what
 * makes the URL expire — a link to an identity document that stays valid
 * forever will eventually appear in a screenshot, a shared screen, a synced
 * browser history or a proxy log. Five minutes is long enough to render it.
 */

const UPLOAD_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };
const SIGN_LIMIT = { limit: 300, windowMs: 60 * 60 * 1000 };

function mayRead(caller: { id: string; role: string }, fileId: string): boolean {
  // Administrators review documents; that is the job. Everyone else may only
  // reach a file that is attached to their own record.
  if (caller.role === "admin") return true;
  return ownsFile(caller.id, fileId);
}

export const Route = createFileRoute("/api/files")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authorize(request, "files:GET");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const url = new URL(request.url);
        const id = url.searchParams.get("id") ?? "";
        const token = url.searchParams.get("token") ?? "";

        const meta = fileMeta(id);
        // The same answer whether the file does not exist or is not yours, so
        // this cannot be used to find out which ids are real.
        if (!meta || !mayRead(caller, id) || !verifyFileToken(token, id, caller.id)) {
          return new Response("Not found.", { status: 404 });
        }

        const bytes = readFileBytes(id);
        if (!bytes) return new Response("Not found.", { status: 404 });

        const isPdf = meta.mime === "application/pdf";
        return new Response(new Uint8Array(bytes), {
          headers: {
            "content-type": meta.mime,
            // nosniff plus an exact type is what stops an uploaded file being
            // interpreted as something executable by the browser.
            "x-content-type-options": "nosniff",
            "content-disposition": `${isPdf ? "attachment" : "inline"}; filename="${meta.originalName}"`,
            // Never in a shared cache, and never written to disk by a proxy.
            "cache-control": "private, no-store",
          },
        });
      },

      POST: async ({ request }) => {
        const auth = await authorize(request, "files:POST");
        if (isDenied(auth)) return auth.response;
        const caller = auth.caller!;

        const contentType = request.headers.get("content-type") ?? "";

        // ── minting a link for a file that already exists ──────────────────
        if (contentType.includes("application/json")) {
          const gate = checkRateLimit(`file-sign:${caller.id}`, SIGN_LIMIT);
          if (!gate.ok) {
            return Response.json(
              { error: "Too many requests." },
              { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
            );
          }

          let body: Record<string, unknown>;
          try {
            body = (await request.json()) as Record<string, unknown>;
          } catch {
            return Response.json({ error: "Malformed request." }, { status: 400 });
          }

          const fileId = String(body.fileId ?? "");
          const meta = fileMeta(fileId);
          if (!meta || !mayRead(caller, fileId)) {
            return Response.json({ error: "Not found." }, { status: 404 });
          }

          return Response.json({
            url: `/api/files?id=${fileId}&token=${signFileToken(fileId, caller.id)}`,
            mime: meta.mime,
            fileName: meta.originalName,
          });
        }

        // ── an upload ──────────────────────────────────────────────────────
        const gate = checkRateLimit(`file-upload:${caller.id}`, UPLOAD_LIMIT);
        if (!gate.ok) {
          return Response.json(
            { error: "Too many uploads. Try again shortly." },
            { status: 429, headers: { "retry-after": String(gate.retryAfter) } },
          );
        }

        // Refuse on the declared length before reading, so an oversized body
        // is never pulled into memory in the first place.
        const declared = Number(request.headers.get("content-length") ?? "0");
        if (declared > MAX_FILE_BYTES) {
          return Response.json({ error: "That file is larger than 10 MB." }, { status: 413 });
        }

        const buffer = Buffer.from(await request.arrayBuffer());
        const result = saveFile({
          ownerId: caller.id,
          bytes: buffer,
          originalName: request.headers.get("x-file-name") ?? "document",
        });

        if ("error" in result) return Response.json({ error: result.error }, { status: 400 });

        return Response.json({
          fileId: result.file.id,
          fileName: result.file.originalName,
          mime: result.file.mime,
          bytes: result.file.bytes,
        });
      },
    },
  },
});
