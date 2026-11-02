"use client";

import { useRef, useState } from "react";

import { type Dictionary, optionLabel } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { FormConfig } from "@/lib/content";

import { CONTACT_SPEC, ContactAndConsent } from "./ContactAndConsent";
import { Check, Choices, SelectInput, TextArea, TextInput } from "./fields";
import { FormSuccess } from "./FormStates";
import { type Spec, useIntakeForm, usePrefill } from "./useIntakeForm";

const SPEC: Spec = {
  ...CONTACT_SPEC, purpose: "text", property_type: "text", areas: "list", budget_min: "number", budget_max: "number",
  strict_budget: "bool", bedrooms_min: "number", timing: "text", preferred_channel: "text", notes: "text",
  match_alerts: "bool", request_kind: "text", company_name: "text", units_needed: "number", investment_goal: "text",
  foreign_ownership_required: "bool",
  // Set from the map / project pages: the listing the customer asked about (stored on the request in the CRM).
  interest_type: "text", interest_id: "text", interest_unit: "text", source_page: "text",
};
const INTEREST = ["interest_type", "interest_id", "interest_unit", "source_page"];
const PREFILL = ["purpose", "property_type", "areas", "budget_max", "bedrooms_min", "notes", ...INTEREST];

export function SearchRequestForm({ lang, dict, config }: { lang: Locale; dict: Dictionary; config: FormConfig }) {
  const f = dict.form;
  const options = config.options["Aqar Search Request"];
  const label = (v: string) => optionLabel(dict, v);
  const ref = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState("Standard");
  const { state, errors, onSubmit, onStart } = useIntakeForm("search", SPEC, f, { request_type: "search" });
  usePrefill(ref, PREFILL);

  if (state.status === "done") return <FormSuccess lang={lang} dict={dict} result={state.result} />;
  const wilayats = [...new Set(config.areas.map((a) => a.wilayat))];

  return (
    <form ref={ref} className="intake" onSubmit={onSubmit} onFocus={onStart} onChange={(e) => {
      const target = e.target as unknown as HTMLSelectElement;
      if (target.name === "request_kind") setKind(target.value || "Standard");
    }}>
      {state.status === "error" && <div className="form-error" role="alert">{state.message}</div>}
      {INTEREST.map((name) => <input key={name} type="hidden" name={name} />)}
      <fieldset>
        <legend>{f.requirementsSection}</legend>
        <Choices name="purpose" label={f.purpose} errors={errors} required defaultValue="Buy"
          options={options.purpose.map((value) => ({ value }))} labelOf={label} />
        <div className="fields">
          <SelectInput name="property_type" label={f.propertyType} errors={errors} required options={options.property_type}
            labelOf={label} placeholder={f.select} />
          <SelectInput name="timing" label={f.timing} errors={errors} required options={options.timing} labelOf={label}
            placeholder={f.select} />
        </div>
        <div className="field" role="group" aria-label={f.areas}>
          <span className="label">{f.areas}</span>
          {wilayats.map((wilayat) => (
            <div className="area-group" key={wilayat}>
              <strong>{wilayat}</strong>
              <div className="choices">
                {config.areas.filter((a) => a.wilayat === wilayat).map((a) => (
                  <label className="choice" key={a.id}>
                    <input type="checkbox" name="areas" value={a.id} />
                    <span>{a.name}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          {errors?.areas && <span className="error" role="alert">{errors.areas}</span>}
        </div>
        <div className="fields">
          <TextInput name="budget_min" label={f.budgetMin} errors={errors} type="number" inputMode="numeric" min={0} />
          <TextInput name="budget_max" label={f.budgetMax} errors={errors} type="number" inputMode="numeric" min={0} required />
          <TextInput name="bedrooms_min" label={f.bedrooms} errors={errors} type="number" inputMode="numeric" min={0} />
        </div>
        <Check name="strict_budget" label={f.strictBudget} />
        <div className="fields">
          <SelectInput name="request_kind" label={f.requestKind} errors={errors} options={options.request_kind}
            labelOf={label} placeholder={label("Standard")} />
        </div>
        {/* Corporate and investment requests use the same simple flow (§27.10, §27.16). */}
        <KindFields kind={kind} dict={dict} errors={errors} options={options} />
        <TextArea name="notes" label={f.notes} errors={errors} />
      </fieldset>
      <ContactAndConsent lang={lang} dict={dict} config={config} errors={errors}>
        <div className="fields">
          <SelectInput name="preferred_channel" label={f.preferredChannel} errors={errors} required
            options={options.preferred_channel} labelOf={label} placeholder={f.select} />
        </div>
        <Check name="match_alerts" label={f.matchAlerts} />
      </ContactAndConsent>
      <button className="btn primary" type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? f.submitting : f.submit}
      </button>
    </form>
  );
}

function KindFields({ kind, dict, errors, options }: {
  kind: string; dict: Dictionary; errors: Record<string, string> | undefined; options: Record<string, string[]>;
}) {
  const f = dict.form;
  if (kind === "Corporate") {
    return (
      <div className="fields">
        <TextInput name="company_name" label={f.companyName} errors={errors} required />
        <TextInput name="units_needed" label={f.unitsNeeded} errors={errors} type="number" inputMode="numeric" min={1} />
      </div>
    );
  }
  if (kind === "Investment Mandate") {
    return (
      <>
        <div className="fields">
          <SelectInput name="investment_goal" label={f.investmentGoal} errors={errors}
            options={options.investment_goal.filter(Boolean)} labelOf={(v) => optionLabel(dict, v)} placeholder={f.select} />
        </div>
        <Check name="foreign_ownership_required" label={f.foreignOwnership} />
      </>
    );
  }
  return null;
}
