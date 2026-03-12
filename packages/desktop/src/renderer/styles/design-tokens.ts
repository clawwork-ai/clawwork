/**
 * ClawWork Design Tokens
 *
 * Single source of truth for the design system.
 * CSS Variables in theme.css reference these same values.
 * Components use Tailwind classes that map to CSS Variables.
 */

export const colors = {
  neutral: {
    50: '#FAFAFA',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#2A2A2A',
    900: '#242424',
    950: '#1C1C1C',
  },
  accent: {
    50: '#ECFDF5',
    100: '#D1FAE5',
    200: '#A7F3D0',
    300: '#6EE7B7',
    400: '#34D399',
    500: '#0FFD0D',
    600: '#0DDC0B',
    700: '#0B8A0A',
    800: '#065F06',
    900: '#064E06',
    950: '#022C02',
  },
  danger: {
    400: '#F87171',
    500: '#EF4444',
    600: '#DC2626',
  },
  warning: {
    400: '#FBBF24',
    500: '#F59E0B',
  },
  info: {
    400: '#60A5FA',
    500: '#3B82F6',
  },
} as const

export const spacing = {
  0: '0px',
  0.5: '2px',
  1: '4px',
  1.5: '6px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const

export const radius = {
  none: '0px',
  sm: '4px',
  md: '6px',
  lg: '8px',
  xl: '12px',
  '2xl': '16px',
  full: '9999px',
} as const

export const typography = {
  fontFamily: {
    sans: "'Inter Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    mono: "'JetBrains Mono Variable', 'SF Mono', 'Fira Code', monospace",
  },
  fontSize: {
    xs: ['12px', { lineHeight: '16px' }],
    sm: ['13px', { lineHeight: '18px' }],
    base: ['14px', { lineHeight: '20px' }],
    md: ['15px', { lineHeight: '22px' }],
    lg: ['17px', { lineHeight: '24px' }],
    xl: ['19px', { lineHeight: '28px' }],
    '2xl': ['22px', { lineHeight: '30px' }],
    '3xl': ['26px', { lineHeight: '34px' }],
  },
  fontWeight: {
    normal: '400',
    medium: '500',
    semibold: '600',
    bold: '700',
  },
} as const

export const shadows = {
  sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
  md: '0 2px 8px rgba(0, 0, 0, 0.4)',
  lg: '0 4px 16px rgba(0, 0, 0, 0.5)',
  xl: '0 8px 32px rgba(0, 0, 0, 0.6)',
} as const

export const transitions = {
  duration: {
    fast: '100ms',
    normal: '150ms',
    moderate: '200ms',
    slow: '300ms',
  },
  easing: {
    default: 'cubic-bezier(0.2, 0, 0, 1)',
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  },
} as const

export const motion = {
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: 0.15 },
  },
  slideUp: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 8 },
    transition: { duration: 0.2, ease: [0.2, 0, 0, 1] },
  },
  slideIn: {
    initial: { opacity: 0, x: -8 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -8 },
    transition: { duration: 0.2, ease: [0.2, 0, 0, 1] },
  },
  scale: {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.97 },
    transition: { duration: 0.15 },
  },
  listItem: {
    initial: { opacity: 0, y: 4 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.15 },
  },
} as const
