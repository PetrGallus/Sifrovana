# Redakční checkpointy — pracovní postup

První obsah nových tras vzniká ve verzovaných JSON souborech v
`content/route-checkpoint-drafts/`. Tyto soubory nejsou produkční hrou. Jsou to
autorské briefy, které lze bezpečně naimportovat do CMS a následně kontrolovat
v terénu.

## Proč jsou kandidátní odpovědi oddělené

Pole `candidate_answers` zachycuje autorský návrh. Generátor je záměrně
nepřenáší do `accepted_answers`: uloží je pouze do interní poznámky. Produkční
odpověď se doplní v CMS až poté, co redaktor na místě ověří skutečnou indicii a
otestuje různé způsoby zápisu.

Stejně tak každý nový checkpoint dostane `is_active = false`. V publikovaném
snapshotu se může objevit teprve po zapnutí volby **Zařadit do příští publikace**.

## Generování migrace

```powershell
pnpm.cmd routes:generate-drafts
```

Skript před vytvořením SQL kontroluje zejména:

- přesně deset rozpracovaných tras;
- souvislé pořadí checkpointů od jedničky;
- unikátní ID složené z ID trasy a slugu;
- platné rozsahy WGS84 souřadnic;
- dvě nápovědy, fallback a zdroj;
- povinné upozornění, že souřadnice jsou pouze orientační.

Vygenerovaná migrace je bezpečná pro opakované spuštění. Doplní pouze
chybějící drafty; existující checkpoint ani jeho redakční a terénní úpravy
znovu nepřepisuje.

## Fragmenty do metašifry

Pokud checkpoint po vyřešení uděluje písmeno, symbol nebo jiný fragment pro
závěrečnou metašifru, patří do samostatného pole `meta_token`. Fragment se
nesmí schovávat do zajímavosti ani další indicie: herní API jej před správnou
odpovědí neodešle a zobrazí jej až na kartě úspěšného vyřešení. Prázdné pole
znamená, že daný checkpoint žádný fragment neuděluje.

Konkrétní fragmenty se do konceptů nedoplňují odhadem. Redaktor je zadá až
společně s odladěnou metašifrou a následně ověří, že jejich pořadí opravdu
vede k jednoznačnému finále.

## Publikační brána

Nová trasa začíná se stavem `commercial_readiness = blocked`. Samotné vyplnění
obsahu nestačí: superadmin ji musí po produktové, obsahové a terénní kontrole
výslovně označit jako připravenou k prodeji.

Aktivní trasa musí mít:

1. datum posledního kompletního terénního průchodu;
2. rozhodnutou vhodnost pro kočárek a předškolní děti;
3. alespoň jeden aktivní checkpoint;
4. souvislé pořadí aktivních bodů od 1 bez mezer;
5. změřenou vzdálenost 0 km u startu a kladnou vzdálenost u dalších bodů;
6. vyplněné a otestované odpovědi, dvě nápovědy a fallback;
7. platné HTTPS zdroje s ručně zapsaným datem kontroly.

Do neměnného snapshotu vstupují pouze data celé trasy a aktivních checkpointů.
Pracovní zdroje a fotografie neaktivních bodů zůstávají v CMS. U sezónní trasy
se terén i zdroje znovu ověřují nejdříve 14 dní před aktuálním obdobím.

JSON ani migrace proto samy o sobě žádnou trasu nezpřístupní hráčům.
