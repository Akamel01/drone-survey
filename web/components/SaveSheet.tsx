"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { MISSION_NAME_MAX } from "@/lib/missionRecords";
import type { MissionState } from "@/lib/model";
import {
  STATE_LABEL,
  copyName,
  nameProblem,
  saveOptions,
  siteProblem,
  type SaveChoice,
  type SiteChoice,
} from "@/lib/missionView";
import type { MissionSpec } from "@/lib/spec";
import type { Editing } from "@/app/plan/page";
import Sheet from "./Sheet";
import SiteCombobox from "./SiteCombobox";
import styles from "./SaveSheet.module.css";

// The one Save: it asks what it needs (UI-30). A new Mission is asked its name
// and Site; an existing one is also asked what saving should do with it, from
// what its state allows (`saveOptions`, ADR 0021). Everything that decides is
// in lib/missionView.ts; this renders it.

/** The stored Mission the editor is working on, as the list last read it. Its
 *  state is what the options come from, so it is the list's, not the one the
 *  editor opened with: a Mission can be Loaded while it is being edited. */
export interface EditedMission {
  state: MissionState;
  name: string;
  site: string;
  site_id?: string;
  date: string;
}

/** What the operator settled on. The caller does the saving. */
export interface SaveRequest {
  choice: SaveChoice;
  name: string;
  site: SiteChoice;
}

/** How the save went. The sheet closes on success; on a failure it stays open
 *  with everything typed, says `text`, and Save is ready to try again. */
export type SaveReply = { ok: true } | { ok: false; text: string };

interface SaveSheetProps {
  open: boolean;
  onClose: () => void;
  /** Changes on every open, so the form starts again from the planner's state
   *  instead of from what was typed the last time it was cancelled. */
  session: number;
  spec: MissionSpec;
  editing: Editing;
  edited: EditedMission | null;
  sites: SiteChoice[];
  /** What is still wrong with the plan (`preview.problems`). It is saved
   *  anyway, as an unfinished Planned Mission; Dispatch refuses it. */
  problems: string[];
  onSave: (request: SaveRequest) => Promise<SaveReply>;
}

export default function SaveSheet({ open, onClose, session, ...form }: SaveSheetProps) {
  const headingId = useId();
  const formRef = useRef<HTMLFormElement>(null);

  // showModal() focuses the first focusable thing in the sheet, which is its
  // close control. This runs after the Sheet's own effect (a parent's effects
  // follow its children's), and moves focus to the first field: the choice
  // when there is one, otherwise the Mission Name.
  useEffect(() => {
    if (!open) return;
    formRef.current
      ?.querySelector<HTMLElement>('input[type="radio"]:checked, input:not([type="radio"]):not([readonly])')
      ?.focus({ preventScroll: true });
  }, [open, session]);

  return (
    <Sheet open={open} onClose={onClose} labelledBy={headingId}>
      {session > 0 && <SaveForm key={session} headingId={headingId} formRef={formRef} onCancel={onClose} {...form} />}
    </Sheet>
  );
}

function SaveForm({
  headingId,
  formRef,
  onCancel,
  onSave,
  ...live
}: Omit<SaveSheetProps, "open" | "onClose" | "session"> & {
  headingId: string;
  formRef: RefObject<HTMLFormElement | null>;
  onCancel: () => void;
}) {
  // The sheet describes the planner as it was when it opened. A save moves the
  // editor on to the Mission it wrote while the sheet is still leaving, and a
  // list re-read can change the state under it; neither may rearrange a form
  // the operator is looking at.
  const [{ spec, editing, edited, sites, problems }] = useState(live);
  const nameId = useId();
  const siteId = useId();
  const nameHintId = useId();
  const siteHintId = useId();
  const { options, reason } = saveOptions(edited?.state ?? null);
  const [choice, setChoice] = useState<SaveChoice>(options[0]?.choice ?? "new");
  // One name per choice, so switching between them does not lose what was
  // typed: a replacement keeps the name it replaces, a new Mission from an
  // existing one starts as "<name> (2)".
  const [names, setNames] = useState<Record<SaveChoice, string>>({
    changes: editing.name,
    replacement: edited?.name ?? editing.name,
    new: edited ? copyName(edited.name) : editing.name,
  });
  const [chosen, setChosen] = useState<{ site: string; site_id?: string }>({ site: spec.site, site_id: spec.site_id });
  const [saving, setSaving] = useState(false);
  // Why the last try failed, until the operator changes something or tries again.
  const [failure, setFailure] = useState<string | null>(null);

  // A replacement is only one while it shares the Mission's Site, date and
  // name (`supersessionGroup`), so its name and Site are the Mission's own.
  const replacing = choice === "replacement" && edited !== null;
  const site = replacing ? { site: edited.site, site_id: edited.site_id } : chosen;
  const name = names[choice];

  const nameBad = nameProblem(choice, name, edited?.name ?? null);
  const siteBad = replacing ? null : siteProblem(chosen, sites);
  const problem = nameBad ?? siteBad;
  const option = options.find((o) => o.choice === choice);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (problem || !site.site_id || saving) return;
    setSaving(true);
    setFailure(null);
    const reply = await onSave({ choice, name: name.trim(), site: { site: site.site.trim(), site_id: site.site_id } });
    setSaving(false);
    // Removed above and inserted here, so a screen reader announces every
    // failure, even the same one twice.
    if (!reply.ok) setFailure(reply.text);
  };

  return (
    <>
      <div>
        <h3 id={headingId} className={styles.title}>
          Save Mission
        </h3>
        <p className={styles.lead}>
          {edited
            ? (reason ?? `“${edited.name}” is ${STATE_LABEL[edited.state]}. What should saving do?`)
            : editing.copied_from
              ? `A copy of ${editing.copied_from}. Saving makes a new Mission; that one is not changed.`
              : "Name this Mission and choose the Site it belongs to."}
        </p>
        {problems.length > 0 && (
          <div className={styles.draft}>
            <p>
              This plan still has problems, so it is saved as an unfinished Planned Mission. It cannot be Dispatched
              until they are fixed:
            </p>
            <ul>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <form ref={formRef} className={styles.form} onSubmit={submit}>
        {options.length > 1 && (
          <fieldset className={styles.options}>
            <legend className="visually-hidden">Save as</legend>
            {options.map((o) => (
              <label key={o.choice} className={o.choice === choice ? styles.optionOn : styles.option}>
                <input
                  type="radio"
                  name="save-choice"
                  checked={o.choice === choice}
                  onChange={() => {
                    setChoice(o.choice);
                    setFailure(null);
                  }}
                />
                <span>
                  <span className={styles.optionLabel}>{o.label}</span>
                  <span className={styles.optionDetail}>{o.detail}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className={styles.field}>
          <label htmlFor={nameId}>Mission name</label>
          <input
            id={nameId}
            type="text"
            value={name}
            readOnly={replacing}
            maxLength={MISSION_NAME_MAX}
            placeholder="north half, orbit"
            aria-describedby={nameBad ? nameHintId : undefined}
            onChange={(e) => {
              setNames((n) => ({ ...n, [choice]: e.target.value }));
              setFailure(null);
            }}
          />
          {nameBad && (
            <p id={nameHintId} className={styles.hint}>
              {nameBad}
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor={siteId}>Site</label>
          <SiteCombobox
            id={siteId}
            sites={sites}
            site={site.site}
            site_id={site.site_id}
            readOnly={replacing}
            describedBy={siteBad ? siteHintId : undefined}
            onChoose={(picked) => {
              setChosen(picked);
              setFailure(null);
            }}
          />
          {siteBad && (
            <p id={siteHintId} className={styles.hint}>
              {siteBad}
            </p>
          )}
        </div>
        {replacing && edited.date !== spec.date && (
          <p className={styles.hint}>
            The date is no longer {edited.date}, so Dispatching this will not supersede “{edited.name}”.
          </p>
        )}
        {failure && (
          <p role="alert" className={styles.failure}>
            {failure}
          </p>
        )}
        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          {/* Not disabled while saving: a disabled button drops focus out of the
              sheet, and Save has to be right where it was for a retry. */}
          <button type="submit" className="primary" disabled={!!problem} aria-busy={saving || undefined}>
            {saving ? "Saving…" : (option?.label ?? "Save Mission")}
          </button>
        </div>
      </form>
    </>
  );
}
