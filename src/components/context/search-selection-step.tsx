import { Ionicons } from '@expo/vector-icons'
import { useMemo, useState } from 'react'
import { FlatList, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing } from '@/constants/theme'
import { blurActiveElement } from '@/utils/focus'

export type SearchSelectionItem = {
  id: string
  title: string
  subtitle?: string
  keywords?: string
}

type SearchSelectionStepProps = {
  title: string
  items: SearchSelectionItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdvance: () => void
  onBack?: () => void
  advanceDisabled?: boolean
  advanceLoading?: boolean
  searchLabel?: string
  searchPlaceholder?: string
  helperText?: string
  emptyTitle: string
  emptyDescription: string
}

export function SearchSelectionStep({
  title,
  items,
  selectedId,
  onSelect,
  onAdvance,
  onBack,
  advanceDisabled,
  advanceLoading,
  searchLabel = 'Buscar',
  searchPlaceholder = 'Buscar',
  helperText,
  emptyTitle,
  emptyDescription,
}: SearchSelectionStepProps) {
  const [query, setQuery] = useState('')

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return items
    }

    return items.filter((item) =>
      [item.title, item.subtitle, item.keywords]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery),
    )
  }, [items, query])

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <View style={styles.page}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              blurActiveElement()
              onBack?.()
            }}
            disabled={!onBack}
            style={({ pressed }) => [
              styles.backButton,
              !onBack ? styles.backButtonDisabled : null,
              pressed && onBack ? styles.backButtonPressed : null,
            ]}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.headerSpacer} />
        </View>

        {helperText ? <Text style={styles.helperText}>{helperText}</Text> : null}

        <View style={styles.searchBlock}>
          <Text style={styles.searchLabel}>{searchLabel}</Text>
          <View style={styles.searchShell}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={searchPlaceholder}
              placeholderTextColor="#A7B4BB"
              style={styles.searchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query ? (
              <Pressable
                onPress={() => setQuery('')}
                style={({ pressed }) => [
                  styles.clearButton,
                  pressed ? styles.clearButtonPressed : null,
                ]}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <FlatList
          data={filteredItems}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const selected = item.id === selectedId

            return (
              <Pressable
                onPress={() => onSelect(item.id)}
                style={({ pressed }) => [
                  styles.row,
                  selected ? styles.rowSelected : null,
                  pressed ? styles.rowPressed : null,
                ]}
              >
                <View style={styles.rowText}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {item.title}
                  </Text>
                  {item.subtitle ? (
                    <Text numberOfLines={1} style={styles.rowSubtitle}>
                      {item.subtitle}
                    </Text>
                  ) : null}
                </View>

                {selected ? (
                  <View style={styles.checkWrap}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.primaryStrong} />
                  </View>
                ) : null}
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>{emptyTitle}</Text>
              <Text style={styles.emptyDescription}>{emptyDescription}</Text>
            </View>
          }
        />

        <View style={styles.fabArea}>
          <Pressable
            onPress={() => {
              blurActiveElement()
              onAdvance()
            }}
            disabled={advanceDisabled || advanceLoading}
            style={({ pressed }) => [
              styles.fab,
              advanceDisabled || advanceLoading ? styles.fabDisabled : null,
              pressed && !advanceDisabled && !advanceLoading ? styles.fabPressed : null,
            ]}
          >
            <Ionicons
              name={advanceLoading ? 'sync-outline' : 'arrow-forward'}
              size={22}
              color={colors.white}
            />
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },
  page: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonPressed: {
    backgroundColor: '#F3F7F8',
  },
  backButtonDisabled: {
    opacity: 0,
  },
  title: {
    flex: 1,
    color: colors.text,
    fontSize: 18,
    fontWeight: '500',
  },
  headerSpacer: {
    width: 36,
  },
  helperText: {
    paddingHorizontal: spacing.lg,
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: spacing.xs,
  },
  searchBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  searchLabel: {
    alignSelf: 'flex-start',
    marginLeft: spacing.sm,
    marginBottom: -8,
    backgroundColor: colors.white,
    zIndex: 2,
    paddingHorizontal: 4,
    color: colors.primaryStrong,
    fontSize: 12,
    fontWeight: '500',
  },
  searchShell: {
    minHeight: 52,
    borderRadius: 4,
    borderWidth: 1.4,
    borderColor: '#C9D7DE',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: spacing.md,
    color: colors.text,
    fontSize: 18,
  },
  clearButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  clearButtonPressed: {
    backgroundColor: '#F3F7F8',
  },
  listContent: {
    paddingBottom: 120,
  },
  row: {
    minHeight: 58,
    borderBottomWidth: 1,
    borderBottomColor: '#E7ECEF',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
  },
  rowPressed: {
    backgroundColor: '#F8FBFC',
  },
  rowSelected: {
    backgroundColor: '#F8FAFB',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E6ECEF',
    marginHorizontal: 6,
    marginTop: 6,
    borderBottomWidth: 1,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '400',
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
  },
  checkWrap: {
    width: 28,
    alignItems: 'center',
  },
  emptyState: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  fabArea: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      web: {
        boxShadow: '0px 8px 16px rgba(23, 56, 66, 0.16)',
      },
      default: {
        shadowColor: '#173842',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.16,
        shadowRadius: 16,
        elevation: 10,
      },
    }),
  },
  fabPressed: {
    transform: [{ scale: 0.97 }],
  },
  fabDisabled: {
    opacity: 0.38,
  },
})
