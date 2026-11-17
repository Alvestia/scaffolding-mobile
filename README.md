# Scaffold Mobile

eas build --platform android --profile preview
# APK para testes
eas build --platform android --profile preview

# AAB para Google Play
eas build --platform android --profile production

outras, development e production

Aplicativo Expo/React Native para operação de campo do Scaffold, alinhado à API desta plataforma e preparado para uso offline-first.

## Funcionalidades

- login e sessão revogável vinculada ao aparelho;
- acesso de campo, para funcionários sem e-mail corporativo: código de ativação de uso único, celular vinculado e bloqueio de tela obrigatório;
- reentrada offline com credencial no SecureStore e biometria opcional;
- escolha de unidade, contrato e equipe operacional;
- fila de execução com cache local;
- apontamentos e desvios operacionais online ou offline; o desvio pode ser vinculado a uma OS e/ou a um andaime (com atividades na fila) ou ficar geral do contrato;
- execução em duas etapas: apontamento e finalização;
- avanço individual por componente e ajustes de metragem no andaime/componente;
- manutenção de membros da equipe;
- aba "Meu dia": os andaimes em que a pessoa logada lançou execução, por dia da semana, com navegação por semana e mês;
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

## Meu dia

A aba **Meu dia** mostra o que a pessoa logada lançou, dia a dia, no contrato selecionado. Abre no dia atual; a faixa SEG a DOM mostra quantos lançamentos houve em cada dia, as setas trocam de semana e o calendário (ícone ou nome do mês) salta para qualquer dia passado.

- **Fonte.** `GET /execution-entries/mine` (API), que devolve só os lançamentos da própria pessoa (`executedById`), exige `execution:create` e aceita no máximo 45 dias. Lançamentos cancelados não aparecem. A aba fica oculta para perfis sem `execution:create`.
- **Pendentes.** Os lançamentos ainda no aparelho entram na lista como "Aguardando envio" ou "Erro no envio"; tocar neles abre Pendências. Quando o envio termina, a cópia do servidor substitui a do aparelho (mesmo `clientMutationId`).
- **Offline.** As últimas 8 semanas/meses vistos ficam guardados no aparelho e são mostrados sem conexão, com aviso da hora em que foram carregados.
- **Dia.** O dia de cada lançamento é o do início, no relógio do aparelho. A API é consultada com um dia de folga de cada lado, porque ela corta os dias no horário de São Paulo.

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




## Preferências da Home e turno dos lançamentos

Na Home, a faixa recolhível **Padrão dos lançamentos**, abaixo do resumo do contrato,
permite salvar equipe ou funções com quantidades e turno para novas atividades e desvios. É possível fixar um turno,
escolher **Sem turno** ou manter a sugestão pelo horário. Cada lançamento pode
alterar os valores sem modificar o padrão salvo; rascunhos reabertos mantêm seus
próprios dados. Ao selecionar uma equipe, é possível visualizar seus integrantes,
adicionar funcionários ativos do mesmo contrato, remover pessoas e restaurar a
composição da equipe. Essa seleção fica salva localmente para os próximos
lançamentos; ela não altera o cadastro da equipe na API. Padrões antigos sem uma
composição personalizada continuam carregando os integrantes atuais da equipe.

O seletor de turno só aparece nos contratos com turnos cadastrados, tanto na
Home quanto em atividades e desvios. Um carregamento pendente ou sem cache
offline não apaga uma escolha já salva.

O padrão persiste no aparelho para o usuário e o contrato atuais. Trocar unidade,
contrato ou usuário, ou sair da conta, limpa o padrão para evitar misturar
equipes e turnos de contextos diferentes. A seleção funciona offline com os
catálogos já carregados. A atualização da base também baixa os turnos.

O normalizador da fila agora preserva `shiftId`, incluindo `null` explícito para
**Sem turno** e ausência do campo nos registros antigos. Antes, esse campo era
descartado ao preparar a sincronização e ao reabrir rascunhos. A API e a web já
suportam o turno; a correção está no mobile. Registros já sincronizados precisam
ser conferidos/corrigidos na web, pois não é possível reconstruir automaticamente
a escolha que foi perdida. Pendências que ainda guardam o turno passam a enviá-lo.

O menu no cabeçalho reúne a navegação e as ações da conta. No Android, **Sair do
aplicativo** fecha a tela sem limpar a sessão, o contexto ou as preferências.
**Logout** é uma ação separada, com confirmação e aviso sobre pendências e
reativação de contas de campo. A Home mostra os cartões de fila de execução,
novo andaime e desvios em uma coluna abaixo dos padrões de lançamento. O cartão
de inspeções aparece para quem tem `inspection:view`, seguindo a mesma regra
da navegação inferior e do menu. A página permite rolagem vertical.

O cadastro de andaime e o lançamento de montagem exigem GPS quando ainda não
há localização. Uma posição existente é preservada. A captura usa a cor primária
do aplicativo, funciona offline e não oferece a opção de continuar sem GPS.
Desmontagens e as regras de GPS das inspeções mantêm seus critérios próprios.

## APK e AAB pelo Expo/EAS

O perfil `preview` já contém `android.buildType: apk` e a URL HTTPS da API.
O APK funciona sem o servidor Metro. Neste ambiente WSL, gerar os pacotes
remotamente pelo EAS: builds nativos locais já excederam a memória disponível.
Execute na pasta `scaffolding-mobile`:

```bash
eas build --platform android --profile preview
```

O EAS fornece o link para baixar o APK. Preserve a mesma chave de assinatura
para atualizar uma instalação anterior. Uma atualização JavaScript/OTA não
substitui mudanças nativas do APK.

A ofuscação R8, a otimização e a redução de recursos estão habilitadas por padrão
em `preview` e `production`, com as regras de compatibilidade `Record`/`Field`
do Expo validadas no aparelho em 17/11/2026. Não há perfil separado nem variável
extra para ativar a ofuscação.

Para a Google Play, o perfil `production` gera AAB:

```bash
eas build --platform android --profile production
```

`npm run check:android-release` verifica a configuração sem compilar APK/AAB.
O manifesto declara orientação retrato e Wi-Fi como recursos opcionais para
evitar restrições indevidas de dispositivos no Google Play. Esse ajuste exige
um novo AAB gerado no EAS, sem mudar as regras de GPS dos lançamentos.
Os detalhes e a validação do pacote final estão em
[Qualidade do release Android](ANDROID_RELEASE_QUALITY.md).

O perfil `production` usa a versão remota e `autoIncrement`. Um APK bem-sucedido
não substitui a homologação do AAB, das bibliotecas de 16 KB e dos formulários
do Play Console.

Referências: [APK](https://docs.expo.dev/build-reference/apk/),
[EAS Build](https://docs.expo.dev/build/introduction/).
