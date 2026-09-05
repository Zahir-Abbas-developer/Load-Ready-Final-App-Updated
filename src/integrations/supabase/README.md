# What is left here, and why

`types.ts` only. It is the generated schema of the Supabase project
`fhjdmxkuxoeamcbmiudl`, kept as a record of what is actually in that database —
including the `escrow_transactions` tables, which tell you the original build
was designed around taking a cut of every job.

**The client is gone.** Nothing in the app has imported it since I3 removed the
trip channel, and one of the files it came with (`previewAuthStorage.ts`)
brokered auth sessions to a third-party editor over `postMessage`. Dead code
that hands a session to somebody else is not something to carry into a mobile
bundle, so it was deleted in Phase K rather than left dormant.

When Supabase credentials arrive, the client comes back with them and
`npm run db:types` regenerates this file. Deleting it now would only mean
losing the record in the meantime.
