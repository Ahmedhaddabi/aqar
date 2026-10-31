"use client";

import type { ReactNode } from "react";

type Errors = Record<string, string> | undefined;

export function Field({ name, label, errors, hint, children }: {
  name: string; label: string; errors: Errors; hint?: string; children: ReactNode;
}) {
  const error = errors?.[name];
  return (
    <div className={`field${error ? " invalid" : ""}`}>
      <label htmlFor={name}>{label}</label>
      {children}
      {hint && <span className="hint" id={`${name}-hint`}>{hint}</span>}
      {error && <span className="error" id={`${name}-error`} role="alert">{error}</span>}
    </div>
  );
}

const describedBy = (name: string, errors: Errors, hint?: string) =>
  [hint ? `${name}-hint` : "", errors?.[name] ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;

export function TextInput({ name, label, errors, hint, type = "text", required, ...rest }: {
  name: string; label: string; errors: Errors; hint?: string; type?: string; required?: boolean;
  inputMode?: "numeric" | "decimal" | "tel" | "email" | "url"; autoComplete?: string; min?: number; dir?: string;
}) {
  return (
    <Field name={name} label={label} errors={errors} hint={hint}>
      <input id={name} name={name} type={type} required={required} aria-invalid={!!errors?.[name]}
        aria-describedby={describedBy(name, errors, hint)} {...rest} />
    </Field>
  );
}

export function TextArea({ name, label, errors, hint }: { name: string; label: string; errors: Errors; hint?: string }) {
  return (
    <Field name={name} label={label} errors={errors} hint={hint}>
      <textarea id={name} name={name} maxLength={2000} aria-invalid={!!errors?.[name]}
        aria-describedby={describedBy(name, errors, hint)} />
    </Field>
  );
}

export function SelectInput({ name, label, errors, options, labelOf, required, placeholder }: {
  name: string; label: string; errors: Errors; options: string[]; labelOf: (v: string) => string;
  required?: boolean; placeholder: string;
}) {
  return (
    <Field name={name} label={label} errors={errors}>
      <select id={name} name={name} required={required} defaultValue="" aria-invalid={!!errors?.[name]}
        aria-describedby={describedBy(name, errors)}>
        <option value="" disabled={required}>{placeholder}</option>
        {options.map((o) => <option key={o} value={o}>{labelOf(o)}</option>)}
      </select>
    </Field>
  );
}

/** Pill-style radio buttons (single choice) or checkboxes (multiple). */
export function Choices({ name, label, errors, options, labelOf, multiple, required, defaultValue }: {
  name: string; label: string; errors: Errors; options: { value: string; label?: string }[];
  labelOf?: (v: string) => string; multiple?: boolean; required?: boolean; defaultValue?: string;
}) {
  const error = errors?.[name];
  return (
    <div className={`field${error ? " invalid" : ""}`} role="group" aria-labelledby={`${name}-label`}>
      <span className="label" id={`${name}-label`}>{label}</span>
      <div className="choices">
        {options.map((o) => (
          <label className="choice" key={o.value}>
            <input type={multiple ? "checkbox" : "radio"} name={name} value={o.value}
              required={required && !multiple} defaultChecked={o.value === defaultValue} />
            <span>{o.label ?? labelOf?.(o.value) ?? o.value}</span>
          </label>
        ))}
      </div>
      {error && <span className="error" role="alert">{error}</span>}
    </div>
  );
}

export function Check({ name, label, errors, required }: { name: string; label: ReactNode; errors?: Errors; required?: boolean }) {
  return (
    <div className={`field${errors?.[name] ? " invalid" : ""}`}>
      <label className="check">
        <input type="checkbox" name={name} required={required} />
        <span>{label}</span>
      </label>
      {errors?.[name] && <span className="error" role="alert">{errors[name]}</span>}
    </div>
  );
}
