// Database schema (Postgres). Simple, flat tables; Arabic and English text side by side.
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, bigserial, boolean, date, doublePrecision, index, integer, jsonb, numeric, pgSequence, pgTable, primaryKey, serial, text, timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const created = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updated = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 14, scale: 3, mode: "number" });

// ---- Staff and login -----------------------------------------------------------------------------------------
export const ROLES = ["admin", "manager", "agent"] as const;
export type Role = (typeof ROLES)[number];
// Like Frappe's apps: CRM (customers and sales), ERP (money and operations), HR (team, payroll, hiring).
export const APPS = ["crm", "erp", "hr"] as const;
export type AppKey = (typeof APPS)[number];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<Role>().notNull().default("agent"),
  active: boolean("active").notNull().default(true),
  language: text("language").$type<"ar" | "en">().notNull().default("ar"),
  apps: text("apps").array().$type<AppKey[]>().notNull().default(sql`'{crm}'::text[]`), // apps this person can open
  mfaSecret: text("mfa_secret"), // two-step sign-in key, encrypted with AUTH_SECRET
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  receivesRequests: boolean("receives_requests").notNull().default(false), // in the fair rotation for new website requests
  commissionPct: doublePrecision("commission_pct").notNull().default(0), // share of our income on their deals (Performance page)
  createdAt: created(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(), // SHA-256 of the cookie token; the token itself is never stored
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: created(),
});

// ---- Geography -------------------------------------------------------------------------------------------------
export const wilayats = pgTable("wilayats", {
  id: serial("id").primaryKey(),
  governorateEn: text("governorate_en").notNull(),
  governorateAr: text("governorate_ar").notNull(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
});

export const areas = pgTable("areas", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  wilayatId: integer("wilayat_id").references(() => wilayats.id),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  boundary: jsonb("boundary").$type<GeoJSON.Polygon | GeoJSON.MultiPolygon | null>(),
  active: boolean("active").notNull().default(true),
});

// ---- Website content -------------------------------------------------------------------------------------------
export type Faq = { questionAr: string; answerAr: string; questionEn: string; answerEn: string };

export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  type: text("type").notNull(), // Area Guide, Buying Guide, Renting Guide, Market Insight, FAQ, ...
  titleAr: text("title_ar").notNull(),
  titleEn: text("title_en").notNull(),
  summaryAr: text("summary_ar").notNull().default(""),
  summaryEn: text("summary_en").notNull().default(""),
  bodyAr: text("body_ar").notNull().default(""),
  bodyEn: text("body_en").notNull().default(""),
  factsAr: text("facts_ar").notNull().default(""), // "Label: value" per line
  factsEn: text("facts_en").notNull().default(""),
  faqs: jsonb("faqs").$type<Faq[]>().notNull().default([]),
  sources: text("sources"),
  areaId: integer("area_id").references(() => areas.id),
  published: boolean("published").notNull().default(false),
  lastReviewed: date("last_reviewed"),
  updatedAt: updated(),
});

export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull(),
  scopeEn: text("scope_en").notNull().default(""),
  scopeAr: text("scope_ar").notNull().default(""),
  price: money("price"),
  public: boolean("public").notNull().default(true),
  sort: integer("sort").notNull().default(0),
  slaHours: integer("sla_hours").notNull().default(48), // delivery time after the shoot (strategy §8.3)
  revisions: integer("revisions").notNull().default(2), // revision rounds included
});

// ---- Listings: projects, properties and units -----------------------------------------------------------------
export const AVAILABILITY = ["active", "limited", "paused", "sold_out"] as const;
export const PROPERTY_STATUS = ["available", "reserved", "sold", "rented", "hidden"] as const;

export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  nameEn: text("name_en").notNull(),
  nameAr: text("name_ar").notNull().default(""),
  developer: text("developer").notNull().default(""),
  category: text("category").notNull().default("Residential"),
  areaId: integer("area_id").references(() => areas.id),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  constructionStatus: text("construction_status"), // Pre-Launch | Under Construction | Ready
  handover: date("handover"),
  priceFrom: money("price_from"),
  priceTo: money("price_to"),
  paymentPlanEn: text("payment_plan_en").notNull().default(""),
  paymentPlanAr: text("payment_plan_ar").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  descriptionAr: text("description_ar").notNull().default(""),
  foreignOwnership: boolean("foreign_ownership").notNull().default(false),
  availability: text("availability").$type<(typeof AVAILABILITY)[number]>().notNull().default("active"),
  public: boolean("public").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  coverImage: text("cover_image"),
  brochure: text("brochure"),
  createdAt: created(),
  updatedAt: updated(),
});

export const projectUnitTypes = pgTable("project_unit_types", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "2 Bedrooms", "Penthouse", ...
  bedrooms: integer("bedrooms"),
  sizeFrom: doublePrecision("size_from"),
  sizeTo: doublePrecision("size_to"),
  priceFrom: money("price_from"),
  priceTo: money("price_to"),
  available: integer("available"), // typed count, used when the project has no unit records
  sort: integer("sort").notNull().default(0),
});

export const propertyCodes = pgSequence("property_code_seq", { startWith: 1 });

/** A property for sale/rent, or a unit inside a project (projectId set). */
export const properties = pgTable("properties", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  title: text("title").notNull().default(""), // internal; the website composes "type in area"
  kind: text("kind").notNull(), // Apartment, Villa, Land, Office, ...
  purpose: text("purpose").$type<"sale" | "rent" | "sale_or_rent">().notNull().default("sale"),
  salePrice: money("sale_price"),
  rentPrice: money("rent_price"),
  bedrooms: integer("bedrooms"),
  bathrooms: integer("bathrooms"),
  sizeSqm: doublePrecision("size_sqm"),
  furnished: text("furnished"),
  areaId: integer("area_id").references(() => areas.id),
  projectId: integer("project_id").references(() => projects.id),
  unitNumber: text("unit_number"),
  floor: integer("floor"),
  unitType: text("unit_type"),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  showExactLocation: boolean("show_exact_location").notNull().default(false),
  status: text("status").$type<(typeof PROPERTY_STATUS)[number]>().notNull().default("available"),
  public: boolean("public").notNull().default(false),
  verified: boolean("verified").notNull().default(false),
  ownerName: text("owner_name"),
  ownerPhone: text("owner_phone"),
  descriptionEn: text("description_en").notNull().default(""),
  descriptionAr: text("description_ar").notNull().default(""),
  coverImage: text("cover_image"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("properties_project_idx").on(t.projectId), index("properties_area_idx").on(t.areaId)]);

export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type").$type<"project" | "property">().notNull(),
  ownerId: integer("owner_id").notNull(),
  url: text("url").notNull(),
  captionEn: text("caption_en"),
  captionAr: text("caption_ar"),
  sort: integer("sort").notNull().default(0),
}, (t) => [index("images_owner_idx").on(t.ownerType, t.ownerId)]);

// ---- Customers and requests (CRM) ----------------------------------------------------------------------------
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"), // +968XXXXXXXX
  email: text("email"), // lowercase
  language: text("language").$type<"ar" | "en">().notNull().default("ar"),
  notes: text("notes").notNull().default(""),
  source: text("source"), // first contact: Website, Phone call, Walk-in, WhatsApp, Instagram, Referral, ...
  referralCode: text("referral_code").unique(), // the customer's own "invite a friend" link (/r/CODE), made on first use
  idNumber: text("id_number"), // civil ID / passport number, when staff need it for a contract
  nationality: text("nationality"),
  idExpiry: date("id_expiry"),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("contacts_phone_idx").on(t.phone), index("contacts_email_idx").on(t.email)]);

export const CONSENT_PURPOSES = ["request_updates", "match_alerts", "marketing"] as const;
/** Append-only: the latest row for a contact, purpose and channel is what counts. */
export const consents = pgTable("consents", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  purpose: text("purpose").$type<(typeof CONSENT_PURPOSES)[number]>().notNull(),
  channel: text("channel").notNull(), // email | whatsapp | phone | all
  granted: boolean("granted").notNull(),
  source: text("source").notNull(), // website_form | self_update | staff
  evidence: text("evidence"),
  createdAt: created(),
}, (t) => [index("consents_contact_idx").on(t.contactId)]);

export const REQUEST_KINDS = ["search", "listing", "consulting"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];
export const REQUEST_STATUSES = ["new", "contacted", "working", "viewing", "offer", "won", "closed"] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const OPEN_STATUSES = ["new", "contacted", "working", "viewing", "offer"] as const;

export const requestNumbers = pgSequence("request_number_seq", { startWith: 1 });

/** Everything that comes from the website, in one inbox: searches, owner listings and consulting requests. */
export const requests = pgTable("requests", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // REQ-2026-00001
  kind: text("kind").$type<RequestKind>().notNull(),
  subtype: text("subtype"), // Buy/Rent, Sell/Let/Content Only/Market Project, client goal
  status: text("status").$type<RequestStatus>().notNull().default("new"),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  assignedTo: integer("assigned_to").references(() => users.id),
  propertyType: text("property_type"),
  areaIds: integer("area_ids").array().notNull().default(sql`'{}'::int[]`),
  budgetMin: money("budget_min"),
  budgetMax: money("budget_max"),
  bedroomsMin: integer("bedrooms_min"),
  timing: text("timing"),
  notes: text("notes").notNull().default(""),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}), // the other form answers
  preferredChannel: text("preferred_channel"),
  language: text("language").$type<"ar" | "en">().notNull().default("ar"),
  interestProjectId: integer("interest_project_id").references(() => projects.id),
  interestPropertyId: integer("interest_property_id").references(() => properties.id),
  sourceChannel: text("source_channel"),
  sourcePage: text("source_page"),
  attribution: jsonb("attribution").$type<Record<string, string>>().notNull().default({}),
  alertsPaused: boolean("alerts_paused").notNull().default(false),
  referredBy: integer("referred_by").references((): AnyPgColumn => contacts.id, { onDelete: "set null" }), // customer whose link brought this request
  expiresOn: date("expires_on"),
  firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
  closedReason: text("closed_reason"),
  selfTokenHash: text("self_token_hash"),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("requests_status_idx").on(t.status), index("requests_contact_idx").on(t.contactId),
  index("requests_assigned_idx").on(t.assignedTo)]);

export const ACTIVITY_TYPES = ["note", "call", "whatsapp", "email", "follow_up", "viewing", "status", "system"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** The timeline: notes, calls, follow-ups and viewings (with a date), status changes. */
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").references(() => requests.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  type: text("type").$type<ActivityType>().notNull(),
  body: text("body").notNull().default(""),
  dueAt: timestamp("due_at", { withTimezone: true }), // follow-ups and viewings
  done: boolean("done").notNull().default(false),
  result: text("result"), // viewing outcome: interested | not_suitable | wants_alternatives | no_show
  propertyId: integer("property_id").references(() => properties.id), // the property a viewing is for
  source: text("source"), // "online" when the customer booked the viewing from the portal
  createdAt: created(),
}, (t) => [index("activities_request_idx").on(t.requestId), index("activities_contact_idx").on(t.contactId),
  index("activities_due_idx").on(t.dueAt)]);

// ---- Matching and offers ---------------------------------------------------------------------------------------
export const MATCH_STATUSES = ["suggested", "approved", "sent", "rejected", "withdrawn"] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

/** A property, unit or project unit type suggested for a request. Staff approve before the customer hears of it. */
export const matches = pgTable("matches", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "cascade" }),
  unitTypeId: integer("unit_type_id").references(() => projectUnitTypes.id, { onDelete: "cascade" }),
  key: text("key").notNull().unique(), // request:property or request:unitType, one row per pair
  score: integer("score").notNull(),
  matchType: text("match_type").$type<"within" | "near" | "interest">().notNull(),
  price: money("price"),
  reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  status: text("status").$type<MatchStatus>().notNull().default("suggested"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("matches_request_idx").on(t.requestId)]);

export const OFFER_STATUSES = ["submitted", "countered", "accepted", "rejected", "withdrawn"] as const;
export const offers = pgTable("offers", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").references(() => properties.id),
  amount: money("amount").notNull(),
  counterAmount: money("counter_amount"),
  status: text("status").$type<(typeof OFFER_STATUSES)[number]>().notNull().default("submitted"),
  notes: text("notes").notNull().default(""),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
});

// ---- Money: quotes, invoices, payments, expenses -----------------------------------------------------------------
export const invoiceNumbers = pgSequence("invoice_number_seq", { startWith: 1 });
export const quoteNumbers = pgSequence("quote_number_seq", { startWith: 1 });
export type InvoiceLine = { description: string; qty: number; unitPrice: number; serviceCode?: string | null; passThrough?: boolean };
export const INVOICE_STATUSES = ["draft", "sent", "partly_paid", "paid", "cancelled", "accepted", "declined"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** Quotes (kind = quote) and invoices share one table; an accepted quote becomes an invoice. */
export const invoices = pgTable("invoices", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // INV-2026-00001 / QUO-2026-00001
  kind: text("kind").$type<"quote" | "invoice">().notNull(),
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  requestId: integer("request_id").references(() => requests.id),
  quoteId: integer("quote_id"),
  status: text("status").$type<InvoiceStatus>().notNull().default("draft"),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  lines: jsonb("lines").$type<InvoiceLine[]>().notNull().default([]),
  total: money("total").notNull().default(0),
  passThroughTotal: money("pass_through_total").notNull().default(0), // client media money: not revenue
  notes: text("notes").notNull().default(""),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("invoices_contact_idx").on(t.contactId)]);

export const PAYMENT_METHODS = ["bank", "cash", "card", "cheque", "online", "refund"] as const; // refund rows are negative
export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  method: text("method").$type<(typeof PAYMENT_METHODS)[number]>().notNull(),
  reference: text("reference").notNull().default(""),
  paidOn: date("paid_on").notNull(),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
});

export const PAYMENT_PROVIDERS = ["thawani", "paymob"] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];
/** One online checkout attempt for an invoice (Thawani session or Paymob intention). Paid attempts create a payments row once. */
export const onlinePayments = pgTable("online_payments", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  provider: text("provider").$type<PaymentProvider>().notNull(),
  reference: text("reference").notNull().unique(), // ours, sent as client_reference_id / special_reference
  providerRef: text("provider_ref"), // Thawani session_id / Paymob intention id
  amount: money("amount").notNull(),
  status: text("status").$type<"pending" | "paid" | "failed" | "cancelled">().notNull().default("pending"),
  checkoutUrl: text("checkout_url"),
  transactionId: text("transaction_id"),
  live: boolean("live").notNull().default(false),
  raw: jsonb("raw").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
  paidAt: timestamp("paid_at", { withTimezone: true }),
}, (t) => [index("online_payments_invoice_idx").on(t.invoiceId)]);

export const EXPENSE_CATEGORIES = ["rent", "salaries", "marketing", "photography", "transport", "utilities", "government",
  "office", "software", "other"] as const;
export const expenses = pgTable("expenses", {
  id: serial("id").primaryKey(),
  spentOn: date("spent_on").notNull(),
  category: text("category").$type<(typeof EXPENSE_CATEGORIES)[number]>().notNull(),
  description: text("description").notNull().default(""),
  amount: money("amount").notNull(),
  paidFrom: text("paid_from").$type<"bank" | "petty_cash" | "card">().notNull(),
  vendor: text("vendor").notNull().default(""),
  receiptUrl: text("receipt_url"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
});

// ---- Messages ----------------------------------------------------------------------------------------------------
export const messageTemplates = pgTable("message_templates", {
  id: serial("id").primaryKey(),
  key: text("key").notNull(), // received, match_sent, viewing_reminder, still_searching, request_expiring, payment_reminder
  language: text("language").$type<"ar" | "en">().notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: updated(),
}, (t) => [index("message_templates_key_idx").on(t.key, t.language)]);

/** Every message the system sends (or would send without a provider), once per idempotency key. */
export const outbox = pgTable("outbox", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  templateKey: text("template_key").notNull(),
  channel: text("channel").notNull().default("email"),
  recipient: text("recipient"),
  subject: text("subject").notNull().default(""),
  body: text("body").notNull().default(""),
  status: text("status").$type<"sent" | "failed" | "skipped" | "delivered" | "read">().notNull(),
  reason: text("reason"),
  providerId: text("provider_id"), // e.g. the WhatsApp message id, to follow delivered / read
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  requestId: integer("request_id").references(() => requests.id, { onDelete: "set null" }),
  createdAt: created(),
});

// ---- HR ----------------------------------------------------------------------------------------------------------
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  name: text("name").notNull(),
  jobTitle: text("job_title").notNull().default(""),
  phone: text("phone"),
  email: text("email"),
  nationality: text("nationality").notNull().default(""),
  idNumber: text("id_number").notNull().default(""),
  idExpiry: date("id_expiry"),
  passportExpiry: date("passport_expiry"),
  visaExpiry: date("visa_expiry"),
  joinDate: date("join_date"),
  basicSalary: money("basic_salary").notNull().default(0),
  allowances: money("allowances").notNull().default(0),
  annualLeaveDays: integer("annual_leave_days").notNull().default(30),
  active: boolean("active").notNull().default(true),
  notes: text("notes").notNull().default(""),
  createdAt: created(),
});

export const LEAVE_TYPES = ["annual", "sick", "unpaid", "emergency", "other"] as const;
export const leaves = pgTable("leaves", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  type: text("type").$type<(typeof LEAVE_TYPES)[number]>().notNull(),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  days: integer("days").notNull(),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  notes: text("notes").notNull().default(""),
  decidedBy: integer("decided_by").references(() => users.id),
  createdAt: created(),
});

export const payrollRuns = pgTable("payroll_runs", {
  id: serial("id").primaryKey(),
  month: text("month").notNull().unique(), // YYYY-MM
  status: text("status").$type<"draft" | "paid">().notNull().default("draft"),
  paidOn: date("paid_on"),
  createdAt: created(),
});
export const payslips = pgTable("payslips", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => payrollRuns.id, { onDelete: "cascade" }),
  employeeId: integer("employee_id").notNull().references(() => employees.id),
  basic: money("basic").notNull(),
  allowances: money("allowances").notNull().default(0),
  deductions: money("deductions").notNull().default(0),
  net: money("net").notNull(),
  notes: text("notes").notNull().default(""),
});

/** Company documents that expire: trade licence, office lease, insurance, municipality permits. */
export const renewals = pgTable("renewals", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"),
  expiresOn: date("expires_on").notNull(),
  notes: text("notes").notNull().default(""),
  done: boolean("done").notNull().default(false),
  createdAt: created(),
});

// ---- Careers and suppliers -----------------------------------------------------------------------------------------
export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  titleEn: text("title_en").notNull(),
  titleAr: text("title_ar").notNull().default(""),
  descriptionEn: text("description_en").notNull().default(""),
  descriptionAr: text("description_ar").notNull().default(""),
  location: text("location").notNull().default("Muscat"),
  employmentType: text("employment_type").notNull().default("Full-time"),
  published: boolean("published").notNull().default(false),
  closesOn: date("closes_on"),
  createdAt: created(),
});

/** Job applications and supplier sign-ups from the website (kind tells which). */
// Hiring stages (applicant tracking lite) and supplier stages (strategy §10) share one status column.
export const JOB_STAGES = ["new", "screening", "interview", "offer", "hired", "rejected"] as const;
export const SUPPLIER_STAGES = ["new", "verified", "approved", "active", "suspended", "rejected"] as const;
export type ApplicationStatus = (typeof JOB_STAGES)[number] | (typeof SUPPLIER_STAGES)[number] | "reviewing" | "shortlisted";
export const applications = pgTable("applications", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<"job" | "supplier">().notNull(),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone"),
  email: text("email"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  fileUrl: text("file_url"), // CV or company profile
  status: text("status").$type<ApplicationStatus>().notNull().default("new"),
  notes: text("notes").notNull().default(""),
  idempotencyKey: text("idempotency_key").unique(),
  createdAt: created(),
});

// ---- Settings and audit ----------------------------------------------------------------------------------------
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

/** Append-only: who did what, when. Never stores passwords. */
export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  userId: integer("user_id").references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  data: jsonb("data").notNull().default(sql`'{}'::jsonb`),
});

// ---- Service jobs (content production and other services sold): one job per service line --------------------
export const JOB_STATUSES = ["new", "scheduled", "in_progress", "waiting_client", "review", "completed", "cancelled"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];
export const jobNumbers = pgSequence("job_number_seq", { startWith: 1 });
export const serviceJobs = pgTable("service_jobs", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // JOB-2026-00001
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  requestId: integer("request_id").references(() => requests.id, { onDelete: "set null" }),
  invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  serviceCode: text("service_code"),
  title: text("title").notNull(),
  status: text("status").$type<JobStatus>().notNull().default("new"),
  assignedTo: integer("assigned_to").references(() => users.id),
  supplierId: integer("supplier_id").references(() => applications.id, { onDelete: "set null" }),
  supplierCost: money("supplier_cost"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  dueAt: timestamp("due_at", { withTimezone: true }),
  slaHours: integer("sla_hours").notNull().default(48),
  pausedAt: timestamp("paused_at", { withTimezone: true }), // the SLA clock stops while waiting on the client
  brief: jsonb("brief").$type<Record<string, string>>(),
  briefAt: timestamp("brief_at", { withTimezone: true }),
  deliverables: jsonb("deliverables").$type<{ label: string; url: string; at: string }[]>().notNull().default([]),
  revisionsAllowed: integer("revisions_allowed").notNull().default(2),
  revisionsUsed: integer("revisions_used").notNull().default(0),
  price: money("price"), // what the customer pays for this job (from the invoice line): margin = price - supplier cost
  rating: integer("rating"), // supplier performance 1-5, given when the job is completed
  ratingNote: text("rating_note"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  notes: text("notes").notNull().default(""),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("service_jobs_status_idx").on(t.status), index("service_jobs_contact_idx").on(t.contactId)]);

export const jobEvents = pgTable("job_events", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => serviceJobs.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  kind: text("kind").$type<"status" | "note" | "brief" | "delivery" | "approved" | "changes" | "system">().notNull(),
  body: text("body").notNull().default(""),
  createdAt: created(),
}, (t) => [index("job_events_job_idx").on(t.jobId)]);

// ---- Document vault: files attached to a customer, property, request, job, employee or project --------------
export const DOC_OWNERS = ["contact", "property", "request", "job", "employee", "project"] as const;
export type DocOwner = (typeof DOC_OWNERS)[number];
export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  ownerType: text("owner_type").$type<DocOwner>().notNull(),
  ownerId: integer("owner_id").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull().default("other"),
  url: text("url").notNull(),
  mime: text("mime").notNull().default(""),
  size: integer("size").notNull().default(0),
  shared: boolean("shared").notNull().default(false), // visible to the customer in their portal
  uploadedBy: integer("uploaded_by").references(() => users.id),
  createdAt: created(),
}, (t) => [index("documents_owner_idx").on(t.ownerType, t.ownerId)]);

// ---- Notification center (staff) --------------------------------------------------------------------------------
export const notifications = pgTable("notifications", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  title: text("title").notNull(),
  href: text("href"),
  key: text("key").unique(), // the same event never notifies twice
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: created(),
}, (t) => [index("notifications_user_idx").on(t.userId, t.readAt)]);

// ---- Staff expense claims: paid from own pocket → approval → reimbursement (strategy §9.4) --------------------
export const CLAIM_STATUSES = ["pending", "approved", "rejected", "reimbursed"] as const;
export const expenseClaims = pgTable("expense_claims", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id),
  spentOn: date("spent_on").notNull(),
  category: text("category").$type<(typeof EXPENSE_CATEGORIES)[number]>().notNull(),
  amount: money("amount").notNull(),
  description: text("description").notNull(),
  receiptUrl: text("receipt_url"),
  status: text("status").$type<(typeof CLAIM_STATUSES)[number]>().notNull().default("pending"),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note").notNull().default(""),
  reimbursedOn: date("reimbursed_on"),
  expenseId: integer("expense_id").references(() => expenses.id, { onDelete: "set null" }),
  createdAt: created(),
});

// ---- Approval engine: refunds and other sensitive money actions wait for an admin (strategy §26.3) ------------
export const APPROVAL_KINDS = ["refund"] as const;
export const approvals = pgTable("approvals", {
  id: serial("id").primaryKey(),
  kind: text("kind").$type<(typeof APPROVAL_KINDS)[number]>().notNull(),
  invoiceId: integer("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  amount: money("amount").notNull(),
  reason: text("reason").notNull(),
  method: text("method").notNull().default("bank"),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  requestedBy: integer("requested_by").notNull().references(() => users.id),
  decidedBy: integer("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note").notNull().default(""),
  createdAt: created(),
});

// ---- Recurring expenses (rent, internet, software, licences): a reminder when due, recorded in one click --------
export const recurringExpenses = pgTable("recurring_expenses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").$type<(typeof EXPENSE_CATEGORIES)[number]>().notNull(),
  amount: money("amount").notNull(),
  paidFrom: text("paid_from").$type<"bank" | "petty_cash" | "card">().notNull().default("bank"),
  everyMonths: integer("every_months").notNull().default(1), // 1 monthly, 3 quarterly, 12 yearly
  nextDue: date("next_due").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: created(),
});

// ---- Knowledge base: procedures, prices, policies and answers for staff (strategy §26.6) ---------------------
export const kbArticles = pgTable("kb_articles", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull().default("procedure"), // procedure | prices | policy | faq | template
  body: text("body").notNull().default(""), // plain text
  roles: text("roles").array().$type<Role[]>().notNull().default(sql`'{admin,manager,agent}'::text[]`), // who can read it
  effectiveFrom: date("effective_from"),
  updatedBy: integer("updated_by").references(() => users.id),
  updatedAt: updated(),
  createdAt: created(),
});

// ---- WhatsApp (Meta Cloud API): template mapping and the conversation history per customer ---------------------
/** Our message (template key) → the template approved in WhatsApp Manager, with the variables in Meta's {{1}}, {{2}} order. */
export const waTemplates = pgTable("wa_templates", {
  key: text("key").primaryKey(), // received, match_sent, viewing_reminder, ...
  name: text("name").notNull(), // template name in WhatsApp Manager
  params: text("params").array().$type<string[]>().notNull().default(sql`'{}'::text[]`), // e.g. {name,number,link}
  enabled: boolean("enabled").notNull().default(false),
  updatedAt: updated(),
});

export const waMessages = pgTable("wa_messages", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "cascade" }),
  direction: text("direction").$type<"in" | "out">().notNull(),
  waId: text("wa_id").unique(), // WhatsApp message id
  phone: text("phone").notNull(),
  body: text("body").notNull().default(""),
  status: text("status").notNull().default("received"), // out: sent | delivered | read | failed; in: received
  error: text("error"),
  userId: integer("user_id").references(() => users.id), // staff who replied
  createdAt: created(),
}, (t) => [index("wa_messages_contact_idx").on(t.contactId)]);

/** Properties a customer saved (❤) from the suggestions in the portal: a buying signal for the agent. */
export const savedProperties = pgTable("saved_properties", {
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  createdAt: created(),
}, (t) => [primaryKey({ columns: [t.contactId, t.propertyId] })]);

/** Map views of a public property, one row per property and Muscat day (shown to the owner in the portal). */
export const propertyViews = pgTable("property_views", {
  propertyId: integer("property_id").notNull().references(() => properties.id, { onDelete: "cascade" }),
  day: date("day").notNull(),
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.propertyId, t.day] })]);

/** Website chat limits: messages per visitor (hashed IP) and in total per Muscat day. */
export const chatUsage = pgTable("chat_usage", {
  day: date("day").notNull(),
  key: text("key").notNull(), // "all" or the hashed visitor IP
  count: integer("count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.day, t.key] })]);

/** Customer reviews after a won deal or a completed job; shown on the website only if the customer allowed it and staff approved. */
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  ref: text("ref").notNull(), // what was reviewed: request:<id> or job:<id> (one review each)
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment").notNull().default(""),
  publish: boolean("publish").notNull().default(false), // the customer allows showing it with their first name
  approved: boolean("approved").notNull().default(false), // staff chose to show it on the website
  createdAt: created(),
}, (t) => [index("reviews_contact_idx").on(t.contactId), uniqueIndex("reviews_contact_ref_idx").on(t.contactId, t.ref)]);

export const AGREEMENT_STATUSES = ["draft", "sent", "signed", "declined", "cancelled"] as const;
export const agreementNumbers = pgSequence("agreement_number_seq", { startWith: 1 });
/** Agreements signed online: the exact text is fixed when sent (SHA-256), the signature, name, time and device are kept. */
export const agreements = pgTable("agreements", {
  id: serial("id").primaryKey(),
  number: text("number").notNull().unique(), // AGR-2026-00001
  contactId: integer("contact_id").notNull().references(() => contacts.id),
  requestId: integer("request_id").references(() => requests.id, { onDelete: "set null" }),
  propertyId: integer("property_id").references(() => properties.id, { onDelete: "set null" }),
  template: text("template"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  bodyHash: text("body_hash"), // set when sent; signing checks the text is unchanged
  status: text("status").$type<(typeof AGREEMENT_STATUSES)[number]>().notNull().default("draft"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signerName: text("signer_name"),
  signature: text("signature"), // PNG data URL of the drawn signature
  signerIpHash: text("signer_ip_hash"),
  signerAgent: text("signer_agent"),
  declineReason: text("decline_reason"),
  createdBy: integer("created_by").references(() => users.id),
  createdAt: created(),
  updatedAt: updated(),
}, (t) => [index("agreements_contact_idx").on(t.contactId)]);

/** Monthly targets per person (Performance page); empty means no target for that measure. */
export const targets = pgTable("targets", {
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  month: text("month").notNull(), // YYYY-MM (Muscat)
  won: integer("won"),
  viewings: integer("viewings"),
  income: money("income"),
}, (t) => [primaryKey({ columns: [t.userId, t.month] })]);
