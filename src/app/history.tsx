import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Badge, Card, EmptyState, StatTile } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { listMyAttendance, type AttendanceRecord } from '@/lib/attendance';
import { formatHours, formatShortDate, formatTime, hoursBetween } from '@/lib/date';
import { colors, radius, spacing, typography } from '@/theme';

type Filter = 'all' | 'complete' | 'open';

export default function HistoryScreen() {
  const { user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setRecords(await listMyAttendance(user.uid));
    } catch (error) {
      Alert.alert('Could not load your history', (error as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const stats = useMemo(() => {
    const complete = records.filter((r) => r.checkInISO && r.checkOutISO);
    const totalHours = records.reduce(
      (sum, r) => sum + (hoursBetween(r.checkInISO, r.checkOutISO) ?? 0),
      0
    );
    return {
      days: records.length,
      complete: complete.length,
      average: complete.length ? totalHours / complete.length : null,
    };
  }, [records]);

  const visible = useMemo(
    () =>
      records.filter((r) => {
        if (filter === 'complete') return Boolean(r.checkInISO && r.checkOutISO);
        if (filter === 'open') return Boolean(r.checkInISO && !r.checkOutISO);
        return true;
      }),
    [records, filter]
  );

  if (!user) return <Redirect href="/login" />;

  return (
    <Screen
      title="My history"
      subtitle={`${records.length} day${records.length === 1 ? '' : 's'} on record`}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
    >
      <View style={styles.stats}>
        <StatTile label="Days" value={stats.days} icon="calendar-outline" />
        <StatTile label="Complete" value={stats.complete} icon="checkmark-done-outline" tone="success" />
        <StatTile
          label="Avg / day"
          value={stats.average === null ? '--' : formatHours(stats.average)}
          icon="timer-outline"
          tone="primary"
        />
      </View>

      <View style={styles.filters}>
        {(
          [
            { key: 'all', label: 'All' },
            { key: 'complete', label: 'Complete' },
            { key: 'open', label: 'Still clocked in' },
          ] as { key: Filter; label: string }[]
        ).map((f) => (
          <Pressable
            key={f.key}
            accessibilityRole="button"
            accessibilityState={{ selected: filter === f.key }}
            onPress={() => setFilter(f.key)}
            style={[styles.chip, filter === f.key && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.key && styles.chipTextActive]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : visible.length === 0 ? (
        <EmptyState
          icon="calendar-clear-outline"
          title="Nothing here yet"
          message={
            records.length === 0
              ? 'Scan the office code to start building your attendance record.'
              : 'No days match this filter.'
          }
        />
      ) : (
        <Card style={styles.list}>
          {visible.map((record, index) => (
            <RecordRow key={record.id} record={record} last={index === visible.length - 1} />
          ))}
        </Card>
      )}
    </Screen>
  );
}

function RecordRow({ record, last }: { record: AttendanceRecord; last: boolean }) {
  const hours = hoursBetween(record.checkInISO, record.checkOutISO);
  const done = Boolean(record.checkInISO && record.checkOutISO);

  return (
    <View style={[styles.row, !last && styles.rowBorder]}>
      <View style={styles.rowDate}>
        <Text style={styles.rowDay}>{record.date.slice(8, 10)}</Text>
        <Text style={styles.rowMonth}>{record.date.slice(5, 7)}</Text>
      </View>

      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{formatShortDate(record.date)}</Text>
        <View style={styles.rowMeta}>
          <Ionicons name="log-in-outline" size={13} color={colors.textMuted} />
          <Text style={styles.rowMetaText}>{formatTime(record.checkInISO)}</Text>
          <Ionicons name="log-out-outline" size={13} color={colors.textMuted} />
          <Text style={styles.rowMetaText}>{formatTime(record.checkOutISO)}</Text>
        </View>
        {record.officeName ? (
          <Text style={styles.rowOffice} numberOfLines={1}>
            {record.officeName}
          </Text>
        ) : null}
      </View>

      <View style={styles.rowRight}>
        <Text style={[styles.rowHours, !done && styles.rowHoursOpen]}>
          {done ? formatHours(hours) : 'Open'}
        </Text>
        <Badge label={done ? 'Done' : 'In'} tone={done ? 'success' : 'warning'} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  filters: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...typography.muted, fontWeight: '600' },
  chipTextActive: { color: colors.white },
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  list: { padding: 0, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowDate: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowDay: { fontSize: 17, fontWeight: '800', color: colors.primaryDark, lineHeight: 20 },
  rowMonth: { fontSize: 10, fontWeight: '700', color: colors.primaryDark, textTransform: 'uppercase' },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowMetaText: { ...typography.muted, marginRight: spacing.sm },
  rowOffice: { ...typography.muted, fontSize: 11 },
  rowRight: { alignItems: 'flex-end', gap: 4 },
  rowHours: { fontSize: 14, fontWeight: '800', color: colors.success },
  rowHoursOpen: { color: colors.warning },
});
