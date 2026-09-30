import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, spacing, typography } from '@/theme';

type ScreenProps = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  onBack?: boolean;
  /** Pinned below the scroll area, e.g. a primary action. */
  footer?: ReactNode;
  headerRight?: ReactNode;
  scroll?: boolean;
  /** Shows the vertical scroll indicator whenever the content overflows. */
  scrollbar?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Enables pull-to-refresh and shows a spinner while `true`. */
  onRefresh?: () => void;
  refreshing?: boolean;
};

export function Screen({
  children,
  title,
  subtitle,
  onBack,
  footer,
  headerRight,
  scroll = true,
  scrollbar = true,
  contentStyle,
  padded = true,
  onRefresh,
  refreshing = false,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const header = title ? (
    <View style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          onPress={goBack}
          hitSlop={10}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
      ) : null}
      <View style={styles.headerText}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {headerRight ? <View style={styles.headerRight}>{headerRight}</View> : null}
    </View>
  ) : null;

  // Only the top inset belongs on the header. The bottom safe-area inset is applied
  // at the end of the screen (scroll content or footer) — putting it on this
  // header-only container rendered it as a dead band between title and content.
  const headerInset = { paddingTop: insets.top };

  // A screen with no title renders no header band, so the top inset moves onto the
  // body. Previously the header wrapper always used `flex: 1`, so on title-less
  // screens it claimed half the viewport as an empty band that no padding change
  // could shrink.
  const bodyInset = header ? undefined : { paddingTop: Math.max(insets.top, spacing.md) };

  const bottomInset = footer
    ? undefined
    : { paddingBottom: Math.max(insets.bottom, spacing.md) };

  const body = scroll ? (
    <ScrollView
      style={[styles.flex, bodyInset]}
      contentContainerStyle={[styles.scrollContent, padded && styles.padded, bottomInset, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={scrollbar}
      indicatorStyle={scrollbar && Platform.OS === 'ios' ? 'default' : undefined}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} /> : undefined
      }
    >
      {children}
    </ScrollView>
  ) : (
      <View style={[styles.flex, padded && styles.padded, bottomInset, contentStyle, bodyInset]}>
        {children}
      </View>
  );

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      {header ? <View style={[styles.headerBand, headerInset]}>{header}</View> : null}
      {body}
      {footer ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  headerBand: { backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: typography.h2,
  subtitle: typography.muted,
  scrollContent: { flexGrow: 1 },
  padded: { paddingHorizontal: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
});
