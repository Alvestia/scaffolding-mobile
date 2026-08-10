import { useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { router } from 'expo-router'
import Constants from 'expo-constants'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { StatusBar } from 'expo-status-bar'
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing } from '@/constants/theme'
import { kaeferWordmark } from '@/constants/brand-assets'
import { login, upgradeLegacyDeviceSession } from '@/services/auth.service'
import { refreshAuthenticatedSessionAccess } from '@/services/auth-session.service'
import { getBiometricCapability } from '@/services/biometric-auth.service'
import { prefetchOfflineCatalogs } from '@/services/catalog-preload.service'
import { queryClient } from '@/providers/app-providers'
import { useAuthStore } from '@/store/auth-store'
import { useOperationalContextStore } from '@/store/operational-context-store'
import { useConnectivityStore } from '@/store/connectivity-store'
import type { AuthUser } from '@/types/auth'
import { confirmBiometricLoginActivation } from '@/utils/biometric-login-prompt'
import { loginSchema, type LoginSchema } from '@/validators/auth'
import { isOfflineLikeError } from '@/utils/error'

export default function LoginPage() {
  const setSession = useAuthStore((state) => state.setSession)
  const setUserProfile = useAuthStore((state) => state.setUserProfile)
  const clearSession = useAuthStore((state) => state.clearSession)
  const setBiometricLoginEnabled = useAuthStore((state) => state.setBiometricLoginEnabled)
  const unlockWithBiometrics = useAuthStore((state) => state.unlockWithBiometrics)
  const hasLockedSession = useAuthStore((state) => state.hasLockedSession)
  const lockedUser = useAuthStore((state) => state.lockedUser)
  const biometricLabel = useAuthStore((state) => state.biometricLabel)
  const isConnected = useConnectivityStore((state) => state.isConnected)
  const resetContext = useOperationalContextStore((state) => state.reset)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isBiometricSubmitting, setIsBiometricSubmitting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const appVersion = useMemo(
    () =>
      Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0',
    [],
  )

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginSchema>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const offerBiometricLogin = async () => {
    const capability = await getBiometricCapability()

    if (!capability.available) {
      return
    }

    await confirmBiometricLoginActivation({
      label: capability.label,
      onConfirm: async () => {
        await setBiometricLoginEnabled(true)
      },
    })
  }

  const finalizeAuthenticatedSession = async (sessionUser: AuthUser) => {
    let currentUser = sessionUser

    if (isConnected) {
      try {
        currentUser = await refreshAuthenticatedSessionAccess(sessionUser)
        await setUserProfile(currentUser)
      } catch (error) {
        if (!isOfflineLikeError(error) && !useAuthStore.getState().accessToken) {
          throw error
        }
      }
    }

    void prefetchOfflineCatalogs()
    router.replace('/')
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      setSubmitError(null)
      setIsSubmitting(true)
      resetContext()
      queryClient.clear()
      const response = await login(values)
      await clearSession()
      await setSession(response)

      try {
        const currentUser = await refreshAuthenticatedSessionAccess(response.user)
        await setUserProfile(currentUser)
      } catch (error) {
        if (!isOfflineLikeError(error) && !useAuthStore.getState().accessToken) {
          throw error
        }
      }

      await offerBiometricLogin()
      // Baixa catálogos de referência para permitir uso offline posteriormente.
      void prefetchOfflineCatalogs()

      router.replace('/')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Nao foi possivel entrar agora.')
    } finally {
      setIsSubmitting(false)
    }
  })

  const handleBiometricLogin = async () => {
    try {
      setSubmitError(null)
      setIsBiometricSubmitting(true)
      resetContext()
      queryClient.clear()
      let session = await unlockWithBiometrics()

      if (!session) {
        return
      }

      if (session.sessionMode !== 'DEVICE' && isConnected) {
        const upgradedSession = await upgradeLegacyDeviceSession()

        if (upgradedSession) {
          await setSession(upgradedSession)
          session = upgradedSession
        }
      }

      await finalizeAuthenticatedSession(session.user)
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : 'Nao foi possivel entrar com biometria.',
      )
    } finally {
      setIsBiometricSubmitting(false)
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right', 'bottom']} style={styles.safeArea}>
      <StatusBar style="light" />

      <LinearGradient
        colors={[colors.primaryStrong, '#344F5B', colors.primary]}
        locations={[0, 0.7, 1]}
        style={styles.gradient}
      >
        <KeyboardAvoidingView
          style={styles.keyboard}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.page}>
            <View style={styles.topSpacer} />

            <View style={styles.content}>
              <View style={styles.brandLockup}>
                <Image source={kaeferWordmark} style={styles.brandLogo} resizeMode="contain" />
                <Text style={styles.brandSubtitle}>Scaffold Management System</Text>
              </View>

              <View style={styles.formCard}>
                <View style={styles.formHeading}>
                  <Text style={styles.formTitle}>Acesso operacional</Text>
                  <Text style={styles.formSubtitle}>
                    Entre com as mesmas credenciais da plataforma Scaffold.
                  </Text>
                </View>

                <View style={styles.form}>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.fieldBlock}>
                        <TextInput
                          value={value}
                          onChangeText={onChange}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          autoComplete="email"
                          placeholder="Email"
                          placeholderTextColor="#A2B2B9"
                          style={[styles.input, errors.email ? styles.inputError : null]}
                        />
                        {errors.email?.message ? (
                          <Text style={styles.fieldError}>{errors.email.message}</Text>
                        ) : null}
                      </View>
                    )}
                  />

                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, value } }) => (
                      <View style={styles.fieldBlock}>
                        <View
                          style={[styles.passwordShell, errors.password ? styles.inputError : null]}
                        >
                          <TextInput
                            value={value}
                            onChangeText={onChange}
                            secureTextEntry={!showPassword}
                            autoCapitalize="none"
                            autoCorrect={false}
                            autoComplete="current-password"
                            placeholder="Senha"
                            placeholderTextColor="#A2B2B9"
                            style={styles.passwordInput}
                          />
                          <Pressable
                            onPress={() => setShowPassword((current) => !current)}
                            style={({ pressed }) => [
                              styles.eyeButton,
                              pressed ? styles.eyeButtonPressed : null,
                            ]}
                          >
                            <Ionicons
                              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                              size={20}
                              color="#A2B2B9"
                            />
                          </Pressable>
                        </View>
                        {errors.password?.message ? (
                          <Text style={styles.fieldError}>{errors.password.message}</Text>
                        ) : null}
                      </View>
                    )}
                  />

                  {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}

                  <Pressable
                    onPress={onSubmit}
                    disabled={isSubmitting || isBiometricSubmitting}
                    style={({ pressed }) => [
                      styles.submitButton,
                      pressed && !isSubmitting && !isBiometricSubmitting
                        ? styles.submitButtonPressed
                        : null,
                      isSubmitting || isBiometricSubmitting ? styles.submitButtonDisabled : null,
                    ]}
                  >
                    <Text style={styles.submitLabel}>
                      {isSubmitting ? 'Entrando...' : 'Entrar'}
                    </Text>
                    <Ionicons name="arrow-forward-outline" size={18} color={colors.white} />
                  </Pressable>

                  {hasLockedSession ? (
                    <Pressable
                      onPress={() => void handleBiometricLogin()}
                      disabled={isSubmitting || isBiometricSubmitting}
                      style={({ pressed }) => [
                        styles.biometricButton,
                        pressed && !isSubmitting && !isBiometricSubmitting
                          ? styles.biometricButtonPressed
                          : null,
                        isSubmitting || isBiometricSubmitting ? styles.submitButtonDisabled : null,
                      ]}
                    >
                      <Ionicons
                        name="finger-print-outline"
                        size={18}
                        color={colors.primaryStrong}
                      />
                      <View style={styles.biometricTextBlock}>
                        <Text style={styles.biometricLabel}>
                          {isBiometricSubmitting
                            ? 'Validando biometria...'
                            : `Entrar com ${biometricLabel ?? 'biometria'}`}
                        </Text>
                        {lockedUser ? (
                          <Text numberOfLines={1} style={styles.biometricHint}>
                            {lockedUser.name || lockedUser.email}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerLine}>Scaffold Mobile · Versao {appVersion}</Text>
              <Text style={styles.footerLineSecondary}>© KAEFER</Text>
            </View>
          </View>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.primaryStrong,
  },
  gradient: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  page: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  topSpacer: {
    height: 12,
  },
  content: {
    alignItems: 'center',
    gap: 28,
  },
  brandLockup: {
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  brandLogo: {
    width: 210,
    height: 54,
  },
  brandSubtitle: {
    color: colors.white,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  formCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 12,
    backgroundColor: colors.surface,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  formHeading: {
    gap: spacing.xs,
  },
  formTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  formSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  form: {
    width: '100%',
    gap: 18,
  },
  fieldBlock: {
    gap: 6,
  },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 4,
    paddingHorizontal: 14,
    color: colors.text,
    fontSize: 15,
  },
  passwordShell: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 4,
    paddingLeft: 14,
    paddingRight: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordInput: {
    flex: 1,
    height: '100%',
    color: colors.text,
    fontSize: 16,
  },
  eyeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyeButtonPressed: {
    backgroundColor: '#F2F6F8',
  },
  inputError: {
    borderColor: '#D07B6D',
  },
  fieldError: {
    color: colors.danger,
    fontSize: 12,
    paddingLeft: 2,
  },
  submitError: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'left',
  },
  submitButton: {
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 2,
  },
  submitButtonPressed: {
    opacity: 0.92,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  biometricButton: {
    minHeight: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
  },
  biometricButtonPressed: {
    opacity: 0.86,
  },
  biometricTextBlock: {
    flex: 1,
    gap: 2,
  },
  biometricLabel: {
    color: colors.primaryStrong,
    fontSize: 14,
    fontWeight: '700',
  },
  biometricHint: {
    color: colors.textMuted,
    fontSize: 11,
  },
  footer: {
    alignItems: 'center',
    gap: 4,
    paddingBottom: spacing.sm,
  },
  footerLine: {
    color: colors.white,
    fontSize: 12,
    textAlign: 'center',
  },
  footerLineSecondary: {
    color: colors.white,
    fontSize: 12,
    textAlign: 'center',
    opacity: 0.85,
  },
})
