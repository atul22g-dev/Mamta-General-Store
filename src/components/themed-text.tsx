import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

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

  const typographyStyle =
    type === 'display' || type === 'h1' || type === 'h2' || type === 'h3' ||
    type === 'body' || type === 'bodySmall' || type === 'caption' || type === 'overline'
      ? Typography[type]
      : undefined;

  return (
    <Text
      style={[
        { color: theme[themeColor ?? 'text'] },
        typographyStyle,
        !typographyStyle &&
          type === 'default' && styles.default,
        !typographyStyle &&
          type === 'small' && styles.small,
        !typographyStyle &&
          type === 'smallBold' && styles.smallBold,
        !typographyStyle &&
          type === 'subtitle' && styles.subtitle,
        !typographyStyle &&
          type === 'link' && styles.link,
        !typographyStyle &&
          type === 'linkPrimary' && styles.linkPrimary,
        !typographyStyle &&
          type === 'code' && styles.code,
        style,
      ]}
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
