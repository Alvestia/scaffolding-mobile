import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, radius, spacing } from '@/constants/theme'
import type { AuthUser } from '@/types/auth'
import { hasPermission } from '@/utils/inspection-rules'

export function UserMenu({
  visible,
  user,
  onClose,
  onLogout,
  onSync,
  canSync,
}: {
  visible: boolean
  user: AuthUser | null
  onClose: () => void
  onLogout: () => void
  onSync: () => void
  canSync: boolean
}) {
  const insets = useSafeAreaInsets()
  const routes = [
    { label: 'Início', icon: 'home-outline', path: '/(app)/(tabs)' },
    { label: 'Fila de execução', icon: 'list-outline', path: '/(app)/(tabs)/queue' },
    ...(hasPermission(user, 'execution:create')
      ? [{ label: 'Meu dia', icon: 'calendar-outline', path: '/(app)/(tabs)/my-day' }]
      : []),
    { label: 'Novo andaime', icon: 'add-circle-outline', path: '/(app)/(tabs)/emergency' },
    { label: 'Desvios', icon: 'alert-circle-outline', path: '/(app)/(tabs)/deviations' },
    ...(hasPermission(user, 'inspection:view')
      ? [
          {
            label: 'Inspeções',
            icon: 'shield-checkmark-outline',
            path: '/(app)/(tabs)/inspections',
          },
        ]
      : []),
    { label: 'Pendências', icon: 'cloud-upload-outline', path: '/(app)/(tabs)/sync' },
    { label: 'Unidade e contrato', icon: 'business-outline', path: '/(app)/context/unit' },
  ]
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: Math.max(insets.top, spacing.lg),
            paddingBottom: Math.max(insets.bottom, spacing.lg),
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Fechar menu"
          onPress={onClose}
          style={styles.backdrop}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.header}>
            <View style={styles.identity}>
              <Text style={styles.name}>{user?.name ?? 'Minha conta'}</Text>
              {user?.email ? <Text style={styles.detail}>{user.email}</Text> : null}
              {user?.roles?.length ? (
                <Text style={styles.detail}>{user.roles.map((role) => role.name).join(' • ')}</Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fechar menu"
              onPress={onClose}
              style={styles.close}
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {routes.map((item) => (
              <Pressable
                key={item.path}
                accessibilityRole="button"
                style={styles.row}
                onPress={() => {
                  onClose()
                  router.push(item.path as never)
                }}
              >
                <Ionicons
                  name={item.icon as keyof typeof Ionicons.glyphMap}
                  size={18}
                  color={colors.primaryStrong}
                />
                <Text style={styles.label}>{item.label}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              disabled={!canSync}
              style={[styles.row, !canSync && styles.disabled]}
              onPress={() => {
                onClose()
                onSync()
              }}
            >
              <Ionicons name="sync-outline" size={18} color={colors.primaryStrong} />
              <Text style={styles.label}>Atualizar base</Text>
            </Pressable>
            <View style={styles.divider} />
            {Platform.OS === 'android' ? (
              <Pressable
                accessibilityRole="button"
                style={styles.row}
                onPress={() => {
                  onClose()
                  BackHandler.exitApp()
                }}
              >
                <Ionicons name="exit-outline" size={18} color={colors.primaryStrong} />
                <View style={styles.identity}>
                  <Text style={styles.label}>Sair do aplicativo</Text>
                  <Text style={styles.detail}>Fechar mantendo o login</Text>
                </View>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              style={styles.row}
              onPress={() => {
                onClose()
                onLogout()
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={colors.danger} />
              <View style={styles.identity}>
                <Text style={[styles.label, styles.danger]}>Logout</Text>
                <Text style={styles.detail}>Encerrar a sessão neste aparelho</Text>
              </View>
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'flex-end',
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    overflow: 'hidden',
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  identity: { flex: 1, gap: 2 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700' },
  detail: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 46,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  label: { color: colors.text, fontSize: 14 },
  danger: { color: colors.danger },
  disabled: { opacity: 0.45 },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
})
