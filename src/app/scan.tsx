import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/Screen';
import { Banner, Button } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { recordScan, ScanError, type ScanOutcome } from '@/lib/attendance';
import { formatTime } from '@/lib/date';
import { colors, radius, spacing, typography } from '@/theme';

type Feedback =
  | { tone: 'success' | 'error' | 'warning'; title: string; message: string; outcome?: ScanOutcome };

export default function ScanScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  // A scan is one-shot: without this guard the camera fires the callback many
  // times per second while the code is still in frame.
  const locked = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    locked.current = false;
  }, [feedback]);

  const handleScan = useCallback(
    async (result: BarcodeScanningResult) => {
      if (!user || locked.current || busy) return;
      locked.current = true;
      setBusy(true);

      try {
        const outcome = await recordScan(user, result.data);

        if (!mounted.current) return;

        if (outcome.kind === 'check-in') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setFeedback({
            tone: 'success',
            title: 'Signed in',
            message: `Welcome in. Signed in at ${formatTime(outcome.record.checkInISO)}. Scan again to sign out.`,
            outcome,
          });
        } else if (outcome.kind === 'check-out') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setFeedback({
            tone: 'success',
            title: 'Signed out',
            message: `Signed out at ${formatTime(outcome.record.checkOutISO)}. See you tomorrow!`,
            outcome,
          });
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          setFeedback({
            tone: 'warning',
            title: 'Already complete',
            message: 'You have already signed in and out today. Nothing more to do.',
            outcome,
          });
        }
      } catch (error) {
        if (!mounted.current) return;

        if (error instanceof ScanError) {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setFeedback({ tone: 'error', title: 'Code not accepted', message: error.message });
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setFeedback({
            tone: 'error',
            title: 'Something went wrong',
            message: (error as Error).message || 'Please try again.',
          });
        }
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [user, busy]
  );

  if (!user) return <Redirect href="/login" />;

  if (!permission) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <Screen onBack title="Camera access needed" subtitle="To scan the office code">
        <View style={styles.permBlock}>
          <View style={styles.permIcon}>
            <Ionicons name="camera-outline" size={30} color={colors.primary} />
          </View>
          <Text style={styles.permTitle}>Allow camera access</Text>
          <Text style={styles.permBody}>
            WorkScan uses the camera only to read the QR code on the office door. No photos or video
            are stored.
          </Text>
          <Button label="Allow camera" icon="camera" onPress={() => requestPermission()} />
          {!permission.canAskAgain ? (
            <Banner
              tone="warning"
              message="Camera access was permanently denied. Enable it in your phone settings to continue."
            />
          ) : null}
        </View>
      </Screen>
    );
  }

  if (feedback) {
    const toneColor = {
      success: colors.success,
      error: colors.danger,
      warning: colors.warning,
    }[feedback.tone];

    return (
      <Screen
        title="Scan result"
        footer={
          <>
            <Button
              label="Scan again"
              icon="scan"
              onPress={() => {
                setFeedback(null);
                locked.current = false;
              }}
            />
            <Button
              label="Back to dashboard"
              variant="ghost"
              icon="home-outline"
              onPress={() => router.replace('/dashboard')}
            />
          </>
        }
        scroll
      >
        <View style={styles.resultBlock}>
          <View style={[styles.resultIcon, { backgroundColor: `${toneColor}1A` }]}>
            <Ionicons
              name={
                feedback.tone === 'success'
                  ? 'checkmark-circle'
                  : feedback.tone === 'warning'
                    ? 'alert-circle'
                    : 'close-circle'
              }
              size={44}
              color={toneColor}
            />
          </View>
          <Text style={[styles.resultTitle, { color: toneColor }]}>{feedback.title}</Text>
          <Text style={styles.resultMessage}>{feedback.message}</Text>

          {feedback.outcome ? (
            <View style={styles.resultCard}>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Signed in</Text>
                <Text style={styles.resultValue}>
                  {formatTime(feedback.outcome.record.checkInISO)}
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Signed out</Text>
                <Text style={styles.resultValue}>
                  {formatTime(feedback.outcome.record.checkOutISO)}
                </Text>
              </View>
              <View style={styles.resultRow}>
                <Text style={styles.resultLabel}>Office</Text>
                <Text style={styles.resultValue}>{feedback.outcome.record.officeName}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={busy ? undefined : handleScan}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <View style={{ height: insets.top + spacing.md }} />

        <View style={styles.frameWrap} pointerEvents="none">
          <View style={styles.frame} />
          <Text style={styles.hint}>
            {busy ? 'Checking the code…' : 'Point at the QR code on the office door'}
          </Text>
        </View>

        <View style={styles.controls} pointerEvents="box-none">
          <View style={styles.statusPill}>
            {busy ? <ActivityIndicator size="small" color={colors.white} /> : null}
            <Text style={styles.statusText}>
              {busy ? 'Recording your scan' : 'Ready to scan'}
            </Text>
          </View>

          <View style={[styles.controlRow, { paddingBottom: insets.bottom }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={torch ? 'Turn the torch off' : 'Turn the torch on'}
              onPress={() => setTorch((t) => !t)}
              style={[styles.control, torch && styles.controlOn]}
            >
              <Ionicons name="flashlight" size={22} color={torch ? colors.white : colors.text} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close the scanner"
              onPress={() => router.back()}
              style={styles.control}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  frameWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  frame: {
    width: 230,
    height: 230,
    borderRadius: radius.lg,
    borderWidth: 3,
    borderColor: colors.white,
  },
  hint: {
    color: colors.white,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
  controls: { padding: spacing.lg, gap: spacing.md, alignItems: 'center' },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  statusText: { color: colors.white, fontSize: 13, fontWeight: '600' },
  controlRow: { flexDirection: 'row', gap: spacing.md },
  control: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlOn: { backgroundColor: colors.primary },

  permBlock: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.xl },
  permIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permTitle: { ...typography.h2 },
  permBody: { ...typography.body, color: colors.textMuted, textAlign: 'center' },

  resultBlock: { alignItems: 'center', gap: spacing.md, paddingTop: spacing.lg },
  resultIcon: { width: 88, height: 88, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  resultTitle: { ...typography.h1 },
  resultMessage: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  resultCard: {
    alignSelf: 'stretch',
    marginTop: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resultLabel: { ...typography.muted },
  resultValue: { fontSize: 15, fontWeight: '700', color: colors.text },
});
