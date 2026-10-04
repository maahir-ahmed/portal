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
    title: "Tour",
    body:
      "This tutorial walks you through each part of the platform: requests, the budget, the Rubric portal, members and your account.\n\n" +
      "Just so the pages have something on them, the tour first adds a few demo records (a content request, a room booking, a reimbursement claim and a printing job), each marked “[Tutorial demo]”. They're deleted when the tour ends.\n\n" +
      "Use the arrow keys to move between steps. Press Esc to leave at any point, which also removes the demo records.",
  },

  // ── Layout ─────────────────────────────────────────────────────────────────
  {
    id: "sidebar",
    path: "/dashboard",
    target: "sidebar",
    title: "The sidebar",
    body:
      "All the pages available are here, and what you see depends on your role privileges. Subcommittee members only get the request pages. Directors also get AHEGS and Rubric events. Executives also get the exec queue, audit log, board, members and settings.",
  },
  {
    id: "sidebar-society",
    target: "sidebar-society",
    title: "Society and role",
    body: "Your society's name and logo, both set in Settings, with your role underneath.",
  },
  {
    id: "sidebar-user",
    target: "sidebar-user",
    title: "Your account",
    body: "Your name and email. The button on the right signs you out.",
  },
  {
    id: "notifications",
    target: "notifications",
    title: "Notifications",
    body:
      "A red dot means you have something unread. Each notification links to the request that changed, and “Mark all read” clears them. The list checks for new ones every 30 seconds.",
  },
  {
    id: "page-help",
    target: "page-help",
    title: "Help for this page",
    body:
      "The question mark runs only the steps for the page you're on, without creating any demo records. It appears on every page the tour covers.",
  },
  {
    id: "launcher",
    target: "tour-launcher-sidebar",
    title: "Taking the tour again",
    body:
      "“Take the tour” at the bottom of the menu starts this walkthrough again from the beginning, with fresh demo records.",
  },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  {
    id: "dash-stats",
    path: "/dashboard",
    target: "dash-stats",
    title: "Quick Overview",
    body:
      "Shows how many content requests are open, room bookings are pending and reimbursements are in progress. Executives can also see how many claims are waiting to be paid. Unless you're an executive, the reimbursement count only includes your own claims, because claims are private to the person who made them.",
  },
  {
    id: "dash-actions",
    target: "dash-actions",
    title: "Shortcuts",
    body: "Start a content request, printing request or reimbursement straight from here.",
  },
  {
    id: "dash-recent",
    target: "dash-recent",
    title: "Recent activity",
    body:
      "The five most recently updated content requests, room bookings and claims. Each row shows who submitted it, its status, and the content deadline, booking date or claim amount. Click a row to open it.",
  },

  // ── Content requests ───────────────────────────────────────────────────────
  {
    id: "nav-content",
    path: "/requests/content",
    target: "nav-content",
    title: "Content requests and events",
    body:
      "Marketing requests, which also serve as the society's list of events. Each event gets one request, with someone being able to request graphics, blurbs and a Rubric event.",
  },
  {
    id: "content-tabs",
    target: "content-tabs",
    title: "Filter by status",
    body:
      "Each tab shows only the requests with that status, with a count next to it. “All” shows everything.",
  },
  {
    id: "content-card",
    target: "content-card",
    title: "Reading a request",
    body:
      "Each card is coloured by how close its content deadline is: green when there's plenty of time, yellow within two weeks, amber within a week, red within two days, and deep red once it's overdue. Open requests are sorted by deadline, soonest first, and finished ones go to the bottom.\n\n" +
      "The small tags show what was asked for (banner, blurb, Rubric event) and turn green once each one is delivered.",
  },
  {
    id: "content-new",
    target: "content-new",
    title: "New request",
    body:
      "Anyone in the society can make one. Here's the form.",
  },
  {
    id: "content-form",
    path: "/requests/content/new",
    target: "content-form",
    title: "The request form",
    body:
      "Event name, start time (and end time if there is one), location, key points and the content deadline, which is what sets the card's colour. Marketing writes the blurb from your key points, so bullet points work better than full sentences.",
  },
  {
    id: "content-required",
    target: "content-required",
    title: "What you're asking for",
    body:
      "Tick any combination of banner, blurb and Rubric event. Ticking Rubric event adds the request to the exec queue, because only an executive can create the event and attach its link.",
  },
  {
    id: "content-submit",
    target: "content-submit",
    title: "Submit or save as draft",
    body:
      "Submitting notifies the executives straight away. Saving as a draft keeps it private to you until you're ready, and drafts never show up in anyone's queue.",
  },
  {
    id: "content-details",
    path: detail("contentId", "/requests/content", "/requests/content"),
    target: "content-details",
    title: "A request in full",
    body:
      "The date, time, location and deadline at the top, then the key points and any extra notes.",
  },
  {
    id: "content-flags",
    target: "content-flags",
    title: "What's been delivered",
    body:
      "Marked green as each one is done.",
  },
  {
    id: "marketing-panel",
    target: "marketing-panel",
    minRole: "EXECUTIVE",
    title: "Marketing deliverables",
    body:
      "Shown to executives and anyone with “marketing” in their title. Upload the finished graphics and press “Save graphics”, then paste in the final blurb and press “Save blurb”. Each one counts as delivered once it's saved, and the requester can download the graphics. “Mark content complete” closes the request.",
  },
  {
    id: "content-rubric",
    target: "content-rubric",
    title: "The Rubric event",
    body:
      "Where the event's ticketing page comes from. An executive creates the event on the Rubric portal and assigns it here, or pastes in a link. A QR code with a transparent background is then made automatically, ready to drop into a poster. Once it's linked you also see attendance numbers and the status of the Arc activity grant.",
  },
  {
    id: "thread",
    target: "thread",
    title: "Discussion",
    body:
      "Every request has its own thread, and comments notify the people involved. Executives can also leave internal notes (the yellow ones), which the submitter never sees.",
  },
  {
    id: "status-updater",
    target: "status-updater",
    minRole: "EXECUTIVE",
    title: "Changing the status",
    body:
      "Executives set the status here: Draft, Submitted, Need more information, In progress, Completed or Cancelled. Each change notifies the submitter and is recorded in the audit log.",
  },
  {
    id: "content-edit",
    target: "content-edit",
    title: "Editing",
    body:
      "The submitter, any director or any executive can edit a request until it's completed or cancelled. It opens the same form you filled in, with your answers already there.",
  },

  // ── Room bookings ──────────────────────────────────────────────────────────
  {
    id: "nav-room",
    path: "/requests/room-booking",
    target: "nav-room",
    title: "Room bookings",
    body:
      "Requests for Arc rooms and equipment",
  },
  {
    id: "room-card",
    target: "room-card",
    title: "The booking list",
    body:
      "Each row shows the date, time, the location you asked for and the attendee limit, plus the room you were given once it's known. Open bookings come first, soonest event first, and finished ones go to the bottom. A red “Late submission” tag appears while a booking still hasn't gone to Arc and its event is less than seven business days away.",
  },
  {
    id: "room-new",
    target: "room-new",
    title: "New booking",
    body:
      "Here's the form. It asks the same questions Arc does, so you can copy your answers straight across.",
  },
  {
    id: "room-notice",
    path: "/requests/room-booking/new",
    target: "room-notice",
    title: "Arc Rule",
    body:
      "Every booking has to reach Arc at least seven business days before the event, whether or not there are external guests. If it's later than that, a warning stays on the booking until it's been submitted to Arc.",
  },
  {
    id: "room-external",
    target: "room-external",
    title: "External guests",
    body:
      "Answering “yes” adds two required questions: who the guests are and how many are coming.",
  },
  {
    id: "room-safety",
    target: "room-safety",
    title: "Safety officer",
    body:
      "Arc needs a named safety officer for the event, with their zID and phone number.",
  },
  {
    id: "room-submit",
    target: "room-submit",
    title: "Submit",
    body:
      "Put any room requirements (building, AV, accessibility) in the box above, then submit. The executives are notified, and the notification is marked urgent if the seven-day deadline has already passed.",
  },
  {
    id: "room-detail",
    path: detail("roomId", "/requests/room-booking", "/requests/room-booking"),
    target: "room-detail",
    title: "Booking Overview",
    body:
      "Once it's approved, a Booked Room box appears. When an executive records the room Arc gave you there, the booking is marked Completed and you're notified.",
  },
  {
    id: "room-delete",
    target: "delete-button",
    title: "Deleting a booking",
    body:
      "The submitter or any executive can delete a booking, which also deletes its comments and notifications. If Arc already has the booking, you'll need to cancel it with Arc too.",
  },

  // ── Treasury ───────────────────────────────────────────────────────────────
  {
    id: "nav-treasury",
    path: "/requests/treasury",
    target: "nav-treasury",
    title: "Treasury",
    body:
      "Reimbursement claims. Only the person who made a claim and the executives can see it, so directors can't see anyone else's claims.",
  },
  {
    id: "treasury-card",
    target: "treasury-card",
    title: "The claim list",
    body:
      "Each row shows the amount, the supplier and the date of the expense, with the status on the right: Draft, Reimbursement pending, Reimbursed or Rejected. Newest claims come first.",
  },
  {
    id: "treasury-new",
    target: "treasury-new",
    title: "New claim",
    body:
      "This is the longest form in the app, so here's a walk through it.",
  },
  {
    id: "treasury-rules",
    path: "/requests/treasury/new",
    target: "treasury-rules",
    title: "Reimbursement policy",
    body:
      "Get the spend approved in the committee Discord before you buy anything (as it's the fastest way. The other rules still apply: no alcohol, no personal transport unless it was approved in writing first, nothing more than three weeks old, and bond money only once it's been returned. You can save a draft without ticking the box, but you can't submit until you do.",
  },
  {
    id: "treasury-amount",
    target: "treasury-amount",
    title: "Amount and supplier",
    body:
      "How much you paid, and who you paid. The spend was already approved in Discord, so nothing here waits for a sign-off.",
  },
  {
    id: "treasury-category",
    target: "treasury-category",
    title: "Budget category",
    body:
      "Which part of the budget the money comes out of. This is what the Spending Budget page adds up. If you're not sure, pick “Not sure” and an executive will sort it out later.",
  },
  {
    id: "treasury-receipts",
    target: "treasury-receipts",
    title: "Receipts",
    body:
      "PDF, PNG or JPG files, up to 10 MB each, as many as you need. Add them now, or later while the claim is still pending.",
  },
  {
    id: "treasury-bank",
    target: "treasury-bank",
    title: "Bank details",
    body:
      "Use the account saved on your profile, or type one in. The first account you type in is saved to your profile for next time. Claims you've already submitted keep the details they were sent with.",
  },
  {
    id: "treasury-submit",
    target: "treasury-submit",
    title: "Submit or save as draft",
    body:
      "Submitting sends the claim straight to the payout queue and notifies the executives. A draft doesn't need every field filled in. They're only all required when you submit.",
  },
  {
    id: "claim-payout",
    path: detail("treasuryId", "/requests/treasury", "/requests/treasury"),
    target: "claim-payout",
    title: "Getting paid",
    body:
      "An executive transfers the money and presses “Mark Reimbursed”, which notifies you. If the answer in Discord was no, an executive rejects the claim from Manage Request.",
  },
  {
    id: "claim-category",
    target: "claim-category",
    minRole: "EXECUTIVE",
    title: "Reclassifying",
    body:
      "Executives can move a claim to a different budget category, or back to unclassified, at any time. The budget page updates straight away.",
  },
  {
    id: "claim-actions",
    target: "claim-edit",
    title: "Editing, submitting and deleting",
    body:
      "Until a claim is paid or rejected, the person who made it can edit the details, add or remove receipts, submit a draft, or delete it. Executives can do all of this at any stage. Deleting a claim also deletes its receipts and comments.",
  },

  // ── Printing ───────────────────────────────────────────────────────────────
  {
    id: "nav-printing",
    path: "/requests/printing",
    target: "nav-printing",
    title: "Printing",
    body:
      "Society printing through the Arc front desk, paid for out of your secretarial allowance.",
  },
  {
    id: "printing-allowance",
    target: "printing-allowance",
    title: "Secretarial allowance",
    body:
      "Your Arc club tier sets the allowance (Bronze $150, Silver $225, Gold $405), and the bar shows how much is used. Only approved jobs count against it, so pending requests don't use any of it up. Deleting an approved job gives its cost back.",
  },
  {
    id: "printing-rates",
    target: "printing-rates",
    title: "Printing Costs",
    body:
      "Arc's price per page for each paper size, single or double sided, in black and white or colour. The request form shows the same table, with your choices highlighted.",
  },
  {
    id: "printing-card",
    target: "printing-card",
    title: "The job list",
    body:
      "Each row shows the job (copies × pages, size, colour), what it costs and where it's up to. Make a separate request for each document.",
  },
  {
    id: "printing-new",
    target: "printing-new",
    title: "New printing request",
    body:
      "Give at least two full business days' notice, or it may not be printed at all. Your file needs to be ready to print.",
  },
  {
    id: "printing-options",
    path: "/requests/printing/new",
    target: "printing-options",
    title: "The print job",
    body:
      "Number of copies, pages per copy, A4 or A3, single or double sided (and which edge it flips on), black and white or colour, and the document itself as a PDF or Word file.",
  },
  {
    id: "printing-cost",
    target: "printing-cost",
    title: "Cost estimate",
    body:
      "Worked out as you fill in the form: the highlighted rate, times pages per copy, times copies. If an executive approves the job, this is the amount taken off the allowance.",
  },
  {
    id: "printing-decision",
    path: detail("printingId", "/requests/printing", "/requests/printing"),
    target: "printing-decision",
    minRole: "EXECUTIVE",
    title: "Approving a print job",
    body:
      "Approving takes the cost off the allowance and moves the job to “Pending Arc submission”. An executive then submits it on the Arc portal, marks it as submitted, and finally marks it ready for pickup. The requester is notified at each step. A rejected job can't be reopened.",
  },

  // ── Spending budget ────────────────────────────────────────────────────────
  {
    id: "nav-budget",
    path: "/budget",
    target: "nav-budget",
    title: "Spending budget",
    body:
      "Everyone can see the totals, but only executives can see individual claims and change the figures.",
  },
  {
    id: "budget-totals",
    target: "budget-totals",
    title: "Budget and spending",
    body:
      "This year's budget, how much has been spent and how much is left. Spending is added up live from claims that are waiting to be paid or already paid, and have been given a category. Drafts, rejected claims and claims without a category aren't counted.",
  },
  {
    id: "budget-categories",
    target: "budget-categories",
    title: "By category",
    body:
      "One bar for each category, with the percentage left. A bar turns amber once more than 85% is spent, and red once the category goes over budget.",
  },
  {
    id: "budget-claims",
    target: "budget-claims",
    minRole: "EXECUTIVE",
    title: "Claims and categories",
    body:
      "Every claim except drafts, with a menu to give each one a category. You can filter by category and sort by date or amount. Crossed-out amounts are rejected claims and don't count. Claims without a category aren't included in the bars or the totals.",
  },
  {
    id: "budget-tabs",
    target: "budget-tabs",
    title: "This year and past years",
    body:
      "Switch to Comparison to see past years.",
  },
  {
    id: "budget-comparison",
    target: "budget-comparison",
    click: "budget-tab-comparison",
    title: "Year by year",
    body:
      "The 2024 budget and its revision, the 2025 budget and what was actually spent, this year's budget and a worst case, with totals at the bottom. Rows with reasons or notes can be expanded, which is where you'll find why each number is what it is.",
  },
  {
    id: "budget-add",
    target: "budget-add",
    minRole: "EXECUTIVE",
    title: "Editing the budget",
    body:
      "Add a category, or click the pencil on any row to change its figures, reasoning and notes. Past years are in a section you can expand, and the same dialog deletes a category. This year's spending is worked out from claims, so you never type it in.",
  },

  // ── Executive queue ────────────────────────────────────────────────────────
  {
    id: "nav-queue",
    path: "/executive/queue",
    target: "nav-queue",
    minRole: "EXECUTIVE",
    title: "Executive queue",
    body:
      "Everything waiting on an executive, on one page: Rubric events to create, room bookings to send to Arc, printing to move along and claims to pay. The total is at the top, and the page says “All clear!” when there's nothing left. If a Discord webhook is set up in Settings, each new item is also posted to Discord.",
  },
  {
    id: "queue-rubric",
    target: "queue-rubric",
    minRole: "EXECUTIVE",
    title: "Rubric events to create",
    body:
      "Content requests that asked for a Rubric event and don't have one yet, soonest deadline first.",
  },
  {
    id: "queue-rooms",
    target: "queue-rooms",
    minRole: "EXECUTIVE",
    title: "Room bookings to send to Arc",
    body:
      "Bookings that are submitted or under review. “Submit on Rubric” opens the Rubric portal inside the app, with the booking's details ready to copy.",
  },
  {
    id: "queue-printing",
    target: "queue-printing",
    minRole: "EXECUTIVE",
    title: "Printing in progress",
    body:
      "Every job that hasn't been picked up yet: waiting for approval, waiting to go to Arc, or at Arc. The button changes with each stage: Review, Submit on Rubric, then Ready for pickup.",
  },
  {
    id: "queue-reimburse",
    target: "queue-reimburse",
    minRole: "EXECUTIVE",
    title: "Claims to pay",
    body:
      "Claims waiting to be paid. Click the amount, BSB, account number or name to copy just that value, ready to paste into your banking app. Once you've made the transfer, press “Mark Reimbursed” and confirm the payee to close the claim.",
  },

  // ── Members ────────────────────────────────────────────────────────────────
  {
    id: "nav-board",
    path: "/board",
    target: "nav-board",
    minRole: "EXECUTIVE",
    title: "The board",
    body:
      "A shared to-do board for the executive team, for things to do and things coming up.",
  },
  {
    id: "board-columns",
    target: "board-columns",
    minRole: "EXECUTIVE",
    title: "Moving cards",
    body:
      "To do, In progress and Done. Drag a card to another column and it saves as soon as you let go. Cards are sorted by due date, soonest first, with undated cards at the bottom.",
  },
  {
    id: "board-add",
    target: "board-add",
    minRole: "EXECUTIVE",
    title: "Adding a card",
    body:
      "Give it a name and, if it has one, a due date. The date turns amber within a week of being due and red once it's passed, unless the card is in Done. Click a card to add notes or delete it. All executives see the same board.",
  },
  {
    id: "nav-members",
    path: "/members",
    target: "nav-members",
    minRole: "EXECUTIVE",
    title: "Members",
    body:
      "The committee list, grouped by portfolio, with each person's title, zID and phone number. Only executives can see it.",
  },
  {
    id: "member-totals",
    target: "member-totals",
    minRole: "EXECUTIVE",
    title: "Who's on the committee",
    body:
      "How many executives, directors and subcommittee members the society has. Below that, the executive team comes first, then a section for each portfolio, with directors listed before subcommittee. Anyone without a portfolio is listed under “No portfolio”.",
  },
  {
    id: "member-invite",
    target: "member-invite",
    minRole: "EXECUTIVE",
    title: "Adding a member",
    body:
      "Enter their name, email, role and title. You don't choose a portfolio, because the title decides it: “Creative Subcom” goes in Creatives, and the dialog shows which portfolio your chosen title belongs to. A new account gets a four-word temporary passphrase, shown in a message that stays until you close it. They choose their own password the first time they sign in.",
  },
  {
    id: "member-edit",
    target: "member-card",
    minRole: "EXECUTIVE",
    title: "Editing a member",
    body:
      "The pencil on a member's card changes their role, title or phone number, resets their password (the new passphrase is shown once, in the dialog), or removes them from the society. Changing their title moves them to that title's portfolio, and executives don't have one. A title with “marketing” in it also gives access to the marketing panel on content requests.",
  },

  // ── Rubric portal ──────────────────────────────────────────────────────────
  {
    id: "nav-ahegs",
    path: "/ahegs",
    target: "nav-ahegs",
    minRole: "DIRECTOR",
    title: "AHEGS recognition",
    body:
      "Arc's Contributing Members Recognition, put together across the year rather than in a rush each November. Two lists are sent: the executives, and everyone else. Directors go on the subcommittee list instead of Arc's separate mentors form, so there's only one set of supporting documents.\n\n" +
      "Executives see the whole society, directors see their own portfolio (including themselves), and subcommittee members don't see this page.",
  },
  {
    id: "ahegs-meetings",
    target: "ahegs-meetings",
    minRole: "DIRECTOR",
    title: "Meetings and minutes",
    body:
      "Record each meeting or workshop your group runs: its name, date, how long it went and who came. Directors record meetings for their own portfolio. Executives can choose the executive team, any portfolio or the whole committee, and see every group's meetings, one portfolio at a time.\n\n" +
      "Attach the minutes as a PDF, with the attendance sheet on the first page and the meeting notes after it. Deleting a meeting takes those hours away from everyone who attended.",
  },
  {
    id: "ahegs-roster",
    target: "ahegs-roster",
    minRole: "DIRECTOR",
    title: "The roster and hours",
    body:
      "Everyone is filled in from the member list, so mostly you're making corrections: their name as it appears on their student ID, a missing zID, or the dates they actually served. Hours are added up from the meetings each person attended, and “Adjust” adds hours for work done outside meetings, like running an event or marking a CTF. Untick anyone who shouldn't be put forward.",
  },
  {
    id: "ahegs-ready",
    target: "ahegs-ready",
    minRole: "EXECUTIVE",
    title: "Ready to send?",
    body:
      "One card for each list, showing how many people are on it, how much evidence is still missing and how many rows Arc would reject. A card turns green when its list is ready. “Download list” gives you Arc's own spreadsheet, already filled in.",
  },
  {
    id: "ahegs-evidence",
    click: "ahegs-tab-subcom",
    target: "ahegs-evidence",
    minRole: "EXECUTIVE",
    title: "Arc's supporting documents",
    body:
      "For the subcommittee list, Arc wants training resources, attendance records and proof of commitment, each as one combined file. “Combine” builds the attendance and commitment files from the uploaded PDF minutes, with a contents page at the front. Each set of minutes starts with its attendance sheet, so the attendance file takes the first page of each and the commitment file takes the rest. Minutes added as links are left out.\n\n" +
      "As more meetings are added during the year, the button changes to “Rebuild”. Training resources aren't a meeting, so upload or link that file yourself. The executive list doesn't need any of this.",
  },
  {
    id: "ahegs-arc",
    target: "ahegs-arc",
    minRole: "EXECUTIVE",
    title: "Filling in Arc's form",
    body:
      "Arc asks about you before it asks for the lists. Click any value to copy it, then upload the two spreadsheets and the evidence files on Arc's site and sign. Hours stay in this app, because Arc's spreadsheets have no column for them. They're only here to help you decide who to put forward.",
  },
  {
    id: "nav-rubric",
    path: "/rubric",
    target: "nav-rubric",
    minRole: "DIRECTOR",
    title: "Rubric portal",
    body:
      "A view of your society on hellorubric.com: events, ticket sales, members, grants and settlements, read live from Rubric. Executives see everything, directors see the Events tab only. On the public demo the data is a saved sample, and a banner says so.",
  },
  {
    id: "rubric-tabs",
    target: "rubric-tabs",
    minRole: "DIRECTOR",
    title: "The tabs",
    body:
      "Executives get Overview, Events, Members, Merch & Orders, Grants, Settlements and Web Portal. Directors get Events only. Until Rubric is connected in Settings, every tab apart from Web Portal says so and links there.",
  },
  {
    id: "rubric-stats",
    target: "rubric-stats",
    minRole: "EXECUTIVE",
    title: "Overview",
    body:
      "Ticket revenue, number of grants, active members and total events, loaded from Rubric when you open the page, plus your Rubric team and links into the real portal.",
  },
  {
    id: "rubric-events",
    path: "/rubric/events",
    target: "rubric-events",
    minRole: "DIRECTOR",
    title: "Events",
    body:
      "Every event on Rubric, with tickets sold, how many were scanned in and the revenue. Open an event for ticket-by-ticket detail or to go to its public page. Executives can also archive an event, and use the button up here to submit a new one to Rubric, including Arc's affiliation questions, without leaving this app.",
  },
  {
    id: "rubric-members",
    path: "/rubric/members",
    target: "rubric-export",
    minRole: "EXECUTIVE",
    title: "Members",
    body:
      "Active, expired and pending members, with counts, degrees and year of study, and a CSV export of the list you're looking at.",
  },
  {
    id: "rubric-rest",
    path: "/rubric/grants",
    target: "rubric-tabs",
    minRole: "EXECUTIVE",
    title: "Merch, grants and settlements",
    body:
      "Merch listings with stock and sales, and the list of orders. Grant funding with what's been paid and what's left. Settlements, each with its own detail, and a total across all of them.",
  },
  {
    id: "rubric-web",
    path: "/rubric/web",
    target: "rubric-web",
    minRole: "EXECUTIVE",
    title: "Web portal",
    body:
      "Rubric's own site inside the app, with a details panel beside it. Choose a room booking, printing job or activity grant, then click any field to copy it. Browsers don't let one site type into another, so copying is the next best thing. The “Submit on Rubric” buttons elsewhere in the app bring you here with the right record already chosen.",
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  {
    id: "nav-settings",
    path: "/settings",
    target: "nav-settings",
    minRole: "EXECUTIVE",
    title: "Society settings",
    body:
      "Settings for the whole society. Only executives can change them.",
  },
  {
    id: "settings-general",
    target: "settings-general",
    minRole: "EXECUTIVE",
    title: "General",
    body:
      "The society's name, description and contact email.",
  },
  {
    id: "settings-tier",
    target: "settings-tier",
    minRole: "EXECUTIVE",
    title: "Club tier",
    body:
      "Your Arc club tier, which sets the printing allowance on the Printing page.",
  },
  {
    id: "settings-ahegs",
    target: "settings-ahegs",
    minRole: "EXECUTIVE",
    title: "The AHEGS year",
    body:
      "Which year the AHEGS page opens on. You set it here instead of it following the calendar, because a submission is put together all year and sent at the end. That way the page doesn't switch to an empty new year on 1 January while you're still finishing the last one. Leave it blank to follow the calendar.",
  },
  {
    id: "settings-branding",
    target: "settings-branding",
    minRole: "EXECUTIVE",
    title: "Branding",
    body:
      "Your logo, which appears in the sidebar the next time you sign in. If there's no logo, the sidebar shows your primary colour instead.",
  },
  {
    id: "settings-social",
    target: "settings-social",
    minRole: "EXECUTIVE",
    title: "Links",
    body:
      "Your website, Facebook, Instagram, Discord and LinkedIn.",
  },
  {
    id: "settings-portfolios",
    target: "settings-portfolios",
    minRole: "EXECUTIVE",
    title: "Portfolios",
    body:
      "The areas the committee is split into. A new society starts with none, and one button adds the nine standard ones. You can add, rename and remove portfolios here.\n\n" +
      "Removing a portfolio takes its titles and members out of it rather than deleting them, and its AHEGS meetings become whole-committee meetings. Nobody is put in a portfolio directly, so each portfolio needs titles set up below.",
  },
  {
    id: "settings-titles",
    target: "settings-titles",
    minRole: "EXECUTIVE",
    title: "Roles & titles",
    body:
      "The titles you can choose from when adding or editing a member, grouped by role. Each director and subcommittee title belongs to a portfolio, and that's what groups people on the Members page. Move a title to another portfolio and everyone with that title moves too. Executive titles don't have a portfolio.",
  },
  {
    id: "settings-rubric",
    target: "settings-rubric",
    minRole: "EXECUTIVE",
    title: "Rubric integration",
    body:
      "Paste in your Rubric session ID and numeric society ID, press “Save Credentials”, then “Test Connection” to switch on the Rubric portal. The session ID is kept on the server and never sent to anyone's browser. The app makes every Rubric request for you, and only from a fixed list of allowed requests.",
  },

  // ── Account ────────────────────────────────────────────────────────────────
  {
    id: "nav-account",
    path: "/account",
    target: "nav-account",
    title: "My account",
    body:
      "Your own settings. Everyone has this page, whatever their role.",
  },
  {
    id: "account-profile",
    target: "account-profile",
    title: "Profile",
    body:
      "Your name and email. You need your current password to change your email. The sidebar updates without you having to sign in again.",
  },
  {
    id: "account-bank",
    target: "account-bank",
    title: "Bank details",
    body:
      "Save your bank details here once, and every reimbursement form will offer them as “details on file”.",
  },
  {
    id: "account-password",
    target: "account-password",
    title: "Password",
    body:
      "Enter your current password, then your new one twice. It needs at least eight characters.",
  },

  // ── Cleanup ────────────────────────────────────────────────────────────────
  {
    id: "cleanup",
    kind: "cleanup",
    path: "/dashboard",
    title: "That's the tour",
    body:
      "Finishing removes the demo records the tour made: the content request, room booking, claim and printing job, their comment threads, the demo notification and, for executives, the demo budget category. Leaving early with Esc cleans up too, and starting the tour again clears anything left over first.",
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
  // Never wider than the viewport's gutters, or the box hangs off a narrow phone.
  const width = Math.min(TOOLTIP_W, vw - 24);
  const base = { width, maxHeight: "80vh" } as const;
  const centred = { ...base, top: "50%", left: "50%", transform: "translate(-50%,-50%)" };
  if (!rect) return centred;

  const gap = 14;
  const room = 320; // enough for a typical box; the 80vh cap handles the rest
  const clampX = (x: number) => Math.min(Math.max(12, x), Math.max(12, vw - width - 12));

  // A phone is too narrow for the beside branches to ever fit, so a target that
  // is tall enough to beat `room` in both directions used to fall through to
  // `centred` — landing squarely on the thing the step is describing. Dock to
  // whichever side has more space and cap the height to exactly that space.
  if (vw < 640) {
    const above = rect.top - gap - 12;
    const below = vh - rect.bottom - gap - 12;
    if (Math.max(above, below) >= 96) {
      return below >= above
        ? { width, left: 12, top: rect.bottom + gap, maxHeight: `${below}px` }
        : { width, left: 12, bottom: vh - rect.top + gap, maxHeight: `${above}px` };
    }
    // Target is taller than the phone screen (a whole form card). Overlap is
    // unavoidable, so dock to the bottom edge: the box covers the tail of the
    // target rather than sitting across its middle, and the rest stays readable.
    return { width, left: 12, bottom: 12, maxHeight: `${Math.round(vh * 0.4)}px` };
  }

  if (vh - rect.bottom > room) return { ...base, top: rect.bottom + gap, left: clampX(rect.left) };
  if (rect.top > room) return { ...base, bottom: vh - rect.top + gap, left: clampX(rect.left) };
  const beside = { ...base, top: "50%", transform: "translateY(-50%)" };
  if (vw - rect.right > TOOLTIP_W + 2 * gap) return { ...beside, left: rect.right + gap };
  if (rect.left > TOOLTIP_W + 2 * gap) return { ...beside, left: rect.left - TOOLTIP_W - gap };
  return centred;
}

// ── Per-page help ─────────────────────────────────────────────────────────────
// The same steps, filtered to one page. Steps declare the page they live on via
// `path`; a step without one continues on the page the previous step set, which is
// how the tour reads in sequence, so the page each step belongs to is resolved by
// walking the list in order.
const PLACEHOLDER_IDS: DemoIds = {
  contentId: "[id]",
  roomId: "[id]",
  treasuryId: "[id]",
  printingId: "[id]",
};

const PAGE_BY_STEP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  let page = "/dashboard";
  for (const step of TOUR_STEPS) {
    const resolved = resolvePath(step, PLACEHOLDER_IDS);
    if (resolved) page = resolved;
    map[step.id] = page;
  }
  return map;
})();

// Record ids in a URL are cuids; every static segment in the app is far shorter.
const ID_LIKE = /^[a-z0-9-]{16,}$/i;

/** Turns a live pathname into the page key steps are indexed by. */
export function normalisePage(pathname: string, slug?: string): string {
  let path = pathname;
  if (slug && (path === `/${slug}` || path.startsWith(`/${slug}/`))) {
    path = path.slice(slug.length + 1) || "/";
  }
  return path
    .split("/")
    .map((segment) => (ID_LIKE.test(segment) ? "[id]" : segment))
    .join("/");
}

/** Steps for one page only. Welcome and cleanup belong to the full tour. */
export function stepsForPage(role: string | undefined, page: string): TourStep[] {
  return stepsFor(role).filter((step) => !step.kind && PAGE_BY_STEP[step.id] === page);
}

export function stepsFor(role: string | undefined): TourStep[] {
  const rank = ROLE_RANK[(role ?? "SUBCOMMITTEE") as TourRole] ?? 1;
  return TOUR_STEPS.filter((s) => !s.minRole || rank >= ROLE_RANK[s.minRole]);
}

export function resolvePath(step: TourStep, ids: DemoIds): string | undefined {
  return typeof step.path === "function" ? step.path(ids) : step.path;
}
