import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ProductImagePicker, type PickedImage } from '@/components/products/product-image-picker';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/error-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing, Radius } from '@/constants';
import { useTheme } from '@/hooks/use-theme';
import {
  PRODUCT_CATEGORIES,
  PRODUCT_UNITS,
  CATEGORY_LABELS,
  UNIT_LABELS,
  EMPTY_PRODUCT_FORM,
  validateProductForm,
  isFormValid,
  type ProductCategory,
  type ProductFormValues,
} from '@/lib/products/product-validation';

/** Fully validated + parsed payload handed to the parent's onSubmit. */
export type ValidProductSubmit = {
  name: string;
  description: string;
  category: ProductCategory;
  mrp: number;
  sellingPrice: number;
  stock: number;
  unit: ProductFormValues['unit'];
  images: PickedImage[];
};

type ProductFormProps = {
  mode: 'create' | 'edit';
  initialValues?: ProductFormValues;
  initialImages?: PickedImage[];
  submitting: boolean;
  submitError: string | null;
  /** Brief success banner shown before navigation (e.g. "Saved ✓"). */
  successMessage?: string | null;
  /** Embedding generation status message. */
  embeddingStatus?: string | null;
  submitLabel?: string;
  submittingLabel?: string;
  onSubmit: (payload: ValidProductSubmit) => void;
  onCancel: () => void;
};

/**
 * Shared add/edit product form. Owns field state + validation; the parent
 * owns submission (Supabase calls live in services, orchestrated by the
 * screen). Duplicate submission is blocked via the `submitting` flag.
 */
export function ProductForm({
  mode,
  initialValues,
  initialImages = [],
  submitting,
  submitError,
  successMessage,
  embeddingStatus,
  submitLabel = 'Save Product',
  submittingLabel = 'Saving…',
  onSubmit,
  onCancel,
}: ProductFormProps) {
  const theme = useTheme();

  const [values, setValues] = useState<ProductFormValues>(initialValues ?? EMPTY_PRODUCT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormValues, string>>>({});
  const [images, setImages] = useState<PickedImage[]>(initialImages);

  const setField = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
    setErrors((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const handleSubmit = () => {
    if (submitting) return; // duplicate-submission guard

    const validation = validateProductForm(values);
    setErrors(validation);
    if (!isFormValid(validation)) return;

    onSubmit({
      name: values.name.trim(),
      description: values.description.trim(),
      category: values.category as ProductCategory,
      mrp: Number(values.mrp.trim()),
      sellingPrice: Number(values.sellingPrice.trim()),
      stock: values.stock.trim() === '' ? 0 : Number(values.stock.trim()),
      unit: values.unit,
      images,
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={[styles.iconTile, { backgroundColor: theme.accentSoft }]}>
              <Icon
                name={mode === 'create' ? 'add-circle' : 'create'}
                size={24}
                color={theme.accent}
              />
            </View>
            <View style={styles.headerText}>
              <ThemedText type="h2">
                {mode === 'create' ? 'Add Product' : 'Edit Product'}
              </ThemedText>
              <ThemedText type="caption" themeColor="textTertiary">
                {mode === 'create' ? 'Saves to the live catalog' : 'Updates go live instantly'}
              </ThemedText>
            </View>
          </View>

          {submitError && (
            <ErrorState
              description={submitError}
              onRetry={handleSubmit}
              retryLabel="Try saving again"
              style={styles.errorPanel}
            />
          )}

          {successMessage && !submitError && (
            <Animated.View
              entering={FadeInDown.duration(250)}
              style={[styles.successPanel, { backgroundColor: theme.successSoft }]}>
              <Icon name="checkmark-circle" size={18} color={theme.success} />
              <ThemedText type="smallBold" style={{ color: theme.success, flex: 1 }}>
                {successMessage}
              </ThemedText>
            </Animated.View>
          )}

          {embeddingStatus && (
            <Animated.View
              entering={FadeInDown.duration(250)}
              style={[styles.embeddingPanel, { backgroundColor: theme.accentSoft }]}>
              <Icon name="sparkles" size={18} color={theme.accent} />
              <ThemedText type="smallBold" style={{ color: theme.accent, flex: 1 }}>
                {embeddingStatus}
              </ThemedText>
            </Animated.View>
          )}

          <View style={styles.form}>
            <Input
              label="Product Name"
              placeholder="e.g. Basmati Rice 5kg"
              value={values.name}
              editable={!submitting}
              onChangeText={(text) => setField('name', text)}
              error={errors.name}
            />

            <Input
              label="Description"
              placeholder="Optional details shown on the product page"
              value={values.description}
              editable={!submitting}
              multiline
              style={styles.descriptionInput}
              onChangeText={(text) => setField('description', text)}
              error={errors.description}
            />

            {/* Category */}
            <View style={styles.fieldGroup}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.fieldLabel}>
                Category
              </ThemedText>
              <View style={styles.chipWrap}>
                {PRODUCT_CATEGORIES.map((category) => (
                  <Chip
                    key={category}
                    label={CATEGORY_LABELS[category]}
                    active={values.category === category}
                    disabled={submitting}
                    onPress={() => setField('category', category)}
                  />
                ))}
              </View>
              {errors.category && (
                <ThemedText type="caption" style={{ color: theme.error }}>
                  {errors.category}
                </ThemedText>
              )}
            </View>

            <View style={styles.rowTwo}>
              <Input
                label="MRP (₹)"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={values.mrp}
                editable={!submitting}
                onChangeText={(text) => setField('mrp', text)}
                error={errors.mrp}
                style={styles.flexOne}
              />
              <Input
                label="Selling Price (₹)"
                placeholder="0.00"
                keyboardType="decimal-pad"
                value={values.sellingPrice}
                editable={!submitting}
                onChangeText={(text) => setField('sellingPrice', text)}
                error={errors.sellingPrice}
                style={styles.flexOne}
              />
            </View>

            {/* Stock + unit — side by side; the unit selector is a compact
                dropdown-style picker so it can never stack into a tall
                vertical column next to the Stock field. */}
            <View style={styles.rowTwo}>
              <Input
                label="Stock"
                placeholder="0"
                keyboardType="number-pad"
                value={values.stock}
                editable={!submitting}
                onChangeText={(text) => setField('stock', text)}
                error={errors.stock}
                style={styles.flexOne}
              />
              <View style={[styles.fieldGroup, styles.flexOne]}>
                <ThemedText type="caption" themeColor="textSecondary" style={styles.fieldLabel}>
                  Unit
                </ThemedText>
                <View style={styles.unitPicker}>
                  {PRODUCT_UNITS.map((unit) => (
                    <Chip
                      key={unit}
                      label={UNIT_LABELS[unit]}
                      active={values.unit === unit}
                      disabled={submitting}
                      onPress={() => setField('unit', unit)}
                      compact
                    />
                  ))}
                </View>
              </View>
            </View>

            {/* Images */}
            <View style={styles.fieldGroup}>
              <ThemedText type="caption" themeColor="textSecondary" style={styles.fieldLabel}>
                Product Images
              </ThemedText>
              <ProductImagePicker images={images} onChange={setImages} disabled={submitting} />
            </View>

            <Button
              title={submitting ? submittingLabel : submitLabel}
              onPress={handleSubmit}
              disabled={submitting}
              block
              icon={<Icon name="save" size={18} color={theme.white} />}
            />
            <Button
              title="Cancel"
              onPress={onCancel}
              variant="secondary"
              block
              disabled={submitting}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Selectable pill used for category + unit fields. */
function Chip({
  label,
  active,
  disabled,
  onPress,
  compact = false,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onPress: () => void;
  compact?: boolean;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: active, disabled }}
      style={({ pressed }) => [
        styles.chip,
        compact && styles.chipCompact,
        {
          backgroundColor: active ? theme.accent : theme.surface,
          borderColor: active ? theme.accent : theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <ThemedText type="caption" style={{ color: active ? theme.white : theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
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
    paddingTop: Spacing.five,
    paddingBottom: Spacing.four,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
    gap: Spacing.four,
  },
  errorPanel: {
    alignSelf: 'stretch',
  },
  successPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  embeddingPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconTile: {
    width: 44,
    height: 44,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: Spacing.one,
  },
  form: {
    gap: Spacing.four,
  },
  fieldGroup: {
    gap: Spacing.two,
  },
  fieldLabel: {
    marginBottom: -Spacing.one,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  unitPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
  },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  chipCompact: {
    minHeight: 44, // accessibility floor — never go below the 44dp touch target
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two + 2,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flexOne: {
    flex: 1,
  },
  descriptionInput: {
    minHeight: 96,
  },
});
