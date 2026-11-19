import { Redirect } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { Banner, Button, Card, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { colors, spacing, typography } from '@/theme';

type WorkingAction = 'name' | 'email' | 'password-reset' | null;
type Feedback = { tone: 'success' | 'error'; message: string } | null;

export default function SettingsScreen() {
  const { user, updateName, requestEmailChange, resetPassword } = useAuth();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [newEmail, setNewEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [working, setWorking] = useState<WorkingAction>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  if (!user) return <Redirect href="/login" />;

  const saveName = async () => {
    setWorking('name');
    setFeedback(null);
    try {
      await updateName(fullName);
      setFullName(fullName.trim());
      setFeedback({ tone: 'success', message: 'Your name has been updated.' });
    } catch (error) {
      setFeedback({ tone: 'error', message: (error as Error).message });
    } finally {
      setWorking(null);
    }
  };

  const sendEmailVerification = async () => {
    setWorking('email');
    setFeedback(null);
    try {
      await requestEmailChange(newEmail, currentPassword);
      setFeedback({
        tone: 'success',
        message: `Check ${newEmail.trim()} and follow the verification link. Then sign out and sign in with the new email.`,
      });
      setNewEmail('');
      setCurrentPassword('');
    } catch (error) {
      setFeedback({ tone: 'error', message: (error as Error).message });
    } finally {
      setWorking(null);
    }
  };

  const sendPasswordReset = async () => {
    setWorking('password-reset');
    setFeedback(null);
    try {
      await resetPassword(user.email);
      setFeedback({
        tone: 'success',
        message: `If an account exists for ${user.email}, a password reset link is on its way.`,
      });
    } catch (error) {
      setFeedback({ tone: 'error', message: (error as Error).message });
    } finally {
      setWorking(null);
    }
  };

  return (
    <Screen title="Settings" subtitle="Your account" onBack>
      {feedback ? <Banner tone={feedback.tone} message={feedback.message} /> : null}

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Profile</Text>
        <Field
          label="Full name"
          icon="person-outline"
          value={fullName}
          onChangeText={setFullName}
          autoCapitalize="words"
          autoComplete="name"
          returnKeyType="done"
          onSubmitEditing={saveName}
        />
        <Button
          label="Save name"
          onPress={saveName}
          loading={working === 'name'}
          disabled={Boolean(working) || !fullName.trim() || fullName.trim() === user.fullName}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Account details</Text>
        <Detail label="Email" value={user.email} />
        <Detail label="Employee number" value={user.employeeId || 'Not assigned'} />
        <Detail label="Role" value={user.role === 'admin' ? 'Manager' : 'Employee'} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Change email</Text>
        <Text style={styles.note}>
          We’ll verify the new address before changing your sign-in email. Enter your current password
          to continue.
        </Text>
        <Field
          label="New email"
          icon="mail-outline"
          placeholder="name@company.com"
          value={newEmail}
          onChangeText={setNewEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          returnKeyType="next"
        />
        <Field
          label="Current password"
          icon="lock-closed-outline"
          value={currentPassword}
          onChangeText={setCurrentPassword}
          autoCapitalize="none"
          autoComplete="current-password"
          secureTextEntry
          returnKeyType="go"
          onSubmitEditing={sendEmailVerification}
        />
        <Button
          label="Send verification email"
          variant="secondary"
          icon="mail-outline"
          onPress={sendEmailVerification}
          loading={working === 'email'}
          disabled={Boolean(working) || !newEmail.trim() || !currentPassword}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.sectionTitle}>Password</Text>
        <Text style={styles.note}>We’ll send a password reset link to your current email address.</Text>
        <Button
          label="Send password reset link"
          variant="secondary"
          icon="key-outline"
          onPress={sendPasswordReset}
          loading={working === 'password-reset'}
          disabled={Boolean(working) || !user.email}
        />
      </Card>
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.md },
  sectionTitle: { ...typography.h3 },
  note: { ...typography.muted, color: colors.textMuted },
  detail: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  detailLabel: { ...typography.muted },
  detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, flexShrink: 1, textAlign: 'right' },
});
