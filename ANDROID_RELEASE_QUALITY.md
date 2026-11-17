# Qualidade do release Android e avisos do Play Console

Atualizado em 17/11/2026. Configuração para Expo SDK 55 / React Native 0.83.

## Ofuscação e otimização DEX

**A ofuscação R8, a otimização e a redução de recursos são o padrão dos perfis
`preview` (APK) e `production` (AAB). O usuário confirmou o funcionamento do APK
ofuscado no aparelho em 17/11/2026. Não é necessário perfil alternativo nem flag
de ambiente para ativar essa configuração.**

O plugin `plugins/with-android-release.js`, registrado no `app.json`, aplica:

```properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
android.r8.optimizedResourceShrinking=true
```

São mantidos o preset `proguard-android-optimize.txt`, o AGP 8.12.2 e as regras
de compatibilidade do Expo descritas abaixo, iguais aos do APK validado.
O plugin também atualiza projetos Android anteriormente gerados sem R8.
Expo 55.0.32, banco, migrações, criptografia offline e SecureStore são preservados.

Não edite manualmente o diretório `android/` gerado: ele não é versionado e será
recriado no EAS. O plugin falha com uma mensagem explícita se um novo template
mudar os pontos esperados de configuração do Gradle; revise-o ao atualizar o SDK.

Na primeira tentativa de ativar R8, o APK apresentou
`START-SQLITE_OPEN-NATIVE_HANDLE` em `openDatabaseAsync`, antes das migrações e
da sessão. Um rollback temporário restabeleceu a inicialização. Depois de
incorporar as regras de compatibilidade, o APK ofuscado foi testado com sucesso
pelo usuário; essa é a configuração que passou a ser padrão.

A homologação no aparelho não mede os percentuais DEX. Os resultados e o aviso
de otimização do Play Console precisam ser conferidos no AAB final.

## Correção de compatibilidade com R8 no SDK 55

O `expo-modules-core` atual do upstream mantém a interface `Record`, a anotação
`Field` e os nomes das subclasses de `CodedException`. O SDK 55 instalado não
inclui essas três regras. O upstream documenta especificamente que renomear
`Field` pode causar `NullPointerException` na leitura de `Field.key` por reflexão.
O SQLite utiliza `@Field` em `OpenDatabaseOptions` durante a abertura, o que é
compatível com a etapa e a categoria de erro observadas neste aparelho.

O plugin incorpora as regras abaixo no `android/app/proguard-rules.pro` gerado,
sem editar `node_modules`, sem novas dependências e sem preservar pacotes
inteiros indiscriminadamente:

```proguard
-keep interface expo.modules.kotlin.records.Record
-keep @interface expo.modules.kotlin.records.Field { *; }
-keepnames class * extends expo.modules.kotlin.exception.CodedException
```

Fontes: [regras oficiais atuais](https://github.com/expo/expo/blob/main/packages/expo-modules-core/android/proguard-rules.pro)
e [regras do SDK 55](https://github.com/expo/expo/blob/sdk-55/packages/expo-modules-core/android/proguard-rules.pro).

O bloco de regras é substituído em cada prebuild, sem duplicação. A mesma
configuração é aplicada a todos os builds release; os builds debug de
desenvolvimento continuam usando a configuração debug do Expo.

Gerar os pacotes **remotamente** pelo EAS:

```bash
eas build --platform android --profile preview
eas build --platform android --profile production
```

O perfil temporário de homologação foi removido após a validação no aparelho.
As regras de compatibilidade permanecem habilitadas junto com o R8 em ambos os
perfis. A geração do Gradle e os testes JS continuam sendo verificações de
configuração; o percentual de ofuscação é medido no pacote final.

## Orientação e redimensionamento

O plugin configura somente a Activity principal Android com
`screenOrientation=unspecified` e `resizeableActivity=true`, sem limites de
proporção. O `orientation: portrait` global permanece para preservar o
comportamento anterior do iOS; a configuração Android efetiva é sobrescrita
pelo plugin e conferida pelo teste de prebuild.

Validar no release: telefone em retrato/paisagem, tablet, tela dividida,
redimensionamento com teclado aberto, câmera/QR Code, seletores e assinatura da
inspeção. As telas usam SafeArea/insets e layouts flexíveis, mas a geração do
manifesto não equivale à homologação visual em aparelho.

### Recursos de hardware opcionais no Google Play

O plugin também declara `android.hardware.screen.portrait` e
`android.hardware.wifi` com `android:required="false"` e
`tools:replace="android:required"`. Isso impede filtros de instalação por
orientação retrato ou ausência de Wi-Fi, inclusive quando bibliotecas declaram
esses requisitos. O NetInfo usa `ACCESS_WIFI_STATE`, que pode implicar o
requisito de Wi-Fi no Google Play; a permissão é mantida para consultar a rede.

O teste de prebuild verifica as declarações, a regra de mesclagem e a correção
de manifestos antigos com recursos obrigatórios/duplicados. O ajuste vale para
`preview` e `production`. Não altera as regras de captura de GPS dos lançamentos.
É necessário gerar outro AAB no EAS e substituir o pacote no Play Console;
uma atualização OTA não altera o manifesto do AAB já enviado. O manifesto final
mesclado e a disponibilidade devem ser conferidos no novo pacote no Google Play.

Referências: [recursos e filtros de instalação](https://developer.android.com/guide/topics/manifest/uses-feature-element)
e [mesclagem de manifestos](https://developer.android.com/build/manage-manifests).

## Exibição de ponta a ponta

`edgeToEdgeEnabled=true` é mantido. As telas usam `react-native-safe-area-context`
e o app configura apenas o estilo dos ícones da StatusBar, sem solicitar cor de
fundo ou translucidez pelas APIs descontinuadas.

O React Native 0.83.10 instalado ainda contém chamadas antigas em
`WindowUtil.kt` e `StatusBarModule.kt`, incluindo acesso às cores das barras e
`setDecorFitsSystemWindows`. Essas chamadas fazem parte das dependências e da
compatibilidade entre versões Android. Não foram removidas à força de
`node_modules`, nem foi desativado o edge-to-edge para esconder o alerta.

O aviso de APIs descontinuadas do Play Console **não está comprovadamente
eliminado**. É necessário conferir a lista de classes/métodos de “Ler mais” no
Console contra o próximo AAB e aplicar a atualização compatível do módulo
responsável quando disponível. A existência do alerta não é evidência, por si
só, de que o conteúdo esteja sobreposto às barras; isso exige teste visual.

## Verificações

### Falha de inicialização antes do login

O Expo foi alinhado em `55.0.32` (incluindo `package-lock.json` e
`expo-modules-core` 55.0.27). Isso corrige a divergência de patch reportada pelo
Expo Doctor, mas não comprova a resolução da falha de abertura do SQLite no APK.

A inicialização registra `app_bootstrap_failed` no log `ReactNativeJS`, com
apenas `stage`, `reason` e `reference`. A mesma referência aparece na tela de
erro para facilitar o diagnóstico pelo suporte:

- `sqlite_module`: carregamento do módulo nativo;
- `sqlite_open`: abertura do arquivo;
- `sqlite_configure`: configuração inicial do SQLite;
- `sqlite_schema`: criação/atualização das tabelas;
- `session`: recuperação da sessão, após o banco estar pronto.

Os motivos são categorias fixas. Mensagens originais, stacks, SQL, caminhos,
credenciais e registros não são enviados ao log nem à tela. `unknown` significa
que o erro não correspondeu às categorias conhecidas; a referência indica a
etapa e não deve ser interpretada como confirmação da causa raiz.

O fluxo continua preservando os dados e oferecendo nova tentativa. A configuração
com R8 e as regras de compatibilidade foi validada no aparelho. Os diagnósticos
seguros permanecem disponíveis para identificar futuras falhas.

Os testes locais usam SQLite em arquivo temporário e uma conexão separada por
transação, como a API do Expo, além de verificar repetição da inicialização,
preservação de pendências e ausência de dados sensíveis nos diagnósticos. Não
substituem a validação JNI/R8 em um APK produzido pelo EAS. Em caso de nova
falha, informar a referência exibida na tela.

### Configuração nativa

```bash
npm run check:android-release
```

O comando cria uma cópia temporária sem `.env`, gera Android offline com o
template instalado e confere R8/redução de recursos habilitados por padrão,
preset, AGP, regras do Expo, Activity adaptável, edge-to-edge e configurações de
segurança. Confere também os perfis APK/AAB e simula um projeto anteriormente
gerado sem R8, verificando que o prebuild corrige esses arquivos. Repete a geração
para conferir idempotência. Limita o heap do processo filho a 256 MB. Não compila APK/AAB,
não executa Gradle nem consulta EAS. Use `-- --keep` para conservar
a cópia gerada e inspecioná-la; por padrão ela é removida no final.

Gerar um novo APK **remotamente pelo EAS**:

```bash
eas build --platform android --profile preview
```

Não compilar APK/AAB localmente neste WSL por limitação de memória. A mudança é
nativa: atualizar somente JavaScript/OTA não altera o pacote já instalado.
Homologar abertura do app, login/biometria, SQLite/SecureStore, registros offline,
sincronização, fotos/câmera, GPS, QR Code e assinatura. O perfil `production`
gera AAB e usa `autoIncrement` para o código de versão remoto.

Guardar o `mapping.txt` correspondente a cada pacote publicado para interpretar
relatórios de falha com a ofuscação habilitada.

Com a ferramenta Android CLI atual, analisar o AAB final:

```bash
android analyze scaffold-mobile.aab
```

Conferir as três porcentagens e os metadados R8/mapeamento. O comando pertence
ao Android CLI atual; não é o comando legado `android` do antigo SDK Tools.
Confirmar também os resultados no pesquisador de pacotes do Play Console.

## Referências

- [Otimização DEX e medição do AAB](https://developer.android.com/google/play/vitals/code-optimization)
- [Habilitar otimização com R8](https://developer.android.com/topic/performance/app-optimization/enable-app-optimization)
- [Patches do Android Gradle Plugin 8.12](https://developer.android.com/build/releases/agp-8-12-0-release-notes)
- [Requisitos de qualidade do Play Console](https://support.google.com/googleplay/android-developer/answer/17492799?hl=pt-BR)
- [Android 16: orientação e telas grandes](https://developer.android.com/about/versions/16/behavior-changes-16#adaptive-layouts)
- [Android 15: APIs de exibição descontinuadas](https://developer.android.com/about/versions/15/behavior-changes-15#edge-to-edge)
