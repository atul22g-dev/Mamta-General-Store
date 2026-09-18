import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type PlaceholderAction = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'cta' | 'secondary' | 'tertiary' | 'ghost' | 'danger';
};

type PlaceholderScreenProps = {
  icon: IconName;
  title: string;
  description: string;
  badgeLabel?: string;
  actions?: PlaceholderAction[];
  style?: StyleProp<ViewStyle>;
};

/**
 * Shared shell for scaffolded routes: icon tile, optional status badge,
 * title, description and action row, centered in the safe area. Keeps every
 * unwired screen consistent while the feature layers are still to come.
 */
export function PlaceholderScreen({
  icon,
  title,
  description,
  badgeLabel,
  actions = [],
  style,
}: PlaceholderScreenProps) {
  const theme = useTheme();

  return (
    <ThemedView style={[styles.container, style]}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.content}>
          <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
            <Icon name={icon} size={28} color={theme.accent} />
          </View>
          {badgeLabel && <Badge label={badgeLabel} variant="accent" />}
          <ThemedText type="h2" style={styles.title}>
            {title}
          </ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.description}>
            {description}
          </ThemedText>
          {actions.length > 0 && (
            <View style={styles.actions}>
              {actions.map((action) => (
                <Button
                  key={action.label}
                  title={action.label}
                  onPress={action.onPress}
                  variant={action.variant ?? 'primary'}
                />
              ))}
            </View>
          )}
        </Animated.View>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 360,
    alignSelf: 'center',
    width: '100%',
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
  },
  iconTile: {
    width: 64,
    height: 64,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    textAlign: 'center',
  },
  description: {
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
});
