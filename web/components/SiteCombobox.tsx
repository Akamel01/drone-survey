"use client";

import { useId, useState, type KeyboardEvent } from "react";
import { newSiteId } from "@/lib/spec";
import { newSiteOffer, siteMatches, siteTwin, type SiteChoice } from "@/lib/missionView";
import styles from "./SiteCombobox.module.css";

// One field that finds or creates the Site (UI-30). Typing lists the Sites
// that match, choosing one uses it, and a name that matches none offers
// "New Site: <name>" as a deliberate choice: typing alone never makes a Site,
// so an existing one cannot be split in two by a slip (#166, ADR 0021).
//
// The WAI-ARIA combobox pattern with a list popup: focus stays in the input,
// the highlighted option is named by aria-activedescendant. The list sits in
// the flow rather than floating, so a Sheet's scroll and a panel's clipping
// cannot cut it off.

interface Row {
  key: string;
  label: string;
  choose: () => SiteChoice;
}

interface SiteComboboxProps {
  id?: string;
  /** The field's accessible name: the id of the caller's visible label, or the
   *  words themselves where the label cannot be referenced. */
  labelledBy?: string;
  label?: string;
  /** The id of a line that says what is wrong with the Site. */
  describedBy?: string;
  sites: SiteChoice[];
  /** The Site the Mission is under now: its name, and its id once it has one. */
  site: string;
  site_id?: string;
  onChoose: (choice: SiteChoice) => void;
  /** Shows the Site without offering to change it. */
  readOnly?: boolean;
}

export default function SiteCombobox({
  id,
  labelledBy,
  label,
  describedBy,
  sites,
  site,
  site_id,
  onChoose,
  readOnly,
}: SiteComboboxProps) {
  const listId = useId();
  // What has been typed since the last choice; null shows the chosen Site.
  const [typed, setTyped] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const query = typed ?? "";
  const offer = newSiteOffer(sites, query);
  const rows: Row[] = [
    ...siteMatches(sites, query).map((s) => ({ key: s.site_id, label: s.site, choose: () => s })),
    ...(offer
      ? [
          {
            key: "new",
            label: `New Site: ${offer}`,
            // An unsaved new Site keeps the id it was given: it is the same
            // place, and its name is only being retyped.
            choose: () => ({ site: offer, site_id: site_id && site.trim() === offer ? site_id : newSiteId(offer) }),
          },
        ]
      : []),
  ];

  const known = site_id != null && sites.some((s) => s.site_id === site_id);
  // Only a Site not in the store can be a twin of one that is (#166).
  const twin = !known && typed === null ? siteTwin(sites, site_id, site) : null;

  const close = () => {
    setOpen(false);
    setTyped(null);
  };
  const pick = (i: number) => {
    const row = rows[i];
    if (!row) return;
    onChoose(row.choose());
    close();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActive(0);
      } else {
        setActive((a) => Math.max(0, Math.min(rows.length - 1, a + (e.key === "ArrowDown" ? 1 : -1))));
      }
    } else if (e.key === "Enter" && open && rows.length) {
      e.preventDefault();
      pick(active);
    } else if (e.key === "Escape" && open) {
      // Closes the list only; a second Escape reaches the Sheet.
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  if (readOnly) {
    return <input id={id} type="text" readOnly value={site} aria-labelledby={labelledBy} aria-label={label} />;
  }

  return (
    <>
      <input
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && rows[active] ? `${listId}-${active}` : undefined}
        aria-labelledby={labelledBy}
        aria-label={label}
        aria-describedby={describedBy}
        autoComplete="off"
        value={typed ?? site}
        placeholder="Find or name a Site"
        onChange={(e) => {
          setTyped(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onClick={() => setOpen(true)}
        onBlur={close}
        onKeyDown={onKeyDown}
      />
      <span className="visually-hidden" role="status">
        {open ? `${rows.length} ${rows.length === 1 ? "choice" : "choices"}` : ""}
      </span>
      <ul
        id={listId}
        role="listbox"
        aria-label="Sites"
        className={styles.list}
        hidden={!open || rows.length === 0}
      >
        {rows.map((row, i) => (
          <li
            key={row.key}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            className={styles.option}
            // Keeps focus in the input, so choosing is not a blur that closes
            // the list before the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => pick(i)}
          >
            {row.label}
          </li>
        ))}
      </ul>
      {open && rows.length === 0 && <p className={styles.hint}>No Sites yet. Type a name to create the first.</p>}
      {twin && (
        // Naming a "new" Site after an existing one is the accident that
        // splits a Site's Captures in two (#166). Offer the real one.
        <p className={styles.hint}>
          There is already a Site called “{twin.site}”.{" "}
          <button type="button" className={styles.use} onClick={() => onChoose(twin)}>
            Use it
          </button>
        </p>
      )}
    </>
  );
}
