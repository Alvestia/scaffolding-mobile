# Qualidade do release Android e avisos do Play Console

Atualizado em 16/11/2026. Configuração para Expo SDK 55 / React Native 0.83.

## Ofuscação e otimização DEX

O template do Expo deixava minificação e redução de recursos desativadas por
padrão. O plugin `plugins/with-android-release.js`, registrado no `app.json`,
aplica em cada prebuild:

```properties
android.enableMinifyInReleaseBuilds=true
android.enableShrinkResourcesInReleaseBuilds=true
android.r8.optimizedResourceShrinking=true
```

O build release utiliza `proguard-android-optimize.txt` no lugar de
`proguard-android.txt` (que inclui `-dontoptimize`). O Android Gradle Plugin
recebe o patch 8.12.2, compatível com a série 8.12 do SDK 55. Os builds debug
continuam com o comportamento do template. As regras nativas de Reanimated e
TurboModules são preservadas; não foram adicionadas regras globais para impedir
ofuscação ou ocultar erros de classes ausentes.

Não edite manualmente o diretório `android/` gerado para manter essas opções:
ele não é versionado e será recriado no EAS. O plugin falha com uma mensagem
explícita se um novo template mudar os pontos esperados de configuração do
Gradle; revise-o ao atualizar o SDK.

O limite anunciado pela Google Play é 25% em otimização, ofuscação e redução,
com aplicação em fevereiro de 2027 para apps com DEX significativo. O percentual
precisa ser medido no AAB final; ativar as opções não comprova o resultado.

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

O fluxo continua preservando os dados e oferecendo nova tentativa. Não libera
o app com o banco indisponível, nem apaga o banco para contornar a falha. A
ofuscação permanece habilitada; sem o erro nativo do aparelho não há evidência
suficiente para atribuir a falha ao R8 ou adicionar regras de preservação.

Os testes locais usam SQLite em arquivo temporário e uma conexão separada por
transação, como a API do Expo, além de verificar repetição da inicialização,
preservação de pendências e ausência de dados sensíveis nos diagnósticos. Não
substituem a validação JNI/R8 em um APK produzido pelo EAS. Gerar o próximo APK
pelo Expo/EAS e, se a falha persistir, informar a referência exibida na tela.

### Configuração nativa

```bash
npm run check:android-release
```

O comando cria uma cópia temporária sem `.env`, gera Android offline com o
template instalado e confere as propriedades do R8, o arquivo de regras, o
patch do AGP, a Activity adaptável, o edge-to-edge e as configurações de
segurança. Executa prebuild duas vezes para detectar duplicação/perda de
configuração. Não compila um AAB nem consulta EAS. Use `-- --keep` para conservar
a cópia gerada e inspecioná-la; por padrão ela é removida no final.

Para publicação, gerar um novo AAB pelo perfil `production` existente. Ele usa
`autoIncrement` para o código de versão remoto. Uma atualização JavaScript/OTA
não altera essa configuração nativa. Homologar o **release ofuscado**: abertura
do app, login/biometria, SQLite/SecureStore, registros offline, sincronização,
fotos/câmera, GPS, QR Code e assinatura. Guardar o `mapping.txt` correspondente
ao pacote para interpretar relatórios de falha.

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
