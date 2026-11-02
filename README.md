# Šifrovaná

Šifrovaná je mobilní webová aplikace pro placené samoobslužné městské výpravy. Malý tým jde po městě, všímá si detailů, řeší krátké šifry a postupně odemyká příběh místa.

Pilotní trasou je **Královo Pole: Stopy proměny**. Jedna licence platí pro tým 1–5 lidí a stojí 449 Kč. Balíček tří tras za 999 Kč je produktová hypotéza; začne se prodávat teprve po terénním ověření tří hotových tras.

## Produktový směr

- hlavní hodnotou je kvalitní trasa a jednoduchý mobilní průchod, ne složitá gamifikace;
- jednotný rytmus hry: dojít → všimnout si → vyřešit → odemknout příběh → pokračovat;
- profil funguje jako Městský pas s dokončenými výpravami a razítky, bez XP a levelů;
- nápovědy nejsou placené ani trestané;
- nové trasy jsou verzovaná data se zdroji, fallbackem a datem terénní kontroly, nikoli nový UI vývoj;
- nejdřív se ověřuje placený pilot v Brně, potom další dvě brněnské trasy a až následně balíčky či další města.

Podrobná rozhodovací pravidla jsou v [produktové konstituci](docs/PRODUCT_CONSTITUTION.md).

## Aktuální stav

- responzivní marketplace a detail pilotní trasy;
- průchod pěti checkpointy s postupným odkrýváním, odpověďmi, nápovědami a lokálně uloženým postupem;
- Městský pas, dokončení trasy, podpis a lokální náhled selfie;
- Supabase Auth, role a databázový základ pro objednávky;
- QR platba převodem po nastavení veřejného IBANu;
- nasazení přes OpenAI Sites.

Pilotní obsah je demonstrační a historické informace i fyzické indicie musí před ostrým prodejem projít terénní kontrolou.

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
pnpm test
```

## Proměnné prostředí

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_PAYMENT_IBAN=
```

`NEXT_PUBLIC_PAYMENT_IBAN` je veřejný účet příjemce ve formátu IBAN. Bez něj lze vytvořit objednávku, ale aplikace záměrně nevygeneruje neplatný platební QR kód.

## Struktura

- `app/` – uživatelské rozhraní a společný herní engine;
- `lib/route-content.ts` – typovaný katalog měst, tras a checkpointů;
- `lib/supabase/` – klient a serverové napojení Supabase;
- `supabase/` – databázové migrace a e-mailové šablony;
- `docs/PRODUCT_CONSTITUTION.md` – produktové mantinely, ekonomika a expanzní brány;
- `tests/` – server-render a kontrola základních produktových kontraktů.

## Důležité omezení

Produkce zatím nemá skutečné GPS ověření, zdravotní API, automatické potvrzení plateb ani redakční systém. Přihlášení a objednávky používají Supabase; herní postup pilotu se stále ukládá lokálně v prohlížeči.
