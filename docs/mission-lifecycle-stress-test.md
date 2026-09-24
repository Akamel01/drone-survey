# Mission lifecycle stress test

The deliverable for #152. Every case the ticket names gets one of three
answers:

- **Prevented:** something structural stops it happening, and that structure is named.
- **Refused:** it is refused, with a message that says what to do next.
- **Absorbed:** it is absorbed, and the operator is told what happened.

A case that "works" by doing nothing visible has not been handled.

**Where the tests live**

| Suite | What it drives | Run |
|---|---|---|
| `web/lib/lifecycle.test.ts` | The deployed route handlers, the real B2 client and its checksums, against an in-memory store that counts transactions and fails any call on demand | `npm test` in `web/` |
| `scripts/mission/load.py --selftest` | The loader against a fake Controller directory, plus a stand-in store that can be overwritten mid-write | `python3 scripts/mission/load.py --selftest` |
| `scripts/mission/b2_status.py --selftest` | The Ledger rules shared with the planner | as named |
| `scripts/mission/e2e_test.py` | A Spec through the real planner maths and the real writer, then both Mission files parsed as the Controller would | as named |

All of these run in CI.

**Defects found by this pass** (each fixed, not noted):

1. Two Dispatches in the same second shared one Spec key. The second overwrote the first Spec, and withdrawing one released every Card either held.
2. Two Dispatches racing were both told they held a Card, while one Reservation was silently overwritten.
3. A double-pressed Dispatch reserved two Cards and wrote two Specs.
4. Unmarking Flown after the Card had gone to another Mission said *"it holds its Card again"* while it held nothing.
5. One hand-edited Mission record took the whole list down. A record that did not parse vanished without a word.
6. Site and Mission names accepted control characters. Those made the Mission file invalid XML, which the Controller cannot open.
7. Names also accepted bidirectional overrides, which make one name display as another, and 500-character Site names.
8. A Load cut off part-way (unplugged, locked, rebooted) left the Cards it had written rewritten and the rest as they were.
9. A failed Load, a mismatched read-back and a locked Controller reached only the cron log, never the planner.
10. A Load started by hand did not take the lock cron holds, so it could write the same Cards as cron at the same time.
11. The host's own Ledger writes could overwrite a Reservation made while a Load ran.
12. The daily transaction cap was reported as *"try again"*, which is the wrong advice until 00:00 UTC.
13. A browser blocking site storage crashed the Mission list.
14. `collect.py --list` labelled a second same-day Mission "superseded" when it was not.

## The Card pool

| Case | Answer | Where |
|---|---|---|
| Every Card holds an unflown Mission and another is Dispatched | **Refused** at Dispatch, naming the Cards in the way, and saying Mark Flown or Withdraw frees one. No Spec is written for the host to Collect. | lifecycle: *pool: every Card held…* |
| The pool runs out mid-queue | **Prevented:** Cards are reserved at Dispatch, so a queue that reaches the host already fits. The loader's overflow check stays as a backstop, and is all or nothing. | lifecycle, and `load_all` backstop |
| A Mission needs several Cards but fewer are free | **Refused**, stating how many it needs. None are half-reserved. | lifecycle: *…fewer are free takes none* |
| A Card is released by Flown, Withdraw or supersession | Each frees exactly its own Cards. The superseded Spec also goes on the host's skip list. | lifecycle: *…each free exactly the Cards they held* |
| A Mission is withdrawn after reserving | Its Card is reusable immediately. | lifecycle |
| The Ledger says a Card is free, but the Controller still holds the last Mission | **Absorbed:** the planner never names a free Card, and the next Mission reserved into it overwrites it on Load. The Card on the Controller still shows the old Mission until then; the count check (below) is what stops it being flown by mistake. | stated |
| The Ledger says a Card holds X, but the Controller holds something else | **Refused:** drift is detected at each plug-in by the md5 the read-back proved. It is reported above the list and in the row, never corrected. | `load.py` selftest (drift) |
| The Controller has fewer Cards than calibrated (a Placeholder deleted or remade) | **Refused:** the Load names the Card and says to recalibrate. It goes to the planner banner. | `load.py` selftest (pool drift) |
| Placeholders on the Controller that are not calibrated | Normal. It is not drift, and is never refused (#118 found this refusing every Load). | `load.py` selftest |
| The pool grew after Missions were reserved | Existing Reservations stay; the new Cards become available. | lifecycle |
| A Reservation seen from a refresh, another browser, another machine, or a cleared cache | **Prevented:** Reservations live in the store, not the browser. | lifecycle: *…any browser sees it* |
| A Card renamed or two swapped on the Controller | **Refused, at the moment of flying:** a Loaded row says *"Open way finder 1. Check it shows 184 points"*. The count inside an opened Card is the file's own. Ceiling: two swapped Cards holding Missions with identical counts (ADR 0022). | `missionView.test.ts` |

## The Load

| Case | Answer | Where |
|---|---|---|
| Interrupted mid-write: unplugged, screen locked, or power lost | **Absorbed:** every Card already written is put back from its backup, and the banner says so. A Card that cannot be put back, because the device is gone, is named *do not fly*. The Load reruns from the start on the next plug-in. Real power loss mid-write cannot be simulated; the unplug path is the same code. | `load.py` selftest (unplugged after one) |
| Read-back does not match, on the first Card or the last | **Absorbed:** every Card is put back, and the banner says so. | `load.py` selftest, both |
| Controller unplugged between Collect and Load | **Prevented:** cron runs the Load only while the Controller's USB id is present. The Spec waits, Collected. | cron line, stated |
| Two Loads racing: cron and one started by hand | **Refused:** the loader holds its own Controller lock. The second run says another Load is writing, and touches nothing. | `load.py` selftest (lock) |
| A stale mount after a Controller reboot | **Absorbed:** a mount that raises I/O errors reads as not mounted and is remounted fresh. | `load.py` selftest |
| Controller plugged in but locked, or its storage not exposed | **Refused:** it goes to the planner banner (*"unlock it, choose file transfer"*), said once, not every minute. | `load.py` selftest (refusal dedupe) |
| A part exceeds DJI Fly's 200-waypoint limit | **Prevented:** the planner and the writer both split at 200 and agree on the part count. One flight line longer than 200 is refused in both. | `e2e_test.py` (part count agrees) |
| A Spec whose Reservation disagrees with its plan (Cards ≠ parts) | **Refused** by name: withdraw and Dispatch it again. | `load.py` selftest |
| A Collected Spec with no Reservation (withdrawn, superseded, legacy) | **Absorbed:** set aside by name. It never holds up the Specs beside it. | `load.py` selftest (#161) |
| The Ledger cannot be read at Load time | **Refused**, loudly. It is never read as empty and never written over. | `load.py` selftest |

## Missions and identity

| Case | Answer | Where |
|---|---|---|
| Two Missions, one Site, one date, different names | Both are live, both hold Cards, both Load. Neither supersedes the other. | lifecycle; `load.py` selftest |
| Same Site, date and name | A new Mission is **refused** at Save, naming the other. Editing a Dispatched one makes a fork that supersedes it on Dispatch, which is intended. | lifecycle; `missionRecords.test.ts` |
| Names differing only by case or trailing space | The same name, so **refused**. | lifecycle |
| A new Site with an existing Site's name | **Refused**; the planner offers the existing Site. | lifecycle; `missionView.test.ts` |
| A Site renamed after its Missions were Dispatched | **Prevented:** a Site is its id, which never changes. Name clashes compare each Site's latest name. | `missionRecords.test.ts` (renamed Site) |
| Edited and re-Dispatched while the host is mid-Collect | **Absorbed:** the old Spec goes on the skip list and loses its Card. The host re-reads the skip list at Load start and Loads only Reserved Specs. | lifecycle (supersession); `load.py` selftest |
| Withdrawn while the host is mid-Collect, or after Collect | Withdraw is accepted. The host is told and the Card is freed. Ceiling: a Load already writing when the withdrawal lands still writes that Card, within seconds. | lifecycle (*withdrawn after the host Collected*) |
| A Loaded Mission withdrawn or edited | **Refused:** its file is already on the Controller. Copy it instead. | lifecycle |
| No area, two corners, a corner off the globe, string coordinates | **Refused** at Dispatch, saying which. No Card is held. | lifecycle |
| An area crossing the antimeridian, or at the poles | **Refused** in practice: the planner lays out in Web Mercator, which cannot represent either, and the aircraft is flown in British Columbia. Not tested, because no Site can be there; revisit if one ever is. | stated |
| Coordinates with excess precision | Harmless: the writer prints twelve decimal places, and anything finer is below GPS resolution. | stated |
| A Site name that is only whitespace | **Refused**. | `spec.test.ts` |
| A 500-character Site name | **Refused** past 60 characters. Mission Names stop at 40. | lifecycle |
| Path separators in a Site name | **Prevented:** storage keys use the Site id, never its name. | lifecycle |
| Control characters, or right-to-left overrides | **Refused** at Save. The writer also strips control characters, for older or hand-made Specs. | lifecycle; `e2e_test.py` |

## Time

| Case | Answer | Where |
|---|---|---|
| Host and planner clocks disagree | **Prevented:** nothing compares the two clocks. Order comes from Dispatch stamps, all from the planner's clock; the host's clock only stamps what it reports. | stated |
| Two Dispatches within the same second | **Prevented:** a Spec key ends in its Mission's id, so it cannot collide, and still sorts by time. | lifecycle; `keys.test.ts`; fixture |
| A Mission dated in the past, or years ahead | Accepted as dated. The date is the operator's to choose. | lifecycle |
| Daylight saving, or a Capture flown across midnight | **Prevented** for dates: a Mission's date is a calendar day the operator picked, and "today" is the operator's own calendar day, not UTC's. Flown is decided by the operator's mark; imagery arriving the next day does not change it. | `missionView.test.ts` (localDate) |

## Storage and network

| Case | Answer | Where |
|---|---|---|
| Store unreachable at Dispatch | **Refused:** *"Nothing was changed; try again."* No Card is held. | lifecycle |
| Store unreachable at Collect | **Absorbed:** Collect retries each minute, and a Spec is recorded Collected only after it is on disk. | `collect.py` (record after each write) |
| Store unreachable mid-Load | **Refused:** the Ledger read fails, so the Load is refused before it touches the Controller. If the bookkeeping write fails after a Load, that is said, and the next plug-in verifies against the Controller. | `load.py` |
| A Spec upload that fails | Its Cards are given back, and the Mission stays Planned. | lifecycle |
| A file that stopped parsing: Ledger, skip list or manifest | Ledger and skip list are **refused** loudly, never read as empty, never overwritten. The manifest reads as nothing reported yet, since it is never written back. | lifecycle |
| A partial or corrupt download | **Refused** by B2's own SHA-1 checksum, on both sides. | lifecycle; `b2.py` selftest |
| The daily transaction cap is reached | **Refused**, naming the cap and that it resets at 00:00 UTC. Reading the list costs one listing plus one download per Mission plus two, which is asserted. The poll stays at five minutes. | lifecycle |
| Two writers updating the Ledger | Every Ledger write, planner and host, decides again on a fresh read, waits, reads back, and retries if its change was lost. Ceiling: B2 has no compare-and-swap, so a race inside the settle window is narrowed, not closed. | lifecycle (racing); `load.py` selftest (overwritten mid-write) |
| Two writers updating a Mission record | Last write wins, whole; records are one file per Mission, so two Missions never collide. | lifecycle (two windows) |
| Credentials absent, wrong, or scoped to the wrong bucket | **Refused:** *"Storage is not configured"*, *"retype the passphrase"*, or the 403 message naming the key. | lifecycle |
| A record written by a newer version | Unknown fields are kept through edits (planner) and through the host's writes (`mission_id`). | lifecycle; `b2_status.py` selftest |

## Abuse and misuse

| Case | Answer | Where |
|---|---|---|
| Dispatch pressed repeatedly and quickly | One Card and one Spec, always. A second press either resolves to the same Dispatch or is refused: *"Dispatched a moment ago."* The client also blocks a second press while one is in flight. | lifecycle, both timings |
| Withdraw and re-Dispatch alternated | Dispatch after Withdraw is **refused**: only a Planned Mission is Dispatched. Copy makes a new one. | lifecycle |
| Marked Flown, unmarked, marked again | Ends Flown, with its Card free. Unmarking once the Card has gone elsewhere is **refused**, naming the Card. | lifecycle, both |
| Mark Flown before the Controller has the Mission | **Refused**. | lifecycle |
| The same Mission edited in two windows | The later edit wins, whole. It is never a blend of the two. | lifecycle |
| A hand-edited record with fields missing, extra, or mistyped | **Absorbed:** left out of the list, named above it, left untouched. Extra fields are kept. | lifecycle |
| Direct API calls, including with a valid passphrase | Bad ids, path tricks, non-JSON and missing Specs are **refused**. Every rule the client applies, the server applies too. | lifecycle |
| Storage disabled, private browsing, or cache cleared mid-session | Blocked storage says so and names the fix. A cleared cache loses only the offline copy and the passphrase, which are typed once more. Missions live in the store. | `actions.test.ts`; `missionView.test.ts` |

## Known ceilings

These are real limits, stated rather than hidden:

- **The store has no compare-and-swap.** Every Ledger write reads back and retries, which narrows a race to about a second but cannot close it. Closing it needs one writer or a store that can compare-and-swap.
- **A Withdraw that lands while a Load is already writing** still gets its Card written. The window is seconds.
- **The count check cannot tell apart two swapped Cards holding Missions with identical point counts.**
