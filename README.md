# Rodinný rozpočet

Jednoduchá webová aplikace pro rodinný rozpočet:
- příjmy a výdaje
- kategorie
- měsíční přehled
- filtrování podle měsíce
- ukládání do Supabase
- záložní režim do localStorage, když nejsou vyplněné Supabase údaje

## 1) Supabase

V Supabase otevři **SQL Editor** a spusť soubor:

```sql
supabase/schema.sql
```

## 2) Nastavení proměnných

Zkopíruj `.env.example` na `.env` a doplň:

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 3) Spuštění lokálně

```bash
npm install
npm run dev
```

## 4) Nasazení na GitHub Pages

Nejjednodušší varianta:
1. Nahraj projekt do GitHub repozitáře.
2. V GitHubu nastav Pages přes GitHub Actions.
3. Přidej workflow pro Vite deploy, nebo použij například `peaceiris/actions-gh-pages`.

Poznámka: pro GitHub Pages bude potřeba nastavit base path ve `vite.config.js`, pokud aplikace nepoběží v root doméně.
