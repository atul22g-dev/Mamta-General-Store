import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Icon, type IconName } from '@/components/ui/icon';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, WebTopBarInset, Spacing, Radius, Typography } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type Row = {
  icon: IconName;
  label: string;
  chevron?: boolean;
};

type Section = { title: string; rows: Row[] };

const SECTIONS: Section[] = [
  {
    title: 'Store',
    rows: [
      { icon: 'storefront', label: 'Store profile', chevron: true },
      { icon: 'document-text', label: 'Price lists', chevron: true },
      { icon: 'print', label: 'Receipt printing', chevron: true },
    ],
  },
  {
    title: 'Preferences',
    rows: [
      { icon: 'notifications', label: 'Notifications' },
      { icon: 'language', label: 'Language', chevron: true },
      { icon: 'information-circle', label: 'About this app', chevron: true },
    ],
  },
];

export default function SettingsScreen() {
  const theme = useTheme();
  const [notificationsOn, setNotificationsOn] = useState(true);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>

          <View style={styles.header}>
            <ThemedText type="h1" style={styles.title}>
              Settings
            </ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              App preferences and configuration
            </ThemedText>
          </View>

          {SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <ThemedText type="overline" themeColor="textTertiary" style={styles.sectionTitle}>
                {section.title}
              </ThemedText>
              <ThemedView
                type="surface"
                style={[styles.group, { borderColor: theme.border }]}>
                {section.rows.map((row, index) => (
                  <View
                    key={row.label}
                    style={[
                      styles.row,
                      index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border },
                    ]}>
                    <View style={[styles.rowIcon, { backgroundColor: theme.accentSoft }]}>
                      <Icon name={row.icon} size={16} color={theme.accent} />
                    </View>
                    <ThemedText type="bodySmall" style={styles.rowLabel}>
                      {row.label}
                    </ThemedText>
                    {row.label === 'Notifications' ? (
                      <Switch
                        value={notificationsOn}
                        onValueChange={setNotificationsOn}
                        trackColor={{ true: theme.accent, false: theme.surfaceSecondary }}
                        thumbColor={theme.white}
                      />
                    ) : (
                      row.chevron && (
                        <Icon
                          name="chevron-forward"
                          size={13}
                          color={theme.textTertiary}
                        />
                      )
                    )}
                  </View>
                ))}
              </ThemedView>
            </View>
          ))}

          <ThemedText type="caption" themeColor="textTertiary" style={styles.version}>
            Mamta General Store · v1.0.0
          </ThemedText>
        </Animated.ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five + WebTopBarInset,
    paddingBottom: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one / 2,
  },
  title: Typography.h1,
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.one,
  },
  group: {
    borderRadius: Radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
  },
  version: {
    textAlign: 'center',
    marginTop: 'auto',
  },
});
