import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Screen } from '@/components/Screen';
import { Badge, Banner, Button, Card, EmptyState, Field, StatTile } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  getAdminCode,
  listAttendanceInRange,
  listStaff,
  setAdminCode,
  type AttendanceRecord,
} from '@/lib/attendance';
import { COMPANY_NAME } from '@/lib/firebase';
import {
  addDays,
  formatShortDate,
  formatTime,
  hoursBetween,
  todayKey,
} from '@/lib/date';
import { exportAttendanceToExcel } from '@/lib/report';
import { colors, radius, spacing, typography } from '@/theme';

type Preset = 'today' | 'week' | 'month';

const PRESETS: { key: Preset; label: string; range: () => { from: string; to: string } }[] = [
  { key: 'today', label: 'Today', range: () => ({ from: todayKey(), to: todayKey() }) },
  { key: 'week', label: 'Last 7 days', range: () => ({ from: addDays(todayKey(), -6), to: todayKey() }) },
  { key: 'month', label: 'Last 30 days', range: () => ({ from: addDays(todayKey(), -29), to: todayKey() }) },
];

export default function AdminScreen() {
  const { user } = useAuth();
  const router = useRouter();

  const [preset, setPreset] = useState<Preset>('today');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [staffCount, setStaffCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [codeModal, setCodeModal] = useState(false);
  const [adminCodeDraft, setAdminCodeDraft] = useState('');
  const [savingCode, setSavingCode] = useState(false);

  const range = useMemo(() => PRESETS.find((p) => p.key === preset)!.range(), [preset]);

  const load = useCallback(async () => {
    try {
      const [next, staff] = await Promise.all([
        listAttendanceInRange(range.from, range.to),
        listStaff(),
      ]);
      setRecords(next);
      setStaffCount(staff.length);
    } catch (error) {
      Alert.alert('Could not load the report', (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [range.from, range.to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  // Hooks must run unconditionally, so the stats are derived before the guards below.
  const stats = useMemo(() => {
    const present = new Set(records.map((r) => r.uid)).size;
    const complete = records.filter((r) => r.checkInISO && r.checkOutISO);
    const totalHours = records.reduce(
      (sum, r) => sum + (hoursBetween(r.checkInISO, r.checkOutISO) ?? 0),
      0
    );
    return {
      present,
      complete: complete.length,
      stillIn: records.filter((r) => r.checkInISO && !r.checkOutISO).length,
      average: complete.length ? totalHours / complete.length : null,
      absent: Math.max(0, staffCount - present),
    };
  }, [records, staffCount]);

  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/dashboard" />;

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportAttendanceToExcel(range);
      if (!result.shared) {
        Alert.alert(
          'Spreadsheet ready',
          `Saved to ${result.uri}. Sharing is not available on this device.`
        );
      }
      await load();
    } catch (error) {
      Alert.alert('Export failed', (error as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const openAdminCode = async () => {
    try {
      setAdminCodeDraft(await getAdminCode());
    } catch {
      setAdminCodeDraft('');
    }
    setSavingCode(false);
    setCodeModal(true);
  };

  const saveAdminCode = async () => {
    if (!adminCodeDraft.trim()) return;
    setSavingCode(true);
    try {
      await setAdminCode(adminCodeDraft);
      setCodeModal(false);
    } catch (error) {
      Alert.alert('Could not save', (error as Error).message);
    } finally {
      setSavingCode(false);
    }
  };

  return (
    <Screen
      title="Admin"
      subtitle={`${COMPANY_NAME} · ${formatShortDate(range.from)}${
        range.from === range.to ? '' : ` to ${formatShortDate(range.to)}`
      }`}
      onBack
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
      footer={
        <Button
          label="Download Excel spreadsheet"
          icon="download-outline"
          onPress={handleExport}
          loading={exporting}
          disabled={loading}
        />
      }
    >
      <View style={styles.presets}>
        {PRESETS.map((p) => (
          <Pressable
            key={p.key}
            accessibilityRole="button"
            accessibilityState={{ selected: preset === p.key }}
            onPress={() => setPreset(p.key)}
            style={[styles.preset, preset === p.key && styles.presetActive]}
          >
            <Text style={[styles.presetText, preset === p.key && styles.presetTextActive]}>
              {p.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          <View style={styles.stats}>
            <StatTile label="Present" value={stats.present} icon="people-outline" tone="success" />
            <StatTile label="Still in" value={stats.stillIn} icon="ellipse-outline" tone="warning" />
            <StatTile label="No scan" value={stats.absent} icon="close-circle-outline" tone="danger" />
          </View>

          <View style={styles.stats}>
            <StatTile label="Scans" value={records.length} icon="list-outline" />
            <StatTile label="Staff" value={staffCount} icon="id-card-outline" />
            <StatTile
              label="Avg hours"
              value={stats.average === null ? '--' : `${stats.average.toFixed(1)}h`}
              icon="timer-outline"
            />
          </View>

          {records.length === 0 ? (
            <EmptyState
              icon="document-text-outline"
              title="No scans in this period"
              message="Once staff start scanning the office code their times will show up here."
            />
          ) : (
            <Card style={styles.list}>
              {records.slice(0, 40).map((record, index) => (
                <RecordRow
                  key={record.id}
                  record={record}
                  last={index === Math.min(records.length, 40) - 1}
                />
              ))}
              {records.length > 40 ? (
                <Text style={styles.more}>
                  Showing the first 40 of {records.length}. The spreadsheet has all of them.
                </Text>
              ) : null}
            </Card>
          )}

          <View style={styles.adminActions}>
            <Button
              label="Office QR code"
              icon="qr-code-outline"
              variant="secondary"
              onPress={() => router.push('/qr-code')}
            />
            <Button
              label="Manager code"
              icon="key-outline"
              variant="ghost"
              onPress={openAdminCode}
            />
          </View>

          <Banner
            tone="info"
            icon="shield-checkmark-outline"
            message="Only managers can see this screen. Firestore security rules should also lock the attendance collection down."
          />
        </>
      )}

      <Modal
        visible={codeModal}
        transparent
        animationType="fade"
        onRequestClose={() => setCodeModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setCodeModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Manager code</Text>
            <Text style={styles.modalBody}>
              Colleagues who choose “Manager” when registering must enter this code. Anyone holding it
              can see attendance data and export spreadsheets.
            </Text>
            <Field
              label="Code"
              icon="key-outline"
              placeholder="e.g. WORKS-2026"
              value={adminCodeDraft}
              onChangeText={setAdminCodeDraft}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={saveAdminCode}
            />
            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                onPress={() => setCodeModal(false)}
                style={styles.flexBtn}
              />
              <Button
                label="Save"
                onPress={saveAdminCode}
                loading={savingCode}
                disabled={!adminCodeDraft.trim()}
                style={styles.flexBtn}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function RecordRow({ record, last }: { record: AttendanceRecord; last: boolean }) {
  const hours = hoursBetween(record.checkInISO, record.checkOutISO);
  const done = Boolean(record.checkInISO && record.checkOutISO);

  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowAvatar}>
        <Text style={styles.rowAvatarText}>
          {record.fullName.trim().slice(0, 1).toUpperCase() || '?'}
        </Text>
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {record.fullName || record.email}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {record.employeeId || record.uid.slice(0, 6)} · {formatTime(record.checkInISO)} →{' '}
          {formatTime(record.checkOutISO)}
        </Text>
      </View>

      <View style={styles.rowRight}>
        <Text style={[styles.rowHours, !done && styles.rowHoursOpen]}>
          {done ? `${hours?.toFixed(1)}h` : 'Open'}
        </Text>
        <Badge label={record.role === 'admin' ? 'Mgr' : 'Staff'} tone="muted" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  presets: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  preset: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  presetText: { ...typography.muted, fontWeight: '700' },
  presetTextActive: { color: colors.white },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  list: { padding: 0, overflow: 'hidden', marginTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarText: { fontWeight: '800', color: colors.primaryDark },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { ...typography.muted, fontSize: 12 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowHours: { fontSize: 14, fontWeight: '800', color: colors.success },
  rowHoursOpen: { color: colors.warning },
  more: { ...typography.muted, textAlign: 'center', padding: spacing.md },
  adminActions: { gap: spacing.sm, marginTop: spacing.lg, marginBottom: spacing.md },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(11,27,43,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  modalTitle: { ...typography.h2 },
  modalBody: { ...typography.muted },
  modalActions: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
});
