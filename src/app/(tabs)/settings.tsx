import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import * as Application from 'expo-application';

import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import { IconButton } from '@/components/ui/icon-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import {
  MaxContentWidth,
  WebTopBarInset,
  MinTouchTarget,
  Motion,
  Spacing,
  Radius,
} from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/hooks/use-auth';

const APP_VERSION = Application.nativeApplicationVersion ?? '1.0.0';

/** Email → initial for the account avatar. */
function initialOf(email: string | null | undefined): string {
  return email?.charAt(0).toUpperCase() ?? '?';
}

/** Static informational row (app version, about). */
function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { minHeight: MinTouchTarget }]}>
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

/** Action row with chevron — navigation targets inside settings groups. */
function ActionRow({
  icon,
  iconColor,
  iconBackground,
  label,
  description,
  onPress,
}: {
  icon: IconName;
  iconColor: string;
  iconBackground: string;
  label: string;
  description: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { minHeight: MinTouchTarget + 4 },
        pressed && styles.rowPressed,
      ]}>
      <View style={[styles.rowIcon, { backgroundColor: iconBackground }]}>
        <Icon name={icon} size={16} color={iconColor} />
      </View>
      <View style={styles.actionText}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="caption" themeColor="textTertiary">
          {description}
        </ThemedText>
      </View>
      <Icon name="chevron-forward" size={16} color={theme.textTertiary} />
    </Pressable>
  );
}

/** Account section body while the session is still being restored. */
function AccountLoadingRow() {
  const theme = useTheme();

  return (
    <View style={[styles.row, { minHeight: MinTouchTarget }]}>
      <Skeleton style={{ width: 44, height: 44, borderRadius: Radius.md }} />
      <View style={styles.actionText}>
        <Skeleton style={{ width: 140, height: 14, borderRadius: Radius.sm }} />
        <Skeleton style={{ width: 180, height: 12, borderRadius: Radius.sm }} />
      </View>
    </View>
  );
}

/**
 * Settings tab. App information for everyone; the account section adapts
 * to the auth state — sign-in prompt for visitors, profile + dashboard
 * link + logout (with confirmation) for signed-in admins.
 */
export default function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { status, profile, isAdmin, signOut } = useAuth();

  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      setConfirmingLogout(false);
      // Session cleared by the provider; land on the consumer home tab.
      router.replace('/(tabs)');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Animated.ScrollView
          entering={FadeIn.duration(Motion.base)}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          {/* Header */}
          <Animated.View entering={FadeInUp.duration(Motion.base).delay(50)} style={styles.header}>
            <ThemedText type="h1">Settings</ThemedText>
            <ThemedText type="bodySmall" themeColor="textSecondary">
              App information and account
            </ThemedText>
          </Animated.View>

          {/* Store / App info */}
          <Animated.View entering={FadeInUp.duration(Motion.base).delay(100)} style={styles.section}>
            <ThemedText type="overline" themeColor="textTertiary" style={styles.sectionTitle}>
              App
            </ThemedText>
            <Card style={styles.group} padding="none">
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

              <View style={[styles.rowDivider, { borderTopColor: theme.border }]} />

              <InfoRow icon="phone-portrait" label="App version" value={APP_VERSION} />
              <View style={[styles.rowDivider, { borderTopColor: theme.border }]} />
              <InfoRow icon="information-circle" label="About" value="Price lookup for shop floor" />
            </Card>
          </Animated.View>

          {/* Account — reflects the real auth state */}
          <Animated.View entering={FadeInUp.duration(Motion.base).delay(150)} style={styles.section}>
            <ThemedText type="overline" themeColor="textTertiary" style={styles.sectionTitle}>
              Account
            </ThemedText>
            <Card style={styles.group} padding="none">
              {status === 'loading' && <AccountLoadingRow />}

              {status === 'unauthenticated' && (
                <View style={[styles.row, { minHeight: MinTouchTarget + 4 }]}>
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
              )}

              {status === 'authenticated' && (
                <>
                  {/* Profile */}
                  <View style={[styles.row, { minHeight: MinTouchTarget + 4 }]}>
                    <View style={[styles.accountBadge, { backgroundColor: theme.accentSoft }]}>
                      <ThemedText type="h3" style={{ color: theme.accentDark }}>
                        {initialOf(profile?.email)}
                      </ThemedText>
                    </View>
                    <View style={styles.accountText}>
                      <ThemedText type="body" numberOfLines={1} style={styles.accountEmail}>
                        {profile?.email ?? 'Signed in'}
                      </ThemedText>
                      <View style={styles.roleRow}>
                        <Badge
                          label={isAdmin ? 'Admin' : 'Staff'}
                          variant={isAdmin ? 'accent' : 'neutral'}
                          size="sm"
                          dot
                        />
                      </View>
                    </View>
                  </View>

                  {isAdmin && (
                    <>
                      <View style={[styles.rowDivider, { borderTopColor: theme.border }]} />
                      <ActionRow
                        icon="grid"
                        iconColor={theme.accent}
                        iconBackground={theme.accentSoft}
                        label="Admin dashboard"
                        description="Inventory stats and quick actions"
                        onPress={() => router.push('/admin')}
                      />
                    </>
                  )}

                  <View style={[styles.rowDivider, { borderTopColor: theme.border }]} />
                  <ActionRow
                    icon="log-out"
                    iconColor={theme.error}
                    iconBackground={theme.errorSoft}
                    label="Log out"
                    description="End this session on the device"
                    onPress={() => setConfirmingLogout(true)}
                  />
                </>
              )}
            </Card>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(Motion.base).delay(200)} style={styles.footnote}>
            <ThemedText type="caption" themeColor="textTertiary">
              Mamta General Store · v{APP_VERSION}
            </ThemedText>
          </Animated.View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Logout confirmation */}
      <ConfirmDialog
        visible={confirmingLogout}
        title="Log out?"
        message="You will need to sign in again to use admin tools on this device."
        confirmLabel="Log Out"
        busyLabel="Logging out…"
        cancelLabel="Cancel"
        destructive
        busy={signingOut}
        icon={<Icon name="log-out" size={24} color={theme.error} />}
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowPressed: {
    opacity: 0.75,
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
  actionText: {
    flex: 1,
    gap: 2,
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
  accountEmail: {
    flexShrink: 1,
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
    marginTop: Spacing.two,
  },
});
