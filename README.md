# YouTube Comment Search

Extensão de navegador (Manifest V3, Chrome/Edge) que adiciona uma busca de
comentários direto na página do vídeo do YouTube — filtra **todos** os
comentários do vídeo, incluindo respostas.

![icon](icons/icon128.png)

## Funcionalidades

- Lupa compacta no cabeçalho da seção de comentários ("N comentários / Ordenar
  por") que expande um campo de busca
- Carrega todos os comentários em background ao abrir o vídeo — primeira busca
  é instantânea
- Busca em texto e autor, **insensível a acentos** ("historia" encontra
  "história")
- Termo pesquisado destacado no texto dos resultados
- Esconde a lista original de comentários enquanto a busca está ativa
- Tema claro/escuro seguindo o YouTube
- Clique fora retrai o campo mantendo a busca; × ou Esc limpa tudo

## Como instalar

1. Baixe ou clone este repositório
2. Abra `chrome://extensions` no Chrome (ou `edge://extensions` no Edge)
3. Ative o **Modo do desenvolvedor**
4. Clique em **Carregar sem compactação** e selecione a pasta do repositório
5. Abra qualquer vídeo do YouTube e role até os comentários

## Como funciona

- `src/fetcher.js` roda no contexto da página (MAIN world) e usa o endpoint
  interno `youtubei/v1/next` do próprio YouTube — o token de continuação da
  seção de comentários é gerado a partir do videoId (mesma técnica do yt-dlp),
  sem precisar de API key. Suporta os formatos antigo (`commentRenderer`) e
  novo (`commentViewModel` + entities) de comentários.
- `src/content.js` injeta o widget de busca no cabeçalho dos comentários,
  filtra os comentários baixados e renderiza os resultados.

## Privacidade

Nenhum dado sai do navegador. Todas as requisições são feitas para o próprio
`youtube.com`, usando a sessão já existente da página.

## Observação

Usa a API interna/não-oficial do YouTube — se o YouTube alterar o formato das
respostas, o `fetcher.js` pode precisar de ajustes.
