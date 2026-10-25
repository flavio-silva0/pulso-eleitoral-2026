# Pulso Eleitoral · 2026

Painel independente para acompanhar o segundo turno brasileiro. Interface original inspirada na proposta de acompanhamento do seuimposto.com, com integração direta aos arquivos oficiais do TSE.

## Rodar localmente

Requer Node.js 22 ou superior. Não há dependências para instalar.

```sh
npm start
```

Abra http://localhost:3000. Para desenvolvimento: `npm run dev`. Testes: `npm test`.

## Recursos

- Votos nominais e percentuais por candidato, presidente e governador, por UF e exterior (presidente).
- Atualização automática em 30 segundos; cache no servidor, deduplicação e espera de 120 segundos em falhas da fonte.
- Progresso das seções, comparecimento, abstenções, brancos e nulos.
- Favoritos locais, tema escuro, modo telão e exportação CSV.
- Curva e últimas cargas observadas durante a execução, com snapshots brutos normalizados em `.runtime/snapshots.jsonl`.
- Link direto à origem, horário da carga, indicação de falhas e preservação da última resposta válida.

## Dados e limitações

Fonte: https://www.tse.jus.br/eleicoes/informacoes-tecnicas-sobre-a-divulgacao-de-resultados

Ambiente `oficial/ele2026`, eleição federal `6258` (cargo 1) e estadual `6260` (cargo 3). Os arquivos oficiais EA20 são consultados exclusivamente em `resultados.tse.jus.br`. A normalização valida ambiente, turno, eleição e abrangência. Nomes, partidos, votos e situação de eleito vêm da fonte; não há dados simulados no aplicativo.

O resultado é parcial até a totalização. Percentual de seções não equivale a percentual do eleitorado. Estados sem disputa de segundo turno ou arquivos ainda não publicados podem retornar indisponibilidade. O histórico inicia na primeira consulta de cada disputa, fica em memória até reiniciar e não representa toda a noite anterior. Os snapshots ficam no disco para auditoria, mas não são reimportados automaticamente. A interface mostra a data da geração separada da última consulta; uma carga antiga não é apresentada como nova apuração.

O mapa interativo usa malha simplificada do IBGE, com liderança presidencial parcial e seleção por UF. A comparação dos estados ordena por percentual de seções totalizadas e atualiza a cada 60 segundos, com no máximo três requisições simultâneas ao TSE. Malha: https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo%2Bjson&qualidade=minima&intrarregiao=UF . Não há detalhamento municipal do Brasil, auditoria individual dos boletins, projeção estatística, comparação de turnos ou notificações push nesta versão. Fontes tipográficas do Google são opcionais, com fallback local.

## Arquivos

- `server.mjs`: servidor HTTP e cache da fonte.
- `lib/tse.mjs`: URLs oficiais e validação/normalização EA20.
- `public/`: interface responsiva em HTML, CSS e JavaScript.
- `test/`: testes com dados fictícios explicitamente restritos às fixtures de teste.

Servidor restrito a `127.0.0.1`. A publicação em hospedagem exige adaptar o endereço de escuta e configurar HTTPS. Nenhuma chave de API é necessária.

A captura original `download.devtools`, referências locais e snapshots não são enviados ao GitHub. Autoria: Flavio Silva.
## Mapas e boletins do exterior

A navegação tem duas abas: **Mapa** (inicial, Brasil e mundo, cores por vantagem proporcional e totais regionais na lateral) e **Apuração** (cabeçalho, filtros, placar e quatro indicadores).

O TSE publica a totalização EA20 separadamente dos boletins de urna. Para exibir a contagem anterior à totalização do exterior, esta versão consulta o feed `https://seuimposto.com/feed/exterior-bu.json` a cada 30 segundos. O painel identifica explicitamente essa fonte secundária. Valida turno, cidades únicas, contagens inteiras, somas por cidade e total, mas não audita os BUs binários individualmente. Nunca soma esse feed ao resultado nacional. Quando o EA20 de ZZ tem seções totalizadas, o placar de ZZ prioriza o resultado oficial. O mapa mundial continua identificado como a contagem dos boletins do feed.

O mapa mundial usa polígonos Natural Earth 1:110m (domínio público), obtidos de https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_admin_0_countries.geojson . Territórios pequenos ausentes dessa escala recebem marcadores quando cadastrados. A lista lateral inclui todos os países do feed, mesmo quando não há polígono. A cobertura por país corresponde às cidades presentes no feed, não ao cadastro completo de seções desse país. No Brasil, os totais regionais são somas dos arquivos estaduais; horários de geração podem variar entre UFs.

Cores: vermelho para 13, azul para 22; a intensidade representa a diferença de votos dividida pela soma dos dois candidatos. Cinza indica ausência de dados. Há seleção por teclado, zoom e deslocamento por arraste.
