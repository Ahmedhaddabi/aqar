"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { ProjectUnit } from "@/lib/content";
import { fill, formatters, interestHref, unitTypeLabel } from "@/lib/format";

/** Registry units of a project with live state; filter by type and availability, ask about a unit. */
export function UnitList({ lang, dict, units, project, projectId, area, source }: {
  lang: Locale; dict: Dictionary; units: ProjectUnit[]; project: string; projectId: string; area: string | null; source: string;
}) {
  const t = dict.pages.projects;
  const m = dict.pages.map;
  const fmt = useMemo(() => formatters(lang), [lang]);
  const [type, setType] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const types = [...new Set(units.map((u) => u.type).filter(Boolean))] as string[];
  const shown = units.filter((u) => (!type || u.type === type) && (!availableOnly || u.state === "available"));

  return (
    <div className="units">
      <div className="units-filters">
        <select aria-label={t.allTypes} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">{t.allTypes}</option>
          {types.map((v) => <option key={v} value={v}>{unitTypeLabel(dict, lang, v)}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
          {t.availableOnly}
        </label>
      </div>
      {shown.length === 0 ? <p className="muted">{t.noUnits}</p> : (
        <table className="units-table">
          <thead>
            <tr><th>{t.unit}</th><th>{t.floor}</th><th>{t.type}</th><th>{t.size}</th><th>{t.price}</th><th>{t.status}</th><th /></tr>
          </thead>
          <tbody>
            {shown.map((u) => (
              <tr key={u.number} className={u.state}>
                <td data-label={t.unit}><strong>{u.number}</strong></td>
                <td data-label={t.floor}>{u.floor ?? "—"}</td>
                <td data-label={t.type}>{u.type ? unitTypeLabel(dict, lang, u.type, u.bedrooms) : "—"}</td>
                <td data-label={t.size}>{u.size ? `${fmt.amount(u.size)} ${m.sizeUnit}` : "—"}</td>
                <td data-label={t.price}>{u.price && u.state !== "sold"
                  ? `${fmt.amount(u.price)} ${m.currency}${u.purpose === "Rent" ? ` ${m.perMonth}` : ""}` : "—"}</td>
                <td data-label={t.status}><span className={`state ${u.state}`}>{t.states[u.state]}</span></td>
                <td>
                  {u.state === "available" && (
                    <Link className="btn secondary small" href={interestHref(lang, { rent: u.purpose === "Rent", kind: "Project",
                      area, budget: u.price, note: fill(t.interestUnitNote, { unit: u.number, ref: project }),
                      listing: { type: "project", id: projectId, unit: u.number }, source })}>{t.askUnit}</Link>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
