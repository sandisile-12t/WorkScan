import { Ionicons } from '@expo/vector-icons';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Badge, Banner, Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getTodayRecord, type AttendanceRecord } from '@/lib/attendance';
import { COMPANY_NAME } from '@/lib/firebase';
import { formatHours, formatLongDate, formatTime, hoursBetween, todayKey } from '@/lib/date';
import { colors, radius, spacing, typography } from '@/theme';

export default function DashboardScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [record, setRecord] = useState<AttendanceRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setRecord(await getTodayRecord(user.uid));
    } catch (error) {
      console.warn('[workscan] could not load today', error);
      Alert.alert('Could not load today', (error as Error).message);
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

  if (!user) return <Redirect href="/login" />;

  const hours = hoursBetween(record?.checkInISO ?? null, record?.checkOutISO ?? null);
  const state = !record
    ? { tone: 'muted' as const, label: 'Not scanned', icon: 'time-outline' as const }
    : record.checkOutISO
      ? { tone: 'muted' as const, label: 'Day complete', icon: 'checkmark-done' as const }
      : { tone: 'success' as const, label: 'Clocked in', icon: 'ellipse' as const };

  const confirmSignOut = () => {
    Alert.alert('Sign out?', 'You will need your email and password to sign back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  };

  return (
    <Screen
      title={`Hi, ${firstName(user.fullName)}`}
      subtitle={formatLongDate(todayKey())}
      onRefresh={() => {
        setRefreshing(true);
        load();
      }}
      refreshing={refreshing}
      headerRight={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          hitSlop={8}
          onPress={confirmSignOut}
          style={styles.iconBtn}
        >
          <Ionicons name="log-out-outline" size={19} color={colors.text} />
        </Pressable>
      }
    >
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials(user.fullName)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name}>{user.fullName || 'Your name'}</Text>
          <Text style={styles.meta}>
            {user.employeeId || 'No employee number'} · {user.email}
          </Text>
        </View>
        <Badge label={user.role === 'admin' ? 'Manager' : 'Employee'} tone={user.role === 'admin' ? 'warning' : 'muted'} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <Card style={[styles.punchCard, state.tone === 'success' && styles.punchCardLive]}>
          <View style={styles.punchHeader}>
            <Ionicons name={state.icon} size={16} color={state.tone === 'success' ? colors.success : colors.textMuted} />
            <Text style={styles.punchTitle}>Today</Text>
            <Badge label={state.label} tone={state.tone === 'success' ? 'success' : 'muted'} />
          </View>

          <View style={styles.times}>
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Signed in</Text>
              <Text style={styles.timeValue}>{formatTime(record?.checkInISO)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Signed out</Text>
              <Text style={styles.timeValue}>{formatTime(record?.checkOutISO)}</Text>
            </View>
            <View style={styles.timeDivider} />
            <View style={styles.timeBlock}>
              <Text style={styles.timeLabel}>Hours</Text>
              <Text style={styles.timeValue}>{formatHours(hours)}</Text>
            </View>
          </View>
        </Card>
      )}

      <View style={styles.actions}>
        <Button
          label={record && !record.checkOutISO ? 'Scan again to sign out' : 'Scan the office code'}
          icon="scan"
          onPress={() => router.push('/scan')}
        />
        <View style={styles.actionRow}>
          <Button
            label="My history"
            variant="secondary"
            icon="time-outline"
            style={styles.flexBtn}
            onPress={() => router.push('/history')}
          />
          {user.role === 'admin' ? (
            <Button
              label="Admin"
              variant="secondary"
              icon="stats-chart"
              style={styles.flexBtn}
              onPress={() => router.push('/admin')}
            />
          ) : null}
        </View>
      </View>

      {user.role !== 'admin' ? (
        <Banner
          tone="info"
          icon="information-circle-outline"
          message="Your manager downloads the office spreadsheet. You can always review your own scans under My history."
        />
      ) : null}

      <Card style={styles.footerCard}>
        <View style={styles.footerRow}>
          <Ionicons name="business-outline" size={18} color={colors.primary} />
          <View style={styles.flex}>
            <Text style={styles.footerTitle}>{COMPANY_NAME}</Text>
            <Text style={styles.footerBody}>
              Scan the code printed by your manager each time you enter or leave the office.
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] || 'there';

const initials = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 12 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '800', fontSize: 16 },
  identityText: { flex: 1, gap: 2 },
  name: { ...typography.h3 },
  meta: { ...typography.muted },
  loading: { paddingVertical: spacing.lg, alignItems: 'center' },
  punchCard: { gap: spacing.sm },
  punchCardLive: { borderColor: colors.success },
  punchHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  punchTitle: { ...typography.h3, flex: 1 },
  times: { flexDirection: 'row', alignItems: 'center' },
  timeBlock: { flex: 1, alignItems: 'center', gap: 2 },
  timeDivider: { width: 1, height: 26, backgroundColor: colors.border },
  timeLabel: { ...typography.label, textTransform: 'uppercase', letterSpacing: 0.5 },
  timeValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  actions: { gap: spacing.xs, marginVertical: 12 },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  footerCard: { marginTop: spacing.xs },
  footerRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  footerTitle: { ...typography.h3, fontSize: 15 },
  footerBody: { ...typography.muted },
});
