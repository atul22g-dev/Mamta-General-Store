import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { Button } from '@/components/common/button';
import { Icon } from '@/components/common/icon';
import { IconButton } from '@/components/common/icon-button';
import { Input } from '@/components/common/input';
import { Loading } from '@/components/common/loading';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { ProductRow } from '@/components/products/product-row';
import { ThemedText } from '@/components/common/themed-text';
import { ThemedView } from '@/components/common/themed-view';
import { MaxContentWidth, Spacing } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import { useProductList, type ProductListStatus } from '@/hooks/use-product-list';
import { alert } from '@/utils/alert';
import type { ProductWithImages } from '@/services/product.service';

/** Vertical gap between product rows (FlatList separator). */
function RowSeparator() {
  return <View style={styles.rowSeparator} />;
}

/**
 * Loading / error / empty panel shown when the list has no rows.
 * Extracted so the screen stays a thin data-list wrapper.
 */
function AdminListStates({
  loading,
  status,
  errorMessage,
  hasSearch,
  search,
  onRetry,
  onAdd,
}: {
  loading: boolean;
  status: ProductListStatus;
  errorMessage: string | null;
  hasSearch: boolean;
  search: string;
  onRetry: () => void;
  onAdd: () => void;
}) {
  const theme = useTheme();

  if (loading) {
    return <Loading text="Loading products…" showIcon />;
  }
  if (status === 'error') {
    return (
      <ErrorState description={errorMessage ?? 'Failed to load products.'} onRetry={onRetry} />
    );
  }
  if (status === 'ready' && !hasSearch) {
    return (
      <EmptyState
        title="No products yet"
        description="Add your first product to start building the catalog."
        action={
          <Button
            title="Add Product"
            icon={<Icon name="add" size={18} color={theme.white} />}
            onPress={onAdd}
          />
        }
      />
    );
  }
  if (status === 'ready') {
    return (
      <EmptyState
        title="No matches"
        description={`Nothing matches “${search.trim()}”. Try a different search.`}
        icon={<Icon name="search" size={26} color={theme.accent} />}
      />
    );
  }
  return null;
}

/**
 * Admin product management screen — real catalog from Supabase with
 * debounced search, pull-to-refresh, and an explicit delete confirmation
 * flow. All data access lives in hooks/services, not here.
 */
export default function AdminProductsScreen() {
  const router = useRouter();
  const theme = useTheme();

  const {
    search,
    setSearch,
    products,
    status,
    errorMessage,
    refreshing,
    loading,
    deletingId,
    refresh,
    deleteProductById,
  } = useProductList();

  // Product pending deletion (drives the confirm dialog).
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;

    const outcome = await deleteProductById(pendingDelete.id);
    setPendingDelete(null);

    if (!outcome.ok) {
      // Cross-platform alert — Alert.alert is a silent no-op on web.
      alert('Could not delete product', outcome.error);
    }
  };

  const hasSearch = search.trim().length > 0;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.flex}>
          {/* Header + search live outside the list's own padding, so they
              carry the screen gutter here. */}
          <View style={[styles.header, styles.screenGutter]}>
            <View style={styles.headerText}>
              <ThemedText type="h1">Products</ThemedText>
              <ThemedText type="bodySmall" themeColor="textSecondary">
                Manage your store catalog
              </ThemedText>
            </View>
            <View style={styles.headerActions}>
              {/* Bulk catalog work lives one tap away, next to search, because
                  importing a spreadsheet is the other way products get in.
                  Icon-only so the header still fits a small phone. */}
              <IconButton
                accessibilityLabel="Export or import products"
                icon={<Icon name="swap-vertical" size={18} color={theme.accent} />}
                onPress={() => router.push('/admin/products/transfer')}
              />
              <Button
                title="Add Product"
                size="sm"
                icon={<Icon name="add" size={18} color={theme.white} />}
                onPress={() => router.push('/admin/products/add')}
              />
            </View>
          </View>

          {/* Search */}
          <Input
            style={styles.screenGutter}
            placeholder="Search products…"
            value={search}
            onChangeText={setSearch}
            leftIcon={<Icon name="search" size={18} color={theme.textTertiary} />}
            clearButtonMode="while-editing"
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel="Search products"
          />

          {/* Result count */}
          {status === 'ready' && products.length > 0 && (
            <ThemedText type="caption" themeColor="textTertiary">
              {products.length} {products.length === 1 ? 'product' : 'products'}
              {hasSearch ? ' found' : ' in catalog'}
            </ThemedText>
          )}

          {/* Body — virtualized: only the visible rows mount */}
          <FlatList
            data={products}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }: { item: ProductWithImages; index: number }) => (
              <ProductRow
                product={item}
                index={index}
                deleting={deletingId === item.id}
                onPress={() =>
                  router.push({ pathname: '/admin/products/[id]', params: { id: item.id } })
                }
                onEdit={() =>
                  router.push({
                    pathname: '/admin/products/[id]/edit',
                    params: { id: item.id },
                  })
                }
                onDelete={() => setPendingDelete({ id: item.id, name: item.name })}
              />
            )}
            ItemSeparatorComponent={RowSeparator}
            ListEmptyComponent={
              <AdminListStates
                loading={loading}
                status={status}
                errorMessage={errorMessage}
                hasSearch={hasSearch}
                search={search}
                onRetry={() => void refresh()}
                onAdd={() => router.push('/admin/products/add')}
              />
            }
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor={theme.accent}
                colors={[theme.accent]}
              />
            }
          />
        </View>
      </SafeAreaView>

      {/* Delete confirmation */}
      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Delete this product?"
        message={
          pendingDelete
            ? `“${pendingDelete.name}” will be permanently removed.\n\nThis action cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        destructive
        busy={deletingId !== null}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => !deletingId && setPendingDelete(null)}
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
  flex: {
    flex: 1,
    paddingTop: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  screenGutter: {
    paddingHorizontal: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one / 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  rowSeparator: {
    height: Spacing.three,
  },
});
