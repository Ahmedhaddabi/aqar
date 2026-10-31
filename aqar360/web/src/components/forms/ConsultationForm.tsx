"use client";

import { type Dictionary, optionLabel } from "@/i18n/dictionaries";
import type { Locale } from "@/lib/config";
import type { FormConfig } from "@/lib/content";

import { CONTACT_SPEC, ContactAndConsent } from "./ContactAndConsent";
import { Choices, SelectInput, TextArea, TextInput } from "./fields";
import { FormSuccess } from "./FormStates";
import { type Spec, useIntakeForm } from "./useIntakeForm";

const SPEC: Spec = {
  ...CONTACT_SPEC, asset_type: "text", client_goal: "text", requested_output: "text", area: "text", map_link: "text",
  budget: "number", expected_timeline: "text", current_situation: "text",
};

export function ConsultationForm({ lang, dict, config }: { lang: Locale; dict: Dictionary; config: FormConfig }) {
  const f = dict.form;
  const options = config.options["Aqar Consultation Request"];
  const label = (v: string) => optionLabel(dict, v);
  const { state, errors, onSubmit, onStart } = useIntakeForm("consultation", SPEC, f, { request_type: "consultation" });

  if (state.status === "done") return <FormSuccess lang={lang} dict={dict} result={state.result} />;

  return (
    <form className="intake" onSubmit={onSubmit} onFocus={onStart}>
      {state.status === "error" && <div className="form-error" role="alert">{state.message}</div>}
      <fieldset>
        <legend>{f.propertySection}</legend>
        <Choices name="client_goal" label={f.clientGoal} errors={errors} required
          options={options.client_goal.map((value) => ({ value }))} labelOf={label} />
        <div className="fields">
          <SelectInput name="asset_type" label={f.assetType} errors={errors} required options={options.asset_type}
            labelOf={label} placeholder={f.select} />
          <SelectInput name="requested_output" label={f.requestedOutput} errors={errors} required
            options={options.requested_output} labelOf={label} placeholder={f.select} />
          <SelectInput name="area" label={f.area} errors={errors} placeholder={f.select}
            options={config.areas.map((a) => a.id)} labelOf={(id) => config.areas.find((a) => a.id === id)?.name ?? id} />
          <TextInput name="budget" label={f.budget} errors={errors} type="number" inputMode="decimal" min={0} />
          <SelectInput name="expected_timeline" label={f.expectedTimeline} errors={errors} labelOf={label}
            options={options.expected_timeline.filter(Boolean)} placeholder={f.select} />
        </div>
        <TextInput name="map_link" label={f.mapLink} errors={errors} type="url" inputMode="url" dir="ltr" />
        <TextArea name="current_situation" label={f.currentSituation} errors={errors} />
      </fieldset>
      <ContactAndConsent lang={lang} dict={dict} config={config} errors={errors} />
      <button className="btn primary" type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? f.submitting : f.submit}
      </button>
    </form>
  );
}
