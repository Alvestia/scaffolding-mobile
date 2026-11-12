# Scaffold Mobile

eas build --platform android --profile preview

outras, development e production

Aplicativo Expo/React Native para operação de campo do Scaffold, alinhado à API desta plataforma e preparado para uso offline-first.

## Funcionalidades

- login e sessão revogável vinculada ao aparelho;
- acesso de campo, para funcionários sem e-mail corporativo: código de ativação de uso único, celular vinculado e bloqueio de tela obrigatório;
- reentrada offline com credencial no SecureStore e biometria opcional;
- escolha de unidade, contrato e equipe operacional;
- fila de execução com cache local;
- apontamentos e desvios operacionais online ou offline;
- execução em duas etapas: apontamento e finalização;
- avanço individual por componente e ajustes de metragem no andaime/componente;
- manutenção de membros da equipe;
- cadastro de andaime em campo (aba "Novo"), planejado ou emergencial conforme a OM/OS, seguindo direto para o lançamento da montagem;
- evidências locais e upload idempotente;
- sincronização automática e manual com retentativa;
- inspeções de andaime offline: leitura do QR Code da placa, checklist, fotos, assinatura e GPS quando a regra exige;
- interdição de andaime e inspeção manual (extraordinária ou avulsa);
- aviso de disponibilidade (interditado, aguardando liberação, com restrição) na fila de execução.

O app não possui fluxo local de primeiro acesso/troca de senha nem cadastro de turno, porque essas capacidades não fazem parte do backend atual.

## Stack

- React Native, Expo e Expo Router;
- TypeScript;
- Zustand e TanStack Query;
- Expo SQLite, AsyncStorage e SecureStore;
- NetInfo, Axios, React Hook Form e Zod.

## Sessão segura

O login `MOBILE` cria uma sessão de dispositivo. O access token é curto e, junto com a credencial revogável, é guardado no SecureStore para retomada da sessão offline. No Android/iOS, a indisponibilidade do SecureStore bloqueia a operação; não há fallback para armazenamento comum. No aplicativo nativo, essa é a proteção equivalente apropriada — `HttpOnly` se aplica ao cookie usado pela aplicação web.

Na tela de login, **Manter conectado neste aparelho** vem marcado e o aparelho lembra a última escolha:

- marcado: o app reabre conectado, sem senha, até o usuário sair, a credencial ser revogada ou expirar no servidor (`AUTH_DEVICE_SESSION_TTL_DAYS`, padrão 180 dias, sem renovação automática);
- desmarcado (aparelho compartilhado): a sessão termina 12 horas após o login (`SHIFT_SESSION_TTL_HOURS`). O prazo é verificado ao abrir o app e quando ele volta ao primeiro plano, nunca no meio de um registro. Ao vencer, a credencial é revogada na API quando possível.

Só um HTTP 401 em `/auth/refresh` apaga a credencial do aparelho. Um 403 de proxy ou firewall, timeouts e erros 5xx mantêm a sessão. Se a sessão salva não puder ser lida na inicialização, a tela de erro permite descartá-la e entrar com e-mail e senha, preservando os registros locais.

Rotas consumidas:

- `POST /auth/login`;
- `GET /auth/me`;
- `POST /auth/refresh`;
- `POST /auth/logout`;
- `POST /auth/device-session`.

## Novo andaime

A aba **Novo** cadastra o andaime em campo.

- **Origem.** A OM/OS decide: com ela, o andaime é planejado; sem ela, emergencial. A regra final é da API (`resolveFieldScaffoldOrigin`, em `scaffolding-api/src/scaffolds/scaffolds.service.ts`), que reconhece os cadastros do app pelo `mobileLocalId`. Nos contratos com módulo de projetos, o andaime criado no app é sempre emergencial, porque um planejado ficaria bloqueado até a aprovação do projeto.
- **Depois de salvar.** O app abre direto o lançamento da montagem do andaime, sem perguntar, online ou offline. A fila filtrada nesse andaime fica por baixo, então "voltar" cai nas atividades dele. Sem serviço de montagem, ou ao criar vários andaimes de uma vez, abre a fila.

## Teclado

O Android desenha a tela de borda a borda e não encolhe mais a janela quando o teclado abre. As telas com campos usam `KeyboardAvoider` (`src/components/ui/keyboard-avoider.tsx`), que mede quanto da tela o teclado cobre e reserva esse espaço, no Android e no iOS. O conteúdo fica num `ScrollView`, que traz o campo em foco para a área visível. O editor de componente do novo andaime é uma camada sobre a tela, na mesma janela do app, e não um `Modal`: no Android o `Modal` é outra janela, e ali o ajuste do `KeyboardAvoidingView` brigava com o redimensionamento do sistema, fazendo o editor piscar. Os modais de seleção continuam com o `KeyboardAvoidingView` nativo.

## Acesso de campo (sem e-mail)

Para encarregados sem e-mail corporativo. A conta pertence ao funcionário do cadastro e só entra no aplicativo. Regras e rotas da API: `scaffolding-api/docs/acesso-campo.md`.

- **Ativação.** Na tela de login, "Sem e-mail corporativo? Entrar com código de acesso". O funcionário lê o QR Code (`SCAFFOLD-CAMPO:<código>`) ou digita o código (`XXXX-XXXX`) que o responsável gerou na web. O código vale uma vez e o app chama `POST /auth/field/activate`.
- **Bloqueio de tela obrigatório.** A conta não tem senha. Por isso:
  - um celular sem PIN, padrão, senha ou biometria não ativa a conta, e o app checa isso antes de gastar o código;
  - o app pede esse bloqueio a cada abertura e depois de 5 minutos fora dele;
  - o bloqueio fica por cima da navegação, então ao desbloquear o funcionário volta à mesma tela.
- **Sessão.** A sessão é sempre a do aparelho, com "Manter conectado". O servidor renova a validade a cada uso.
- **Fim do acesso.** Quando o funcionário é inativado ou o acesso é revogado, a próxima renovação recebe 401 e o app sai da conta. A tela de login mostra o motivo e quantos registros ficaram sem enviar, porque esses registros não são aceitos. Ao tocar em Sair, o app avisa que só volta com um novo código.

## Offline e sincronização

O SQLite mantém dados isolados por usuário e tenant:

- snapshots de fila e catálogos necessários ao escopo atual;
- outbox de mutações ainda não confirmadas;
- evidências pendentes;
- estado e lease de sincronização.

Mesmo quando há rede, mutações operacionais passam pelo mesmo mecanismo confiável da outbox. As chaves `mobileLocalId`, `clientMutationId` e `Idempotency-Key` permitem repetir uma tentativa após timeout sem criar duplicidades na API.

Na execução, a primeira etapa reúne produção, equipe, componentes e período. A finalização concentra revisão, observações, descontos/acréscimos e evidências. O app cria o apontamento, vincula os ajustes ao ID remoto criado e só depois envia as fotos.

Itens confirmados são removidos da outbox; pendências e evidências nunca são apagadas antes da confirmação remota.

## Inspeções

A aba **Inspeções** aparece para quem tem `inspection:view` e só mostra conteúdo nos contratos com política de inspeção publicada. Regras de negócio e rotas da API: `scaffolding-api/docs/inspecoes.md`.

- **Base offline.** A sincronização baixa, por contrato, `GET /inspections/offline-pack`: inspeções abertas com o que já foi respondido, os checklists usados e os andaimes em campo com a disponibilidade. Fica no SQLite (`reference_records`) e é usada sem rede.
- **QR Code.** A câmera lê a placa (`<front>/placa/<código>`). O app calcula o SHA-256 do código e procura o andaime pelo `plateHash` da base; o código da placa, que abre a página pública, não é guardado no aparelho.
- **Execução.** O rascunho (respostas, fotos e assinatura) é salvo no aparelho a cada alteração. Antes de concluir, o app aplica as mesmas regras da API: itens obrigatórios, justificativas, fotos por item, fotos só da câmera, assinatura e GPS. Quem tem `inspection:perform` sem `inspection:release` envia as respostas sem concluir.
- **Envio.** "Concluir" põe a inspeção na outbox (`inspection_submission`). A sincronização confere se ninguém mais assumiu a inspeção, inicia com a hora do aparelho, envia as respostas, cada arquivo (`Idempotency-Key` por arquivo) e conclui com `clientMutationId`. Uma falha no meio retoma do ponto em que parou. Inspeção concluída ou assumida por outra pessoa vira **Conflito** em Pendências.
- **GPS.** Pedido só ao concluir uma inspeção cuja regra exige localização, em primeiro plano, sem rastreamento em segundo plano (`ACCESS_BACKGROUND_LOCATION` bloqueada). Depende do aval da CIT (LGPD).
- **Interdição e inspeção manual.** Com rede, são enviadas na hora; sem rede, vão para a outbox (`scaffold_interdiction`, `inspection_manual`) e o andaime aparece como "Interditado (no aparelho)" até o envio. A inspeção manual usa `Idempotency-Key`: o reenvio devolve a mesma inspeção. A retirada da interdição continua no sistema web.
- **Fila de execução.** `GET /inspections/availability-map` (exige `scaffold:view`) alimenta o selo no cabeçalho de cada andaime da fila e o aviso no detalhe e no lançamento do serviço.

Módulos nativos usados: `expo-camera` (QR Code), `expo-location` (GPS) e `react-native-svg` (assinatura). Ao adicioná-los, é preciso gerar um novo APK; a atualização OTA não basta.

## Configuração

```bash
cp .env.example .env
npm install
npm run start
```

Variáveis:

```env
EXPO_PUBLIC_API_URL=http://localhost:3089
EXPO_PUBLIC_REQUEST_TIMEOUT_MS=30000
```

No emulador Android, a API local normalmente deve usar `10.0.2.2` em vez de `localhost`. Em aparelho físico, use um endereço HTTPS ou o IP acessível na rede de desenvolvimento.

## Qualidade

```bash
npm run typecheck
npm run lint
npm run test:mobile
npm run security:secrets
npm run export:web
```




## APK local, sem usar a cota de builds do EAS

O perfil `preview` já contém `android.buildType: apk` e a URL HTTPS da API.
O APK funciona sem o servidor Metro. Execute na pasta `scaffolding-mobile`:

```bash
npm run build:apk:local
```

Equivalente:

```bash
eas build --platform android --profile preview --local --output ./scaffold-mobile.apk
```

O arquivo final será `scaffold-mobile.apk`. A compilação ocorre nesta máquina.
O EAS ainda exige autenticação (`eas login`) e acesso para consultar o projeto
ou obter as credenciais de assinatura configuradas. Preserve a mesma chave de
assinatura para atualizar uma instalação anterior.

Pré-requisitos: Node 24, EAS CLI, JDK 17 e Android SDK/NDK compatíveis com o
Expo SDK 55. Instale pelo Android Studio/SDK Manager a plataforma Android 36,
Build Tools e NDK exigidos pelo projeto gerado; configure `JAVA_HOME`,
`ANDROID_HOME` e o `PATH` das ferramentas. Confira `java -version`,
`adb --version` e `sdkmanager --list_installed` antes do build.

As variáveis deste WSL foram configuradas em `~/.config/android/env.sh`,
carregado por `~/.bashrc` e `~/.profile`:

```bash
export JAVA_HOME="/usr/lib/jvm/java-17-openjdk-amd64"
export ANDROID_HOME="$HOME/Android/Sdk"
```

Para atualizar um terminal que já estava aberto:

```bash
source ~/.config/android/env.sh
```

O SDK deste projeto utiliza Android 36, Build Tools 36.0.0, NDK
27.1.12297006 e CMake 3.22.1. Não é necessário instalar Gradle globalmente;
o build utiliza o wrapper do projeto Android gerado.

Em WSL, as ferramentas precisam estar disponíveis dentro do Linux. O Expo
não oferece suporte oficial a builds locais em Windows/WSL; Linux e macOS são
suportados. Não é necessário pagar um plano para compilar na própria máquina.

Para a Google Play, o perfil `production` continua gerando AAB:

```bash
eas build --platform android --profile production --local --output ./scaffold-mobile.aab
```

Esse perfil usa a versão remota e `autoIncrement`. Um APK local bem-sucedido
não substitui a homologação do AAB, das bibliotecas de 16 KB e dos formulários
do Play Console.

Referências: [EAS local](https://docs.expo.dev/build-reference/local-builds/),
[APK](https://docs.expo.dev/build-reference/apk/),
[build de release local](https://docs.expo.dev/guides/local-app-production/).
