# Produktová ústava Šifrované

Tento dokument drží produkt jednoduchý, užitečný a dlouhodobě udržitelný. Každá nová funkce, trasa nebo obchodní nabídka se má posuzovat podle toho, zda podporuje níže uvedený slib.

## Produktový slib

**Šifrovaná je prémiová samoobslužná městská procházka s lehkou šifrovací vrstvou. Pomáhá dvojicím a malým skupinám všimnout si míst a příběhů, které by jinak minuly.**

Neprodáváme složitou hru na levelování. Prodáváme příjemně strávených 75–120 minut ve městě, společný zážitek a chuť vyrazit na další trasu.

Hlavní herní smyčka je vždy:

> dojdi → všimni si → krátce vyřeš → odemkni příběh → pokračuj

## Primární zákazník

- pár hledající program na rande;
- malá skupina přátel;
- návštěvník města;
- místní člověk, který chce objevit známou čtvrť jinak;
- tým 1–5 lidí používající jednu licenci.

Rodinné, školní a firemní varianty jsou samostatně označené nabídky. Nemají komplikovat základní spotřebitelskou trasu.

## Standard kvalitní trasy

Každá běžná trasa má splnit následující rámec:

- 75–120 minut a přibližně 2,5–4 km;
- 6–8 zastavení;
- 80 % lehkých až středních úkolů;
- nejvýše jedna jednoduchá závěrečná metašifra;
- alespoň jeden zapamatovatelný „wow“ moment;
- žádné nutné předchozí znalosti;
- řešení odvoditelné pozorováním místa nebo logikou;
- tolerantní kontrola odpovědí;
- dvě postupné nápovědy bez trestání hráče;
- krátké a dobře čitelné odhalení příběhu;
- GPS jako pomoc, nikdy jako tvrdá brána;
- záložní zadání pro každý checkpoint;
- partner ani otevírací doba nesmí být podmínkou dokončení.

Městská část je výchozí obchodní a obsahová jednotka, ne technické omezení. Tematická trasa může později překročit hranice čtvrtí.

## Co vědomě nestavíme v prvním ostrém MVP

- nativní mobilní aplikaci;
- složitou XP ekonomiku a levely;
- veřejné žebříčky, streaky a komunitní feed;
- zdravotní API a přesný krokoměr;
- živý multiplayer;
- vlastní fyzické instalace, samolepky nebo schránky v terénu;
- povinné partnerské zastávky;
- otevřený marketplace tras od veřejnosti;
- předplatné před vznikem dostatečně velkého katalogu;
- vlastní minihru naprogramovanou pro každý checkpoint;
- expanzi mimo Brno před ověřením opakovatelných výsledků.

## Jednoduchá gamifikace

Profil je **městský pas**, nikoli RPG postava. Obsahuje zejména:

- dokončené a rozehrané trasy;
- razítka městských částí;
- objevenou vzdálenost;
- deník výprav;
- doporučení další trasy.

Razítko nebo odznak je památka na zážitek. Nesmí být podmínkou pro přístup k obsahu ani zdrojem umělého tlaku.

## Obchodní model

Primární produkt je licence pro jeden tým 1–5 lidí.

Pracovní cenové hypotézy pro testování:

- pilotní cena: 299–349 Kč za tým;
- standardní hotová trasa: 449 Kč za tým;
- prémiová nebo sezónní trasa: 549–699 Kč za tým;
- balíček tří tras: přibližně 999–1 099 Kč;
- dárkový poukaz podle zvoleného produktu.

Nápovědy nejsou placené. V aplikaci nejsou reklamy ani mikrotransakce.

Druhý příjmový pilíř je B2B nad stejným obsahem a enginem:

- teambuildingové balíčky;
- hromadné voucherové kódy;
- hotely a turistická informační centra;
- městské a festivalové spolupráce;
- označené partnerské odměny po dokončení.

Zakázková trasa se prodává pouze za cenu, která pokryje její výrobu, testování a budoucí údržbu. Partnerství nesmí poškodit důvěru v obsah.

## Trasa je datový produkt

Nová trasa nesmí vyžadovat nový frontendový vývoj. Jeden herní engine zpracovává verzovaný obsah.

Datový balíček trasy obsahuje minimálně:

- město, oblast, cílovou skupinu, cenu, délku, čas a obtížnost;
- verzi a stav `draft / testing / active / maintenance / retired`;
- velikost týmu, sezónnost a dostupnost;
- zastávky v pořadí;
- souřadnice a bezpečnostní poznámku;
- zadání, přijímané odpovědi a dvě nápovědy;
- odhalení příběhu, navigaci a záložní zadání;
- interní zdroje historických tvrzení;
- datum poslední terénní kontroly.

Rozehraný tým dokončí verzi, kterou začal. Opravy se publikují jako nová verze.

## Výrobní proces trasy

1. Brief: publikum, téma, slib a ekonomická hypotéza.
2. Terénní průzkum: bezpečnost, přístupnost, hluk, signál a stabilita prvků.
3. Scénář: příběhová linka a pořadí zastávek.
4. Tvorba úkolů z malé knihovny ověřených typů.
5. Fact-check a evidence zdrojů.
6. Cold test člověkem, který trasu nezná.
7. Beta test několika nezávislými týmy.
8. Publikace a sledování problémů.
9. Terénní kontrola každé 3–6 měsíců a po hlášení chyby.

Lokální autor může dodat znalost místa. Publikační kvalitu a tón značky drží centrální editor.

## Metriky, které rozhodují

Primární metrika není počet denních přihlášení ani získané XP. Je to:

**počet dokončených placených tras, po kterých hráči chtějí další.**

Pro pilot sledujeme zejména:

- nákup → start;
- start → dokončení;
- místo opuštění;
- použití nápověd a chybné odpovědi;
- hodnocení trasy;
- hlášení problémů na 100 průchodů;
- zájem o další trasu;
- opakovaný nákup.

Pracovní validační cíle:

- dokončení alespoň 75 % zahájených her;
- průměrné hodnocení alespoň 4,5 z 5;
- technický nebo obsahový problém u méně než 10 % průchodů;
- nejméně třetina hráčů projeví zájem o další trasu.

## Brány pro rozšiřování

1. Placeně otestovat Královo Pole na 30–50 skutečných týmech.
2. Opravit společný formát trasy podle dat z pilotu.
3. Vytvořit dvě další brněnské trasy bez změny herního enginu.
4. Ověřit balíček, opakovaný nákup a B2B nabídku.
5. Teprve poté otevřít druhé město.

Každé rozšíření musí zachovat kvalitu zážitku a snížit, nikoli zvýšit, provozní náročnost jedné další trasy.
