# Tory Reader

Biblioteca privada de manga e manhwa em PT-BR — MangaDex integration.

## Deploy na Vercel

### Opção 1 — Via GitHub (recomendado)
1. Crie um repositório no GitHub
2. Faça push dos arquivos do projeto: `index.html`, `app.js`, `api/`, `package.json`
3. Na Vercel: **Add New Project → Import Git Repository**
4. Selecione o repo → **Deploy**

### Opção 2 — Drag & Drop
1. Acesse [vercel.com/new](https://vercel.com/new)
2. Arraste a pasta `tory-reader/` direto para o browser
3. Deploy automático

## Estrutura
```
tory-reader/
├── index.html    # Shell da SPA + todo o CSS
├── app.js        # Lógica completa + integração MangaDex
├── api/          # Proxies serverless para API, capas e páginas
└── package.json  # Config mínima do runtime
```

## Features
- 🔥 Popular / Lançamentos / Manga / Manhwa / Coloridos / +18
- ❤️  Favoritos, Minha Lista, Histórico (localStorage)
- 📖 Continuar lendo com barra de progresso
- 🔍 Busca por título
- 📱 Leitor vertical (manhwa) e horizontal (manga)
- 🚫 Zero anúncios, zero cadastro

## Personalizar

### Mudar nome
Em `index.html`, troque todas as ocorrências de `Tory` pelo nome que quiser.

### Adicionar idiomas
Em `app.js`, `CFG.LANG` está como `'pt-br'`. Para adicionar inglês como fallback:
```js
// No helper title():
return t['pt-br'] || t.en || Object.values(t)[0] || '—';
```
Já está assim por padrão.

### Cache das requisições
Ajuste os valores de TTL em `app.js → API`:
- `popular`: 3 minutos (padrão)
- `latest`:  1 minuto (atualiza mais rápido)

## Integração futura
O script Python de auto-tradução pode chamar a API do MangaDex diretamente
usando os mesmos endpoints em `app.js → API`.
