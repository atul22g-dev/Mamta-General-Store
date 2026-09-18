import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

/**
 * Admin sign-in scaffold. The form is fully composed but disabled — no
 * authentication layer exists yet, so nothing submits or validates.
 */
export default function AdminLoginScreen() {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.content}>
          <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
            <Icon name="lock-closed" size={28} color={theme.accent} />
          </View>
          <Badge label="Coming soon" variant="accent" />
          <ThemedText type="h2" style={styles.title}>
            Admin Sign In
          </ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.description}>
            Store-owner access only. Authentication is not implemented yet — the form is disabled
            until then.
          </ThemedText>

          <View style={styles.form}>
            <Input label="Email" placeholder="owner@mamtastore.in" editable={false} />
            <Input label="Password" placeholder="••••••••" secureTextEntry editable={false} />
            <Button title="Sign In" onPress={undefined} disabled block />
          </View>
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
  form: {
    alignSelf: 'stretch',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
});
