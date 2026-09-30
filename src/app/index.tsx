import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Button, Card } from '@/components/ui';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/lib/auth';
import { COMPANY_NAME, isFirebaseConfigured } from '@/lib/firebase';
import { colors, radius, shadow, spacing, typography } from '@/theme';

const FEATURES = [
  {
    icon: 'scan' as const,
    title: 'Scan to sign in',
    body: 'Hold your phone over the code on the office door when you arrive.',
  },
  {
    icon: 'scan-circle' as const,
    title: 'Scan again to leave',
    body: 'One code for both directions. The second scan of the day signs you out.',
  },
  {
    icon: 'grid' as const,
    title: 'Instant timesheets',
    body: 'Your manager exports the whole office to Excel whenever they need it.',
  },
];

export default function HomeScreen() {
  const { user, initialising } = useAuth();
  const router = useRouter();

  // A signed-in user has no business on the marketing screen.
  useEffect(() => {
    if (!initialising && user) router.replace('/dashboard');
  }, [initialising, user, router]);

  if (initialising) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (user) return <Redirect href="/dashboard" />;

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="qr-code" size={20} color={colors.white} />
        </View>
        <Text style={styles.brand}>{COMPANY_NAME}</Text>
        <Text style={styles.tagline}>Office attendance, one scan away.</Text>
      </View>

      <Card style={styles.card}>
        {FEATURES.map((f) => (
          <View key={f.title} style={styles.feature}>
            <View style={styles.featureIcon}>
              <Ionicons name={f.icon} size={18} color={colors.primary} />
            </View>
            <View style={styles.featureText}>
              <Text style={styles.featureTitle}>{f.title}</Text>
              <Text style={styles.featureBody}>{f.body}</Text>
            </View>
          </View>
        ))}
      </Card>

      {!isFirebaseConfigured ? (
        <View style={styles.setupNotice}>
          <Ionicons name="warning" size={16} color={colors.warning} />
          <Text style={styles.setupText}>
            Firebase is not configured yet. Copy <Text style={styles.mono}>.env.example</Text> to{' '}
            <Text style={styles.mono}>.env</Text>, add your project values, then restart the dev
            server.
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button label="Sign in" size="sm" style={styles.flexBtn} onPress={() => router.push('/login')} />
        <Button
          label="Create account"
          variant="secondary"
          size="sm"
          style={styles.flexBtn}
          onPress={() => router.push('/signup')}
        />
      </View>

      <Pressable onPress={() => router.push('/login')} style={styles.linkRow}>
        <Text style={styles.linkText}>Forgot your password?</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: 8 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  hero: { alignItems: 'center', gap: spacing.xs },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.raised,
  },
  brand: { ...typography.h2, fontSize: 20 },
  tagline: { ...typography.body, color: colors.textMuted, textAlign: 'center' },
  card: { gap: 8, padding: 10 },
  feature: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  featureIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { flex: 1, gap: 2 },
  featureTitle: { ...typography.h3, fontSize: 14 },
  featureBody: { ...typography.muted, fontSize: 12 },
  setupNotice: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  setupText: { flex: 1, ...typography.muted, color: colors.warning },
  mono: { fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) },
  actions: { flexDirection: 'row', gap: spacing.sm },
  flexBtn: { flex: 1 },
  linkRow: { alignItems: 'center', paddingVertical: 2 },
  linkText: { ...typography.muted, textDecorationLine: 'underline' },
});
