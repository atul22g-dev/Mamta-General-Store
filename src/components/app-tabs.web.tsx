import { Platform, Pressable, View, StyleSheet } from 'react-native';
import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Icon, type IconName } from '@/components/ui/icon';
import { MaxContentWidth, Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const isWeb = Platform.OS === 'web';

const TAB_ITEMS = [
  { name: 'home', href: '/', label: 'Home', icon: 'home-outline' as IconName, activeIcon: 'home' as IconName },
  { name: 'products', href: '/products', label: 'Products', icon: 'grid-outline' as IconName, activeIcon: 'grid' as IconName },
  { name: 'settings', href: '/settings', label: 'Settings', icon: 'settings-outline' as IconName, activeIcon: 'settings' as IconName },
] as const;

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          {TAB_ITEMS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton icon={tab.icon} activeIcon={tab.activeIcon}>
                {tab.label}
              </TabButton>
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({
  children,
  icon,
  activeIcon,
  isFocused,
  ...props
}: TabTriggerSlotProps & { icon: IconName; activeIcon: IconName }) {
  const theme = useTheme();

  return (
    <Pressable
      {...props}
      style={({ pressed, hovered }) => [
        isWeb && hovered && !isFocused && { backgroundColor: theme.text + '0A' },
        pressed && styles.pressed,
      ]}>
      <ThemedView
        style={[
          styles.tabButtonView,
          isWeb && { transitionProperty: 'background-color', transitionDuration: '150ms' },
          {
            backgroundColor: isFocused ? theme.accentSoft : 'transparent',
            borderRadius: Radius.full,
          },
        ]}>
        <Icon
          name={isFocused ? activeIcon : icon}
          size={16}
          color={isFocused ? theme.accent : theme.textSecondary}
        />
        <ThemedText
          type="smallBold"
          themeColor={isFocused ? 'accent' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const theme = useTheme();

  return (
    <View {...props} style={styles.tabListContainer}>
      <ThemedView
        style={[
          styles.innerContainer,
          {
            backgroundColor: theme.surface + (isWeb ? 'D9' : ''),
            borderColor: theme.border,
          },
          isWeb && {
            backdropFilter: 'saturate(180%) blur(20px)',
          },
        ]}>
        {/* Brand mark */}
        <View style={[styles.logoMark, { experimental_backgroundImage: `linear-gradient(135deg, ${theme.accent}, ${theme.cta})`, backgroundImage: `linear-gradient(135deg, ${theme.accent}, ${theme.cta})` }]}>
          <ThemedText type="smallBold" style={{ color: theme.white, fontSize: 12 }}>
            M
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={styles.brandText}>
          Mamta General Store
        </ThemedText>

        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: Spacing.three,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.full,
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    borderWidth: 1,
    boxShadow: '0 1px 2px 0 rgba(15, 23, 42, 0.04), 0 8px 24px 0 rgba(15, 23, 42, 0.09)',
  },
  logoMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -Spacing.one,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
});
