import { prisma } from "./db";
import { createAuditLog } from "./audit";
import { notifyExecs } from "./notifications";
import { computePrintingCost, type Colour, type PaperSize, type Sided } from "./printing";

export interface NewPrintingRequest {
  pickupAt: Date;
  quantity: number;
  pages: number;
  paperSize: PaperSize;
  sided: Sided;
  colour: Colour;
  fileUrl: string;
  fileName: string;
  additionalDetails?: string;
}

/**
 * Files a printing request for a member, from the website's form or the Discord /print
 * command. Contact details come from the member and the society, not the caller.
 */
export async function createPrintingRequest(societyId: string, userId: string, body: NewPrintingRequest) {
  const cost = computePrintingCost(body);
  const [user, soc] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, phone: true } }),
    prisma.society.findUnique({ where: { id: societyId }, select: { name: true } }),
  ]);

  const request = await prisma.printingRequest.create({
    data: {
      societyId,
      submittedById: userId,
      clubName: soc?.name ?? "",
      contactName: user?.name ?? "",
      contactEmail: user?.email ?? "",
      contactPhone: user?.phone ?? "N/A",
      pickupAt: body.pickupAt,
      quantity: body.quantity,
      pages: body.pages,
      paperSize: body.paperSize,
      sided: body.sided,
      colour: body.colour,
      fileUrl: body.fileUrl,
      fileName: body.fileName,
      additionalDetails: body.additionalDetails || null,
      cost,
    },
  });

  await createAuditLog({ societyId, userId, action: "CREATE", entityType: "PrintingRequest", entityId: request.id });

  await notifyExecs(
    societyId,
    "APPROVAL_REQUIRED",
    `New Printing Request from ${user?.name ?? "a member"}`,
    `${body.quantity}× ${body.pages}pp ${body.paperSize} ${body.colour === "BW" ? "B&W" : "Colour"}, est. $${cost.toFixed(2)}.`,
    `/requests/printing/${request.id}`
  );
  return request;
}
