// Dibuja los bloques del expediente en un PDF tamano carta (paso 28 r4). El
// contenido lo decide recordExportModel; aqui solo hay tipografia y paginas.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { toPdfSafe, wrapText } from "./pdfText.ts";
import {
  buildBlocks,
  doctorHeader,
  footerText,
  patientName,
  type Block,
  type ExportKind,
  type RecordExport
} from "./recordExportModel.ts";

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN_X = 56;
const TOP = PAGE_HEIGHT - 52;
const BOTTOM = 64;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const INK = rgb(0.13, 0.15, 0.2);
const MUTED = rgb(0.42, 0.45, 0.5);
const LINE = rgb(0.85, 0.87, 0.9);
const WARNING = rgb(0.68, 0.38, 0.05);
const PRIMARY = rgb(0.12, 0.33, 0.62);

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

class Writer {
  private page!: PDFPage;
  private y = TOP;
  readonly pages: PDFPage[] = [];
  private readonly doc: PDFDocument;
  private readonly fonts: Fonts;
  private readonly data: RecordExport;

  constructor(doc: PDFDocument, fonts: Fonts, data: RecordExport) {
    this.doc = doc;
    this.fonts = fonts;
    this.data = data;
    this.newPage();
  }

  private newPage() {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    this.pages.push(this.page);
    const header = doctorHeader(this.data);
    this.page.drawText(toPdfSafe(header.lines[0]), { x: MARGIN_X, y: TOP, size: 13, font: this.fonts.bold, color: INK });
    this.page.drawText(toPdfSafe(header.lines[1]), {
      x: MARGIN_X,
      y: TOP - 15,
      size: 9.5,
      font: this.fonts.regular,
      color: header.missing ? WARNING : MUTED
    });
    const brand = "MiDoc";
    this.page.drawText(brand, {
      x: PAGE_WIDTH - MARGIN_X - this.fonts.bold.widthOfTextAtSize(brand, 10),
      y: TOP,
      size: 10,
      font: this.fonts.bold,
      color: PRIMARY
    });
    this.page.drawLine({
      start: { x: MARGIN_X, y: TOP - 26 },
      end: { x: PAGE_WIDTH - MARGIN_X, y: TOP - 26 },
      thickness: 0.8,
      color: LINE
    });
    this.y = TOP - 48;
  }

  private ensure(height: number) {
    if (this.y - height < BOTTOM) this.newPage();
  }

  private lines(text: string, font: PDFFont, size: number, color = INK, indent = 0, lineHeight = size * 1.38) {
    const wrapped = wrapText(text, CONTENT_WIDTH - indent, (line) => font.widthOfTextAtSize(line, size));
    for (const line of wrapped) {
      this.ensure(lineHeight);
      if (line) this.page.drawText(line, { x: MARGIN_X + indent, y: this.y, size, font, color });
      this.y -= lineHeight;
    }
  }

  draw(block: Block) {
    switch (block.type) {
      case "title":
        this.ensure(30);
        this.lines(block.text, this.fonts.bold, 17);
        this.y -= 6;
        break;
      case "heading":
        // Un encabezado no se queda solo al pie de la pagina.
        this.ensure(70);
        this.y -= 6;
        this.page.drawLine({
          start: { x: MARGIN_X, y: this.y + 14 },
          end: { x: PAGE_WIDTH - MARGIN_X, y: this.y + 14 },
          thickness: 0.6,
          color: LINE
        });
        this.lines(block.text, this.fonts.bold, 12.5, PRIMARY);
        break;
      case "meta":
        this.lines(block.text, this.fonts.regular, 9, MUTED);
        this.y -= 2;
        break;
      case "warning":
        this.lines(block.text, this.fonts.bold, 9.5, WARNING);
        this.y -= 2;
        break;
      case "field":
        this.ensure(34);
        this.lines(block.label.toUpperCase(), this.fonts.bold, 8, MUTED, 0, 12);
        this.lines(block.text, this.fonts.regular, 10.5);
        this.y -= 6;
        break;
      case "signature": {
        this.ensure(90);
        this.y -= 46;
        const width = 220;
        const x = PAGE_WIDTH - MARGIN_X - width;
        this.page.drawLine({ start: { x, y: this.y }, end: { x: x + width, y: this.y }, thickness: 0.8, color: INK });
        const header = doctorHeader(this.data);
        let lineY = this.y - 13;
        for (const text of ["Firma", ...header.lines]) {
          this.page.drawText(toPdfSafe(text), { x, y: lineY, size: 9, font: this.fonts.regular, color: MUTED });
          lineY -= 12;
        }
        this.y = lineY - 8;
        break;
      }
      case "spacer":
        this.y -= 10;
        break;
    }
  }

  finish() {
    const total = this.pages.length;
    this.pages.forEach((page, index) => {
      page.drawText(toPdfSafe(footerText(this.data, index + 1, total)), {
        x: MARGIN_X,
        y: 36,
        size: 8,
        font: this.fonts.regular,
        color: MUTED
      });
    });
  }
}

/** PDF de una consulta (con firma, como receta) o del expediente completo. */
export async function buildRecordPdf(data: RecordExport, kind: ExportKind): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts = {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold)
  };
  const title = `${kind === "PDF_CONSULTA" ? "Nota de consulta" : "Expediente clínico"} · ${patientName(data)}`;
  doc.setTitle(toPdfSafe(title));
  doc.setAuthor(toPdfSafe(data.doctor.name ?? "MiDoc"));
  doc.setCreator("MiDoc");
  doc.setProducer("MiDoc");
  doc.setCreationDate(new Date(data.generated_at));

  const writer = new Writer(doc, fonts, data);
  for (const block of buildBlocks(data, kind)) writer.draw(block);
  writer.finish();
  return doc.save();
}
