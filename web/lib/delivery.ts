/** Where one Bundle file lives in the delivery bucket, or null if the caller
 *  asked for something that is not a Bundle file.
 *
 *  Lives in lib/ rather than beside the route so it is testable with the
 *  project's own `node --test lib/*.test.ts`, and because it is the only part
 *  of the delivery gate with a decision in it. nodes/publish/publish.py writes
 *  these same keys as `bundles/<bundle-id>/<path>`; the two must agree.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function bundleKey(segments: string[]): string | null {
  // A bare Bundle id addresses no file, so at least an id and a path are needed.
  if (segments.length < 2) return null;
  for (const s of segments) {
    // Refuse rather than encode: `..` walks out of the prefix, and a slash or
    // a control character addresses a different part of the bucket.
    if (s === "." || s === ".." || !SAFE_SEGMENT.test(s)) return null;
  }
  return `bundles/${segments.join("/")}`;
}
