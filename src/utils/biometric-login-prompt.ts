import { Alert, Platform } from 'react-native'

type ConfirmBiometricLoginActivationInput = {
  label: string
  onConfirm: () => Promise<void>
}

export async function confirmBiometricLoginActivation({
  label,
  onConfirm,
}: ConfirmBiometricLoginActivationInput) {
  if (Platform.OS === 'web') {
    return
  }

  await new Promise<void>((resolve) => {
    Alert.alert(
      'Ativar biometria?',
      `Nas proximas entradas, voce podera liberar sua sessao com ${label}.`,
      [
        {
          text: 'Agora nao',
          style: 'cancel',
          onPress: () => resolve(),
        },
        {
          text: 'Ativar',
          onPress: () => {
            void (async () => {
              try {
                await onConfirm()
              } catch (error) {
                Alert.alert(
                  'Biometria nao ativada',
                  error instanceof Error
                    ? error.message
                    : 'Nao foi possivel ativar a biometria neste aparelho.',
                )
              } finally {
                resolve()
              }
            })()
          },
        },
      ],
    )
  })
}
