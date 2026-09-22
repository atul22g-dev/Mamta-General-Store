import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps } from 'expo-router/ui';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/ui/icon';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <View style={styles.tabBar}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton icon="home" label="Home" />
          </TabTrigger>
          <TabTrigger name="products" href="/products" asChild>
            <TabButton icon="apps" label="Products" />
          </TabTrigger>
          <TabTrigger name="settings" href="/settings" asChild>
            <TabButton icon="settings" label="Settings" />
          </TabTrigger>
        </View>
      </TabList>
    </Tabs>
  );
}

type TabButtonProps = {
  icon: IconName;
  label: string;
};

function TabButton({ icon, label, isFocused, ...props }: TabButtonProps & TabTriggerSlotProps) {
  const theme = useTheme();

  return (
    <Pressable {...props} style={({ pressed }) => [
      styles.tabButton,
      pressed && styles.pressed,
    ]}>
      {/* Explicit theme colors — 'currentColor' is a CSS-only value and does
          not resolve on native, which left the glyphs invisible on Android. */}
      {/* accentDark is the readable-on-surface accent in both schemes (see
          the web tab bar for the contrast numbers behind this choice). */}
      <Icon
        name={icon}
        size={22}
        color={isFocused ? theme.accentDark : theme.textSecondary}
      />
      <ThemedText type="smallBold" style={{ color: isFocused ? theme.accentDark : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
