import { prisma } from "./db";
import { createAuditLog } from "./audit";
import { notifyExecs } from "./notifications";
import { combinedPolicy } from "./policies";
import { wallClockNow } from "./urgency";
import { isPlausibleDate } from "./utils";
import { ALLOWED_EXTS, ALLOWED_TYPES, MAX_UPLOAD, extOf, saveUpload } from "./uploads";
import { memberFor, NOT_LINKED, type Attachment, type DiscordMessage, type Interaction } from "./discordBot";

// /claim: a reimbursement claim from Discord. The command saves the receipt and a DRAFT
// claim, then shows it back with the society's rules and two buttons. "Submit claim"
// files it, as the website's submit does; if the member has no bank details yet, it
// first opens a Discord form for them, saved to their account like the website does.
// The draft is the only state: the buttons carry its ID, and only its owner can use them.
//
// Button and form IDs: claim:submit:<id>, claim:cancel:<id>, claim:bank:<id>.

const base = () => process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
const money = (n: number) => `$${n.toFixed(2)}`;
const opt = (i: Interaction, name: string) => i.data.options?.find((o) => o.name === name)?.value;
const discordUserOf = (i: Interaction) => i.member?.user ?? i.user;

/** Answers that replace the message the buttons are on (Discord's UPDATE_MESSAGE). */
const update = (message: DiscordMessage) => ({ type: 7, data: { embeds: [], components: [], ...message } });

/** Runs after the "thinking…" reply: files the draft and returns what to show. */
export async function handleClaim(i: Interaction): Promise<DiscordMessage | string> {
  const discordUser = discordUserOf(i);
  if (!discordUser) return "Use /claim in your society's server.";
  const member = await memberFor(discordUser);
  if (!member) return NOT_LINKED;
  const society = await prisma.society.findUnique({
    where: { id: member.societyId },
    select: { timezone: true, treasuryMode: true },
  });
  if (!society) return NOT_LINKED;

  const amount = Math.round(Number(opt(i, "amount")) * 100) / 100;
  if (!(amount > 0)) return "The amount has to be more than $0.";
  const what = String(opt(i, "what") ?? "").trim();
  const where = String(opt(i, "where") ?? "").trim();
  if (!what || !where) return "Say what you bought and where.";

  // A date typed like 2026-11-04, or today on the society's clock. Stored as the website
  // stores a date input: midnight UTC of that day.
  const typed = String(opt(i, "date") ?? "").trim();
  const day = typed || new Date(wallClockNow(society.timezone)).toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isPlausibleDate(day)) return "I couldn't read the date. Write it like 2026-11-04.";
  const expenseDate = new Date(`${day}T00:00:00Z`);
  if (expenseDate.getTime() > wallClockNow(society.timezone)) return "That date is in the future.";

  // A picked suggestion sends the category's ID; typing without picking sends the text.
  let category: { id: string; name: string } | null = null;
  const typedCategory = String(opt(i, "category") ?? "").trim();
  if (typedCategory && society.treasuryMode === "BUDGET") {
    category = await prisma.budgetCategory.findFirst({
      where: { societyId: member.societyId, OR: [{ id: typedCategory }, { name: { equals: typedCategory, mode: "insensitive" } }] },
      select: { id: true, name: true },
    });
    if (!category) return `There's no budget category called "${typedCategory}". Pick one from the list as you type.`;
  }

  const file: Attachment | undefined = i.data.resolved?.attachments?.[String(opt(i, "receipt"))];
  if (!file) return "Attach the receipt.";
  const ext = extOf(file.filename);
  if (!ALLOWED_EXTS.includes(ext) || (file.content_type && !ALLOWED_TYPES.includes(file.content_type.split(";")[0]))) {
    return "I can't take that kind of file. Send a photo or a PDF of the receipt.";
  }
  if (file.size > MAX_UPLOAD) return `That file is too big (the limit is ${MAX_UPLOAD / 1024 / 1024} MB).`;
  // Only from Discord's own CDN: the URL is in the signed request, but check anyway.
  if (!/^https:\/\/(cdn|media)\.discordapp\.(com|net)\//.test(file.url)) return "That attachment didn't come from Discord.";
  const res = await fetch(file.url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) return "I couldn't download the receipt from Discord. Try again.";
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_UPLOAD) return "That file is too big.";
  const fileUrl = await saveUpload(bytes, ext);

  const claim = await prisma.$transaction(async (tx) => {
    const c = await tx.treasuryRequest.create({
      data: {
        societyId: member.societyId,
        submittedById: member.id,
        contactEmail: member.email,
        expenseDate,
        locationSupplier: where,
        description: what,
        amount,
        budgetCategoryId: category?.id ?? null,
        status: "DRAFT",
      },
    });
    await tx.treasuryAttachment.create({
      data: { treasuryRequestId: c.id, fileName: file.filename, fileUrl, fileSize: bytes.length, mimeType: file.content_type ?? "application/octet-stream" },
    });
    await tx.thread.create({ data: { treasuryRequestId: c.id } });
    return c;
  });
  await createAuditLog({
    societyId: member.societyId,
    userId: member.id,
    action: "CREATE",
    entityType: "TreasuryRequest",
    entityId: claim.id,
    metadata: { via: "Discord /claim" },
  });

  const [addition, bank] = await Promise.all([
    prisma.policyAddition.findFirst({ where: { societyId: member.societyId, kind: "TREASURY" }, select: { text: true } }),
    savedBank(member.id),
  ]);
  const rules = combinedPolicy("TREASURY", addition?.text);
  return {
    content: "Check this, then press **Submit claim**. Submitting means you agree to the rules below.",
    embeds: [
      {
        title: `Claim: ${money(amount)}`,
        description: what.slice(0, 1000),
        fields: [
          { name: "Where", value: where.slice(0, 200), inline: true },
          { name: "When", value: day, inline: true },
          ...(category ? [{ name: "Category", value: category.name, inline: true }] : []),
          {
            name: "Paid to",
            value: bank ? `Your saved account ending ${bank.accountNumber.slice(-3)}` : "You'll be asked for your bank details next",
          },
          { name: "Rules", value: rules.map((r) => `• ${r}`).join("\n").slice(0, 1024) || "None" },
        ],
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Submit claim", custom_id: `claim:submit:${claim.id}` },
          { type: 2, style: 2, label: "Cancel", custom_id: `claim:cancel:${claim.id}` },
          ...(base() ? [{ type: 2, style: 5, label: "Open on the portal", url: `${base()}/requests/treasury/${claim.id}` }] : []),
        ],
      },
    ],
  };
}

/** The account a claim would be paid into: the same one the website's claim form shows. */
function savedBank(userId: string) {
  return prisma.bankAccount.findFirst({
    where: { userId, bsb: { not: "" }, accountNumber: { not: "" } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: { id: true, accountNumber: true },
  });
}

/** The draft behind a button or form, if the person pressing it owns it. */
async function ownDraft(i: Interaction, id: string) {
  const discordUser = discordUserOf(i);
  const member = discordUser && (await memberFor(discordUser));
  if (!member) return { error: NOT_LINKED };
  const draft = await prisma.treasuryRequest.findFirst({
    where: { id, societyId: member.societyId, submittedById: member.id },
    select: { id: true, status: true, amount: true },
  });
  if (!draft) return { error: "That claim isn't there any more: it was cancelled or deleted." };
  if (draft.status !== "DRAFT") return { error: "That claim has already been submitted." };
  return { member, draft };
}

/** A button press on the summary. Answers within Discord's 3 seconds: no downloads here. */
export async function handleClaimButton(i: Interaction) {
  const [, action, id] = (i.data.custom_id ?? "").split(":");
  const found = await ownDraft(i, id);
  if ("error" in found) return update({ content: found.error! });
  const { member, draft } = found;

  if (action === "cancel") {
    await prisma.$transaction([
      prisma.thread.deleteMany({ where: { treasuryRequestId: id } }),
      prisma.treasuryRequest.deleteMany({ where: { id, status: "DRAFT" } }),
    ]);
    return update({ content: "Cancelled. Nothing was sent to the executives." });
  }

  const bank = await savedBank(member.id);
  if (bank) return update({ content: await submit(member, draft.id, bank.id) });
  // No bank details yet: ask in a Discord form. Submitting it files the claim.
  const input = (custom_id: string, label: string, placeholder: string, required = true, max = 100) => ({
    type: 1,
    components: [{ type: 4, custom_id, label, style: 1, placeholder, required, max_length: max }],
  });
  return {
    type: 9,
    data: {
      custom_id: `claim:bank:${id}`,
      title: "Where should we pay you?",
      components: [
        input("name", "Account name", "Jane Smith"),
        input("bsb", "BSB", "123-456", true, 7),
        input("account", "Account number", "12345678", true, 12),
        input("payid", "PayID (optional)", "Email, phone number or ABN", false),
      ],
    },
  };
}

/** The bank details form. Saves them to the member's account, then files the claim. */
export async function handleClaimBank(i: Interaction) {
  const id = (i.data.custom_id ?? "").split(":")[2];
  const found = await ownDraft(i, id);
  if ("error" in found) return update({ content: found.error! });
  const field = (name: string) =>
    (i.data.components ?? []).flatMap((row) => row.components).find((c) => c.custom_id === name)?.value.trim() ?? "";

  const bank = checkBank(field("name"), field("bsb"), field("account"), field("payid"));
  if ("error" in bank) {
    // A form can't be reopened from its own answer, but the buttons are still there.
    return update({ content: `${bank.error} Press **Submit claim** again to fix it.`, components: undefined, embeds: undefined });
  }
  // A fresh default row, as the Account page saves one: older claims keep theirs.
  const account = await prisma.$transaction(async (tx) => {
    await tx.bankAccount.updateMany({ where: { userId: found.member.id }, data: { isDefault: false } });
    return tx.bankAccount.create({ data: { userId: found.member.id, ...bank, isDefault: true } });
  });
  await createAuditLog({
    societyId: found.member.societyId,
    userId: found.member.id,
    action: "UPDATE",
    entityType: "BankAccount",
    entityId: account.id,
    metadata: { via: "Discord /claim", accountName: bank.accountName },
  });
  return update({ content: await submit(found.member, id, account.id) });
}

/** BSB as 123-456, a 4 to 10 digit account number, and an optional PayID. */
export function checkBank(accountName: string, bsb: string, accountNumber: string, payId: string) {
  const bsbDigits = bsb.replace(/[\s-]/g, "");
  const account = accountNumber.replace(/[\s-]/g, "");
  if (!accountName) return { error: "Add the account name." };
  if (!/^\d{6}$/.test(bsbDigits)) return { error: "A BSB is 6 digits, like 123-456." };
  if (!/^\d{4,10}$/.test(account)) return { error: "An account number is 4 to 10 digits." };
  return {
    accountName: accountName.slice(0, 100),
    bsb: `${bsbDigits.slice(0, 3)}-${bsbDigits.slice(3)}`,
    accountNumber: account,
    payId: payId.slice(0, 100) || null,
  };
}

/** DRAFT → submitted, once even if the button is pressed twice. */
async function submit(member: { id: string; name: string; societyId: string }, id: string, bankAccountId: string) {
  const done = await prisma.treasuryRequest.updateMany({
    where: { id, submittedById: member.id, status: "DRAFT" },
    data: { status: "REIMBURSEMENT_PENDING", acknowledgedRules: true, bankAccountId },
  });
  if (!done.count) return "That claim has already been submitted.";
  const claim = await prisma.treasuryRequest.findUniqueOrThrow({ where: { id }, select: { amount: true } });
  const amount = Number(claim.amount);
  await createAuditLog({
    societyId: member.societyId,
    userId: member.id,
    action: "UPDATE",
    entityType: "TreasuryRequest",
    entityId: id,
    metadata: { status: "DRAFT → REIMBURSEMENT_PENDING", via: "Discord /claim" },
  });
  await notifyExecs(
    member.societyId,
    "EXECUTIVE_ACTION_REQUIRED",
    `Reimbursement to pay: ${money(amount)} to ${member.name}`,
    "Ready to pay out. Spending approval happens in the committee Discord.",
    `/requests/treasury/${id}`
  );
  return (
    `Submitted: ${money(amount)}. The executives have it, and you'll get a notification when it's paid.` +
    (base() ? ` Follow it here: ${base()}/requests/treasury/${id}` : "")
  );
}

/** Suggestions for the category option as it's typed: up to Discord's 25. */
export async function claimCategories(i: Interaction) {
  const typed = String(i.data.options?.find((o) => o.focused)?.value ?? "");
  const discordUser = discordUserOf(i);
  const member = discordUser && (await memberFor(discordUser));
  const categories = member
    ? await prisma.budgetCategory.findMany({
        where: { societyId: member.societyId, name: { contains: typed, mode: "insensitive" } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true },
        take: 25,
      })
    : [];
  return { type: 8, data: { choices: categories.map((c) => ({ name: c.name.slice(0, 100), value: c.id })) } };
}
