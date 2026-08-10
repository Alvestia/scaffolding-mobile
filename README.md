# Scaffold Mobile

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

O login `MOBILE` cria uma sessão de dispositivo. O access token é curto e fica somente em memória; a credencial revogável é guardada no SecureStore. No aplicativo nativo, essa é a proteção equivalente apropriada — `HttpOnly` se aplica ao cookie usado pela aplicação web.

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
npm run test:phase3
npm run security:secrets
npm run export:web
```



