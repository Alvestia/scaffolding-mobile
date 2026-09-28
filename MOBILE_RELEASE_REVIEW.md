# Revisão do Mobile: API, segurança, qualidade e Google Play

Data: 28/09/2026. Escopo: `scaffolding-mobile` e contratos locais de
`scaffolding-api`. Foram preservadas as alterações das revisões anteriores.
Não houve publicação, acesso ao Play Console, migração ou alteração da API de produção.

## Resultado

As correções descritas abaixo estão aplicadas. Tipos, lint, varredura de segredos
e 56 testes do Mobile passaram; o Expo Doctor aprovou 20/20 verificações.
A configuração Android foi gerada em uma cópia temporária e inspecionada.
Isso não equivale a aprovação de publicação: faltam o AAB assinado, a homologação
em aparelho e as declarações do Play Console. A política de privacidade foi
adiada a pedido do responsável — OK para tratar depois nesta revisão, sem
considerá-la implementada ou dispensada pela Google Play.

## Correções desta revisão

| Área | Problema e tratamento |
| --- | --- |
| Permissões | O manifesto gerado incluía microfone, leitura de armazenamento e sobreposição sem uso funcional. Bloqueados `RECORD_AUDIO`, `READ_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `READ_MEDIA_VIDEO` e `SYSTEM_ALERT_WINDOW`. |
| Fotos | Os dois seletores passaram a usar diretamente o seletor do sistema, sem pedir acesso amplo à galeria. A câmera continua solicitando autorização quando utilizada. `WRITE_EXTERNAL_STORAGE` permanece somente até API 28, pois o módulo de câmera do Expo exige essa permissão nesses aparelhos antigos. |
| Contrato de mídia | Antes de persistir fotos, o app valida os tipos JPEG/PNG/GIF/WebP e o teto de 50 MB definidos na API. Falhas de seleção/câmera são apresentadas ao usuário. HEIC não é convertido automaticamente: o usuário recebe a indicação dos formatos aceitos. |
| Backup Android | `allowBackup=false` e regras explícitas de exclusão dos dados locais de backup e transferência entre aparelhos. Evita copiar fotos, cache e outbox para outro dispositivo sem suas chaves. |
| Transporte | HTTP bloqueado no manifesto de release e na configuração JS de produção. URL com credenciais, query ou fragmento é rejeitada. Timeout inválido ou ilimitado é rejeitado. O endereço padrão foi alinhado ao domínio HTTPS já configurado nos perfis EAS. HTTP continua permitido em desenvolvimento. |
| Criptografia offline | Gravações simultâneas na primeira utilização compartilham a mesma criação de chave AES-GCM. Antes, cada chamada podia gerar uma chave distinta e sobrescrever a persistida, tornando dados ilegíveis. A leitura de dados cifrados sem chave agora falha sem criar uma chave substituta. |
| Armazenamento seguro | Android/iOS deixam de usar armazenamento comum como alternativa quando faltam as funções do SecureStore. A alternativa web permanece e não tem o mesmo modelo de segurança do aplicativo nativo. |
| Sessão | Renovação de sessão verifica identidade antes/depois da persistência. Uma resposta atrasada não pode reativar o usuário que saiu, reenviar uma requisição com outra conta ou limpar a sessão nova. Renovações simultâneas são agrupadas por geração de identidade. Gravação e remoção de sessão são serializadas. |
| Cache | Oito consultas de catálogos deixam de esconder 401/403/404 com cache. O fallback permanece para falhas transitórias de rede/servidor. |
| Outbox | A interface deixa de oferecer edição de execução já recebida pelo servidor ou em envio. O repositório também bloqueia a substituição e impede recriar um rascunho que desapareceu durante a edição. Correções permitidas preservam a chave de idempotência e a data original. |
| Inicialização | Falhas do SQLite ou da hidratação de sessão mostram mensagem e tentativa novamente, preservando os registros. Uma falha ao abrir o banco deixa de ficar permanentemente memorizada como uma Promise rejeitada. |
| Dependências | Atualizados os patches recomendados do Expo SDK 55 e React Native 0.83.10, além das dependências transitivas com correções compatíveis. A auditoria passou de 22 alertas (6 altos) para 14 moderados, sem altos/críticos. |
| Links externos | Adicionada validação de tamanho, caracteres de controle e percent-encoding em `+native-intent`, antes do processamento de links externos pelo Expo Router. |
| Documentação | Corrigida a descrição de sessão: o access token também é persistido no SecureStore para retomada offline; não fica exclusivamente em memória. Documentado e adicionado comando de APK local. |

## Compatibilidade com a API

Foram comparados serviços móveis e contratos locais de autenticação, execução,
desvio, mídia, componentes e ajustes. Os endpoints de login móvel, refresh,
logout e upgrade de sessão existem. Identificação de dispositivo, perfil e
credencial seguem os DTOs atuais. O identificador do dispositivo é gerado pelo
aplicativo; não utiliza IMEI.

Execuções e desvios enviam `clientMutationId` e `Idempotency-Key`. Execuções
mantêm `expectedBasisVersion`; os testes anteriores de revisão da base,
quantidade/percentual e preservação de conflitos continuam passando. O envio de
mídia usa multipart autenticado e idempotência por evidência. O cabeçalho
`X-Content-SHA256` enviado pelo Mobile não é consumido pelos controllers de mídia
analisados: não deve ser apresentado como validação de integridade pelo servidor.

A validação realizada é de código/contrato e de comportamento local, com
substitutos para rede e componentes nativos. Não foi realizado login ou upload
real no ambiente de produção. A tentativa de testes Jest da API foi interrompida;
seu resultado não foi contabilizado como aprovado.

## Alertas moderados restantes

Os 14 registros do `npm audit` derivam de duas causas, propagadas pela árvore:

- `decode-uri-component` via `query-string`/Expo Router: decodificação de entradas
  malformadas pode consumir CPU excessiva. A versão corrigida é 0.5.0, que muda
  o formato do módulo para ESM; o consumidor instalado usa CommonJS. Foi aplicada
  proteção na entrada dos links nativos. Isso reduz a exposição desse fluxo, mas
  não remove o alerta nem comprova cobertura de todos os parsers ou da versão web.
  [Advisory oficial](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
- `uuid` via `xcode` e ferramentas Expo: o advisory afeta variantes v3/v5/v6 com
  buffer. O `xcode` instalado foi inspecionado e utiliza `uuid.v4()` sem buffer;
  essa ferramenta não integra o runtime Android. O pacote continua sinalizado e
  exige acompanhamento/atualização upstream.
  [Advisory oficial](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

Não foi aplicado `npm audit fix --force`, cuja sugestão incluía versões principais
incompatíveis e até downgrade do Expo. Não há declaração de ausência total de
vulnerabilidades ou de certificação de segurança.

## Google Play: evidências e pendências

| Requisito | Evidência ou ação necessária |
| --- | --- |
| Target Android | O plugin local fixa `compileSdkVersion` e `targetSdkVersion` em 36. Confirmados no projeto gerado. A exigência para novos apps/updates desde 31/08/2026 é API 36; confirmar também no AAB final. |
| Formato e versão | `production` usa `app-bundle` e `autoIncrement` com versionamento remoto. `preview` gera APK. A versão efetiva e as credenciais dependem do EAS e da assinatura; não foram consultadas. |
| 64 bits e 16 KB | A base inclui ARM64/x86_64 e stack atualizada, mas isso não comprova alinhamento de todas as bibliotecas. Verificar APKs gerados a partir do AAB, alinhamento ELF/ZIP e execução em dispositivo/emulador de 16 KB. |
| Permissões mínimas | Confirmadas remoções no manifesto fonte gerado. Ainda conferir o manifesto final mesclado das dependências dentro do artefato assinado. |
| Política de privacidade | Adiada por decisão do responsável. Antes da publicação, disponibilizar URL pública válida, acesso dentro do app e referência no Play Console. |
| Data safety | Não há acesso ao formulário preenchido. Declarar corretamente dados do usuário e da equipe, fotos, registros de trabalho, identificadores e metadados do dispositivo, além de retenção, exclusão e prestadores envolvidos. |
| Exclusão de conta | O Mobile não oferece cadastro nem direciona a criação de conta. A exigência específica de exclusão associada a cadastro no app não foi identificada como aplicável ao fluxo atual. Confirmar essa condição e preencher as perguntas de exclusão no Console; saída/revogação de sessão não significa exclusão de conta. |
| Acesso para revisão | Disponibilizar ao Google uma conta de teste com unidade/contrato e instruções que permitam exercitar os recursos protegidos por login. |
| Cadastro e conteúdo | Confirmar identidade do desenvolvedor, registro do pacote/assinatura, público-alvo, classificação indicativa, declaração de anúncios, suporte, descrição e screenshots correspondentes à versão enviada. Não encontrados SDKs publicitários, pagamentos ou coleta de localização nos fluxos analisados. |
| Conta pessoal nova | Se a conta se enquadrar na regra para contas pessoais criadas após 13/11/2023, realizar teste fechado com pelo menos 12 participantes inscritos por 14 dias consecutivos e solicitar acesso à produção. O tipo/data da conta não foram verificados. |
| Qualidade real | Homologar instalação e atualização com dados existentes, login, biometria, expiração/revogação, troca de usuário, câmera/galeria, teclado, telas pequenas/grandes, offline, perda de conexão e retomada de fotos. Verificar crashes/ANRs no relatório de pré-lançamento. |

Fontes oficiais consultadas:
[API de destino](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en),
[páginas de 16 KB](https://developer.android.com/guide/practices/page-sizes),
[permissões de fotos](https://support.google.com/googleplay/android-developer/answer/14115180?hl=en-CA),
[dados e privacidade](https://support.google.com/googleplay/android-developer/answer/10144311?hl=en),
[exclusão](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en),
[preparação para revisão](https://support.google.com/googleplay/android-developer/answer/9859455?hl=en),
[testes de contas pessoais](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en),
[requisitos do Console](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en).

## Verificações reproduzíveis

```bash
npm run typecheck
npm run lint
npm run test:mobile
npm run security:secrets
npx expo-doctor
npm audit
```

Os 56 testes incluem criptografia AES-GCM real, persistência da outbox em SQLite
em memória, proteção contra reedição, concorrência de sessão/logout/HTTP,
fallback de oito catálogos, recuperação da inicialização, mídia, links externos
e as regressões das revisões anteriores. Os testes de interface usam substitutos
nativos e não comprovam layout, permissões ou interação biométrica em aparelho.

O prebuild Android foi executado com sucesso em cópia temporária, incluindo a
geração das regras XML de backup. Não foram geradas pastas nativas no repositório.
A exportação Android JavaScript/Hermes de produção passou, com um worker e heap
limitado a 512 MB. Gerou um bundle HBC de 6,7 MB em
`/tmp/scaffold-mobile-android-export`, usando a URL HTTPS do perfil EAS. Esse
artefato temporário não é um APK/AAB assinado. O ambiente Java/Android foi
instalado e validado neste WSL em 28/09/2026, conforme registro abaixo. A
compilação nativa e a homologação em dispositivo permanecem pendentes.

A preparação offline de componentes de andaimes nunca consultados online continua
limitada ao cache disponível, como registrado nas revisões anteriores. Galeria
consolidada, notificações e demais funções exclusivas da web não foram adicionadas.

## Build APK local

Foi adicionado `npm run build:apk:local`, usando o perfil `preview` com `--local`.
A saída esperada é `scaffold-mobile.apk`. O processo exige JDK/Android SDK/NDK
locais e autenticação para consultar projeto/credenciais do EAS; não consome a
cota de compilação remota. Em 28/09/2026 foram instalados e validados neste WSL:

- OpenJDK 17.0.20.1;
- Android SDK Platform 36, Build Tools 36.0.0 e Platform Tools 37.0.1;
- NDK 27.1.12297006 e CMake 3.22.1;
- ferramentas de linha de comando do Android, com licenças aceitas.

`JAVA_HOME` aponta para `/usr/lib/jvm/java-17-openjdk-amd64` e `ANDROID_HOME`
para `/home/alvestia/Android/Sdk`. O arquivo `~/.config/android/env.sh` configura
as variáveis e o PATH, sendo carregado por `~/.bashrc` e `~/.profile`. O
carregamento em novos shells e a execução das ferramentas foram verificados.
Essa validação do ambiente não inclui a geração do APK/AAB.

Instruções e limitações de WSL estão no [README](README.md#apk-local-sem-usar-a-cota-de-builds-do-eas).
