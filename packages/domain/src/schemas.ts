import { z } from "zod";
import { normalizeNigerianPhone } from "./format";

const uuid = z.uuid();
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address"));
const optionalPhone = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    if (!v) return undefined;
    const n = normalizeNigerianPhone(v);
    if (!n) {
      ctx.addIssue({ code: "custom", message: "Enter a valid Nigerian phone number (e.g. 0803 123 4567)" });
      return z.NEVER;
    }
    return n;
  });

export const checkoutSchema = z.object({
  eventId: uuid,
  items: z
    .array(z.object({ ticketTypeId: uuid, quantity: z.coerce.number().int().min(1).max(100), accessCode: z.string().trim().max(64).optional() }))
    .min(1, "Choose at least one ticket")
    .max(10),
  buyer: z.object({
    name: z.string().trim().min(2, "Enter your full name").max(120),
    email,
    phone: optionalPhone,
  }),
  promoCode: z.string().trim().toUpperCase().max(32).optional().or(z.literal("")),
  idempotencyKey: z.string().min(16).max(80),
  acceptTerms: z.literal(true, { error: "Please accept the terms to continue" }),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/, "Use 3–50 lowercase letters, numbers or hyphens"),
  description: z.string().trim().max(4000).optional(),
  contactEmail: email.optional(),
  contactPhone: optionalPhone,
  cityId: uuid.optional(),
});

export const attendeeQuestionSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]{1,32}$/),
  label: z.string().trim().min(2).max(120),
  required: z.boolean(),
});

export const eventBasicsSchema = z.object({
  title: z.string().trim().min(3).max(140),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,98}[a-z0-9])$/, "Use lowercase letters, numbers and hyphens"),
  summary: z.string().trim().max(280).optional(),
  descriptionHtml: z.string().max(20000).optional(),
  categoryId: uuid,
  tags: z.array(z.string().trim().toLowerCase().max(24)).max(10).default([]),
});

export const eventScheduleSchema = z
  .object({
    format: z.enum(["in_person", "online", "hybrid"]),
    venueName: z.string().trim().max(160).optional(),
    addressLine: z.string().trim().max(300).optional(),
    cityId: uuid.optional(),
    timezone: z.string().default("Africa/Lagos"),
    startsLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    endsLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
    capacity: z.coerce.number().int().min(1).max(1_000_000),
    onlineAccessInstructions: z.string().max(4000).optional(),
    entryRules: z.string().max(2000).optional(),
    accessibilityInfo: z.string().max(2000).optional(),
    ageRestriction: z.coerce.number().int().min(0).max(25).optional(),
    visibility: z.enum(["public", "unlisted", "private"]),
  })
  .refine((v) => v.endsLocal > v.startsLocal, { message: "End must be after start", path: ["endsLocal"] })
  .refine((v) => v.format === "online" || (v.venueName && v.cityId), { message: "Venue and city are required for in-person events", path: ["venueName"] });

export const ticketTypeSchema = z
  .object({
    id: uuid.optional(),
    name: z.string().trim().min(1).max(80),
    kind: z.enum(["general", "early_bird", "regular", "vip", "vvip", "student", "group", "free", "complimentary"]),
    description: z.string().trim().max(500).optional(),
    priceMinor: z.coerce.number().int().min(0).max(100_000_000_000),
    quantityTotal: z.coerce.number().int().min(0).max(1_000_000),
    admissionsPerUnit: z.coerce.number().int().min(1).max(50),
    minPerOrder: z.coerce.number().int().min(1).max(100),
    maxPerOrder: z.coerce.number().int().min(1).max(100),
    salesStartLocal: z.string().optional(),
    salesEndLocal: z.string().optional(),
    opensAfterTicketTypeId: uuid.optional().or(z.literal("")),
    visibility: z.enum(["public", "hidden", "access_code"]),
    accessCode: z.string().trim().min(4).max(32).optional().or(z.literal("")),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.minPerOrder <= v.maxPerOrder, { message: "Min must be ≤ max", path: ["minPerOrder"] })
  .refine((v) => !["free", "complimentary"].includes(v.kind) || v.priceMinor === 0, { message: "Free tickets must cost ₦0", path: ["priceMinor"] });

export const promoSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,32}$/, "3–32 letters, numbers, - or _"),
    discountType: z.enum(["percent", "fixed"]),
    percentBps: z.coerce.number().int().min(1).max(10000).optional(),
    amountMinor: z.coerce.number().int().min(1).optional(),
    maxRedemptions: z.coerce.number().int().min(1).optional(),
    startsLocal: z.string().optional(),
    endsLocal: z.string().optional(),
  })
  .refine((v) => (v.discountType === "percent" ? !!v.percentBps : !!v.amountMinor), { message: "Enter a discount value", path: ["percentBps"] });

export const referralProgramSchema = z.object({
  rateBps: z.coerce.number().int().min(1).max(5000),
  windowDays: z.coerce.number().int().min(1).max(60).default(7),
  maturityDays: z.coerce.number().int().min(0).max(120).optional(),
  terms: z.string().trim().min(20).max(8000),
  enrollmentMode: z.enum(["approval", "open"]).default("approval"),
  eligibleTicketTypeIds: z.array(uuid).optional(),
});

export const payoutRecipientSchema = z.object({
  bankCode: z.string().regex(/^[0-9A-Za-z]{2,10}$/),
  bankName: z.string().trim().min(2).max(80),
  accountNumber: z.string().regex(/^\d{10}$/, "Enter a 10-digit NUBAN account number"),
  accountName: z.string().trim().min(2).max(120),
});

export const refundRequestSchema = z.object({
  orderId: uuid,
  reason: z.string().trim().min(3).max(1000),
  items: z.array(z.object({ orderItemId: uuid, units: z.coerce.number().int().min(1) })).optional(),
  includeUsed: z.boolean().default(false),
});
