import PDFDocument from "pdfkit";

export type ContractData = {
  contactName: string;
  contactPhone: string;
  contactEmail?: string;
  eventType: string;
  eventDate?: string;
  guestCount?: number;
  location?: string;
  services: string[];
  totalValue: string;
  paymentTerms: string;
  style?: string;
};

export async function generateContractPdf(data: ContractData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 60 });
      const chunks: Buffer[] = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const gold = "#c9a961";
      const dark = "#1a1a1a";
      const muted = "#666";

      doc.fillColor(dark);

      // header
      doc.fontSize(26).text("JEAN IZIDORO", { align: "center" });
      doc.fontSize(10).fillColor(gold).text("ARQUITETURA & EVENTOS", { align: "center", characterSpacing: 3 });
      doc.moveDown(0.5);
      doc.moveTo(60, doc.y).lineTo(535, doc.y).strokeColor(gold).lineWidth(0.5).stroke();
      doc.moveDown(1.5);

      // title
      doc.fontSize(18).fillColor(dark).text("Contrato de Prestação de Serviços", { align: "center" });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(muted).text(
        `Emitido em ${new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`,
        { align: "center" }
      );
      doc.moveDown(2);

      // Parties
      doc.fontSize(12).fillColor(dark).text("CONTRATANTE", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor(dark);
      doc.text(`Nome: ${data.contactName}`);
      doc.text(`WhatsApp: ${data.contactPhone}`);
      if (data.contactEmail) doc.text(`Email: ${data.contactEmail}`);
      doc.moveDown(1);

      doc.fontSize(12).text("CONTRATADO", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11);
      doc.text("Jean Izidoro — Arquitetura & Eventos");
      doc.text("contato@jeanizidoro.com.br");
      doc.moveDown(1.5);

      // Event details
      doc.fontSize(12).text("DO EVENTO", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11);
      doc.text(`Tipo: ${data.eventType}`);
      if (data.eventDate) {
        const d = new Date(data.eventDate);
        doc.text(`Data: ${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}`);
      }
      if (data.guestCount) doc.text(`Convidados: ${data.guestCount}`);
      if (data.location) doc.text(`Local: ${data.location}`);
      if (data.style) doc.text(`Estilo / referências: ${data.style}`);
      doc.moveDown(1.5);

      // Services
      doc.fontSize(12).text("SERVIÇOS CONTRATADOS", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11);
      if (data.services.length === 0) doc.text("(a definir)");
      for (const s of data.services) {
        doc.text(`•  ${s}`);
      }
      doc.moveDown(1.5);

      // Financial
      doc.fontSize(12).text("INVESTIMENTO", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(11);
      doc.text(`Valor total: R$ ${data.totalValue || "a definir"}`);
      doc.text(`Condições: ${data.paymentTerms || "a definir"}`);
      doc.moveDown(1.5);

      // Clauses
      doc.fontSize(12).text("CLÁUSULAS GERAIS", { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).fillColor(dark);
      const clauses = [
        "1. O CONTRATADO compromete-se a executar os serviços descritos com a qualidade e padrão estético característicos de sua assinatura.",
        "2. A reserva da data do evento fica confirmada mediante pagamento do sinal acordado nas condições de pagamento.",
        "3. Alterações de escopo após a assinatura deste contrato poderão implicar revisão de valores, mediante aditivo.",
        "4. O CONTRATANTE declara ciência de que montagem e desmontagem do cenário seguem o cronograma definido pela produção.",
        "5. Caso o evento seja cancelado pelo CONTRATANTE, aplicam-se as condições de cancelamento conforme política da contratada.",
        "6. Foro: Comarca de São Paulo-SP para dirimir quaisquer controvérsias.",
      ];
      for (const c of clauses) {
        doc.text(c, { align: "justify" });
        doc.moveDown(0.3);
      }
      doc.moveDown(2);

      // Signature lines
      doc.fontSize(10);
      const y = doc.y + 50;
      doc.moveTo(80, y).lineTo(260, y).strokeColor(dark).stroke();
      doc.moveTo(335, y).lineTo(515, y).stroke();
      doc.text("CONTRATANTE", 80, y + 5, { width: 180, align: "center" });
      doc.text("CONTRATADO", 335, y + 5, { width: 180, align: "center" });
      doc.fontSize(9).fillColor(muted);
      doc.text(data.contactName, 80, y + 20, { width: 180, align: "center" });
      doc.text("Jean Izidoro", 335, y + 20, { width: 180, align: "center" });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
