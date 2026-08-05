// Guided tour definition: every step is an element to point at, plus the copy for
// the hovering box. Steps whose `minRole` outranks the viewer are dropped, so the
// tour only ever shows features the viewer can actually use.

export type TourRole = "EXECUTIVE" | "DIRECTOR" | "SUBCOMMITTEE";

export const ROLE_RANK: Record<TourRole, number> = {
  EXECUTIVE: 3,
  DIRECTOR: 2,
  SUBCOMMITTEE: 1,
};

// Demo records the tour creates are prefixed with this and deleted on exit.
export const TUTORIAL_MARKER = "[Tutorial demo]";

export interface DemoIds {
  contentId?: string;
  roomId?: string;
  treasuryId?: string;
  printingId?: string;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** Page (relative to the society) the step lives on. Omit to stay put. */
  path?: string | ((ids: DemoIds) => string);
  /** `data-tour` value of the element to highlight. Omit for a centred box. */
  target?: string;
  /** `data-tour` value to click first, to open the tab/panel the step is about. */
  click?: string;
  /** Viewers below this role skip the step. */
  minRole?: TourRole;
  /** welcome = creates the demo records; cleanup = deletes them. */
  kind?: "welcome" | "cleanup";
}

const detail =
  (key: keyof DemoIds, path: string, fallback: string) =>
  (ids: DemoIds) =>
    ids[key] ? `${path}/${ids[key]}` : fallback;

export const TOUR_STEPS: TourStep[] = [
  // ── Welcome ────────────────────────────────────────────────────────────────
  {
    id: "welcome",
    kind: "welcome",
    path: "/dashboard",
    title: "Tour of the platform",
    body:
      "This walks through every part of the dashboard: requests, approvals, the budget, the Rubric portal and your account.\n\n" +
      "To make the pages worth looking at, it first creates a handful of demo records (a content request, a room booking, a reimbursement claim and a printing job) all tagged “[Tutorial demo]”. They are deleted again when the tour ends.\n\n" +
      "Arrow keys move between steps; Esc leaves and cleans up.",
  },

  // ── Layout ─────────────────────────────────────────────────────────────────
  {
    id: "sidebar",
    path: "/dashboard",
    target: "sidebar",
    title: "The sidebar",
    body:
      "Everything lives here, and the menu is filtered by role: subcommittee members get the request tools, directors also get the Rubric Events tab, executives get the exec queue, member directory and settings on top.",
  },
  {
    id: "sidebar-society",
    target: "sidebar-society",
    title: "Society + your role",
    body:
      "Your society's name, logo and colours (set in Settings), with your own role underneath. One account can belong to several societies; each has its own space.",
  },
  {
    id: "sidebar-user",
    target: "sidebar-user",
    title: "You, and the way out",
    body: "Your name and email, and the sign-out button on the right.",
  },
  {
    id: "notifications",
    target: "notifications",
    title: "Notifications",
    body:
      "Refreshes every 30 seconds. A red dot means unread. Each entry links straight to the request that changed, and most also go out by email. “Mark all read” clears the dot.",
  },
  {
    id: "launcher",
    target: "tour-launcher-sidebar",
    title: "Restarting this tour",
    body:
      "“Take the tour” at the bottom of the menu reopens this walkthrough whenever you want it, as does the mortarboard button in the top bar. Restarting always starts from the beginning and re-creates fresh demo records.",
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    id: "dash-stats",
    path: "/dashboard",
    target: "dash-stats",
    title: "Your counters",
    body:
      "Open content requests, pending room bookings and active reimbursements. Executives get a fourth card counting claims sitting on their approval. Reimbursement counts are yours alone unless you're an exec, because claims are private to their submitter.",
  },
  {
    id: "dash-actions",
    target: "dash-actions",
    title: "Quick create",
    body: "Shortcuts to the three forms people open most: content request, printing request, reimbursement.",
  },
  {
    id: "dash-recent",
    target: "dash-recent",
    title: "Recent activity",
    body:
      "The five most recently touched records of each type, with submitter, status badge and the date that matters (content deadline, booking date, claim amount). Click any row to open it.",
  },

  // ── Content requests ───────────────────────────────────────────────────────
  {
    id: "nav-content",
    path: "/requests/content",
    target: "nav-content",
    title: "Content requests / events",
    body:
      "The marketing workflow, and in practice the society's event register: one record per event, carrying its graphics, blurb and Rubric event.",
  },
  {
    id: "content-tabs",
    target: "content-tabs",
    title: "Status tabs with counts",
    body:
      "Filter by status (Submitted, Need more information, In Progress, Completed, Cancelled) with a live count on each. “All” shows everything.",
  },
  {
    id: "content-card",
    target: "content-card",
    title: "Reading a request at a glance",
    body:
      "Cards are colour-coded by how close the content deadline is: green with plenty of time, yellow inside two weeks, amber inside a week, red inside two days, deep red overdue. Open requests sort soonest-deadline-first; finished ones drop to the bottom.\n\n" +
      "The little chips show what was asked for (Banner, Blurb, Rubric) and turn green as each is delivered.",
  },
  {
    id: "content-new",
    target: "content-new",
    title: "New request",
    body: "Anyone in the society can raise one. Let's look at the form.",
  },
  {
    id: "content-form",
    path: "/requests/content/new",
    target: "content-form",
    title: "The request form",
    body:
      "Event name, start (and optional end), location, key points, and the content deadline, which is the date the card's colour is based on. Key points are what marketing writes the blurb from, so bullet points beat a sentence.",
  },
  {
    id: "content-required",
    target: "content-required",
    title: "What you're asking for",
    body:
      "Tick any mix of banner/graphic, written blurb and Rubric event. Ticking Rubric adds the request to the executive queue, because only an exec can create the event and attach its link.",
  },
  {
    id: "content-submit",
    target: "content-submit",
    title: "Submit or save as draft",
    body:
      "Submit notifies the executives immediately. Save as draft keeps it private to you until you're ready; drafts never appear in anyone's queue.",
  },
  {
    id: "content-details",
    path: detail("contentId", "/requests/content", "/requests/content"),
    target: "content-details",
    title: "A request in full",
    body: "Date, time, location and deadline up top, then the key points and any extra notes.",
  },
  {
    id: "content-flags",
    target: "content-flags",
    title: "Delivery checklist",
    body: "The same banner / blurb / Rubric chips, ticked off as the work lands.",
  },
  {
    id: "marketing-panel",
    target: "marketing-panel",
    minRole: "EXECUTIVE",
    title: "Marketing deliverables",
    body:
      "Visible to executives and anyone whose title mentions marketing. Upload the finished graphics (they become downloads for the requester), paste the final blurb, tick “banner done” / “blurb done”, then Save. “Mark content complete” closes the request out.",
  },
  {
    id: "content-rubric",
    target: "content-rubric",
    title: "The Rubric event",
    body:
      "Where the event gets its ticketing page. An exec creates it on the Rubric portal and assigns it here (or attaches a link by hand); the QR code is then generated automatically with a transparent background, ready to drop into a poster. Once linked you also get attendance stats and the Arc activity-grant status.",
  },
  {
    id: "thread",
    target: "thread",
    title: "Discussion",
    body:
      "Every request has a thread. Comments notify the people involved. Executives can also post internal notes (the yellow ones) that the submitter never sees.",
  },
  {
    id: "status-updater",
    target: "status-updater",
    minRole: "EXECUTIVE",
    title: "Moving the status",
    body:
      "Executives drive the status from here: Draft → Submitted → Need more information / In Progress → Completed, or Cancelled. Every change notifies the submitter and lands in the audit log.",
  },
  {
    id: "content-edit",
    target: "content-edit",
    title: "Editing",
    body:
      "The submitter, any director or any exec can edit a request until it's completed or cancelled. It's the same form you filled in, prefilled.",
  },

  // ── Room bookings ──────────────────────────────────────────────────────────
  {
    id: "nav-room",
    path: "/requests/room-booking",
    target: "nav-room",
    title: "Room bookings",
    body: "Arc room and resource requests, tracked from submission through to Arc's decision.",
  },
  {
    id: "room-card",
    target: "room-card",
    title: "The booking list",
    body:
      "Date, time, requested location and attendee cap on each row, sorted by event date. Bookings with external guests are flagged, and a red “Late submission” pill appears when the event is less than seven business days away.",
  },
  {
    id: "room-new",
    target: "room-new",
    title: "New booking",
    body: "Onward to the form. It mirrors what Arc asks for, so it can be copy-pasted straight across.",
  },
  {
    id: "room-notice",
    path: "/requests/room-booking/new",
    target: "room-notice",
    title: "Arc's seven-day rule",
    body: "Anything involving non-UNSW guests has to reach Arc at least seven business days out. The reminder is here and the warning follows the booking around.",
  },
  {
    id: "room-external",
    target: "room-external",
    title: "External guests",
    body:
      "Answering “yes” opens two required fields (who they are and how many) and raises the late-submission warning. This is the single most common reason a booking gets bounced.",
  },
  {
    id: "room-safety",
    target: "room-safety",
    title: "Safety officer",
    body: "Arc requires a named event safety officer with their zID and phone number. No officer, no booking.",
  },
  {
    id: "room-submit",
    target: "room-submit",
    title: "Submit",
    body:
      "Room requirements (building, AV, accessibility) go in the box above, then submit. The executives get notified, with an urgency flag if the seven-day rule is already broken.",
  },
  {
    id: "room-detail",
    path: detail("roomId", "/requests/room-booking", "/requests/room-booking"),
    target: "room-detail",
    title: "A booking in full",
    body:
      "Everything Arc needs on one page, with the external-guest and safety-officer detail called out separately. Executives move it through Under review → Submitted to Arc (which timestamps the submission) → Approved / Rejected / Completed.",
  },
  {
    id: "room-delete",
    target: "delete-button",
    title: "Deleting a booking",
    body:
      "The submitter or any exec can delete a booking. It takes the comment thread and stale notifications with it. If Arc already has the booking, you still need to cancel it there.",
  },

  // ── Treasury ───────────────────────────────────────────────────────────────
  {
    id: "nav-treasury",
    path: "/requests/treasury",
    target: "nav-treasury",
    title: "Treasury",
    body:
      "Reimbursement claims. A claim is visible only to the person who submitted it and to executives; even directors don't see other people's money.",
  },
  {
    id: "treasury-card",
    target: "treasury-card",
    title: "The claim list",
    body:
      "Amount, supplier and expense date per row. Claims awaiting approval show filled dots, one per approval still needed, so you can see how far along each is without opening it.",
  },
  {
    id: "treasury-new",
    target: "treasury-new",
    title: "New claim",
    body: "The reimbursement form is the longest in the app, so it's worth a walk-through.",
  },
  {
    id: "treasury-rules",
    path: "/requests/treasury/new",
    target: "treasury-rules",
    title: "The policy gate",
    body:
      "No alcohol, no personal transport without written pre-approval, nothing older than three weeks, bonding money only once returned. You can save a draft without ticking the box, but you can't submit.",
  },
  {
    id: "treasury-amount",
    target: "treasury-amount",
    title: "Amount sets the approval bar",
    body:
      "Under $50 needs one executive. $50 and over needs three, and one of them must be the Treasurer. The amount you type here decides which rule applies.",
  },
  {
    id: "treasury-category",
    target: "treasury-category",
    title: "Budget category",
    body:
      "Which pot the money comes out of. This is what the Spending Budget tab totals up. “Not sure” is a fine answer; an exec can classify it later.",
  },
  {
    id: "treasury-receipts",
    target: "treasury-receipts",
    title: "Receipts",
    body: "PDF, PNG or JPG, up to 10 MB each, as many as you need. Attach them now or add them later while the claim is still pending.",
  },
  {
    id: "treasury-bank",
    target: "treasury-bank",
    title: "Bank details",
    body:
      "Use the account saved on your profile, or type one in. Your first manual entry is saved to your profile for next time; claims already submitted keep the details they went in with.",
  },
  {
    id: "treasury-submit",
    target: "treasury-submit",
    title: "Submit or draft",
    body:
      "Submitting alerts every exec with the number of approvals needed. A draft can be incomplete; the app only enforces the full field set at submission.",
  },
  {
    id: "approval-panel",
    path: detail("treasuryId", "/requests/treasury", "/requests/treasury"),
    target: "approval-panel",
    title: "Approvals",
    body:
      "The rule for this amount, spelled out, with one dot per approval required. Executives approve, revoke their own approval, or reject outright. When the last approval lands the claim flips to “reimbursement pending”.",
  },
  {
    id: "approval-progress",
    target: "approval-progress",
    title: "Who has signed off",
    body: "Named approvers, with the Treasurer requirement tracked separately for claims of $50 and over.",
  },
  {
    id: "claim-category",
    target: "claim-category",
    minRole: "EXECUTIVE",
    title: "Reclassifying",
    body: "Executives can move a claim between budget categories (or unclassify it) at any point. The budget page updates immediately.",
  },
  {
    id: "claim-actions",
    target: "claim-edit",
    title: "Editing, submitting and deleting",
    body:
      "While a claim is draft or pending, its owner can edit the details, add or remove receipts, submit a draft for approval, and delete it. Executives can do all of that at any stage; deleting a claim removes its receipts, approvals and comments with it.",
  },

  // ── Printing ───────────────────────────────────────────────────────────────
  {
    id: "nav-printing",
    path: "/requests/printing",
    target: "nav-printing",
    title: "Printing",
    body: "Club printing through the Arc Front Desk, costed against your society's secretarial allowance.",
  },
  {
    id: "printing-allowance",
    target: "printing-allowance",
    title: "Secretarial allowance",
    body:
      "Your Arc club tier sets the yearly pot (Bronze $150, Silver $225, Gold $405) and the bar tracks it. Only approved jobs are deducted, so pending requests don't eat the budget.",
  },
  {
    id: "printing-card",
    target: "printing-card",
    title: "The job list",
    body: "Each row summarises the job (copies × pages, size, colour), its cost and where it is in the pipeline. One request per document.",
  },
  {
    id: "printing-new",
    target: "printing-new",
    title: "New printing request",
    body: "Two full business days' notice minimum, and the file needs to be print-ready.",
  },
  {
    id: "printing-options",
    path: "/requests/printing/new",
    target: "printing-options",
    title: "The print job",
    body:
      "Copies, pages per copy, A4 or A3, single or double sided (and which edge it flips on), black-and-white or colour, plus the document itself as PDF or Word.",
  },
  {
    id: "printing-cost",
    target: "printing-cost",
    title: "Live cost estimate",
    body:
      "Priced as you type from the per-page rates (10c for A4 mono, up to $1.75 for A3 double-sided colour) times pages times copies. That figure is what gets deducted if an exec approves it.",
  },
  {
    id: "printing-decision",
    path: detail("printingId", "/requests/printing", "/requests/printing"),
    target: "printing-decision",
    minRole: "EXECUTIVE",
    title: "Approving a print job",
    body:
      "Approve deducts the cost from the allowance and moves the job to “pending Arc submission”. From there an exec submits it on the Arc portal, marks it submitted, and finally marks it ready for pickup. Each step notifies the requester. Rejection is final.",
  },

  // ── Spending budget ────────────────────────────────────────────────────────
  {
    id: "nav-budget",
    path: "/budget",
    target: "nav-budget",
    title: "Spending budget",
    body:
      "The yearly budget tracker that replaced the committee spreadsheet. Everyone can see the totals; only executives see individual claims and can edit the figures.",
  },
  {
    id: "budget-totals",
    target: "budget-totals",
    title: "Budget vs spend",
    body:
      "This year's budget, what's been spent, and what's left. Spend is summed live from treasury claims that have actually been committed; drafts and rejected claims are excluded.",
  },
  {
    id: "budget-categories",
    target: "budget-categories",
    title: "By category",
    body: "One bar per category with the percentage left. It turns amber past 85% and red once the category is over budget.",
  },
  {
    id: "budget-claims",
    target: "budget-claims",
    minRole: "EXECUTIVE",
    title: "Claims and classification",
    body:
      "Every non-draft claim, with a dropdown to file it against a category. Struck-through amounts are rejected claims and don't count; anything left unclassified sits outside the category bars.",
  },
  {
    id: "budget-tabs",
    target: "budget-tabs",
    title: "Current year vs comparison",
    body: "Switch to Comparison for the archival view.",
  },
  {
    id: "budget-comparison",
    target: "budget-comparison",
    click: "budget-tab-comparison",
    title: "Year-by-year",
    body:
      "2024, the 2024 revision, 2025 budget and actual usage, this year's budget and a worst case, plus a totals row. Rows with reasoning or notes expand, which is where the “why is this number this number” lives.",
  },
  {
    id: "budget-add",
    target: "budget-add",
    minRole: "EXECUTIVE",
    title: "Editing the budget",
    body:
      "Add a category, or click the pencil on any row to edit its figures, reasoning and notes. Previous years are tucked behind a collapsible section. The same dialog deletes a category. Current-year usage is computed, never typed.",
  },

  // ── Executive queue ────────────────────────────────────────────────────────
  {
    id: "nav-queue",
    path: "/executive/queue",
    target: "nav-queue",
    minRole: "EXECUTIVE",
    title: "Executive queue",
    body:
      "One page with everything waiting on an executive, across every request type, with a total count in the header. When it's empty you get “All clear”.",
  },
  {
    id: "queue-rubric",
    target: "queue-rubric",
    minRole: "EXECUTIVE",
    title: "Rubric events required",
    body: "Content requests that asked for a Rubric event and don't have one yet, soonest deadline first.",
  },
  {
    id: "queue-rooms",
    target: "queue-rooms",
    minRole: "EXECUTIVE",
    title: "Room bookings to lodge",
    body: "Bookings still submitted or under review, each with a shortcut into the embedded Arc portal with its details ready to paste.",
  },
  {
    id: "queue-treasury",
    target: "queue-treasury",
    minRole: "EXECUTIVE",
    title: "Claims awaiting approval",
    body: "Oldest first, with the approval dots inline so you can see which claims are one signature away.",
  },
  {
    id: "queue-printing",
    target: "queue-printing",
    minRole: "EXECUTIVE",
    title: "Printing in flight",
    body:
      "Everything not yet collected: waiting on approval, waiting to be lodged with Arc, or at Arc. The button changes to match the stage: Review, Submit on Rubric, Ready for pickup.",
  },
  {
    id: "queue-reimburse",
    target: "queue-reimburse",
    minRole: "EXECUTIVE",
    title: "Pending reimbursement",
    body:
      "Fully approved claims waiting to be paid, with the recipient's BSB and account number right there, and a “Mark reimbursed” button to close them once the transfer is done.",
  },

  // ── Members ────────────────────────────────────────────────────────────────
  {
    id: "nav-members",
    path: "/members",
    target: "nav-members",
    minRole: "EXECUTIVE",
    title: "Members",
    body: "The committee directory, grouped by role, with titles, departments, zIDs and phone numbers. Executives only.",
  },
  {
    id: "member-invite",
    target: "member-invite",
    minRole: "EXECUTIVE",
    title: "Adding a member",
    body:
      "Name, email, role, title and department. A brand-new account comes back with a temporary password in the toast, so copy it before it disappears.",
  },
  {
    id: "member-edit",
    target: "member-card",
    minRole: "EXECUTIVE",
    title: "Editing a member",
    body:
      "The pencil on a member card changes their role, title, department or phone number, or resets their password. Titles matter beyond decoration: a title containing “marketing” unlocks the marketing deliverables panel on content requests.",
  },

  // ── Rubric portal ──────────────────────────────────────────────────────────
  {
    id: "nav-rubric",
    path: "/rubric",
    target: "nav-rubric",
    minRole: "DIRECTOR",
    title: "Rubric portal",
    body:
      "A window onto hellorubric.com: your events, ticket sales, members, grants and settlements, read live. Executives see all of it; directors get the Events tab only.",
  },
  {
    id: "rubric-tabs",
    target: "rubric-tabs",
    minRole: "DIRECTOR",
    title: "The tabs",
    body:
      "Overview, Events, Members, Merch & Orders, Grants, Settlements and the embedded Web Portal. If Rubric credentials haven't been set up yet, each tab says so and links to Settings.",
  },
  {
    id: "rubric-stats",
    target: "rubric-stats",
    minRole: "EXECUTIVE",
    title: "Overview",
    body: "Ticket revenue, grant count, active members and total events, pulled from Rubric on load, plus your Rubric team and quick links into the real portal.",
  },
  {
    id: "rubric-events",
    path: "/rubric/events",
    target: "rubric-events",
    minRole: "DIRECTOR",
    title: "Events",
    body:
      "Every event on Rubric with tickets sold, scanned-in count and revenue. Open one for per-ticket detail, jump to its public page, or archive it. The button up here submits a new event (including the Arc affiliation questions) straight from this app.",
  },
  {
    id: "rubric-members",
    path: "/rubric/members",
    target: "rubric-export",
    minRole: "EXECUTIVE",
    title: "Members",
    body:
      "Active, expired and pending membership lists with counts, degree and study-year detail, and a CSV export of whichever list you're looking at.",
  },
  {
    id: "rubric-rest",
    path: "/rubric/grants",
    target: "rubric-tabs",
    minRole: "EXECUTIVE",
    title: "Merch, grants and settlements",
    body:
      "Merch listings with stock and sales plus the order list; grant funding with paid and remaining balances; and settlements with per-settlement detail and a running total.",
  },
  {
    id: "rubric-web",
    path: "/rubric/web",
    target: "rubric-web",
    minRole: "EXECUTIVE",
    title: "Web portal",
    body:
      "Rubric's own site embedded, with a details panel beside it. Pick a room booking, printing job or activity grant and click any field to copy it. The browser won't let us type into someone else's site, so this is the next best thing. The Submit-on-Rubric buttons elsewhere in the app land you here with the right record already selected.",
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  {
    id: "nav-settings",
    path: "/settings",
    target: "nav-settings",
    minRole: "EXECUTIVE",
    title: "Society settings",
    body: "Executive-only configuration for the whole society.",
  },
  {
    id: "settings-general",
    target: "settings-general",
    minRole: "EXECUTIVE",
    title: "General",
    body: "Society name, description and contact email.",
  },
  {
    id: "settings-tier",
    target: "settings-tier",
    minRole: "EXECUTIVE",
    title: "Club tier",
    body: "Your Arc tier, which is what sets the printing allowance on the Printing page.",
  },
  {
    id: "settings-branding",
    target: "settings-branding",
    minRole: "EXECUTIVE",
    title: "Branding",
    body: "Primary and secondary colours, plus logo and banner uploads. The logo is what you see in the sidebar.",
  },
  {
    id: "settings-social",
    target: "settings-social",
    minRole: "EXECUTIVE",
    title: "Links",
    body: "Website, Facebook, Instagram, Discord and LinkedIn.",
  },
  {
    id: "settings-titles",
    target: "settings-titles",
    minRole: "EXECUTIVE",
    title: "Roles & titles",
    body:
      "The title options offered when adding or editing a member, grouped by role level. Add, rename and remove them here.",
  },
  {
    id: "settings-rubric",
    target: "settings-rubric",
    minRole: "EXECUTIVE",
    title: "Rubric integration",
    body:
      "Paste your Rubric session ID and numeric society ID to switch the Rubric portal on, then use Test Connection. Sessions are IP-bound and rotate, so this is checked from your browser rather than the server.",
  },

  // ── Account ────────────────────────────────────────────────────────────────
  {
    id: "nav-account",
    path: "/account",
    target: "nav-account",
    title: "My account",
    body: "Your own settings, available to everyone whatever your role.",
  },
  {
    id: "account-profile",
    target: "account-profile",
    title: "Profile",
    body: "Name and email. Changing your email needs your current password; the sidebar updates without re-logging in.",
  },
  {
    id: "account-bank",
    target: "account-bank",
    title: "Bank details",
    body: "Saved once here, then offered as “details on file” on every reimbursement form.",
  },
  {
    id: "account-password",
    target: "account-password",
    title: "Password",
    body: "Current password, new password twice, minimum eight characters.",
  },

  // ── Cleanup ────────────────────────────────────────────────────────────────
  {
    id: "cleanup",
    kind: "cleanup",
    path: "/dashboard",
    title: "That's the whole thing",
    body:
      "Finishing deletes the demo records the tour created: the content request, room booking, claim, printing job, demo budget category and demo notification. Leaving early (Esc) cleans up too, and starting the tour again always clears anything left behind first.",
  },
];

export const TOOLTIP_W = 360;

export interface TooltipBox {
  top?: number | string;
  bottom?: number;
  left?: number | string;
  transform?: string;
  width: number;
  maxHeight: string;
}

/**
 * Where to put the hovering box for a highlighted rect. Below the target if it
 * fits, else above, else beside it (vertically centred; a full-height target
 * like the sidebar has room in neither direction), else centred on screen.
 * Every branch has to land inside the viewport; see scripts/check-tutorial.ts.
 */
export function tooltipBox(
  rect: { top: number; left: number; right: number; bottom: number } | null,
  vw: number,
  vh: number
): TooltipBox {
  const base = { width: TOOLTIP_W, maxHeight: "80vh" } as const;
  const centred = { ...base, top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  if (!rect) return centred;

  const gap = 14;
  const room = 320; // enough for a typical box; the 80vh cap handles the rest
  const clampX = (x: number) => Math.min(Math.max(12, x), Math.max(12, vw - TOOLTIP_W - 12));

  if (vh - rect.bottom > room) return { ...base, top: rect.bottom + gap, left: clampX(rect.left) };
  if (rect.top > room) return { ...base, bottom: vh - rect.top + gap, left: clampX(rect.left) };
  const beside = { ...base, top: "50%", transform: "translateY(-50%)" };
  if (vw - rect.right > TOOLTIP_W + 2 * gap) return { ...beside, left: rect.right + gap };
  if (rect.left > TOOLTIP_W + 2 * gap) return { ...beside, left: rect.left - TOOLTIP_W - gap };
  return centred;
}

export function stepsFor(role: string | undefined): TourStep[] {
  const rank = ROLE_RANK[(role ?? "SUBCOMMITTEE") as TourRole] ?? 1;
  return TOUR_STEPS.filter((s) => !s.minRole || rank >= ROLE_RANK[s.minRole]);
}

export function resolvePath(step: TourStep, ids: DemoIds): string | undefined {
  return typeof step.path === "function" ? step.path(ids) : step.path;
}
