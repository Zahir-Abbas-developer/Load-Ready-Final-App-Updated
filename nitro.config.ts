/**
 * Nitro's own configuration file.
 *
 * The Vite wrapper this project uses exposes only a few Nitro knobs
 * (`preset`, `output`, `cloudflare`), and the one that matters most for a
 * pilot on a rural connection is not among them — so it is set here, where
 * Nitro reads it directly.
 */
export default {
  /*
   * Compress the built assets at build time, and serve the compressed copy.
   *
   * Measured in L3: the Node server sent 384KB of JavaScript where gzip is
   * 119KB — 905KB for a first visit against roughly 250KB. Static assets are
   * served by Nitro before the application handler runs, so our own
   * compression never sees them; this is the layer that can.
   */
  compressPublicAssets: { gzip: true, brotli: true },
};
