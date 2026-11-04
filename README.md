# Scaffold Mobile

eas build --platform android --profile preview

outras, development e production

Aplicativo Expo/React Native para operação de campo do Scaffold, alinhado à API desta plataforma e preparado para uso offline-first.

## Funcionalidades

- login e sessão revogável vinculada ao aparelho;
- reentrada offline com credencial no SecureStore e biometria opcional;
- escolha de unidade, contrato e equipe operacional;
- fila de execução com cache local;
- apontamentos e desvios operacionais online ou offline;
- execução em duas etapas: apontamento e finalização;
- avanço individual por componente e ajustes de metragem no andaime/componente;
- manutenção de membros da equipe;
- criação de andaime emergencial com execução inicial;
- evidências locais e upload idempotente;
- sincronização automática e manual com retentativa.

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

## Offline e sincronização

O SQLite mantém dados isolados por usuário e tenant:

- snapshots de fila e catálogos necessários ao escopo atual;
- outbox de mutações ainda não confirmadas;
- evidências pendentes;
- estado e lease de sincronização.

Mesmo quando há rede, mutações operacionais passam pelo mesmo mecanismo confiável da outbox. As chaves `mobileLocalId`, `clientMutationId` e `Idempotency-Key` permitem repetir uma tentativa após timeout sem criar duplicidades na API.

Na execução, a primeira etapa reúne produção, equipe, componentes e período. A finalização concentra revisão, observações, descontos/acréscimos e evidências. O app cria o apontamento, vincula os ajustes ao ID remoto criado e só depois envia as fotos.

Itens confirmados são removidos da outbox; pendências e evidências nunca são apagadas antes da confirmação remota.

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
