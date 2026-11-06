# Fyzická vrstva tras Šifrované

Stav: pracovní návrh před terénním a partnerským ověřením
Zásada: žádný fyzický prvek nesmí být nutný k dokončení zaplacené hry.

Tento dokument je **post-MVP experiment**, nikoli součást prvního ostrého vydání. V souladu s produktovou konstitucí se vlastní prvky nezačnou vyrábět, dokud čistě digitální placený pilot neprokáže poptávku, dokončování tras a zvládnutelnou podporu. Níže uvedená místa jsou náměty k jednání, nikoli udělená povolení.

## Doporučený provozní model

Šifrovaná fyzické schránky nepotřebuje. Hlavní herní materiál tvoří už existující a veřejně přístupné detaily města: nápisy, reliéfy, průhledy, počty prvků a práce s okolím. Vlastní fyzický prvek má být vzácný bonus, který překvapí, nikoli další infrastruktura k hlídání.

- Nejvýše 0–1 vlastní prvek na trasu.
- Nic nelepit ani neschovávat ve veřejném prostoru bez písemného souhlasu vlastníka.
- Venkovní zalaminovaný QR kód není standard: degraduje, bývá odstraněn a působí jako cizí reklama.
- Preferovaný prvek je malá UV stabilní nebo gravírovaná destička pod střechou u partnera. Obsahuje QR, krátký ručně opsatelný kód a případně NFC.
- QR vede na trvalou adresu spravovanou v CMS. Změna úkolu tak nevyžaduje výměnu destičky.
- U každého prvku je v aplikaci okamžitá plnohodnotná volba „Prvek chybí / místo je zavřené“, která otevře digitální náhradu bez penalizace.
- QR smí vést jen na vlastní HTTPS doménu Šifrované, bez otevřeného přesměrování a cizího trackeru. Ruční kód není tajemství ani autentizační faktor; cíl musí jít v CMS okamžitě zneplatnit nebo přesměrovat na bezpečný fallback.
- Prvek musí být dosažitelný z kočárku i vozíku, s bezpečným místem k zastavení mimo provoz, čitelným kontrastem a kódem dostatečně velkým pro běžný mobil. Úloha nesmí vyžadovat obkreslování bez rovnocenné alternativy.
- Omezená otevírací doba je vždy uvedena před startem; při zavření se fallback nabídne okamžitě. Před sezónou a očekávanou špičkou proběhne mimořádná kontrola.

### Provozní třídy

| Třída | Co se připravuje | Jednorázově | Materiál | Běžná obsluha |
|---|---|---:|---:|---|
| A — bez instalace | existující detail města + digitální záloha | 0–1 h | 0 Kč | součást terénní kontroly trasy |
| B — partnerský prvek | návrh, souhlas, výroba a montáž jedné destičky | 3–6 h | cca 300–1 200 Kč | kontrola čtvrtletně a po nahlášení |
| C — sezónní prvek | dočasný prvek, koordinace instalace a stažení | 4–8 h | cca 500–1 500 Kč | instalace, jedna kontrola, demontáž |

Časy nezahrnují čekání na souhlas partnera. Přesné umístění se nezveřejní před uzavřením dohody a terénním testem.

## Návrh pro jednotlivé trasy

| `route_id` | Trasa | Třída | Navržený prvek a vhodný typ místa | Náročnost a riziko | Digitální náhrada |
|---|---|---|---|---|---|
| `brno-kralovo-pole-stopy` | Královo Pole: Stopy proměny | B | Reliéfní „úlomek kroniky“ s QR a krátkým kódem pod střechou ve foyer Semilassa nebo u partnerského podniku poblíž cíle. | Střední; závislost na otevírací době a partnerovi. | Stejný úlomek se zobrazí v aplikaci. |
| `brno-stred-pod-povrchem` | Brno-střed: Pod povrchem | A | Bez vlastního prvku; hra stojí na veřejných nápisech, průchodech a historických detailech. | Nízká; jen pravidelný audit čitelnosti. | Archivní detail ve vysokém rozlišení. |
| `brno-zabovresky-vily` | Žabovřesky: Vily vyprávějí | B | Ilustrovaný „klíč od vily“ v knihovně, komunitním centru nebo partnerské kavárně, nikdy na soukromém domě. | Střední; nutný souhlas a přístupnost mimo omezené hodiny. | Otočný digitální klíč. |
| `brno-medlanky-pecet-parku` | Medlánky: Pečeť zámeckého parku | B | Pevná reliéfní pečeť bez inkoustu na schválené nástěnce nebo u vstupu do Sýpky. Hráč přečte motiv; obkreslení je jen volitelný bonus. | Nízká až střední; jednoduchá výroba, kryté místo. | Silueta pečeti v aplikaci. |
| `brno-medlanky-zabi-posta` | Medlánky: Žabí pošta | B | Malé „žabí razítko“ s QR na schválené komunitní nástěnce u Sýpky či hřiště. | Střední; kontrola po bouřkách, riziko poškození dětmi. | Animované digitální razítko. |
| `brno-medlanky-kridla-stepi` | Medlánky: Křídla nad stepí | A | Bez instalace v přírodě a u letiště; využít informační tabule, horizont a bezpečné pozorování. | Nízká; nezasahuje do chráněného území. | Fotografie panelu a skládací digitální kluzák. |
| `brno-cerna-pole-moderni` | Černá Pole: Tři zahrady, tři rodiny | B | „Katalogový lístek rodiny“ u souhlasící instituce či kavárny, ne v zahradách vil. | Střední; důsledně nevybízet ke vstupu na soukromý pozemek. | Lístek v aplikaci. |
| `brno-cerna-pole-zelena-veda` | Černá Pole: Od černé půdy k zelené vědě | B | Pevná jmenovka semene pouze po dohodě s MENDELU či arboretem a mimo placenou část. | Vyšší; institucionální souhlas a provozní pravidla areálu. | Digitální herbářový list. |
| `brno-cerna-pole-99-schodu` | Černá Pole: Devětadevadesát schodů | A | Bez instalace; mechanikou je převýšení, schodiště a výhled. | Nízká; hlídat bezpečnou alternativu schodů. | Fotografie a alternativní početní úloha. |
| `brno-reckovice-pecet-vavrince` | Řečkovice: Pečeť svatého Vavřince | B | Reliéfní pečeť v krytém prostoru MČ, knihovny nebo zámečku; ne na kostele ani památníku. | Střední; souhlas a otevírací doba. | Digitální otisk pečeti. |
| `brno-reckovice-nove-mesto` | Řečkovice: Od císařské silnice k novému městu | A | Telefon funguje jako průhled: hráč porovnává dnešní ulici s historickou mapou. | Nízká; žádný servis v terénu. | Dvojice map se zarovnávacím jezdcem. |
| `brno-mokra-hora-ponavka` | Mokrá Hora: Ponávka a tajemství Mokré Hory | A | Bez schránky u vody a v zeleni; využít mostky, veřejné panely a zvuk toku. | Nízká; nulové riziko odpadu nebo zanesení vodou. | Fotografie detailu a digitální mlýnské kolo. |
| `brno-vanoce-betlem-z-lip` | Vánoční: Betlém z lip | C | Jedna odnímatelná „sedmá ozdoba“ s QR u partnera nebo v oficiální sezónní instalaci. | Střední; instalace a stažení každý rok. | Virtuální ozdoba na stejné pozici. |
| `brno-vanoce-kosmicka-hvezda` | Vánoční: Kosmické Vánoce | C | Hvězdný štítek s QR u hvězdárny, pouze jako součást domluveného adventního programu. | Vyšší; každoroční koordinace a návaznost na program. | Digitální souhvězdí. |
| `brno-vanoce-zoo-advent` | Zoo Brno: Zvířecí advent | C | Jedno partnerské QR nebo razítko u hlavních služeb či suvenýrů, nikdy u výběhu. | Vyšší; formální dohoda se Zoo a kontrola návštěvnického provozu. | Digitální zvířecí razítko. |

## Doporučený post-MVP experiment

Teprve po úspěšném digitálním pilotu lze na tři měsíce vyrobit jen dva fyzické kusy:

1. pečeť pro trasu v Medlánkách v krytém prostoru Sýpky;
2. úlomek kroniky pro Královo Pole u stabilního partnera.

U obou sledovat počet použití QR/ručního kódu, hlášení nedostupnosti, čas potřebný na domluvu a servis a to, zda prvek reálně zvyšuje hodnocení trasy. Před spuštěním musí existovat písemný souhlas, instalační a demontážní fotografie, náhradní kus, vlastník incidentu a termín odstranění. Další prvky vyrábět teprve tehdy, pokud bonus pro hráče převáží provozní práci.

## Pole pro budoucí CMS

- stabilní `route_id`, typ prvku, veřejný herní název a interní `asset_id`;
- neveřejný přesný popis umístění a fotografie instalace;
- vlastník místa, kontakt, datum a rozsah souhlasu;
- datum instalace, konce platnosti a poslední kontroly;
- stav `návrh / aktivní / chybí / poškozen / stažen`;
- trvalý QR cíl, ruční kód a obsah digitální náhrady;
- datum poslední rotace/revokace QR cíle, náhradní kus, vlastník incidentu a servisní lhůta;
- výška, dostupnost z vozíku/kočárku, bezpečné místo k zastavení, otevírací doba a způsob bezbariérového fallbacku;
- historie kontrol a hlášení hráčů.
