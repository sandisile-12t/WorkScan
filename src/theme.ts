export const colors = {
  primary: '#208AEF',
  primaryDark: '#1565C0',
  primarySoft: '#E6F4FE',
  success: '#1BA672',
  successSoft: '#E4F6EF',
  warning: '#C77700',
  warningSoft: '#FFF3E0',
  danger: '#D93025',
  dangerSoft: '#FDECEA',
  text: '#11181C',
  textMuted: '#5C6B75',
  border: '#E1E7EC',
  surface: '#FFFFFF',
  background: '#F5F8FA',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 30, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.text },
  h3: { fontSize: 17, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted },
} as const;

/**
 * `boxShadow` is the cross-platform replacement for the legacy `shadow*` props
 * and `elevation`, which React Native Web has deprecated. It is supported on
 * iOS, Android and web in RN 0.86, so a single declaration covers every target.
 */
export const shadow = {
  card: {
    boxShadow: '0px 4px 12px rgba(11, 27, 43, 0.07)',
  },
  raised: {
    boxShadow: '0px 8px 18px rgba(11, 27, 43, 0.14)',
  },
} as const;
