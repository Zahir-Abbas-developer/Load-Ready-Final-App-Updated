import { createFileRoute } from "@tanstack/react-router";

/**
 * Twilio SMS endpoint.
 *
 * When the Twilio connector is connected and TWILIO_PHONE_NUMBER is set,
 * sends a real SMS via the Twilio gateway. Otherwise returns a friendly
 * stub response so the UI can show "Twilio not connected".
 */
export const Route = createFileRoute("/api/sms")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { to, body, tripId } = (await request.json()) as {
          to?: string;
          body?: string;
          tripId?: string;
        };

        if (!to || !body) {
          return Response.json(
            { ok: false, message: "Missing 'to' or 'body'" },
            { status: 400 },
          );
        }
        if (body.length > 1000) {
          return Response.json(
            { ok: false, message: "Message too long (max 1000 chars)" },
            { status: 400 },
          );
        }

        const lovableKey = process.env.LOVABLE_API_KEY;
        const twilioKey = process.env.TWILIO_API_KEY;
        const fromNumber = process.env.TWILIO_PHONE_NUMBER;

        if (!lovableKey || !twilioKey || !fromNumber) {
          return Response.json({
            ok: true,
            stub: true,
            message:
              "Twilio not connected — connect Twilio + set TWILIO_PHONE_NUMBER to enable real SMS.",
            tripId,
            to,
          });
        }

        const res = await fetch(
          "https://connector-gateway.lovable.dev/twilio/Messages.json",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": twilioKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ To: to, From: fromNumber, Body: body }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          return Response.json(
            { ok: false, message: data.message ?? "Twilio SMS failed", details: data },
            { status: res.status },
          );
        }
        return Response.json({ ok: true, sid: data.sid, message: "SMS sent" });
      },
    },
  },
});
