// Message for the login screen when the server ends a field account on this
// phone. No imports: the API client uses it while the sync store registers the
// counter, without an import cycle between them.
let countUnsentRecords: () => number = () => 0

export function setUnsentRecordsCounter(counter: () => number) {
  countUnsentRecords = counter
}

export function fieldAccessEndedNotice() {
  let unsent = 0
  try {
    unsent = countUnsentRecords()
  } catch {
    unsent = 0
  }
  return (
    'O acesso deste celular foi encerrado: o funcionário foi inativado ou o acesso foi revogado. ' +
    'Procure o responsável pelo contrato para receber um novo código.' +
    (unsent > 0
      ? ` ${unsent} registro(s) feito(s) neste aparelho não foram enviados e não serão aceitos.`
      : '')
  )
}
