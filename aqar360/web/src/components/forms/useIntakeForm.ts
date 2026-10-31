"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";

import { readAttribution, sourceChannel, track } from "@/lib/analytics";

export type FieldKind = "text" | "number" | "bool" | "list";
export type Spec = Record<string, FieldKind>;
export type Result = { request_number: string; status: string; self_service_token?: string };
type State =
  | { status: "idle" | "submitting" }
  | { status: "done"; result: Result }
  | { status: "error"; message: string; fields?: Record<string, string> };

/** FormData → JSON payload limited to the spec; empty values are omitted. */
export function collect(form: HTMLFormElement, spec: Spec) {
  const data = new FormData(form);
  const payload: Record<string, unknown> = {};
  for (const [name, kind] of Object.entries(spec)) {
    if (kind === "list") {
      const values = data.getAll(name).map(String).filter(Boolean);
      if (values.length) payload[name] = values;
    } else if (kind === "bool") {
      payload[name] = data.get(name) === "on";
    } else {
      const raw = String(data.get(name) ?? "").trim();
      if (raw) payload[name] = kind === "number" ? Number(raw) : raw;
    }
  }
  return payload;
}

/** Prefill from the page URL (e.g. links from the home page) without making the page dynamic. */
export function usePrefill(ref: React.RefObject<HTMLFormElement | null>, keys: string[]) {
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const params = new URLSearchParams(window.location.search);
    for (const key of keys) {
      const value = params.get(key);
      if (!value) continue;
      for (const el of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement>(`[name="${key}"]`))) {
        if (el instanceof HTMLInputElement && (el.type === "radio" || el.type === "checkbox")) {
          if (el.value === value) el.checked = true;
        } else {
          el.value = value;
        }
      }
    }
  }, [ref, keys]);
}

export function useIntakeForm(kind: "search" | "property" | "consultation", spec: Spec, messages: {
  error: string; unknownError: string; rateLimited: string;
}, analytics: { request_type: string }) {
  const idempotencyKey = useRef<string>("");
  const started = useRef(false);
  const [state, setState] = useState<State>({ status: "idle" });

  const onStart = () => {
    if (!started.current) {
      started.current = true;
      track("request_start", analytics);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    idempotencyKey.current ||= crypto.randomUUID();
    const attribution = readAttribution();
    const captcha = new FormData(form).get("cf-turnstile-response");
    const payload = {
      ...collect(form, spec),
      ...attribution,
      source_channel: sourceChannel(attribution),
      idempotency_key: idempotencyKey.current,
      ...(captcha ? { captcha_token: String(captcha) } : {}),
    };
    setState({ status: "submitting" });
    try {
      const res = await fetch(`/api/forms/${kind}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        setState({ status: "done", result: json.data });
        track("request_submit", analytics);
        if (kind === "consultation") track("consultation_requested", analytics);
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (json.error?.code === "rate_limited") {
        setState({ status: "error", message: messages.rateLimited });
      } else {
        setState({ status: "error", message: json.error?.fields ? messages.error : json.error?.message || messages.unknownError,
          fields: json.error?.fields ?? undefined });
      }
    } catch {
      setState({ status: "error", message: messages.unknownError });
    }
  };

  const errors = state.status === "error" ? state.fields : undefined;
  return { state, errors, onSubmit, onStart };
}
