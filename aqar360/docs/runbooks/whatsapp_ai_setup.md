# WhatsApp and AI — setup

Both stay switched off until their keys are added. **Recommended:** an admin pastes them in **Admin → Integrations**
(🔌 in the menu), presses **Save and test**, and the feature switches on at once — no redeploy. The variable names
below still work in Vercel → Project → Settings → Environment Variables (type **Secret**, then redeploy) as a fallback;
keys saved in Integrations take priority. Nothing is charged until then.

## WhatsApp Business (Meta Cloud API)

What it does once connected:
- Automatic messages (request received, property suggestion, viewing reminder, still searching, request expiring,
  invoice, payment reminder, job details, delivery ready) also go on WhatsApp to customers who chose WhatsApp and agreed.
  Email keeps working as before.
- Customers' replies appear in **CRM → WhatsApp**, on the customer's timeline, with a notification to the responsible person.
  New numbers become customers automatically (source "WhatsApp").
- Staff reply from the conversation within 24 hours of the customer's last message (WhatsApp's rule); outside it, only
  approved templates can be sent.
- "STOP" (or ايقاف / الغاء) switches WhatsApp messages off for that customer at once.
- Delivery receipts (sent ✓, delivered ✓✓, read) show on each message and in the Messages log.

Steps:
1. Meta Business account → **WhatsApp Manager**: add the business phone number (it must not be in use on the WhatsApp app).
2. developers.facebook.com → create an app (type Business) → add **WhatsApp**. Copy the **Phone number ID**.
3. Create a **permanent access token** (System user in Business Settings → generate token with `whatsapp_business_messaging`).
4. App → Settings → Basic → copy the **App secret**. Choose any long random text as the **verify token**.
5. Vercel variables: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
   (optional `WHATSAPP_API_VERSION`, default `v23.0`). Redeploy.
6. App → WhatsApp → Configuration → Webhook: URL `https://<your-domain>/api/webhooks/whatsapp`, verify token from step 4,
   subscribe to the **messages** field.
7. WhatsApp Manager → Message templates: create a template for each message you want on WhatsApp (category Utility),
   Arabic and English versions with the same name. Body variables `{{1}}`, `{{2}}`… in the order you will enter.
8. Admin → CRM → Messages → **WhatsApp** tab: for each message enter the approved template name and the variables in order
   (e.g. `name, number, link`), tick **Use**, Save.
9. Test: send a WhatsApp message to the business number → it appears in CRM → WhatsApp; reply from there.

Costs: Meta charges per conversation/template message by category and country (Oman rates on Meta's pricing page);
service replies inside the 24-hour window are free under Meta's current policy.

## AI (Claude)

What it does:
- **AI assistant** (CRM → AI assistant): questions in plain words ("who is looking for a villa in Al Khoudh under 200,000?",
  "which invoices are overdue?", "what is on my list today?"). Read-only tools, limited to what the person may see; links to records.
- **Fill from a message** (New customer / request): paste a WhatsApp or chat message → the form is filled; staff check and save.
- **Write description** (property editor): Arabic + English drafts from the facts typed in the form; staff edit and save.
- Safeguards: never writes to the database; customer text is treated as data, not instructions; 60 AI calls per person per hour;
  every call is in the activity log.

Steps:
1. console.anthropic.com → create an organisation → Billing (prepaid credit) → **API keys** → create a key.
2. Vercel variable `ANTHROPIC_API_KEY` (Secret). Optional `AI_MODEL` (default `claude-opus-5-5`; for lower cost on these
   short tasks you may choose another current model, e.g. `claude-haiku-5-5`). Redeploy.
3. Set a monthly spend limit in the Anthropic console.

Privacy: questions and the records needed to answer them are sent to Anthropic for processing (not used for training);
mention it in the privacy policy (customer_inputs.md).
