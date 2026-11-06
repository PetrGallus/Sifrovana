# Šifrovaná

Šifrovaná je mobilní webová aplikace pro placené samoobslužné městské výpravy. Malý tým jde po městě, všímá si detailů, řeší krátké šifry a postupně odemyká příběh místa.

Pilotní trasou je **Královo Pole: Stopy proměny**. Jedna licence platí pro tým 1–5 lidí. Pracovní standardní cena je 449 Kč, ale prodejní cenu vždy určuje aktuální záznam v CMS a serverový checkout. Balíček tří tras za 999 Kč je produktová hypotéza; začne se prodávat teprve po terénním ověření tří hotových tras.

## Produktový směr

- hlavní hodnotou je kvalitní trasa a jednoduchý mobilní průchod, ne složitá gamifikace;
- jednotný rytmus hry: dojít → všimnout si → vyřešit → odemknout příběh → pokračovat;
- profil funguje jako Městský pas s dokončenými výpravami a razítky, bez XP a levelů;
- nápovědy nejsou placené ani trestané;
- nové trasy jsou verzovaná data se zdroji, fallbackem a datem terénní kontroly, nikoli nový UI vývoj;
- nejdřív se ověřuje placený pilot v Brně, potom další dvě brněnské trasy a až následně balíčky či další města.

Podrobná rozhodovací pravidla jsou v [produktové konstituci](docs/PRODUCT_CONSTITUTION.md).

## Implementováno v repozitáři

- responzivní marketplace a detail pilotní trasy;
- průchod pěti checkpointy z neměnné publikované verze CMS; odpovědi se ověřují pouze serverově a budoucí body se do klienta neposílají;
- serverově uložený postup, nápovědy a rozehraná session s bezpečným obnovením po refreshi;
- Městský pas, dokončení trasy, podpis a lokální náhled selfie;
- Supabase Auth, role, CMS pro trasy/checkpointy/zdroje/fotografie a verzované publikace;
- administrace procentních i pevných slevových kupónů s limitem použití;
- QR platba převodem po nastavení veřejného IBANu a ruční potvrzení superadminem;
- lokální ilustrovaná mapa z otevřených WGS84 dat Brna (29 MČ a hlavní vodní toky), bez API klíče a průběžných nákladů;
- herní mapa aktuálního checkpointu s volitelným Google Maps Embed, bezklíčovým fallbackem a odkazy do Mapy.com i Google Maps;
- nasazení přes OpenAI Sites.

## Dosud neověřeno pro ostrý provoz

- databázové migrace jsou navazující; pro nový Supabase projekt stále chybí verzovaný baseline základních tabulek;
- produkční konfigurace účtu, rolí, e-mailů, plateb a publikovaných verzí musí projít samostatným end-to-end testem;
- všechny trasy včetně pilotu mají demonstrační obsah a nulové datum poslední terénní kontroly;
- historické informace, fyzické indicie, bezbariérovost a bezpečnost každého bodu se musí ověřit přímo na místě před prvním ostrým prodejem;
- fyzické prvky jsou pouze post-MVP experiment popsaný v provozním návrhu, nikoli součást prvního ostrého vydání.

## Lokální vývoj

Požadavky:

- Node.js `>=22.13.0`;
- pnpm `11.16.0`.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

Ověření změn:

```bash
pnpm lint
pnpm typecheck
pnpm test
# nebo vše jedním příkazem
pnpm check
```

Obnova lokálního mapového snapshotu z otevřených dat města Brna:

```bash
pnpm map:generate
```

## Proměnné prostředí

```bash
NEXT_PUBLIC_SITE_URL=https://sifrovana-mestska-hra.galluspeginpetr.chatgpt.site
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_PAYMENT_IBAN=
NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY=
```

`NEXT_PUBLIC_SITE_URL` je jediný důvěryhodný základ pro canonical a sociální URL. Pokud chybí nebo je neplatný, aplikace použije veřejnou adresu Sites; hodnoty z HTTP hlaviček do metadat nepřebírá.

`NEXT_PUBLIC_PAYMENT_IBAN` je veřejný účet příjemce ve formátu IBAN. Bez něj je vytvoření objednávky záměrně zakázané, aby nevznikaly rezervace, které nelze zaplatit.

`NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` je volitelný veřejný klíč omezený na Maps Embed API a domény Šifrované. Bez něj herní mapa automaticky použije bezklíčový náhled OpenStreetMap; externí navigace v Mapy.com a Google Maps funguje bez klíče vždy.

## Struktura

- `app/` – uživatelské rozhraní a společný herní engine;
- `lib/route-content.ts` – typovaný veřejný katalog měst a produktů bez řešení šifer;
- `lib/supabase/` – klient a serverové napojení Supabase;
- `supabase/migrations/` – navazující produkční migrace CMS, hry a kupónů; před založením nového projektu je ještě nutný verzovaný baseline základních tabulek;
- `supabase/deferred/` – připravené, ale nenasazené funkce pro některou další verzi;
- `docs/PRODUCT_CONSTITUTION.md` – produktové mantinely, ekonomika a expanzní brány;
- `docs/architecture/map-foundation.md` – zdroje, licence a rozšiřování mapového základu;
- `docs/field/physical-layer-plan.md` – nízkoúdržbový návrh fyzických prvků pro jednotlivé trasy;
- `tests/` – server-render a kontrola základních produktových kontraktů.

## Důležité omezení

Produkce zatím nemá skutečné GPS ověření, zdravotní API ani automatické párování bankovních plateb. Selfie a podpis zůstávají pouze lokálním náhledem a nikam se neodesílají. Referral a kredity jsou záměrně odložené v `supabase/deferred/` a nejsou součástí produkční databáze.
