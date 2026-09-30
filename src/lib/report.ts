import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { COMPANY_NAME } from '@/lib/firebase';
import { formatShortDate, formatTime, hoursBetween } from '@/lib/date';
import {
  listAttendanceInRange,
  listStaff,
  type AttendanceRecord,
} from '@/lib/attendance';
import { buildWorkbook, type CellValue, type SheetSpec } from '@/lib/xlsx';

const ATTENDANCE_COLUMNS = [
  { header: 'Date', width: 14, align: 'left' as const },
  { header: 'Day', width: 12, align: 'left' as const },
  { header: 'Employee ID', width: 14, align: 'left' as const },
  { header: 'Employee', width: 26, align: 'left' as const },
  { header: 'Email', width: 30, align: 'left' as const },
  { header: 'Role', width: 12, align: 'left' as const },
  { header: 'Office', width: 18, align: 'left' as const },
  { header: 'Check in', width: 12, align: 'left' as const },
  { header: 'Check out', width: 12, align: 'left' as const },
  { header: 'Hours worked', width: 14, align: 'right' as const, numeric: true },
  { header: 'Status', width: 16, align: 'left' as const },
];

const statusOf = (record: AttendanceRecord): string => {
  if (record.checkInISO && record.checkOutISO) return 'Complete';
  if (record.checkInISO) return 'Still clocked in';
  return 'Incomplete';
};

const toRow = (record: AttendanceRecord): Record<string, CellValue> => ({
  Date: record.date,
  Day: formatShortDate(record.date),
  'Employee ID': record.employeeId,
  Employee: record.fullName,
  Email: record.email,
  Role: record.role === 'admin' ? 'Admin' : 'Employee',
  Office: record.officeName,
  'Check in': formatTime(record.checkInISO),
  'Check out': formatTime(record.checkOutISO),
  'Hours worked': hoursBetween(record.checkInISO, record.checkOutISO),
  Status: statusOf(record),
});

export type ExportRange = { from: string; to: string };

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const XLSX_UTI = 'org.openxmlformats.spreadsheetml.sheet';

export type ExportResult = {
  uri: string;
  recordCount: number;
  sheetCount: number;
  shared: boolean;
};

const buildSheets = (
  records: AttendanceRecord[],
  range: ExportRange,
  staffCount: number
): SheetSpec[] => {
  const hours = records.reduce((sum, r) => sum + (hoursBetween(r.checkInISO, r.checkOutISO) ?? 0), 0);
  const complete = records.filter((r) => r.checkInISO && r.checkOutISO).length;
  const stillIn = records.filter((r) => r.checkInISO && !r.checkOutISO).length;
  const absentees = Math.max(0, staffCount - new Set(records.map((r) => r.uid)).size);

  const rangeLabel =
    range.from === range.to ? formatShortDate(range.from) : `${formatShortDate(range.from)} to ${formatShortDate(range.to)}`;

  const summaryRows: Record<string, CellValue>[] = [
    { Metric: 'Period', Value: rangeLabel },
    { Metric: 'Days in period', Value: range.from === range.to ? 1 : undefined },
    { Metric: 'Records captured', Value: records.length, Detail: 'one row per employee per day' },
    { Metric: 'Days present', Value: new Set(records.map((r) => r.date)).size },
    { Metric: 'Staff on file', Value: staffCount },
    { Metric: 'Staff with no record', Value: absentees, Detail: 'scanned in on none of these days' },
    { Metric: 'Full days (in + out)', Value: complete },
    { Metric: 'Still clocked in', Value: stillIn, Detail: 'no check-out recorded' },
    { Metric: 'Total hours logged', Value: Math.round(hours * 100) / 100 },
    { Metric: 'Average hours / day', Value: complete ? Math.round((hours / complete) * 100) / 100 : undefined },
  ];

  return [
    {
      name: 'Summary',
      title: `${COMPANY_NAME} attendance summary`,
      subtitle: `${rangeLabel}  |  generated ${new Date().toLocaleString()}`,
      columns: [
        { header: 'Metric', width: 26, align: 'left' },
        { header: 'Value', width: 14, align: 'right', numeric: true },
        { header: 'Detail', width: 34, align: 'left' },
      ],
      rows: summaryRows,
    },
    {
      name: 'Attendance',
      // Deliberately no title block: the header sits in row 1 so the register
      // sorts and filters correctly in Excel, Sheets and Numbers alike.
      columns: ATTENDANCE_COLUMNS,
      rows: records.map(toRow),
    },
  ];
};

/**
 * Pulls the attendance for a date range, builds a real `.xlsx` workbook in the
 * cache directory and hands it to the platform share sheet.
 */
export async function exportAttendanceToExcel(
  range: ExportRange
): Promise<ExportResult> {
  const [records, staff] = await Promise.all([
    listAttendanceInRange(range.from, range.to),
    listStaff(),
  ]);

  const bytes = buildWorkbook(buildSheets(records, range, staff.length));

  const label = range.from === range.to ? range.from : `${range.from}_to_${range.to}`;
  const file = new File(Paths.cache, `WorkScan-Attendance-${label}.xlsx`);

  // `overwrite` replaces a leftover file from a previous export of the same period
  // in one step, so there is no delete/create race and no stale spreadsheet is
  // ever shared.
  file.create({ overwrite: true });
  file.write(bytes);

  let shared = false;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: XLSX_MIME,
      dialogTitle: 'Attendance spreadsheet',
      UTI: XLSX_UTI,
    });
    shared = true;
  }

  return { uri: file.uri, recordCount: records.length, sheetCount: 2, shared };
}

/** Human-readable description of what an export will contain, for the confirm step. */
export function describeRange(records: AttendanceRecord[], staffCount: number): string {
  if (records.length === 0) return 'No scans have been recorded for this period yet.';
  const people = new Set(records.map((r) => r.uid)).size;
  return `${records.length} scan${records.length === 1 ? '' : 's'} from ${people} of ${staffCount} staff member${
    staffCount === 1 ? '' : 's'
  }.`;
}

export { toRow, statusOf, buildSheets };
