import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn } from 'react-native-reanimated';
import * as Application from 'expo-application';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loading } from '@/components/ui/loading';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, WebTopBarInset, Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';

const APP_VERSION = Application.nativeApplicationVersion ?? '1.0.0';

/** Static informational row (no sensitive data — email/role only for admins). */
function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      <View style={[styles.rowIcon, { backgroundColor: theme.accentSoft }]}>
        <Icon name={icon} size={16} color={theme.accent} />
      </View>
      <ThemedText type="bodySmall" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.rowValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * Settings tab.
 *
 * Everyone sees app information (store name, version, about). Authenticated
 * admins additionally see their account (email, role) with a confirmed
 * logout. No tokens, session internals, or ids are ever displayed.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { profile, status, isAdmin, signOut } = useAuth();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);

    try {
      await signOut(); // clears the Supabase session via AuthProvider
      setConfirmingLogout(false);

      // Land on Home and unwind anything pushed above the tabs (e.g. an
      // admin flow). navigate() pops to the existing tab when present.
      // The admin guard also reacts to the cleared session on its own.
      router.navigate('/(tabs)');
    } catch {
      Alert.alert('Sign out failed', 'Please try again.');
      setConfirmingLogout(false);
    } finally {
      setSigningOut(false);
    }
  };

  const authLoading = status === 'loading';

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(300)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="h1">Settings</ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              App information and account
            </ThemedText>
          </View>

          {/* Store / App info — visible to everyone */}
          <View style={styles.section}>
            <ThemedText type="overline" themeColor="textTertiary" style={styles.sectionTitle}>
              App
            </ThemedText>
            <ThemedView type="surface" style={[styles.group, { borderColor: theme.border }]}>
              {/* Store identity header */}
              <View style={styles.storeRow}>
                <View style={[styles.storeBadge, { backgroundColor: theme.accentSoft }]}>
                  <Icon name="storefront" size={22} color={theme.accent} />
                </View>
                <View style={styles.storeText}>
                  <ThemedText type="h3">Mamta General Store</ThemedText>
                  <ThemedText type="caption" themeColor="textTertiary">
                    Scan-to-price retail companion
                  </ThemedText>
                </View>
              </View>

              <View style={[styles.divider, { borderTopColor: theme.border }]} />

              <InfoRow icon="phone-portrait" label="App version" value={APP_VERSION} />
              <View style={[styles.rowDivider, { borderTopColor: theme.border }]} />
              <InfoRow icon="information-circle" label="About" value="Price lookup for shop floor" />
            </ThemedView>
          </View>

          {/* Admin account — only for authenticated admins */}
          {authLoading ? (
            <Loading size="small" text="Checking account…" />
          ) : isAdmin ? (
            <View style={styles.section}>
              <ThemedText type="overline" themeColor="textTertiary" style={styles.sectionTitle}>
                Account
              </ThemedText>
              <ThemedView type="surface" style={[styles.group, { borderColor: theme.border }]}>
                <View style={styles.accountRow}>
                  <View style={[styles.accountBadge, { backgroundColor: theme.successSoft }]}>
                    <Icon name="shield-checkmark" size={20} color={theme.success} />
                  </View>
                  <View style={styles.accountText}>
                    <ThemedText type="body" numberOfLines={1} ellipsizeMode="middle">
                      {profile?.email ?? 'Signed in'}
                    </ThemedText>
                    <View style={styles.roleRow}>
                      <Badge label="Admin" variant="success" size="sm" />
                      <ThemedText type="caption" themeColor="textTertiary">
                        Full catalog access
                      </ThemedText>
                    </View>
                  </View>
                </View>

                <View style={[styles.rowDivider, { borderTopColor: theme.border }]} />

                <Button
                  title="Log Out"
                  variant="danger"
                  icon={<Icon name="log-out" size={18} color={theme.white} />}
                  block
                  onPress={() => setConfirmingLogout(true)}
                  style={styles.logoutButton}
                />
              </ThemedView>
            </View>
          ) : (
            /* Signed-out visitors: quiet sign-in hint, no auth internals */
            <View style={styles.section}>
              <ThemedText type="overline" themeColor="textTertiary" style={styles.sectionTitle}>
                Account
              </ThemedText>
              <ThemedView type="surface" style={[styles.group, { borderColor: theme.border }]}>
                <View style={styles.accountRow}>
                  <View style={[styles.accountBadge, { backgroundColor: theme.surfaceSecondary }]}>
                    <Icon name="person-circle" size={20} color={theme.textTertiary} />
                  </View>
                  <View style={styles.accountText}>
                    <ThemedText type="body">Not signed in</ThemedText>
                    <ThemedText type="caption" themeColor="textTertiary">
                      Admin tools live behind sign-in
                    </ThemedText>
                  </View>
                  <Button
                    title="Sign In"
                    size="sm"
                    variant="secondary"
                    onPress={() => router.push('/admin/login')}
                  />
                </View>
              </ThemedView>
            </View>
          )}

          <ThemedText type="caption" themeColor="textTertiary" style={styles.footnote}>
            Mamta General Store · v{APP_VERSION}
          </ThemedText>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Logout confirmation */}
      <ConfirmDialog
        visible={confirmingLogout}
        title="Log out of Mamta General Store?"
        message="You will need to sign in again to access admin tools."
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        destructive
        busy={signingOut}
        onConfirm={() => void handleSignOut()}
        onCancel={() => !signingOut && setConfirmingLogout(false)}
      />
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
    padding: Spacing.four,
    gap: Spacing.three,
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  storeBadge: {
    width: 48,
    height: 48,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeText: {
    flex: 1,
    gap: 2,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
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
  rowValue: {
    textAlign: 'right',
    flexShrink: 1,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  accountBadge: {
    width: 44,
    height: 44,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountText: {
    flex: 1,
    gap: Spacing.one / 2,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoutButton: {
    marginTop: Spacing.one,
  },
  footnote: {
    textAlign: 'center',
    marginTop: 'auto',
  },
});
