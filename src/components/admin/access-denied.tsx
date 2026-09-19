import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';

type AccessDeniedProps = {
  email?: string | null;
  onSignOut?: () => void;
};

/**
 * Shown to authenticated users whose profile role is not admin. Distinct
 * from the login screen: they ARE signed in — they just lack permission.
 */
export function AccessDenied({ email, onSignOut }: AccessDeniedProps) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.content}>
          <View style={[styles.iconTile, { backgroundColor: theme.errorSoft }]}>
            <Icon name="shield" size={28} color={theme.error} />
          </View>
          <Badge label="Access denied" variant="error" />
          <ThemedText type="h2" style={styles.title}>
            Not an admin account
          </ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.description}>
            {email
              ? `${email} doesn't have admin access to this store. Ask an owner to grant the admin role.`
              : "This account doesn't have admin access to this store. Ask an owner to grant the admin role."}
          </ThemedText>
          {onSignOut && (
            <Button title="Sign Out" onPress={onSignOut} variant="secondary" style={styles.button} />
          )}
        </View>
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
  button: {
    marginTop: Spacing.two,
  },
});
