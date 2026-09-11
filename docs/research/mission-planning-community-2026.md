# Community research: automated mission planning for DJI Mini 4/5 Pro + RC2 (Reddit)

Researched September 10, 2026. Scope: what real users report actually works today for fully-automated survey missions (pick an area of interest, generate a mission, load it onto the RC2, fly with no manual planning) on a **DJI Mini 5 Pro / Mini 4 Pro with the DJI RC2 screen controller**, from macOS and Ubuntu 24.04 clients. Task scope was Reddit-only; a YouTube pass was briefly attempted and then stopped by the coordinator before it went far — its partial results are kept in a short, clearly-marked incomplete section at the end and were not pursued further.

## Reddit could not be reached in this environment

Every access path to Reddit failed, and the failures escalate in a way that shows this is a hard block, not a query problem:

- **Web search** (`site:reddit.com`, `reddit.com/r/dji`, and a dozen keyword variants aimed at r/dji, r/djimini, r/drones, r/UAVmapping, r/photogrammetry, r/opendronemap, r/Litchi, r/GIS, r/Surveying) never returned a single actual `reddit.com` thread URL — results were consistently retailer listings, vendor blogs, and unrelated GitHub/App Store pages, even when the query string explicitly named a subreddit.
- **Direct fetch** of `www.reddit.com` and `old.reddit.com` was refused outright by the fetch tool ("unable to fetch from www.reddit.com"), and `allowed_domains: ["reddit.com"]` on web search was rejected with "not accessible to our user agent."
- **Direct curl** from this host to `old.reddit.com` (both a search URL and a plain, query-free subreddit listing like `/r/dji/new/`) returned **HTTP 302 redirects to Reddit's login page** for every request, logged-in or not. This means Reddit is currently forcing a login wall for this traffic even for anonymous browsing, not just search.
- **No Reddit CLI/backend was available**: the `agent-reach` skill's `agent-reach` binary is not installed in this environment, and no OpenCLI/rdt-cli fallback exists here either, so there was no authenticated path around the login wall.

Per policy, logging into Reddit or otherwise working around its bot/login wall was not attempted. The result is that **no Reddit thread could be read or cited in this pass**, despite exhausting the available tool-based approaches. This is a environment/tooling limitation on this run, not evidence about what the DJI community is or isn't saying on Reddit.

## What this means for the brief

Because Reddit itself was unreachable, none of the six questions in the original brief (free tools in use, the KMZ transfer method and which MTP tools/OS, automatic photo capture during imported missions, reported problems, what full-automation seekers actually do, and OpenDroneMap/WebODM results) can be answered from actual Reddit posts or comments in this report. Nothing below should be read as a Reddit finding.

The only substantive material gathered before the scope was narrowed to Reddit-only came from adjacent, non-Reddit sources (MavicPilots.com forum threads, the Litchi user forum, GitHub project pages, and a handful of YouTube video pages) reached via general web search. Per the coordinator's instruction, that material is not being expanded further and is kept below only as a short incomplete note rather than a full findings section, since the operator will supply YouTube findings directly.

## Recommendation

To actually answer the brief, Reddit needs to be reached from an environment where it isn't forcing a login wall — e.g., a logged-in browser session, an authenticated Reddit API app (client id/secret + OAuth), or a working `agent-reach`/rdt-cli install with credentials configured. Any of those would let a follow-up pass search r/dji, r/djimini, r/drones, r/UAVmapping, r/photogrammetry, r/opendronemap, r/Litchi, r/GIS, and r/Surveying directly and cite real threads with dates, which is what the brief actually asked for.

---

## Incomplete / not pursued further: early YouTube fragments

The coordinator stopped YouTube research before it was substantive. The following was found in passing via general web search (not verified against full video transcripts, not comment-checked, and not to be extended):

- Several 2025–2026 tutorials exist for DJI Fly's native Waypoint feature on Mini 5 Pro/Mini 4 Pro, and for free third-party planners (WaypointMap, Pixpro Waypoints, Maven, Litchi Hub's new Area Mapping, and an open-source QGIS plugin called FlyPath).
- One clear signal worth flagging to the operator for verification: FlyPath's own GitHub documentation (github.com/dronnix-io/FlyPath) states outright that "DJI consumer drones do not trigger from the mission file, so before takeoff manually enable auto interval capture" — i.e. imported missions on Mini-series drones reportedly do not auto-trigger continuous interval photo capture; the operator must arm interval shooting by hand before takeoff. This is a secondary source, not Reddit, and was not cross-checked further.
- A named real-world example pairing DJI Mini 4 Pro + Litchi + WebODM was found (a tutorial cross-posted to the OpenDroneMap community forum), but its actual overlap/quality results were not extracted.

These are left here only as pointers; no further YouTube tool calls were made after the scope change.
