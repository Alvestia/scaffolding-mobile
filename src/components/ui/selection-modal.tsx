import { Ionicons } from '@expo/vector-icons'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Button } from '@/components/ui/button'
import { colors, radius, spacing } from '@/constants/theme'
import { blurActiveElement } from '@/utils/focus'

export type SelectionOption = {
  value: string
  label: string
  sublabel?: string | null
  caption?: string | null
  keywords?: string
  disabled?: boolean
}

type SelectionModalProps = {
  visible: boolean
  title: string
  subtitle?: string
  options: SelectionOption[]
  onClose: () => void
  onSelect?: (value: string) => void
  onConfirm?: (values: string[]) => void
  selectedValue?: string | null
  selectedValues?: string[]
  multiple?: boolean
  confirmLabel?: string
  searchPlaceholder?: string
  emptyMessage?: string
}

const EMPTY_SELECTION: string[] = []

export function SelectionModal({
  visible,
  title,
  subtitle,
  options,
  onClose,
  onSelect,
  onConfirm,
  selectedValue,
  selectedValues = EMPTY_SELECTION,
  multiple = false,
  confirmLabel = 'Aplicar selecao',
  searchPlaceholder = 'Buscar item',
  emptyMessage = 'Nenhum item encontrado.',
}: SelectionModalProps) {
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const [draftValues, setDraftValues] = useState<string[]>(selectedValues)
  const wasVisible = useRef(false)
  const listRef = useRef<FlatList<SelectionOption>>(null)

  useEffect(() => {
    if (visible && !wasVisible.current) {
      setSearch('')
      setDraftValues(selectedValues)
    }
    wasVisible.current = visible
  }, [selectedValues, visible])

  useEffect(() => {
    if (visible) listRef.current?.scrollToOffset({ offset: 0, animated: false })
  }, [search, visible])

  const filteredOptions = useMemo(() => {
    const normalized = search.trim().toLowerCase()

    if (!normalized) {
      return options
    }

    return options.filter((option) =>
      [option.label, option.sublabel, option.caption, option.keywords]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    )
  }, [options, search])

  const toggleDraftValue = (value: string) => {
    setDraftValues((current) =>
      current.includes(value) ? current.filter((item) => item !== value) : [...current, value],
    )
  }

  const handleClose = () => {
    blurActiveElement()
    onClose()
  }

  const content = (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      enabled={Platform.OS !== 'web'}
      style={[
        styles.overlay,
        Platform.OS === 'web'
          ? null
          : {
              paddingTop: Math.max(insets.top, spacing.sm),
              paddingBottom: Math.max(insets.bottom, spacing.sm),
            },
      ]}
    >
      <Pressable style={styles.backdrop} onPress={handleClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={searchPlaceholder}
            placeholderTextColor="#8AA0A8"
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={blurActiveElement}
          />
        </View>

        <FlatList
          ref={listRef}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          data={filteredOptions}
          extraData={multiple ? draftValues : selectedValue}
          keyExtractor={(item) => item.value}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = multiple
              ? draftValues.includes(item.value)
              : selectedValue === item.value

            return (
              <Pressable
                onPress={() => {
                  if (item.disabled) {
                    return
                  }

                  if (multiple) {
                    toggleDraftValue(item.value)
                    return
                  }

                  blurActiveElement()
                  onSelect?.(item.value)
                  handleClose()
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  isSelected ? styles.optionRowSelected : null,
                  item.disabled ? styles.optionRowDisabled : null,
                  pressed && !item.disabled ? styles.optionRowPressed : null,
                ]}
              >
                <View style={styles.optionText}>
                  <Text style={styles.optionLabel}>{item.label}</Text>
                  {item.sublabel ? (
                    <Text style={styles.optionSublabel}>{item.sublabel}</Text>
                  ) : null}
                  {item.caption ? <Text style={styles.optionCaption}>{item.caption}</Text> : null}
                </View>
                <View style={[styles.checkWrap, isSelected ? styles.checkWrapSelected : null]}>
                  {isSelected ? <Ionicons name="checkmark" size={16} color={colors.white} /> : null}
                </View>
              </Pressable>
            )
          }}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Nada por aqui</Text>
              <Text style={styles.emptyMessage}>{emptyMessage}</Text>
            </View>
          }
        />

        {multiple ? (
          <View style={styles.footer}>
            <Button variant="secondary" onPress={handleClose}>
              Cancelar
            </Button>
            <Button
              onPress={() => {
                blurActiveElement()
                onConfirm?.(draftValues)
                handleClose()
              }}
            >
              {confirmLabel}
            </Button>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  )

  if (!visible) {
    return null
  }

  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') {
      return null
    }

    return createPortal(content, document.body)
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      {content}
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    ...Platform.select({
      web: {
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        zIndex: 9999,
      },
      default: null,
    }),
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(23, 56, 66, 0.36)',
  },
  sheet: {
    height: '88%',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  closeButton: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchWrap: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  listContent: {
    gap: spacing.xs,
    paddingBottom: spacing.sm,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  optionRow: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  optionRowSelected: {
    borderColor: '#2A6E88',
    backgroundColor: '#EEF7FA',
  },
  optionRowDisabled: {
    opacity: 0.45,
  },
  optionRowPressed: {
    transform: [{ scale: 0.995 }],
  },
  optionText: {
    flex: 1,
    gap: 2,
  },
  optionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  optionSublabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  optionCaption: {
    color: colors.textMuted,
    fontSize: 11,
  },
  checkWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkWrapSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  emptyState: {
    paddingVertical: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyMessage: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
  },
  footer: {
    gap: spacing.sm,
  },
})
