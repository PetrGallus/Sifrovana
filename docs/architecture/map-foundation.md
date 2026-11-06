# Mapový základ Šifrované

## Rozhodnutí

Veřejný katalog používá lokální SVG mapu Brna vykreslenou z WGS84 GeoJSON. Mapa nevolá za běhu Google Maps ani Mapy.com, nepotřebuje API klíč a nevytváří náklady za mapové načtení. Google Maps a Mapy.com zůstávají jako externí navigační odkazy u právě odemčeného checkpointu.

Mapa zobrazuje:

- skutečné hranice všech 29 městských částí;
- skutečné linie Svratky, Svitavy, Ponávky a Medláneckého potoka;
- orientační značky oblastí publikovaných a připravovaných tras;
- zvýraznění vybrané městské části.

Nezobrazuje předem přesný průběh placené trasy ani uzamčené checkpointy. Ty se odhalují postupně v herní relaci.

## Zdroj a licence

- Hranice MČ: [Statutární město Brno – otevřená data](https://data.gov.cz/datov%C3%A1-sada?iri=https://data.gov.cz/zdroj/datov%C3%A9-sady/44992785/916e8f0d886385be2d8b08e4a5b86067)
- Vodní toky: [Statutární město Brno – otevřená data](https://data.gov.cz/datov%C3%A1-sada?iri=https://data.gov.cz/zdroj/datov%C3%A9-sady/44992785/017158621a74c39f2a2fb2eac5472502)
- Souřadnicový systém: WGS84 / EPSG:4326
- Licence: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Hranice jsou odvozené z RÚIAN; v mapě je zachována atribuce ČÚZK a odkaz na [podmínky poskytování prostorových dat](https://cuzk.gov.cz/Predpisy/Podminky-poskytovani-prostor-dat-a-sitovych-sluzeb/Podminky-poskytovani-prostorovych-dat-CUZK.aspx).

Geometrie je zjednodušená pro rychlý mobilní render a výtvarně upravená. Není navigačním ani geodetickým podkladem.

## Obnova snapshotu

```powershell
pnpm map:generate
```

Generátor ověří přesně 29 polygonů, očekávaná pole a liniové geometrie vodstva. Výstup uloží do `lib/brno-districts.json` včetně samostatných katalogových odkazů a dat snapshotu pro hranice i vodní toky, licence a souřadnicového systému.

## Budoucí rozšíření

- Ověřené checkpointy se ukládají jako WGS84 a herní mapa je promítá stejnou funkcí.
- Koncept trasy má na veřejné mapě jen oblast/centroid, nikoliv vymyšlenou linii.
- Po terénním schválení lze z checkpointů odvodit zjednodušenou veřejnou obálku trasy, stále bez prozrazení pořadí a přesných bodů.
- Pro další města se přidá nový lokální datový snapshot a samostatná konfigurace projekce; UI komponenta zůstane poskytovatelsky neutrální.
