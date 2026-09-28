# Revisão do Mobile — 14/09/2026

Foram revisados os seletores compartilhados, os filtros da fila, a atualização
manual/automática, os carregamentos de referência, a paginação, o cache da fila
e o início do aplicativo. A análise sintática percorreu os 137 arquivos TS/TSX
de `src`; o ESLint de `src` passou sem erros. Não foram executados builds,
exportações Expo, compilação nativa ou verificação completa de tipos.

## Problemas confirmados e corrigidos

| Problema | Causa e correção |
| --- | --- |
| Poucos resultados ficam atrás do teclado | `SelectionModal` era uma folha ancorada ao rodapé, sem ajuste de teclado. Agora usa `KeyboardAvoidingView`, altura estável e uma lista que ocupa o espaço disponível. A busca volta ao início da lista e o toque em um resultado funciona com o teclado aberto. |
| A busca ou seleção múltipla pode reiniciar | O valor padrão `selectedValues = []` criava uma referência nova em cada renderização, acionando um efeito que limpava a busca e atualizava novamente o estado. O padrão agora é estável, e a inicialização acontece somente ao abrir o seletor. |
| Teclado permanece durante navegação/seleção | A função compartilhada de desfoco tratava somente o DOM. Agora fecha também o teclado nativo. Seleção de unidade/contrato e modal de componentes também receberam ajustes de teclado; a barra de abas se esconde durante a digitação. |
| Painel de progresso permanece após concluir | `manualSyncVisible` era ligado e nunca desligado. Agora fecha no `finally`, inclusive em falhas. O erro permanece em um aviso compacto com opção de fechar. |
| Base incompleta a partir de 500 registros | `getAllPages` retornava silenciosamente depois de cinco páginas de 100. Agora percorre a paginação informada pelo servidor, respeita páginas menores e rejeita respostas interrompidas/repetidas. Há um limite defensivo de 1.000 páginas que gera erro, sem apresentar um resultado parcial como completo. |
| Atualização automática interfere na manual | A proteção do motor terminava antes do download dos catálogos da atualização manual. Agora o store impede sobreposição durante toda a operação. Requisições paralelas de uma etapa são aguardadas mesmo quando outra falha. |
| Filtros de datas mudam entre online e offline | A API usa sobreposição de períodos, enquanto o cache exigia que o serviço estivesse inteiramente dentro do intervalo. O filtro offline agora usa a mesma regra da API. |
| Avanços locais e filtros da fila inconsistentes | Avanços em serviços locais não eram aplicados no retorno online. Agora são aplicados em ambos os modos, antes do filtro final. A consulta também considera serviços que passam a “em execução” por causa de pendências locais. Tipo, andaime, OS e conectividade entram na chave da consulta. |
| Fila atualizada antes de enviar pendências | O botão disparava sincronização e consulta simultaneamente. A consulta da tela agora aguarda a sincronização. |
| Catálogos na tela permanecem antigos | A atualização manual não invalidava as demais consultas e omitia tipos de componente. Agora inclui esse catálogo e invalida as consultas relacionadas. Projetos, áreas e OS também deixam de mostrar opções do contexto anterior durante a troca de filtros. |
| Trabalho repetido ao renderizar grupos da fila | Cada cabeçalho percorria toda a lista para contar os serviços do andaime. A contagem agora é preparada em uma passagem e reutilizada. Não foi medida uma redução de tempo em aparelho. |

## Outros achados que permanecem para tratamento

1. **Detalhe de uma atividade baixa a fila inteira.**
   `src/hooks/use-queue-service-detail.ts` chama `fetchQueueServices` e substitui
   o cache completo para localizar um único ID. O custo aumenta com o contrato.
   Uma evolução deve usar consulta por ID e atualização individual do cache,
   preservando os dados necessários ao funcionamento offline.
2. **A preparação offline não baixa todos os componentes de cada andaime.**
   O catálogo de tipos foi corrigido, mas os componentes e seus avanços são
   carregados por `useScaffoldComponents` ao abrir a execução. Um andaime nunca
   consultado online pode ficar sem esses detalhes offline. A solução exige
   definir a preparação desses dados por contrato, preferencialmente em lotes
   para evitar uma requisição adicional por andaime/operação.
3. **Falha na inicialização do banco não tem tela de recuperação.**
   `src/hooks/use-app-bootstrap.ts` não captura a rejeição de
   `initializeDatabase`; `BootstrapGate` continua mostrando o carregamento.
   Falta um estado de erro com tentativa novamente. Esse cenário não foi
   reproduzido com banco real nesta revisão.

## Validação realizada

- Os sete arquivos de testes passaram, incluindo os testes existentes de
  componentes, preservação de lançamentos, identidade offline e migração da fila.
- Os 17 novos cenários foram executados individualmente: seleção simples e
  múltipla, fechamento do progresso após sucesso/falha, sincronização concorrente,
  catálogos, paginação com 601 registros, cache e filtros online/offline.
- Os testes de componentes substituem o ambiente nativo e exercitam estado,
  efeitos e eventos; não medem posicionamento ou animação do teclado.
- ESLint de todo `src`, análise sintática de 137 arquivos e `git diff --check`
  passaram. `eas.json` já tinha alterações e não foi modificado nesta revisão.

Para repetir os testes sem build: `npm run test:mobile`.

## Validação ainda necessária em aparelho

Testar Android e iOS, inclusive uma tela pequena: abrir o filtro de OS, pesquisar
até restar um resultado e selecioná-lo com o teclado aberto; repetir com zero
resultados e em seleção múltipla. Confirmar que fechar/reabrir o seletor reinicia
a busca, mas novas renderizações não apagam uma busca em andamento.

Executar “Atualizar” com sucesso e com perda de rede. O painel deve desaparecer
ao terminar; uma falha deve deixar somente o aviso fechável. Alternar o aplicativo
entre primeiro e segundo plano durante a atualização não deve iniciar outra
sincronização. Comparar um filtro de cronograma online/offline e verificar
serviços cujo período começa antes e termina depois do intervalo selecionado.
