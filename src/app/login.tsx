import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMPANY_NAME, isFirebaseConfigured } from '@/lib/firebase';
import { colors, radius, spacing, typography } from '@/theme';

type Mode = 'sign-in' | 'reset';

export default function LoginScreen() {
  const { user, signIn, resetPassword } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  if (user) return <Redirect href="/dashboard" />;

  const isReset = mode === 'reset';
  const emailError = touched && !email.trim() ? 'Enter your work email address' : null;
  const passwordError = touched && password.length < 8 ? 'Passwords are at least 8 characters' : null;
  const canSubmit = !busy && email.trim().length > 0 && (!isReset || password.length >= 8);

  const handleSignIn = async () => {
    setTouched(true);
    if (busy || !email.trim() || password.length < 8) return;

    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async () => {
    setTouched(true);
    if (busy || !email.trim()) return;

    setBusy(true);
    setError(null);
    try {
      await resetPassword(email);
      setNotice(`If an account exists for ${email.trim()}, a reset link is on its way.`);
      setMode('sign-in');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen onBack title={isReset ? 'Reset password' : 'Welcome back'} subtitle={COMPANY_NAME}>
      <View style={styles.hero}>
        <View style={styles.logo}>
          <Ionicons name="finger-print" size={28} color={colors.white} />
        </View>
      </View>

      <Text style={styles.lead}>
        {isReset
          ? 'Enter your work email and we will send you a link to choose a new password.'
          : 'Sign in to scan in and out of the office.'}
      </Text>

      {error ? <Banner tone="error" message={error} /> : null}
      {notice ? <Banner tone="success" message={notice} /> : null}
      {!isFirebaseConfigured ? (
        <Banner
          tone="warning"
          message="Firebase is not configured. Add your EXPO_PUBLIC_FIREBASE_* values to a .env file and restart the dev server."
        />
      ) : null}

      <View style={styles.form}>
        <Field
          ref={emailRef}
          label="Work email"
          icon="mail-outline"
          placeholder="johndoe@company.co.za"
          value={email}
          onChangeText={(t) => {
            setEmail(t);
            setError(null);
          }}
          onSubmitEditing={() => (isReset ? handleReset() : passwordRef.current?.focus())}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType={isReset ? 'send' : 'next'}
          textContentType="emailAddress"
        />

        {isReset ? null : (
          <Field
            ref={passwordRef}
            label="Password"
            icon="lock-closed-outline"
            placeholder="At least 8 characters"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            onSubmitEditing={handleSignIn}
            error={passwordError}
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            secureTextEntry={secure}
            accessory={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={secure ? 'Show password' : 'Hide password'}
                hitSlop={8}
                onPress={() => setSecure((s) => !s)}
              >
                <Ionicons
                  name={secure ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={colors.textMuted}
                />
              </Pressable>
            }
          />
        )}

        {isReset ? null : (
          <View style={styles.rowBetween}>
            <Text style={styles.hint}>Passwords are case sensitive.</Text>
            <Text
              accessibilityRole="button"
              style={styles.link}
              onPress={() => {
                setMode('reset');
                setError(null);
                setNotice(null);
              }}
            >
              Forgot password?
            </Text>
          </View>
        )}
      </View>

      <View style={styles.submit}>
        <Button
          label={isReset ? 'Send reset link' : 'Sign in'}
          icon={isReset ? 'mail-outline' : 'log-in-outline'}
          onPress={isReset ? handleReset : handleSignIn}
          loading={busy}
          disabled={!canSubmit}
        />

        <Button
          label={isReset ? 'Back to sign in' : 'Create an account'}
          variant="ghost"
          icon={isReset ? 'arrow-back' : 'person-add-outline'}
          onPress={() => {
            setError(null);
            setNotice(null);
            if (isReset) {
              setMode('sign-in');
            } else {
              router.push('/signup');
            }
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.md },
  logo: {
    width: 60,
    height: 60,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  form: { gap: spacing.xs, marginTop: spacing.md },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  hint: { ...typography.muted },
  link: { ...typography.muted, color: colors.primary, fontWeight: '700' },
  submit: { marginTop: spacing.lg, gap: spacing.sm },
});
