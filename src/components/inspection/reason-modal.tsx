import { useState, type ReactNode } from 'react'
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, View } from 'react-native'
import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { colors, radius, spacing } from '@/constants/theme'

const MIN_REASON = 3
const MAX_REASON = 500

type ReasonModalProps = {
  visible: boolean
  title: string
  description: string
  label: string
  placeholder: string
  confirmLabel: string
  tone?: 'primary' | 'danger'
  /** Extra fields above the reason (e.g. the inspection type). */
  children?: ReactNode
  onCancel: () => void
  onConfirm: (reason: string) => Promise<void>
}

/** Asks for the reason the API requires (3 to 500 characters). */
export function ReasonModal({
  visible,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  tone = 'primary',
  children,
  onCancel,
  onConfirm,
}: ReasonModalProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const valid = reason.trim().length >= MIN_REASON

  const close = () => {
    if (busy) return
    setReason('')
    onCancel()
  }

  const confirm = async () => {
    if (!valid || busy) return
    setBusy(true)
    try {
      await onConfirm(reason.trim())
      setReason('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          {children}
          <TextField
            label={label}
            value={reason}
            onChangeText={setReason}
            placeholder={placeholder}
            multiline
            maxLength={MAX_REASON}
            style={styles.input}
          />
          <View style={styles.actions}>
            <View style={styles.action}>
              <Button variant="secondary" onPress={close} disabled={busy}>
                Cancelar
              </Button>
            </View>
            <View style={styles.action}>
              <Button
                variant={tone === 'danger' ? 'danger' : 'primary'}
                onPress={() => void confirm()}
                disabled={!valid}
                loading={busy}
              >
                {confirmLabel}
              </Button>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: 'rgba(17, 24, 39, 0.55)',
  },
  sheet: {
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  input: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
  },
})
