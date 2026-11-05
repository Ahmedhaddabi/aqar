"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";

import { audit, requireUser } from "@/lib/auth";
import { FIELDS, INTEGRATIONS, type IntegrationId, removeIntegration, saveIntegration, testIntegration } from "@/lib/integrations";

const integrationId = (form: FormData) => {
  const id = String(form.get("id") ?? "") as IntegrationId;
  if (!INTEGRATIONS.includes(id)) redirect("/admin/integrations");
  return id;
};

/** Saves one service's keys (admins only); "Save and test" then runs the service's own check. Secret values are never logged. */
async function save(form: FormData, test: boolean) {
  const user = await requireUser(["admin"]);
  const id = integrationId(form);
  const input = Object.fromEntries(FIELDS[id].map((f) => [f.name, String(form.get(f.name) ?? "")]));
  const clear = form.getAll("clear").map(String);
  const enabled = form.get("enabled") === "on";
  let stored = true;
  try {
    await saveIntegration(id, input, clear, enabled);
  } catch (error) {
    console.error("integration save failed:", (error as Error).message);
    stored = false;
  }
  if (!stored) redirect(`/admin/integrations?error=secret#${id}`);
  const changed = FIELDS[id].filter((f) => input[f.name].trim() || clear.includes(f.name)).map((f) => f.name);
  await audit("integration_saved", "integration", id, { enabled, changed }, user.id);
  if (test) {
    const result = await testIntegration(id, { email: user.email });
    await audit("integration_tested", "integration", id, { ok: result.ok }, user.id);
  }
  revalidateTag("aqar-content");
  revalidatePath("/admin", "layout");
  redirect(`/admin/integrations?saved=${id}#${id}`);
}

export async function saveIntegrationForm(form: FormData) {
  await save(form, false);
}

// Its own action, not a value on the button: a clicked button's value is not sent to a server action (ADR-040).
export async function saveAndTestIntegrationForm(form: FormData) {
  await save(form, true);
}

export async function removeIntegrationForm(form: FormData) {
  const user = await requireUser(["admin"]);
  const id = integrationId(form);
  await removeIntegration(id);
  await audit("integration_removed", "integration", id, {}, user.id);
  revalidateTag("aqar-content");
  revalidatePath("/admin", "layout");
  redirect(`/admin/integrations?removed=${id}#${id}`);
}
