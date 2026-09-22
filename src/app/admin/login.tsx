import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { Icon } from '@/components/common/icon';
import { Input } from '@/components/common/input';
import { Button } from '@/components/common/button';
import { IconButton } from '@/components/common/icon-button';
import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';
import { alert } from '@/utils/alert';

/**
 * Admin sign-in. Real Supabase email/password auth:
 *  - loading state disables the form while the request is in flight
 *  - credential/network errors surface inline
 *  - success lands on the admin dashboard (guard admits admins only)
 */
export default function AdminLoginScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, status, isAdmin, authNotice, clearAuthNotice } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repairNeeded, setRepairNeeded] = useState(false);

  // The credentials were correct but the account has no store profile row,
  // so the provider ended the session. Explaining that here is the whole
  // point: previously the screen silently remounted and sign-in looked
  // broken with nothing to act on.
  const profileMissing = authNotice?.kind === 'profile-missing';

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSubmit = emailIsValid && password.length >= 6 && !submitting;

  // Already signed in as admin? Send them straight in. <Redirect> performs
  // the navigation in an effect — calling router.replace() directly here
  // would update the navigator DURING render (web hard-crashes on it).
  if (status === 'authenticated' && isAdmin) {
    return <Redirect href="/admin" />;
  }

  /** Opens the project's SQL Editor, where the setup SQL must be pasted. */
  const openSqlEditor = () => {
    const ref = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '')
      .replace('https://', '')
      .split('.')[0];
    // openURL rejects when no handler exists (e.g. no browser registered) —
    // an unhandled rejection here would crash the app in dev and warn in
    // production.
    Linking.openURL(`https://supabase.com/dashboard/project/${ref}/sql/new`).catch(() => {
      alert(
        'Could not open the browser',
        'Open supabase.com/dashboard in your browser and go to the SQL Editor manually.',
      );
    });
  };

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
      // A 500 during sign-in means the account's database row is malformed
      // (hand-inserted without GoTrue's required columns). Surface the
      // guided repair panel instead of leaving a dead-end message.
      setRepairNeeded(result.error.startsWith('Server error while signing in'));
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
                setRepairNeeded(false);
                // A different account is being tried — the previous
                // account's setup notice no longer applies.
                clearAuthNotice();
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
                setRepairNeeded(false);
                clearAuthNotice();
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

            {profileMissing && (
              <View
                accessibilityRole="alert"
                style={[
                  styles.repairPanel,
                  { backgroundColor: theme.warningSoft, borderColor: theme.warning },
                ]}>
                <View style={styles.noticeHead}>
                  <Icon name="alert-circle" size={16} color={theme.warning} />
                  <ThemedText type="smallBold">This account isn’t set up yet</ThemedText>
                </View>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  Your email and password were accepted, but this account has no store
                  profile — so it has no role and the admin area stays locked. Finish the
                  setup, then sign in again.
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  {'1. Open supabase/create-admin-user.sql in this project'}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  {'2. Set its ▼ EDIT ME email to your admin email, paste it into the Supabase SQL Editor and Run it'}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  {'3. Come back here and sign in again'}
                </ThemedText>
                <Button
                  title="Open Supabase SQL Editor"
                  size="sm"
                  variant="secondary"
                  onPress={openSqlEditor}
                />
              </View>
            )}

            {error && (
              <View style={[styles.errorRow, { backgroundColor: theme.errorSoft }]}>
                <Icon name="warning" size={14} color={theme.error} />
                <ThemedText type="caption" style={{ color: theme.error, flex: 1 }}>
                  {error}
                </ThemedText>
              </View>
            )}

            {repairNeeded && (
              <View
                style={[
                  styles.repairPanel,
                  { backgroundColor: theme.surfaceSecondary, borderColor: theme.border },
                ]}>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  {'1. Open supabase/create-admin-user.sql in this project'}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  {'2. Paste it in the Supabase SQL Editor and run it (it repairs the admin login)'}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.repairStep}>
                  {'3. Sign in with the password written in that file'}
                </ThemedText>
                <Button
                  title="Open Supabase SQL Editor"
                  size="sm"
                  variant="secondary"
                  onPress={openSqlEditor}
                />
              </View>
            )}

            <Button
              title={submitting ? 'Signing in…' : 'Sign In'}
              onPress={() => void handleSignIn()}
              disabled={!canSubmit}
              busy={submitting}
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
  repairPanel: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  repairStep: {
    alignSelf: 'stretch',
  },
  noticeHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
