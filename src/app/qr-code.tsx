import * as Clipboard from 'expo-clipboard';
import * as Print from 'expo-print';
import { Redirect, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { Screen } from '@/components/Screen';
import { Banner, Button, Card } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import {
  DEFAULT_OFFICE_FALLBACK,
  ensureOffice,
  getOfficeCode,
  listOffices,
  regenerateOfficeCode,
  type Office,
  type OfficeCodeState,
} from '@/lib/attendance';
import { COMPANY_NAME } from '@/lib/firebase';
import { formatLongDate } from '@/lib/date';
import { qrSvgMarkup } from '@/lib/qrSvg';
import { colors, radius, spacing, typography } from '@/theme';

export default function QrCodeScreen() {
  const { user } = useAuth();

  const [offices, setOffices] = useState<Office[]>([]);
  const [officeId, setOfficeId] = useState<string | null>(null);
  const [code, setCode] = useState<OfficeCodeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const load = useCallback(
    async (target?: string) => {
      try {
        const list = await listOffices();
        if (list.length === 0) list.push(await ensureOffice(DEFAULT_OFFICE_FALLBACK));
        setOffices(list);

        const chosen = target ?? officeId ?? list[0]?.id;
        if (!chosen) return;
        setOfficeId(chosen);
        setCode(await getOfficeCode(chosen));
      } catch (error) {
        Alert.alert('Could not load the office code', (error as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [officeId]
  );

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!user) return <Redirect href="/login" />;
  if (user.role !== 'admin') return <Redirect href="/dashboard" />;

  const regenerate = () => {
    if (!officeId) return;
    Alert.alert(
      'Replace this code?',
      'The current QR code stops working immediately. Any code already printed for today will be rejected.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          style: 'destructive',
          onPress: async () => {
            setWorking(true);
            try {
              setCode(await regenerateOfficeCode(officeId));
            } catch (error) {
              Alert.alert('Could not replace the code', (error as Error).message);
            } finally {
              setWorking(false);
            }
          },
        },
      ]
    );
  };

  const printSheet = async () => {
    if (!code) return;
    setWorking(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: printHtml(code) });
      await Print.printAsync({ uri });
    } catch (error) {
      Alert.alert('Could not open the print dialog', (error as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const copyPayload = async () => {
    if (!code) return;
    await Clipboard.setStringAsync(code.payload);
    Alert.alert('Copied', 'The raw code has been copied to your clipboard.');
  };

  return (
    <Screen
      title="Office QR code"
      subtitle="Print this and put it by the door"
      onBack
      footer={
        <>
          <Button label="Print or save as PDF" icon="print-outline" onPress={printSheet} disabled={!code || working} />
          <Button
            label="Replace today's code"
            variant="danger"
            icon="refresh"
            onPress={regenerate}
            loading={working}
            disabled={!code}
          />
        </>
      }
    >
      {offices.length > 1 ? (
        <View style={styles.officeRow}>
          {offices.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: o.id === officeId }}
              onPress={() => load(o.id)}
              style={[styles.officeChip, o.id === officeId && styles.officeChipActive]}
            >
              <Text style={[styles.officeChipText, o.id === officeId && styles.officeChipTextActive]}>
                {o.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading || !code ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <Card style={styles.qrCard}>
            <View style={styles.qrFrame}>
              <QRCode value={code.payload} size={230} backgroundColor={colors.white} color={colors.text} />
            </View>
            <Text style={styles.qrOffice}>{code.officeName}</Text>
            <Text style={styles.qrHint}>Staff scan this to sign in and out</Text>
          </Card>

          <Card style={styles.detailsCard}>
            <Detail label="Valid for" value={formatLongDate(code.date)} />
            <Detail label="Code" value={code.token} mono />
            <Detail label="Expires" value="Tonight — a new code is generated each day" />
          </Card>

          <Button
            label="Copy the code as text"
            variant="ghost"
            icon="copy-outline"
            onPress={copyPayload}
          />

          <Banner
            tone="info"
            icon="information-circle-outline"
            message="A new code is generated automatically every day. Use “Replace today's code” if the printed copy is damaged or falls into the wrong hands."
          />
        </>
      )}
    </Screen>
  );
}

const Detail = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <View style={styles.detail}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={[styles.detailValue, mono && styles.detailMono]}>{value}</Text>
  </View>
);

const printHtml = (code: OfficeCodeState) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${COMPANY_NAME} office code</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; text-align: center; margin: 32px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  p { color: #5C6B75; margin: 4px 0; }
  .frame { display: inline-block; padding: 20px; border: 3px solid #11181C; border-radius: 20px; margin: 20px 0; }
  .token { font-family: Menlo, Consolas, monospace; font-size: 22px; letter-spacing: 2px; }
  .foot { margin-top: 28px; font-size: 12px; color: #5C6B75; }
</style></head>
<body>
  <h1>${COMPANY_NAME}</h1>
  <p>${code.officeName}</p>
  <div class="frame">${qrSvgMarkup(code.payload, { quietZone: 3 })}</div>
  <p class="token">${code.token}</p>
  <p>${formatLongDate(code.date)}</p>
  <p>Staff scan this code to sign in and out.</p>
  <p class="foot">A new code is generated each morning. This one stops working tonight.</p>
</body></html>`;

const styles = StyleSheet.create({
  loading: { paddingVertical: spacing.xl, alignItems: 'center' },
  officeRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  officeChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  officeChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  officeChipText: { ...typography.muted, fontWeight: '700' },
  officeChipTextActive: { color: colors.white },
  qrCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  qrFrame: {
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qrOffice: { ...typography.h2 },
  qrHint: { ...typography.muted },
  detailsCard: { gap: spacing.sm, marginTop: spacing.md, marginBottom: spacing.md },
  detail: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  detailLabel: { ...typography.muted },
  detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1, textAlign: 'right' },
  detailMono: { fontFamily: 'monospace' },
});
