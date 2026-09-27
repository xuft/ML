// Shared RMIT HSW house-style helpers for the AR-PFM method guides (docx-js).
// Usage: const g = require('./docgen'); const d = g.builder(); d.P('...'); g.write(d, meta, out)
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle, AlignmentType, Header, Footer, PageNumber,
  TabStopType, HeadingLevel, LevelFormat, PageBreak,
} = require('docx');

const C = { RED: 'E60028', BLUE: '000054', ORANGE: 'FC9147', G1: 'F5F5F5', G2: 'EBEBEB', G3: 'E1E1E1', G4: 'CDCDCD', G5: 'AFAFAF' };
const FONT = 'Calibri';
const PAGE_W = 11906, PAGE_H = 16838, MARGIN = 1134; // A4, 2 cm side margins
const CONTENT_W = PAGE_W - 2 * MARGIN;

// Inline markup: **bold**  *italic*  _{sub}  ^{sup}
// [published|typical|estimate|derived|calculation|measured ...] evidence tag; [verify ...] confirm-on-instrument tag
function runs(text, base = {}) {
  const out = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|_\{[^}]+\}|\^\{[^}]+\}|\[(?:published|typical|estimate|derived|calculation|measured|verify)[^\]]*\])/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...base }));
    const t = m[0];
    if (t.startsWith('**')) out.push(...runs(t.slice(2, -2), { ...base, bold: true }));
    else if (t.startsWith('*')) out.push(...runs(t.slice(1, -1), { ...base, italics: true }));
    else if (t.startsWith('_{')) out.push(new TextRun({ text: t.slice(2, -1), ...base, subScript: true }));
    else if (t.startsWith('^{')) out.push(new TextRun({ text: t.slice(2, -1), ...base, superScript: true }));
    else if (t.startsWith('[verify')) out.push(new TextRun({ text: t, ...base, bold: true, color: '000000', shading: { type: ShadingType.CLEAR, fill: C.ORANGE, color: 'auto' } }));
    else out.push(new TextRun({ text: t, ...base, italics: true, color: C.BLUE }));
    last = m.index + t.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...base }));
  return out;
}

// Fractions -> DXA widths that sum exactly to the content width.
function W(...fr) {
  const s = fr.reduce((a, b) => a + b, 0);
  const w = fr.map((f) => Math.floor((CONTENT_W * f) / s));
  w[w.length - 1] += CONTENT_W - w.reduce((a, b) => a + b, 0);
  return w;
}

function builder() {
  const body = [];
  const d = { body };
  d.P = (text, opts = {}) => body.push(new Paragraph({ spacing: { after: 110, line: 276 }, ...opts, children: runs(text) }));
  d.H1 = (text) => body.push(new Paragraph({
    heading: HeadingLevel.HEADING_1, keepNext: true,
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.G5, space: 4 } },
    spacing: { before: 320, after: 140 }, children: runs(text, { font: FONT, size: 28, bold: true, color: C.RED }),
  }));
  d.H2 = (text) => body.push(new Paragraph({
    heading: HeadingLevel.HEADING_2, keepNext: true, spacing: { before: 220, after: 80 },
    children: runs(text, { font: FONT, size: 23, bold: true, color: C.BLUE }),
  }));
  d.B = (text, level = 0) => body.push(new Paragraph({ numbering: { reference: 'bul', level }, spacing: { after: 60, line: 264 }, children: runs(text) }));
  d.STEP = (id, text) => body.push(new Paragraph({
    spacing: { after: 90, line: 264 }, indent: { left: 700, hanging: 700 },
    tabStops: [{ type: TabStopType.LEFT, position: 700 }],
    children: [new TextRun({ text: id, bold: true, color: C.BLUE }), new TextRun({ text: '\t' }), ...runs(text)],
  }));
  d.SPACER = () => body.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
  d.PAGEBREAK = () => body.push(new Paragraph({ children: [new PageBreak()] }));
  d.EQ = (text, label) => body.push(new Paragraph({
    spacing: { before: 60, after: 120 },
    tabStops: [{ type: TabStopType.CENTER, position: CONTENT_W / 2 }, { type: TabStopType.RIGHT, position: CONTENT_W }],
    children: [new TextRun({ text: '\t' }), ...runs(text), new TextRun({ text: '\t' + label })],
  }));
  d.CALLOUT = (title, lines, color = C.RED) => {
    const mk = (children, after = 40) => new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: C.G1, color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 24, color, space: 8 } },
      indent: { left: 180, right: 180 }, spacing: { after, line: 264 }, children,
    });
    body.push(mk([new TextRun({ text: title, bold: true, color: color === C.ORANGE ? '000000' : color })]));
    lines.forEach((l, i) => body.push(mk(runs(l), i === lines.length - 1 ? 60 : 40)));
    d.SPACER();
  };
  d.TABLE = (headers, rows, widths) => {
    const total = widths.reduce((a, b) => a + b, 0);
    if (Math.abs(total - CONTENT_W) > 2) throw new Error(`Table width ${total} != ${CONTENT_W}: ${headers}`);
    rows.forEach((r) => { if (r.length !== headers.length) throw new Error(`Row length ${r.length} != ${headers.length}: ${r[0]}`); });
    const bd = { style: BorderStyle.SINGLE, size: 4, color: C.G4 };
    const borders = { top: bd, bottom: bd, left: bd, right: bd };
    const cell = (txt, i, head, r) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, borders,
      shading: head ? { type: ShadingType.CLEAR, fill: C.BLUE, color: 'auto' }
        : (r % 2 ? { type: ShadingType.CLEAR, fill: C.G1, color: 'auto' } : undefined),
      margins: { top: 50, bottom: 50, left: 90, right: 90 },
      children: String(txt).split('\n').map((line) => new Paragraph({
        spacing: { after: 30, line: 250 },
        children: runs(line, head ? { bold: true, color: 'FFFFFF', size: 19 } : { size: 19 }),
      })),
    });
    body.push(new Table({
      width: { size: total, type: WidthType.DXA }, columnWidths: widths,
      rows: [
        new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((h, i) => cell(h, i, true, 0)) }),
        ...rows.map((row, r) => new TableRow({ cantSplit: true, children: row.map((c, i) => cell(c, i, false, r)) })),
      ],
    }));
    d.SPACER();
  };
  d.CODE = (lines) => {
    lines.forEach((l) => body.push(new Paragraph({ shading: { type: ShadingType.CLEAR, fill: C.G2, color: 'auto' }, spacing: { after: 0 }, indent: { left: 200 }, children: [new TextRun({ text: l, size: 19 })] })));
    d.SPACER();
  };
  d.TITLE = (title, subtitle, line3) => {
    body.push(new Paragraph({ spacing: { before: 120, after: 60 }, children: [new TextRun({ text: title, bold: true, size: 40, color: C.BLUE })] }));
    body.push(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: subtitle, size: 26, color: C.BLUE })] }));
    body.push(new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: line3, size: 22 })] }));
  };
  d.CONTENTS = (items) => {
    d.H2('Contents');
    items.forEach((t) => body.push(new Paragraph({ spacing: { after: 20 }, indent: { left: 200 }, children: [new TextRun({ text: t, size: 20 })] })));
  };
  d.REFS = (refs) => refs.forEach((r, i) => body.push(new Paragraph({
    spacing: { after: 70, line: 256 }, indent: { left: 460, hanging: 460 },
    tabStops: [{ type: TabStopType.LEFT, position: 460 }],
    children: [new TextRun({ text: `${i + 1}.`, bold: true, color: C.BLUE, size: 19 }), new TextRun({ text: '\t', size: 19 }), ...runs(r, { size: 19 })],
  })));
  return d;
}

// meta: { headerTitle, docTitle, rev, date, preparedBy, centreNote }
function write(d, meta, outPath) {
  const header = new Header({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: C.RED, space: 4 } },
    spacing: { after: 120 },
    children: [new TextRun({ text: meta.headerTitle, bold: true, color: C.RED, size: 20 }), new TextRun({ text: '\t[RMIT logo]', color: C.G5, size: 18 })],
  })] });
  const footer = new Footer({ children: [new Paragraph({
    tabStops: [{ type: TabStopType.CENTER, position: CONTENT_W / 2 }, { type: TabStopType.RIGHT, position: CONTENT_W }],
    border: { top: { style: BorderStyle.SINGLE, size: 4, color: C.G4, space: 4 } },
    children: [
      new TextRun({ text: `Prepared by: ${meta.preparedBy}`, size: 16 }),
      new TextRun({ text: `\t${meta.centreNote}`, size: 16 }),
      new TextRun({ children: [`\tRev ${meta.rev} · ${meta.date} · Page `, PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES], size: 16 }),
    ],
  })] });
  const doc = new Document({
    creator: 'Chenglong Xu', title: meta.docTitle,
    styles: {
      default: { document: { run: { font: FONT, size: 21 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 28, bold: true, color: C.RED }, paragraph: { outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT, size: 23, bold: true, color: C.BLUE }, paragraph: { outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{ reference: 'bul', levels: [
      { level: 0, format: LevelFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 400, hanging: 260 } } } },
      { level: 1, format: LevelFormat.BULLET, text: '–', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 800, hanging: 260 } } } },
    ] }] },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 1300, bottom: 1100, left: MARGIN, right: MARGIN, header: 560, footer: 500 } } },
      headers: { default: header }, footers: { default: footer }, children: d.body,
    }],
  });
  return Packer.toBuffer(doc).then((buf) => { fs.writeFileSync(outPath, buf); console.log('wrote', outPath, buf.length, 'bytes'); });
}

module.exports = { builder, write, runs, W, C, CONTENT_W };
