import {
  Platform,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { Typography } from '@/constants/typography';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?:
    | 'default'
    | 'display'
    | 'h1'
    | 'h2'
    | 'h3'
    | 'body'
    | 'bodySmall'
    | 'caption'
    | 'overline'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'title'
    | 'link'
    | 'linkPrimary'
    | 'code';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  // Single table lookup replaces the long conditional chain:
  // each text type maps to its typography scale or legacy style.
  const typeStyle = TYPE_STYLE[type];

  return (
    <Text
      style={[{ color: theme[themeColor ?? 'text'] }, typeStyle, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '500',
  },
  title: {
    fontSize: 48,
    fontWeight: '600',
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: '600',
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});

/** type → style. Typography-scale types come from the scale; the rest
 *  from the legacy sheet below (title renders unstyled, as before). */
const TYPE_STYLE: Record<NonNullable<ThemedTextProps['type']>, TextStyle | undefined> = {
  default: styles.default,
  small: styles.small,
  smallBold: styles.smallBold,
  subtitle: styles.subtitle,
  title: undefined,
  link: styles.link,
  linkPrimary: styles.linkPrimary,
  code: styles.code,
  display: Typography.display,
  h1: Typography.h1,
  h2: Typography.h2,
  h3: Typography.h3,
  body: Typography.body,
  bodySmall: Typography.bodySmall,
  caption: Typography.caption,
  overline: Typography.overline,
};
