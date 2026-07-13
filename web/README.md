# LiteLedger Web

Implementacao inicial da versao web do LiteLedger.

## Escopo atual
- Importacao de CSV Nubank
- Gestao de categorias e regras
- Revisao/categorizacao de transacoes
- Dashboard mensal com tendencia
- Assistente mensal
- Persistencia local com `localStorage`

## Scripts
- `npm run dev`
- `npm run typecheck`
- `npm run build`

## Estrutura
- `src/importers/` parser CSV
- `src/services/` regras de categorizacao e agregacao
- `src/db/` repositorio e persistencia web
- `src/pages/` telas principais

## Observacoes
- Esta fase usa armazenamento local no navegador.
- O objetivo e validar fluxo e paridade funcional antes da reconstrucao mobile.
