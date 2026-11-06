# Produkční stav a bezpečný handoff

Stav k 6. 11. 2026. Tento soubor eviduje rozdíl mezi repozitářem a produkcí;
nenahrazuje migrační historii ani terénní kontrolu tras.

## Aktivní služby

- veřejný web: `https://sifrovana-mestska-hra.galluspeginpetr.chatgpt.site`;
- Sites projekt: `appgprj_6a7a3e2f8eec8191b0b004159e1d2227`;
- Supabase projekt: `tcobxpvrkipquvhpyupq`;
- účet `gallus-petr@pm.me` má v produkčním profilu roli `superadmin`;
- veřejný pilot je `brno-kralovo-pole-stopy`; cenu vždy určuje živý CMS
  katalog a serverový checkout, nikoli statická fallback data v klientovi.

Sites má nastavené veřejné Supabase proměnné. Platební IBAN zatím nastavený
není, takže klient záměrně nevytvoří objednávku, kterou by nešlo zaplatit.
Google Maps Embed klíč je volitelný; bez něj aplikace používá bezklíčovou mapu
a externí navigační odkazy.

## Co je v repozitáři, ale zatím ne v produkční databázi

Migrace
`supabase/migrations/20261106180429_harden_checkout_concurrency.sql` je
připravená a otestovaná, ale nebyla aplikována do produkce. Sjednocuje pořadí
zámků při checkoutu a potvrzení platby, chrání původ access záznamů a přidává
volitelnou cenovou precondition `p_expected_price_czk`.

Po jejím samostatném databázovém nasazení má klient začít posílat:

```ts
p_expected_price_czk: route.price
```

Do té doby musí produkční klient zůstat u kompatibilního dvouparametrového
volání. Migraci neaplikovat naslepo společně s frontendovým releasem; nejdřív
zkontrolovat Supabase advisories a po aplikaci projít vytvoření, storno i ruční
potvrzení testovací objednávky.

## Známé provozní mezery

- aktivní migrační řetězec není reprodukovatelný na prázdném projektu; přesný
  inventář a bezpečný postup jsou v
  [`supabase-baseline.md`](../architecture/supabase-baseline.md);
- automatické párování bankovní platby není implementované;
- v Sites chybí IBAN, takže ostrý checkout zůstává vypnutý;
- ochranu proti uniklým heslům je ještě nutné zapnout v nastavení Supabase Auth;
- obsah, souřadnice, fyzické indicie, přístupnost a bezpečnost tras musí před
  prodejem projít kontrolou přímo v terénu;
- referral a kredity zůstávají vědomě odložené v `supabase/deferred/`.

## Release postup

1. Načíst aktuální veřejné Sites proměnné jen do prostředí procesu.
2. Spustit `pnpm release:prepare`; obyčejný build není produkční artefakt.
3. Commitnout a pushnout přesný zdrojový stav do GitHubu i Sites source repa.
4. Uložit a nasadit verzi z vygenerovaného `outputs/site-package.tar.gz`.
5. Spustit `pnpm release:verify-live` a ověřit HTTP hlavičky, živou cenu a
   základní mobilní průchod.

Nikdy neukládat publishable key, krátkodobé Sites přihlašovací údaje ani jiné
tokeny do souborů, commitu nebo výstupu CI.
