import { strToU8, zipSync } from 'fflate';

/**
 * A tiny, dependency-light writer for real `.xlsx` workbooks.
 *
 * An .xlsx file is just a ZIP archive of XML parts, so we only need a zip writer
 * plus the handful of parts Excel insists on. Inline strings keep us clear of the
 * shared-string table entirely, and `fflate` is pure JS so it runs under Hermes
 * without a `Buffer` polyfill.
 */

export type CellValue = string | number | boolean | null | undefined;

export type Column = {
  header: string;
  width: number;
  /** Derives the cell value from the row, when the column is computed. */
  value?: (row: Record<string, CellValue>, index: number) => CellValue;
  /** Aligns the cell contents. */
  align?: 'left' | 'center' | 'right';
  /** Renders as a real number with two decimals instead of text. */
  numeric?: boolean;
};

export type SheetSpec = {
  name: string;
  title?: string;
  subtitle?: string;
  columns: Column[];
  rows: Record<string, CellValue>[];
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // Excel rejects almost every control character outright.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

/** 1 -> "A", 26 -> "Z", 27 -> "AA" */
export const columnLetter = (index: number): string => {
  let n = index;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

/** Style ids, in the order they appear in `cellXfs` below. */
const STYLE = {
  general: 0,
  number: 1,
  header: 2,
  title: 3,
  subtitle: 4,
} as const;

const styleFor = (col: Column): number => (col.numeric ? STYLE.number : STYLE.general);

const inlineString = (ref: string, style: number, text: string): string =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(
    text
  )}</t></is></c>`;

const cellXml = (ref: string, col: Column, value: CellValue): string => {
  const style = styleFor(col);

  if (value === null || value === undefined || value === '') {
    return `<c r="${ref}" s="${style}"/>`;
  }

  if (col.numeric) {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? `<c r="${ref}" s="${style}"><v>${num}</v></c>` : inlineString(ref, STYLE.general, String(value));
  }

  if (typeof value === 'boolean') {
    return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }

  return inlineString(ref, style, String(value));
};

const sheetXml = (spec: SheetSpec): string => {
  const rows: string[] = [];
  let rowNumber = 0;

  if (spec.title) {
    rowNumber += 1;
    rows.push(
      `<row r="${rowNumber}" ht="24" customHeight="1">${inlineString(
        `A${rowNumber}`,
        STYLE.title,
        spec.title
      )}</row>`
    );
  }

  if (spec.subtitle) {
    rowNumber += 1;
    rows.push(
      `<row r="${rowNumber}" ht="16" customHeight="1">${inlineString(
        `A${rowNumber}`,
        STYLE.subtitle,
        spec.subtitle
      )}</row>`
    );
  }

  if (spec.title || spec.subtitle) {
    rowNumber += 1;
    rows.push(`<row r="${rowNumber}"/>`);
  }

  const headerRow = rowNumber + 1;
  const headerCells = spec.columns
    .map((col, i) => inlineString(`${columnLetter(i + 1)}${headerRow}`, STYLE.header, col.header))
    .join('');
  rowNumber = headerRow;
  rows.push(`<row r="${headerRow}" ht="20" customHeight="1">${headerCells}</row>`);

  spec.rows.forEach((row, rowIdx) => {
    rowNumber += 1;
    const cells = spec.columns
      .map((col, i) =>
        cellXml(
          `${columnLetter(i + 1)}${rowNumber}`,
          col,
          col.value ? col.value(row, rowIdx) : row[col.header]
        )
      )
      .join('');
    rows.push(`<row r="${rowNumber}">${cells}</row>`);
  });

  const lastRow = Math.max(rowNumber, 1);
  const lastCol = columnLetter(spec.columns.length);
  const cols = spec.columns
    .map(
      (col, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${col.width}" customWidth="1" style="${styleFor(
          col
        )}"/>`
    )
    .join('');

  const freeze = spec.rows.length > 0 || spec.title || spec.subtitle ? headerRow : 0;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
<dimension ref="A1:${lastCol}${lastRow}"/>
<sheetViews><sheetView workbookViewId="0">${
    freeze
      ? `<pane ySplit="${freeze}" topLeftCell="A${freeze + 1}" activePane="bottomLeft" state="frozen"/>`
      : ''
  }</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${rows.join('')}</sheetData>
${
  spec.rows.length
    ? `<autoFilter ref="A${headerRow}:${lastCol}${lastRow}"/>`
    : ''
}
<pageMargins left="0.4" right="0.4" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" paperSize="9"/>
</worksheet>`;
};

const contentTypesXml = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${Array.from(
  { length: sheetCount },
  (_, i) =>
    `<Override PartName="/xl/worksheets/sheet${
      i + 1
    }.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
).join('\n')}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const workbookRelsXml = (sheetCount: number) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${Array.from(
  { length: sheetCount },
  (_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${
      i + 1
    }.xml"/>`
).join('\n')}
<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

const workbookXml = (specs: SheetSpec[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<workbookPr/>
<sheets>
${specs
  .map(
    (s, i) =>
      `<sheet name="${escapeXml(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  )
  .join('\n')}
</sheets>
</workbook>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
<fonts count="4">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF11181C"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF5C6B75"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF208AEF"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="1">
<border><left/><right/><top/><bottom/><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="top"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const coreXml = (title: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(title)}</dc:title>
<dc:creator>WorkScan</dc:creator>
<cp:lastModifiedBy>WorkScan</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</dcterms:created>
</cp:coreProperties>`;

const APP_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
<Application>WorkScan</Application>
</Properties>`;

/** Builds the .xlsx bytes for one or more sheets. */
export function buildWorkbook(specs: SheetSpec[]): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypesXml(specs.length)),
    '_rels/.rels': strToU8(ROOT_RELS),
    'docProps/core.xml': strToU8(coreXml(specs[0]?.title ?? 'WorkScan report')),
    'docProps/app.xml': strToU8(APP_XML),
    'xl/workbook.xml': strToU8(workbookXml(specs)),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml(specs.length)),
    'xl/styles.xml': strToU8(STYLES_XML),
  };

  specs.forEach((spec, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(spec));
  });

  return zipSync(files, { level: 6 });
}
