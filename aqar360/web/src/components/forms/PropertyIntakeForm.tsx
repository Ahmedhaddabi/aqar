"use client";

import { useRef } from "react";

import { type Dictionary, optionLabel } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { FormConfig } from "@/lib/content";

import { CONTACT_SPEC, ContactAndConsent } from "./ContactAndConsent";
import { Check, Choices, SelectInput, TextArea, TextInput } from "./fields";
import { FormSuccess } from "./FormStates";
import { type Spec, useIntakeForm, usePrefill } from "./useIntakeForm";

const SPEC: Spec = {
  ...CONTACT_SPEC, request_type: "text", property_type: "text", area: "text", location_details: "text", size_sqm: "number",
  bedrooms: "number", bathrooms: "number", asking_price: "number", property_condition: "text", readiness: "text",
  description: "text", accuracy_declaration: "bool",
};

/** "Market my property" (sell / let / content only) and "Market my project" (fixed request type). */
export function PropertyIntakeForm({ lang, dict, config, project }: {
  lang: Locale; dict: Dictionary; config: FormConfig; project?: boolean;
}) {
  const f = dict.form;
  const options = config.options["Aqar Opportunity Intake"];
  const label = (v: string) => optionLabel(dict, v);
  const ref = useRef<HTMLFormElement>(null);
  const { state, errors, onSubmit, onStart } = useIntakeForm("property", SPEC, f,
    { request_type: project ? "project" : "property" });
  usePrefill(ref, ["request_type"]);

  if (state.status === "done") return <FormSuccess lang={lang} dict={dict} result={state.result} />;
  const types = options.request_type.filter((t) => (project ? t === "Market Project" : t !== "Market Project"));

  return (
    <form ref={ref} className="intake" onSubmit={onSubmit} onFocus={onStart}>
      {state.status === "error" && <div className="form-error" role="alert">{state.message}</div>}
      <fieldset>
        <legend>{f.propertySection}</legend>
        {project ? (
          <input type="hidden" name="request_type" value="Market Project" />
        ) : (
          <Choices name="request_type" label={f.requestType} errors={errors} required defaultValue={types[0]}
            options={types.map((value) => ({ value }))} labelOf={label} />
        )}
        <div className="fields">
          <SelectInput name="property_type" label={f.propertyType} errors={errors} required labelOf={label}
            options={project ? ["Project", ...options.property_type.filter((t) => t !== "Project")] : options.property_type}
            placeholder={f.select} />
          <SelectInput name="area" label={f.area} errors={errors} required placeholder={f.select}
            options={config.areas.map((a) => a.id)} labelOf={(id) => config.areas.find((a) => a.id === id)?.name ?? id} />
          <TextInput name="asking_price" label={f.askingPrice} errors={errors} type="number" inputMode="decimal" min={0} />
        </div>
        <TextInput name="location_details" label={f.locationDetails} errors={errors} />
        <div className="fields">
          <TextInput name="size_sqm" label={f.size} errors={errors} type="number" inputMode="numeric" min={0} />
          <TextInput name="bedrooms" label={f.bedrooms} errors={errors} type="number" inputMode="numeric" min={0} />
          <TextInput name="bathrooms" label={f.bathrooms} errors={errors} type="number" inputMode="numeric" min={0} />
          <SelectInput name="property_condition" label={f.condition} errors={errors} labelOf={label} placeholder={f.select}
            options={options.property_condition.filter(Boolean)} />
          <SelectInput name="readiness" label={f.readiness} errors={errors} labelOf={label} placeholder={f.select}
            options={options.readiness.filter(Boolean)} />
        </div>
        <TextArea name="description" label={f.description} errors={errors} />
      </fieldset>
      <ContactAndConsent lang={lang} dict={dict} config={config} errors={errors}>
        <Check name="accuracy_declaration" label={f.accuracy} errors={errors} required />
      </ContactAndConsent>
      <button className="btn primary" type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? f.submitting : f.submit}
      </button>
    </form>
  );
}
