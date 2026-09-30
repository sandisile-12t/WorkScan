import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { COMPANY_NAME, isFirebaseConfigured } from '@/lib/firebase';
import { colors, radius, spacing, typography } from '@/theme';

const ROLES = [
  { value: 'employee' as const, label: 'Employee', hint: 'I scan in and out each day' },
  { value: 'admin' as const, label: 'Manager', hint: 'I also need the dashboard and reports' },
];

export default function SignupScreen() {
  const { user, signUp } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState<'employee' | 'admin'>('employee');
  const [adminCode, setAdminCode] = useState('');
  const [secure, setSecure] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  if (user) return <Redirect href="/dashboard" />;

  const nameError = touched && !fullName.trim() ? 'Tell us your name' : null;
  const emailError = touched && !email.includes('@') ? 'Enter a valid work email' : null;
  const passwordError = touched && password.length < 8 ? 'Use at least 8 characters' : null;
  const confirmError = touched && confirm !== password ? 'Passwords do not match' : null;
  const codeError = touched && role === 'admin' && !adminCode.trim() ? 'Enter the code from your manager' : null;

  const canSubmit =
    !busy &&
    fullName.trim().length > 0 &&
    email.includes('@') &&
    password.length >= 8 &&
    confirm === password &&
    (role === 'employee' || adminCode.trim().length > 0);

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;

    setBusy(true);
    setError(null);
    try {
      await signUp({
        fullName,
        email,
        password,
        adminCode: role === 'admin' ? adminCode : undefined,
      });
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Screen onBack title="Create your account" subtitle={COMPANY_NAME}>
      <Text style={styles.lead}>
        Register once, then scan the code on the office door to sign in and out.
      </Text>

      {error ? <Banner tone="error" message={error} /> : null}
      {!isFirebaseConfigured ? (
        <Banner
          tone="warning"
          message="Firebase is not configured. Add your EXPO_PUBLIC_FIREBASE_* values to a .env file and restart the dev server."
        />
      ) : null}

      <View style={styles.form}>
        <Field
          label="Full name"
          icon="person-outline"
          placeholder="Sandisile Tshabalala"
          value={fullName}
          onChangeText={setFullName}
          onSubmitEditing={() => emailRef.current?.focus()}
          error={nameError}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="next"
        />

        <Field
          ref={emailRef}
          label="Work email"
          icon="mail-outline"
          placeholder="johndoe@company.co.za"
          value={email}
          onChangeText={setEmail}
          onSubmitEditing={() => passwordRef.current?.focus()}
          error={emailError}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
          textContentType="emailAddress"
        />

        <Field
          ref={passwordRef}
          label="Password"
          icon="lock-closed-outline"
          placeholder="At least 8 characters"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={() => confirmRef.current?.focus()}
          error={passwordError}
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="next"
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

        <Field
          ref={confirmRef}
          label="Confirm password"
          icon="checkmark-circle-outline"
          placeholder="Repeat your password"
          value={confirm}
          onChangeText={setConfirm}
          onSubmitEditing={handleSubmit}
          error={confirmError}
          autoCapitalize="none"
          autoComplete="new-password"
          returnKeyType="go"
          secureTextEntry={secure}
        />
      </View>

      <View style={styles.roleBlock}>
        <Text style={styles.roleLabel}>I am joining as</Text>
        <View style={styles.roleRow}>
          {ROLES.map((r) => {
            const active = role === r.value;
            return (
              <Pressable
                key={r.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                onPress={() => setRole(r.value)}
                style={[styles.roleOption, active && styles.roleOptionActive]}
              >
                <View style={[styles.radio, active && styles.radioActive]}>
                  {active ? <View style={styles.radioDot} /> : null}
                </View>
                <Text style={[styles.roleOptionLabel, active && styles.roleOptionLabelActive]}>
                  {r.label}
                </Text>
                <Text style={styles.roleHint}>{r.hint}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {role === 'admin' ? (
        <Field
          label="Manager code"
          icon="key-outline"
          placeholder="Provided by your company"
          value={adminCode}
          onChangeText={setAdminCode}
          onSubmitEditing={handleSubmit}
          error={codeError}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="go"
          hint={
            touched && !adminCode.trim()
              ? undefined
              : 'The first person to register always becomes a manager. Later managers need this code.'
          }
        />
      ) : null}

      <View style={styles.submit}>
        <Button
          label="Create account"
          icon="checkmark-circle-outline"
          onPress={handleSubmit}
          loading={busy}
          disabled={!canSubmit}
        />
        <Text style={styles.legal}>
          By creating an account you agree that your office scans are recorded for your employer.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { ...typography.body, color: colors.textMuted, marginBottom: spacing.lg },
  form: { gap: spacing.xs },
  roleBlock: { gap: spacing.sm, marginTop: spacing.md },
  roleLabel: { ...typography.label, textTransform: 'uppercase', letterSpacing: 0.6 },
  roleRow: { gap: spacing.sm },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  roleOptionActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  radio: {
    width: 20,
    height: 20,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioActive: { borderColor: colors.primary },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  roleOptionLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  roleOptionLabelActive: { color: colors.primaryDark },
  roleHint: { flex: 1, ...typography.muted, textAlign: 'right' },
  submit: { marginTop: spacing.lg, gap: spacing.md },
  legal: { ...typography.muted, textAlign: 'center' },
});
