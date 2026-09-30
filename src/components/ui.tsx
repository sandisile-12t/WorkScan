import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, radius, shadow, spacing, typography } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  fullWidth?: boolean;
  size?: 'md' | 'sm';
};

const VARIANTS: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
  secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
  success: { bg: colors.success, fg: colors.white, border: colors.success },
  danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  ghost: { bg: 'transparent', fg: colors.textMuted, border: colors.border },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  loading = false,
  disabled = false,
  style,
  fullWidth = true,
  size = 'md',
}: ButtonProps) {
  const tone = VARIANTS[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: tone.bg, borderColor: tone.border },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.buttonPressed,
        isDisabled && styles.buttonDisabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={tone.fg} size="small" />
      ) : (
        <>
            {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 18} color={tone.fg} /> : null}
            <Text style={[size === 'sm' ? styles.buttonLabelSm : styles.buttonLabel, { color: tone.fg }]}>
              {label}
            </Text>
        </>
      )}
    </Pressable>
  );
}

type FieldProps = TextInputProps & {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  error?: string | null;
  hint?: string;
  /** Trailing control, e.g. a show/hide password button. */
  accessory?: React.ReactNode;
};

export const Field = forwardRef<TextInput, FieldProps>(function Field(
  { label, icon, error, hint, accessory, style, ...inputProps },
  ref
) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.inputShell, !!error && styles.inputShellError]}>
        {icon ? (
          <Ionicons
            name={icon}
            size={18}
            color={error ? colors.danger : colors.textMuted}
            style={styles.inputIcon}
          />
        ) : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, style]}
          {...inputProps}
        />
        {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
      </View>
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : hint ? (
        <Text style={styles.fieldHint}>{hint}</Text>
      ) : null}
    </View>
  );
});

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Banner({
  tone,
  message,
  icon,
}: {
  tone: 'info' | 'success' | 'error' | 'warning';
  message: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const map = {
    info: { bg: colors.primarySoft, fg: colors.primaryDark, fallback: 'information-circle' as const },
    success: { bg: colors.successSoft, fg: colors.success, fallback: 'checkmark-circle' as const },
    error: { bg: colors.dangerSoft, fg: colors.danger, fallback: 'alert-circle' as const },
    warning: { bg: colors.warningSoft, fg: colors.warning, fallback: 'warning' as const },
  }[tone];

  return (
    <View style={[styles.banner, { backgroundColor: map.bg }]}>
      <Ionicons name={icon ?? map.fallback} size={18} color={map.fg} />
      <Text style={[styles.bannerText, { color: map.fg }]}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
}) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyMessage}>{message}</Text>
    </View>
  );
}

export function StatTile({
  label,
  value,
  tone = 'primary',
  icon,
}: {
  label: string;
  value: string | number;
  tone?: 'primary' | 'success' | 'warning' | 'danger';
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const fg = colors[tone];
  return (
    <View style={styles.tile}>
      <View style={[styles.tileIcon, { backgroundColor: `${fg}1A` }]}>
        <Ionicons name={icon} size={18} color={fg} />
      </View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

export function Badge({ label, tone }: { label: string; tone: 'success' | 'warning' | 'muted' }) {
  const map = {
    success: { bg: colors.successSoft, fg: colors.success },
    warning: { bg: colors.warningSoft, fg: colors.warning },
    muted: { bg: colors.background, fg: colors.textMuted },
  }[tone];

  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  button: {
    // 46 still clears the 44pt minimum touch target from the WCAG/iOS
    // guidelines, so this is as tight as accessibility allows.
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  buttonSm: { minHeight: 44, paddingHorizontal: 12, gap: 6 },
  fullWidth: { alignSelf: 'stretch' },
  buttonPressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  buttonDisabled: { opacity: 0.5 },
  buttonLabel: { fontSize: 16, fontWeight: '700' },
  buttonLabelSm: { fontSize: 14, fontWeight: '700' },

  fieldWrap: { gap: spacing.xs, marginBottom: spacing.md },
  fieldLabel: { ...typography.label, textTransform: 'uppercase', letterSpacing: 0.6 },
  inputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  inputShellError: { borderColor: colors.danger },
  inputIcon: { marginRight: spacing.sm },
  accessory: { marginLeft: spacing.sm },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
  },
  fieldError: { ...typography.muted, color: colors.danger },
  fieldHint: { ...typography.muted },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow.card,
  },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },

  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.h3 },
  emptyMessage: { ...typography.muted, textAlign: 'center', paddingHorizontal: spacing.lg },

  tile: {
    flex: 1,
    minWidth: 96,
    gap: 2,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  tileIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  tileValue: { fontSize: 24, fontWeight: '800', color: colors.text },
  tileLabel: { ...typography.muted },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
});
