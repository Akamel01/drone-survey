// How a Site name and a Mission Name are written, read as "the same", and
// keyed (ADR 0021). One module, because the browser and the server must agree:
// a name pair that looks identical to the operator has to be identical to
// supersession and to the name-taken check, or "north  half" and "north half"
// become two live Missions that never replace each other.

/** The longest a Mission Name may be. It is read on a phone, beside a Site
 *  name and a date, and it exists to tell two Missions apart -- not to hold a
 *  description. */
export const MISSION_NAME_MAX = 40;

/** The longest a Site name may be. It is written into every Mission file for
 *  the Site and read on the Controller's screen; five hundred characters is
 *  a paste accident, not a name. */
export const SITE_NAME_MAX = 60;

/** Characters a name may not carry. Control characters make the Mission file
 *  the Controller reads invalid XML (the Site's name is written into it), and
 *  bidirectional overrides make one name display as another. */
export const UNPRINTABLE = /[\u0000-\u001f\u007f‪-‮⁦-⁩]/;

/** The identity of a name as an operator reads it: case and spacing (outer and
 *  inner) are not a difference. Stored names are never rewritten; only
 *  comparison and keys go through this. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function sameName(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

/** Why a Site name cannot be written, or null. Emptiness is the caller's
 *  concern (a Draft and a Save say it differently); this is what is wrong with
 *  a name that is there. */
export function siteLabelProblem(site: string): string | null {
  if (UNPRINTABLE.test(site)) return "A Site name cannot contain invisible control characters; retype it.";
  if (site.trim().length > SITE_NAME_MAX) return `A Site name is at most ${SITE_NAME_MAX} characters; shorten it.`;
  return null;
}

/** The one rule for a Mission Name, so the browser refuses exactly what the
 *  server would. Null when the name is usable. */
export function missionNameProblem(name: unknown): string | null {
  if (typeof name === "string" && UNPRINTABLE.test(name)) {
    return "A Mission Name cannot contain invisible control characters; retype it.";
  }
  if (typeof name !== "string" || !name.trim()) {
    return "Give this Mission a short name -- \"north half\", \"orbit\" -- so it can be told apart from another for the same Site on the same day.";
  }
  if (name.trim().length > MISSION_NAME_MAX) {
    return `A Mission Name is at most ${MISSION_NAME_MAX} characters; shorten it.`;
  }
  return null;
}
