import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const contracts = await prisma.contract.findMany({
    include: { contact: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ contracts });
}

export async function POST(req: NextRequest) {
  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    contactId,
    leadId,
    contactName,
    contactPhone,
    contactEmail,
    eventType,
    eventDate,
    guestCount,
    location,
    style,
    services,
    totalValue,
    paymentTerms,
    sentVia,
  } = body;

  // Usa contato existente ou cria
  let contact = contactId ? await prisma.contact.findUnique({ where: { id: contactId } }) : null;
  if (!contact && contactPhone) {
    contact = await prisma.contact.upsert({
      where: { phone: contactPhone },
      update: { name: contactName || undefined, email: contactEmail || undefined },
      create: { phone: contactPhone, name: contactName, email: contactEmail },
    });
  }
  if (!contact) {
    return NextResponse.json({ error: "contato obrigatório" }, { status: 400 });
  }

  // Import lazy (pdfkit/autentique só server)
  const { generateContractPdf } = await import("@/lib/pdf");
  const { createDocumentWithFile } = await import("@/lib/autentique");

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generateContractPdf({
      contactName: contact.name || contactName || "Cliente",
      contactPhone: contact.phone,
      contactEmail: contact.email || contactEmail,
      eventType: eventType || "Evento",
      eventDate,
      guestCount,
      location,
      style,
      services: services || [],
      totalValue: totalValue || "",
      paymentTerms: paymentTerms || "",
    });
  } catch (e) {
    console.error("PDF gen error", e);
    return NextResponse.json({ error: "pdf_failed" }, { status: 500 });
  }

  const docName = `Contrato - ${contact.name || contact.phone} - ${eventType || "Evento"}`;

  let autentiqueResult: { id: string; publicUrl?: string } | null = null;
  try {
    autentiqueResult = await createDocumentWithFile({
      name: docName,
      pdf: pdfBuffer,
      signers: [
        {
          name: contact.name || "Cliente",
          email: contact.email || contactEmail || undefined,
          phone: !contact.email && !contactEmail ? contact.phone : undefined,
        },
      ],
      message: `Contrato de serviços — Jean Izidoro. Qualquer dúvida, estamos à disposição.`,
    });
  } catch (e) {
    console.error("Autentique error", e);
    // ainda assim salva o contrato como DRAFT
  }

  const contract = await prisma.contract.create({
    data: {
      contactId: contact.id,
      leadId,
      autentiqueId: autentiqueResult?.id,
      publicUrl: autentiqueResult?.publicUrl,
      status: autentiqueResult ? "SENT" : "DRAFT",
      totalValue: totalValue ? Number(String(totalValue).replace(/\./g, "").replace(",", ".")) : null,
      paymentTerms,
      services: services as object,
      eventData: {
        eventType,
        eventDate,
        guestCount,
        location,
        style,
      } as object,
      sentVia,
      sentAt: autentiqueResult ? new Date() : null,
    },
  });

  if (leadId) {
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: "CONTRACT_SENT" },
    }).catch(() => {});
  }

  return NextResponse.json({ contract, autentique: autentiqueResult });
}
