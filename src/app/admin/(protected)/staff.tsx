import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect, useRouter } from 'expo-router';

import { Icon } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing, Radius, MinTouchTarget } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';
import { createStaffAccount } from '@/lib/staff-service';

/** Full-screen confirmation shown after an account is created. */
function StaffCreatedPanel({
  email,
  onAddAnother,
}: {
  email: string;
  onAddAnother: () => void;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.successWrap}>
          <View style={[styles.successIcon, { backgroundColor: theme.successSoft }]}>
            <Icon name="checkmark" size={28} color={theme.success} />
          </View>
          <ThemedText type="h3">Staff account created</ThemedText>
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.successText}>
            {email} can now sign in to the store app with the password you set.
          </ThemedText>
          <Button title="Add another" variant="secondary" onPress={onAddAnother} />
        </Animated.View>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Whether an unauthenticated/non-admin visitor should be bounced to login.
 * Module-level so the screen component stays a simple state router.
 */
function shouldRedirectToLogin(
  status: ReturnType<typeof useAuth>['status'],
  isAdmin: boolean,
): boolean {
  if (status === 'loading') return false;
  return status !== 'authenticated' || !isAdmin;
}
/**
 * Add Staff — admin-only account provisioning.
 *
 * Creates a Supabase Auth user (email + password, auto-confirmed) and grants
 * the 'staff' role via the create-staff edge function. The app never holds
 * privileged credentials; the edge function verifies the caller's admin role
 * server-side.
 *
 * Route: /admin/staff  (registered in the protected admin layout)
 */
export default function AddStaffScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, isAdmin } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);

  const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordIsStrong = password.length >= 8;
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit = emailIsValid && passwordIsStrong && passwordsMatch && !submitting;

  // The protected layout already guards this route, but this early-out keeps
  // deep-link behavior honest if the guard ever changes. <Redirect> performs
  // the navigation in an effect — calling router.replace() during render
  // would update the navigator DURING render (web hard-crashes on it), the
  // exact pattern login.tsx documents and avoids.
  if (shouldRedirectToLogin(status, isAdmin)) {
    return <Redirect href="/admin/login" />;
  }

  const handleCreate = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    // Failures are values, not throws — but an unexpected rejection (offline,
    // crash mid-request) must still re-enable the form below, so every exit
    // path resets the busy flag (compiler-friendly: no try/finally).
    let result: Awaited<ReturnType<typeof createStaffAccount>>;
    try {
      result = await createStaffAccount(email, password);
    } catch {
      result = { ok: false, error: 'Network error — could not reach the account service.' };
    }

    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setSuccessEmail(result.data.email);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
  };

  if (successEmail) {
    return (
      <StaffCreatedPanel email={successEmail} onAddAnother={() => setSuccessEmail(null)} />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.View entering={FadeInDown.duration(350)} style={styles.content}>
          {/* Header */}
          <View style={styles.headerRow}>
            <IconButton
              size="sm"
              variant="ghost"
              accessibilityLabel="Go back"
              onPress={() => router.back()}
              icon={<Icon name="chevron-back" size={20} color={theme.text} />}
            />
            <ThemedText type="h3" style={styles.headerTitle}>
              Add Staff
            </ThemedText>
            <View style={styles.headerSpacer} />
          </View>
          <ThemedText type="bodySmall" themeColor="textSecondary" style={styles.lede}>
            Create a login for a staff member. They can sign in with this email and password.
          </ThemedText>

          {/* Form */}
          <View style={styles.form}>
            <Input
              label="Email"
              placeholder="staff@mamtastore.in"
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
              placeholder="At least 8 characters"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
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
            <Input
              label="Confirm password"
              placeholder="Re-enter the password"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirmPassword}
              editable={!submitting}
              onChangeText={(text) => {
                setConfirmPassword(text);
                setError(null);
              }}
              error={
                confirmPassword.length > 0 && !passwordsMatch
                  ? 'Passwords do not match'
                  : undefined
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
              title={submitting ? 'Creating account…' : 'Create Staff Account'}
              onPress={() => void handleCreate()}
              disabled={!canSubmit}
              block
            />
            <Button
              title="Cancel"
              variant="ghost"
              onPress={() => router.back()}
              disabled={submitting}
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
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    minHeight: MinTouchTarget,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: MinTouchTarget,
  },
  lede: {
    textAlign: 'center',
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
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    paddingHorizontal: Spacing.four,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successText: {
    textAlign: 'center',
  },
});
