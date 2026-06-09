from pathlib import Path
import re
from textwrap import wrap

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    Preformatted,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "MiDoc_V2_Documentacion.pdf"

DOCS = [
    ROOT / "README.md",
    ROOT / "01_contexto_v2.md",
    ROOT / "02_recoleccion_informacion.md",
    ROOT / "03_clasificacion_requerimientos.md",
    ROOT / "04_validacion_requerimientos.md",
    ROOT / "05_requerimientos_funcionales.md",
    ROOT / "06_casos_uso_dcu.md",
    ROOT / "07_capacidades_heredadas_y_alcance.md",
    ROOT / "08_recomendaciones_produccion.md",
    ROOT / "09_contraste_v1_v2.md",
    ROOT / "10_linea_de_desarrollo.md",
    ROOT / "11_recomendaciones_ia_medica.md",
    ROOT / "anexos" / "01_factibilidad_resumen.md",
    ROOT / "anexos" / "02_ieee_830_resumen.md",
]


def clean_inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def split_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator(line: str) -> bool:
    stripped = line.strip()
    return bool(stripped) and set(stripped.replace("|", "").replace(":", "").replace("-", "").strip()) == set()


def is_table_start(lines: list[str], index: int) -> bool:
    return (
        index + 1 < len(lines)
        and lines[index].strip().startswith("|")
        and lines[index + 1].strip().startswith("|")
        and "---" in lines[index + 1]
    )


def make_table(lines: list[str], styles) -> Table:
    rows = [split_row(line) for line in lines if not is_separator(line)]
    max_cols = max(len(row) for row in rows)
    normalized = []
    for row in rows:
        padded = row + [""] * (max_cols - len(row))
        normalized.append([Paragraph(clean_inline(cell), styles["TableCell"]) for cell in padded])

    page_width = letter[0] - 1.1 * inch
    table = Table(normalized, colWidths=[page_width / max_cols] * max_cols, repeatRows=1)
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EAF1FB")),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#B8C5D6")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("LEFTPADDING", (0, 0), (-1, -1), 5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def code_block_to_preformatted(block: list[str], styles):
    text = "\n".join(block)
    if text.startswith("mermaid\n"):
        text = text.replace("mermaid\n", "Diagrama Mermaid:\n", 1)
    wrapped_lines = []
    for line in text.splitlines():
        wrapped_lines.extend(wrap(line, width=82, replace_whitespace=False) or [""])
    return Preformatted("\n".join(wrapped_lines), styles["Code"])


def parse_markdown(path: Path, styles) -> list:
    story = []
    lines = path.read_text(encoding="utf-8").splitlines()
    index = 0
    in_code = False
    code_lines = []

    while index < len(lines):
        line = lines[index]

        if line.strip().startswith("```"):
            if in_code:
                story.append(code_block_to_preformatted(code_lines, styles))
                story.append(Spacer(1, 8))
                code_lines = []
                in_code = False
            else:
                in_code = True
                language = line.strip().strip("`")
                code_lines = [language] if language else []
            index += 1
            continue

        if in_code:
            code_lines.append(line)
            index += 1
            continue

        if is_table_start(lines, index):
            table_lines = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                table_lines.append(lines[index])
                index += 1
            story.append(make_table(table_lines, styles))
            story.append(Spacer(1, 10))
            continue

        stripped = line.strip()
        if not stripped:
            story.append(Spacer(1, 5))
        elif stripped.startswith("# "):
            story.append(Paragraph(clean_inline(stripped[2:]), styles["Title"]))
            story.append(Spacer(1, 10))
        elif stripped.startswith("## "):
            story.append(Paragraph(clean_inline(stripped[3:]), styles["Heading2"]))
            story.append(Spacer(1, 6))
        elif stripped.startswith("### "):
            story.append(Paragraph(clean_inline(stripped[4:]), styles["Heading3"]))
            story.append(Spacer(1, 5))
        elif stripped.startswith("- "):
            story.append(Paragraph("- " + clean_inline(stripped[2:]), styles["Bullet"]))
        else:
            story.append(Paragraph(clean_inline(stripped), styles["Body"]))
        index += 1

    return story


def add_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#52606D"))
    canvas.drawRightString(7.5 * inch, 0.4 * inch, f"Pagina {doc.page}")
    canvas.restoreState()


def build_pdf():
    sample = getSampleStyleSheet()
    styles = {
        "Title": ParagraphStyle("Title", parent=sample["Title"], fontSize=18, leading=22),
        "Heading2": ParagraphStyle(
            "Heading2",
            parent=sample["Heading2"],
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#1D4ED8"),
        ),
        "Heading3": ParagraphStyle("Heading3", parent=sample["Heading3"], fontSize=11, leading=14),
        "Body": ParagraphStyle("Body", parent=sample["BodyText"], fontSize=9.5, leading=13),
        "Bullet": ParagraphStyle(
            "Bullet",
            parent=sample["BodyText"],
            fontSize=9.5,
            leading=13,
            leftIndent=12,
            firstLineIndent=-8,
        ),
        "TableCell": ParagraphStyle("TableCell", parent=sample["BodyText"], fontSize=7.2, leading=9),
        "Code": ParagraphStyle(
            "Code",
            parent=sample["Code"],
            fontName="Courier",
            fontSize=7,
            leading=8.5,
            backColor=colors.HexColor("#F2F6FB"),
            borderColor=colors.HexColor("#D9E2EC"),
            borderWidth=0.4,
            borderPadding=5,
        ),
    }

    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.55 * inch,
        bottomMargin=0.6 * inch,
        title="MiDoc V2 - Documentacion",
    )
    story = [
        Paragraph("MiDoc V2", styles["Title"]),
        Paragraph("Documentacion de levantamiento y analisis", styles["Heading2"]),
        Paragraph(
            "Entregable basado en el sistema actual y en la decision V2 de integrar agenda y expediente en un paquete unico de atencion clinica.",
            styles["Body"],
        ),
        Spacer(1, 18),
    ]

    for idx, md_path in enumerate(DOCS):
        if idx > 0:
            story.append(PageBreak())
        story.extend(parse_markdown(md_path, styles))

    doc.build(story, onFirstPage=add_page_number, onLaterPages=add_page_number)


if __name__ == "__main__":
    build_pdf()
    print(f"PDF generado: {OUTPUT}")
