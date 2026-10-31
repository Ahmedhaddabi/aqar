"use client";

import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import type { Dictionary } from "@/i18n/dictionaries";
import { type Locale, turnstileSiteKey } from "@/lib/config";

import { Turnstile } from "./ContactAndConsent";
import { Check, Field, TextArea, TextInput } from "./fields";

type State = { status: "idle" | "submitting" | "done" } | { status: "error"; message: string; fields?: Record<string, string> };

/** Careers application or supplier registration, with an optional file (sent as multipart to /api/apply). */
export function ApplyForm({ kind, lang, dict, jobs = [], captcha }: {
  kind: "job" | "supplier"; lang: Locale; dict: Dictionary; jobs?: { id: number; title: string }[]; captcha: boolean;
}) {
  const a = dict.apply;
  const f = dict.form;
  const key = useRef("");
  const [state, setState] = useState<State>({ status: "idle" });

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (file instanceof File && file.size > 4 * 1024 * 1024) return setState({ status: "error", message: a.tooBig, fields: { file: a.tooBig } });
    key.current ||= crypto.randomUUID();
    data.set("idempotency_key", key.current);
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/apply", { method: "POST", body: data });
      const json = await res.json().catch(() => ({}));
      if (json.ok) {
        setState({ status: "done" });
        window.scrollTo({ top: form.offsetTop - 80, behavior: "smooth" });
        return;
      }
      const fields: Record<string, string> = {};
      for (const [name, code] of Object.entries((json.error?.fields ?? {}) as Record<string, string>)) {
        fields[name] = code === "phone" ? a.phoneInvalid : code === "too_big" ? a.tooBig : name === "file" ? a.badFile : a.error;
      }
      setState({ status: "error", fields, message: res.status === 429 ? a.rateLimited : Object.keys(fields).length ? a.error : a.unknownError });
    } catch {
      setState({ status: "error", message: a.unknownError });
    }
  };

  if (state.status === "done") return <div className="notice" role="status">{kind === "job" ? a.doneJob : a.doneSupplier}</div>;
  const errors = state.status === "error" ? state.fields : undefined;
  return (
    <form className="intake" onSubmit={onSubmit} encType="multipart/form-data">
      <h2>{kind === "job" ? a.jobTitle : a.supplierTitle}</h2>
      {state.status === "error" && <div className="form-error" role="alert">{state.message}</div>}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="language" value={lang} />
      {/* Honeypot: hidden from people, filled in by bots. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px" }} />
      <div className="fields">
        {kind === "job" && (
          <Field name="job_id" label={a.job} errors={errors}>
            <select id="job_id" name="job_id" defaultValue="">
              <option value="">{a.general}</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </Field>
        )}
        <TextInput name="full_name" label={f.fullName} errors={errors} required autoComplete="name" />
        <TextInput name="phone" label={f.phone} errors={errors} required type="tel" inputMode="tel" autoComplete="tel" dir="ltr" hint={f.phoneHint} />
        <TextInput name="email" label={f.email} errors={errors} type="email" inputMode="email" autoComplete="email" dir="ltr" />
        {kind === "supplier" && <TextInput name="company" label={a.company} errors={errors} autoComplete="organization" />}
        {kind === "supplier" && <TextInput name="cr_number" label={a.crNumber} errors={errors} dir="ltr" />}
        <TextInput name="experience" label={a.experience} errors={errors} type="number" inputMode="numeric" min={0} />
        {kind === "supplier" && <TextInput name="areas" label={a.areas} errors={errors} />}
      </div>
      {kind === "supplier" && <TextArea name="services" label={a.services} hint={a.servicesHint} errors={errors} />}
      <TextArea name="message" label={a.message} errors={errors} />
      <Field name="file" label={kind === "job" ? a.cv : a.profile} errors={errors}>
        <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
      </Field>
      <Check name="privacy" required errors={errors}
        label={<>{a.privacy} — <Link href={`/${lang}/legal/careers-privacy`}>{a.privacyLink}</Link></>} />
      {captcha && turnstileSiteKey && <Turnstile />}
      <button className="btn primary" type="submit" disabled={state.status === "submitting"}>
        {state.status === "submitting" ? a.submitting : a.submit}
      </button>
    </form>
  );
}
