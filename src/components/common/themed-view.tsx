import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedViewProps = ViewProps & {
  lightColor?: string;
  darkColor?: string;
  type?: ThemeColor;
};

/**
 * Layout view. Transparent by default — pass `type` to paint a themed
 * surface (e.g. `type="surface"`, `type="background"` on screen roots).
 */
export function ThemedView({ style, lightColor, darkColor, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();

  return (
    <View
      style={[type ? { backgroundColor: theme[type] } : undefined, style]}
      {...otherProps}
    />
  );
}
