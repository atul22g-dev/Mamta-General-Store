import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps } from 'react';
import { type ColorValue, type StyleProp, type TextStyle } from 'react-native';

/** Every valid Ionicons glyph name — full type safety at call sites. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

type IconProps = {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<TextStyle>;
};

/**
 * The one icon component for the whole app.
 *
 * Glyphs come from the Ionicons font bundled inside @expo/vector-icons, so
 * icons render instantly and offline on iOS, Android and web — unlike
 * expo-symbols' SymbolView, which fetches the Material Symbols font over the
 * network at runtime and renders nothing until (unless) it loads.
 */
export function Icon({ name, size = 20, color, style }: IconProps) {
  return <Ionicons name={name} size={size} color={color} style={style} />;
}
