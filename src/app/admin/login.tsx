import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';

/**
 * Admin sign-in. Real Supabase email/password auth:
 *  - loading state disables the form while the request is in flight
 *  - credential/network errors surface inline
 *  - success lands on the admin dashboard (guard admits admins only)
 */
export default function AdminLoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, status, isAdmin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailIsValid && password.length >= 6 && !submitting;

  // Already signed in as admin? Send them straight in.
  if (status === 'authenticated' && isAdmin) {
    router.replace('/admin');
    return null;
  }

  const handleSignIn = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // signIn returns failures as results, not throws — but an unexpected
    // rejection (offline, crash mid-request) must still reset the button
    // below, so it is converted to a failed result on every path.
    let result: Awaited<ReturnType<typeof signIn>>;
    try {
      result = await signIn(email, password);
    } catch {
      result = { ok: false, error: 'Something went wrong. Please try again.' };
    }

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    router.replace('/admin');
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.content}>
          {/* Brand */}
          <View
            style={[
              styles.logo,
              {
                boxShadow: `0 8px 24px 0 ${theme.accentGlow}`,
                experimental_backgroundImage: `linear-gradient(135deg, ${theme.accent}, ${theme.cta})`,
                backgroundImage: `linear-gradient(135deg, ${theme.accent}, ${theme.cta})`,
              },
            ]}>
            <ThemedText type="h2" style={{ color: theme.white }}>
              M
            </ThemedText>
          </View>
          <View style={styles.brandText}>
            <ThemedText type="h3">Mamta General Store</ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              Admin Login
            </ThemedText>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="owner@mamtastore.in"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              editable={!submitting}
              onChangeText={(text) => {
                setEmail(text);
                setError(null);
              }}
            />
            <Input
              label="Password"
              placeholder="••••••••"
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              value={password}
              editable={!submitting}
              onChangeText={(text) => {
                setPassword(text);
                setError(null);
              }}
              rightIcon={
                <IconButton
                  size="sm"
                  variant="ghost"
                  accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                  onPress={() => setShowPassword((value) => !value)}
                  icon={
                    <Icon
                      name={showPassword ? 'eye-off' : 'eye'}
                      size={16}
                      color={theme.textTertiary}
                    />
                  }
                />
              }
            />

            {error && (
              <View style={[styles.errorRow, { backgroundColor: theme.errorSoft }]}>
                <Icon name="warning" size={14} color={theme.error} />
                <ThemedText type="caption" style={{ color: theme.error, flex: 1 }}>
                  {error}
                </ThemedText>
              </View>
            )}

            <Button
              title={submitting ? 'Signing in…' : 'Sign In'}
              onPress={() => void handleSignIn()}
              disabled={!canSubmit}
              block
            />
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
    gap: Spacing.four,
  },
  logo: {
    width: 72,
    height: 72,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    alignItems: 'center',
    gap: Spacing.one / 2,
  },
  form: {
    alignSelf: 'stretch',
    gap: Spacing.three,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
});
