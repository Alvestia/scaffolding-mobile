# Compatibilidade do mobile com as alterações recentes — 25/09/2026

A revisão considera o aplicativo Expo de `scaffolding-mobile`, os contratos atuais de `scaffolding-api` e os recursos recentes da web. Não equivale a uma homologação Android/iOS nem da instalação de produção. As alterações locais que já existiam foram preservadas; o relatório anterior `MOBILE_REVIEW.md` continua válido.

## Resultado por funcionalidade

| Alteração | Situação no aplicativo |
| --- | --- |
| Revisão de quantidade de andaimes e serviços | O lançamento já enviava `expectedBasisVersion` e preservava a base do rascunho. Corrigida a consulta do serviço, que podia manter quantidade antiga quando o serviço saía da fila ativa ou tinha sido criado offline e depois sincronizado. |
| Recálculo do executado | O editor de revisões e suas três opções continuam na web. No app, um rascunho afetado por revisão exige confirmação para manter quantidade ou percentual; se a unidade mudou ou a base anterior é desconhecida, exige revisão manual dos valores. A opção de preservar a base dos serviços é uma decisão da revisão na web, não uma forma de reenviar um rascunho sobre uma base obsoleta. |
| Bloqueio de alterações após envio para aprovação | A proteção permanece na API (`scaffold-revisions/quantity-transaction.ts`). O app não possui editor de revisões de execuções já registradas no servidor. Os rascunhos locais não podem substituir a validação de estado, autorização e versão da API. |
| Limite de quantidade por tipo de serviço | A validação permanece no servidor (`scaffold-services/service-capacity.ts`). O app cria andaimes emergenciais com os serviços automáticos; não tem cadastro avulso para adicionar uma segunda montagem ao mesmo andaime. Não foi criada regra que exclua ou invalide os serviços históricos excedentes. |
| Registros fotográficos | O app continua capturando e enviando fotos de execução e de desvio, vinculadas aos registros usados pela galeria web. Não possui galeria consolidada, filtros por andaime/serviço ou consulta das fotos já enviadas. |
| Datas padrão da galeria | A regra de primeiro dia do mês até hoje está na página web; não há galeria nativa à qual aplicá-la. Os filtros operacionais da fila não foram alterados. |
| Central de notificações, leitura e retorno | Não implementada no app. A aba Pendências é a fila de sincronização local, não a central de notificações da web. |
| `FILE_AUTH_ENABLED=true` | Os uploads móveis usam o cliente HTTP autenticado e os endpoints de mídia da API. As imagens mostradas pelo app são arquivos locais; não foi encontrado consumo de URLs remotas sem assinatura. O fluxo é compatível pelo contrato analisado, mas não foi realizado upload real em produção. |
| Portal do cliente e configuração de senhas | O app usa login corporativo e sessão de dispositivo. Não oferece o portal do cliente. A exigência do arquivo externo de blocklist foi removida na API; não é uma variável exigida pelo app. As demais validações do acesso de clientes permanecem no servidor. |
| Dashboards, Vite e recuperação de carregamento | A Home móvel resume a fila; não consome os mesmos dashboards da web, nem o WebSocket do Vite. Corrigida a tela de lançamento para distinguir carregamento, indisponibilidade e erro com tentativa novamente. Isso não representa a implantação de uma recuperação global de erros no Expo. |

## Correções feitas nesta revisão

1. Consulta individual a `/scaffold-services/:id`, com contrato/unidade capturados e cancelamento. Funciona também para serviços concluídos, sem baixar e substituir toda a fila. O histórico de execuções e revisões recebido nesse endpoint não é persistido no cache do serviço.
2. Serviços criados offline que já possuem identificação remota passam a consultar a base remota. Sem conexão, usam apenas o cache remoto disponível no mesmo contexto; não voltam silenciosamente à base original de criação.
3. Leitura do cache individual restringida a contrato, unidade e identidade. A atualização de um serviço preserva os demais registros. A consulta verifica troca de identidade antes de devolver ou armazenar o resultado.
4. Falhas temporárias de conexão/servidor podem usar o cache. Negação de acesso, recurso removido, cancelamento e troca de identidade deixam de ser encobertos por esse fallback, tanto no detalhe quanto na fila para os erros HTTP pertinentes.
5. A fila só soma avanços locais compatíveis com a base atual. Conflitos, pendências que exigem revisão manual e execuções já recebidas pelo servidor não são somados novamente. Rascunhos, fotos e informações de sincronização são preservados.
6. A tela compara versão, quantidade e unidade antes de aceitar a base do rascunho; distingue carregamento de erro; oferece nova tentativa e identifica corretamente o status do serviço.

Exemplo validado: um rascunho de 50% sobre 60 m³, diante de uma revisão para 120 m³, mantém 30 m³ ao escolher quantidade ou mantém 50% (60 m³) ao escolher percentual. A fila não interpreta sozinha o percentual antigo sobre a base nova.

## Limitações ainda presentes

- A central de notificações, a galeria consolidada, o editor de revisões e o portal do cliente exigem implementação própria no app para haver equivalência funcional com a web.
- O fluxo inicial `useAppBootstrap` ainda não oferece recuperação visual se a inicialização da base local falhar. É uma pendência anterior já registrada em `MOBILE_REVIEW.md`, não corrigida nesta revisão.
- O download antecipado de todos os componentes dos andaimes para uso offline continua sendo uma pendência do relatório anterior.
- A tela de Pendências ainda permite abrir a edição de um item com `remoteId` que esteja aguardando fotos. Essa edição local não é um mecanismo de revisão da execução no servidor: a API mantém suas regras e idempotência. Convém separar a retomada de envio de fotos da correção de um lançamento ainda não recebido.
- Sem rede, o app só conhece a última base baixada. Uma revisão posterior é detectada quando a base é consultada novamente ou quando o servidor rejeita o envio com `EXECUTION_BASIS_CHANGED`; o rascunho permanece para resolução manual.

## Validação

Testes leves em Node, com heap limitado a 128 MB e execução sequencial:

- `test/mobile-compatibility.test.cjs`: consulta direta, escopo, identidade, fallback, cancelamento, base revisada, cache, avanços locais e conflito real no fluxo do sincronizador com resposta HTTP simulada.
- `test/mobile-execution-screen.test.cjs`: estado de carregamento/erro, recuperação e escolhas de quantidade/percentual. Usa substitutos para os componentes nativos; não valida desenho, gestos ou integração do aparelho.
- Regressões existentes: `test/mobile-data.test.cjs` e `test/mobile-sync.test.cjs`.

Lint restrito aos arquivos desta alteração, com heap de 192 MB. Não foram executados build, `tsc`, export do Expo ou compilação nativa. Não houve alteração de banco de produção, migração, deploy ou teste em aparelho.

Antes da publicação de uma versão móvel, homologar com uma API de teste: criação offline, sincronização do andaime, revisão na web, correção do rascunho com as duas escolhas, envio de fotos com autenticação de arquivos ativa e retomada após perda de conexão.
