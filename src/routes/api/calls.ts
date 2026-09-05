import { createFileRoute } from "@tanstack/react-router";

/**
 * Twilio voice call endpoint.
 *
 * When the Twilio connector is connected (provides TWILIO_API_KEY +
 * LOVABLE_API_KEY env vars), this proxies to the Twilio gateway to start
 * an outbound call. Otherwise, returns a friendly 200 with a message so the
 * UI can surface "Twilio not connected".
 */
export const Route = createFileRoute("/api/calls")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { to, tripId } = (await request.json()) as {
          to?: string;
          tripId?: string;
        };

        if (!to || typeof to !== "string") {
          return Response.json(
            { ok: false, message: "Missing 'to' phone number" },
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
              "Twilio not connected — connect Twilio + set TWILIO_PHONE_NUMBER to enable real calls.",
            tripId,
            to,
          });
        }

        // Twilio call: TwiML URL is required. Use a public TwiML Bin that
        // simply says "Connecting your BWM trip call" — apps can swap this.
        const twimlUrl = "http://demo.twilio.com/docs/voice.xml";
        const res = await fetch(
          "https://connector-gateway.lovable.dev/twilio/Calls.json",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${lovableKey}`,
              "X-Connection-Api-Key": twilioKey,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              To: to,
              From: fromNumber,
              Url: twimlUrl,
            }),
          },
        );
        const data = await res.json();
        if (!res.ok) {
          return Response.json(
            { ok: false, message: data.message ?? "Twilio call failed", details: data },
            { status: res.status },
          );
        }
        return Response.json({ ok: true, sid: data.sid, message: "Calling…" });
      },
    },
  },
});
