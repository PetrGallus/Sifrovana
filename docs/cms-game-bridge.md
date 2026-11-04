# Propojení publikovaného CMS s živou hrou

## Co je zdrojem pravdy

- Marketplace dál čte lehký veřejný katalog `public.routes`.
- Autor trasy upravuje pracovní obsah v `cms_routes` a `cms_checkpoints`.
- Publikování vytvoří neměnný záznam v `cms_route_publications` včetně odpovědí.
- Hra nikdy nečte pracovní tabulky ani celý snapshot. Používá pouze herní RPC z migrace
  `20261104154835_add_live_game_sessions.sql`.
- Každá rozehraná hra drží `publication_id`. Pozdější opravy v CMS proto nezmění rozehranou
  výpravu; nová hra dostane nejnovější publikaci.

## Klientské API

Datový adaptér je v `lib/supabase/published-game.ts` a React hook v
`app/use-published-game.ts`.

1. `start(routeId)` zavolá `start_or_resume_route_game`. Server zkontroluje přihlášení,
   vlastnictví trasy a aktivní publikaci.
2. `load(sessionId)` obnoví stejnou publikaci například po refreshi nebo z přímého odkazu.
3. `submitAnswer({ checkpointId, answer, useFallback })` odešle odpověď do databáze.
   Přijaté odpovědi nikdy nejsou součástí klientského typu ani payloadu.
4. `revealHint(level)` zpřístupní právě jednu nápovědu. Použité nápovědy se obnoví i po
   refreshi.
5. `currentCheckpoint` je poslední odemčený bod. Budoucí checkpointy server vůbec nevrací.

Do `localStorage` se smí uložit nanejvýš ID session pro pohodlný návrat. Obsah trasy,
odpovědi ani vlastní stav postupu se tam pro ostrou hru neukládají.

Když publikace neexistuje, `start_or_resume_route_game` skončí chybou „Trasa zatím nemá
publikovanou herní verzi.“ ještě před insertem session. UI má tuto chybu zobrazit a ponechat
uživatele v knihovně; nesmí v tomto případě automaticky spustit statické demo.

## Integrace v `app/page.tsx`

Integrace je hotová. Přihlášený vlastník publikované trasy používá výhradně následující
serverovou větev; statické odpovědi ani tichý offline fallback v klientu nejsou:

1. Vedle `useSifrovanaAuth()` se používá `usePublishedGame()`.
2. V `startGame()` po kontrole vlastnictví `await publishedGame.start(selectedRoute.id)` a
   teprve po úspěchu otevřít obrazovku `game`.
3. `activeCheckpoint` odvozovat z `publishedGame.currentCheckpoint`; ne z globálního
   `getRouteCheckpoints()`.
4. `revealHint()` změnit na asynchronní volání `publishedGame.revealHint(1 | 2)`. Texty číst
   z `checkpoint.revealedHints`.
5. `checkAnswer()` změnit na `publishedGame.submitAnswer(...)`. Klient už nesmí volat
   `normalizeAnswer` ani procházet `puzzle.answers`.
6. Těsně před odesláním si UI ponechá aktuální checkpoint jako `solvedCheckpoint`. Po správné
   odpovědi zobrazí `solvedCheckpoint` spolu s `result.fact` a `result.nextClue`. Hook už v té
   chvíli obsahuje další checkpoint z `result.session`; tlačítko „další“ pouze smaže lokální
   kartu výsledku. Tím se úspěšná karta nepřepne předčasně na nový bod.
7. Dokončení určit podle `session.progress.completedAt`, statistiky podle
   `session.progress`. Až navazující backendová verze má atomicky udělit odznak/XP.
8. Herní view model se mapuje z `PublishedGameCheckpoint`: `position`, `shortTitle`,
   `puzzlePrompt`, `fallbackPrompt`, `coordinates`, `map` a `distanceFromPreviousKm`.
9. Detail trasy smí zobrazit počet budoucích stop z katalogu, ale ne jejich názvy,
   souřadnice nebo zadání.

Při chybě backendu ostrá hra nesmí tiše přepnout na statické odpovědi. Takový fallback by
umožnil obejít publikaci i serverové ověření. Statickou variantu lze zachovat jen pod jasně
označeným demonstračním přepínačem.

## Bezpečnostní audit

| Vlastnost | Ochrana | Zbývající riziko / další krok |
| --- | --- | --- |
| Odpovědi | Porovnání probíhá v `SECURITY DEFINER` RPC; payload odstraňuje normální i záložní odpovědi. | Správci CMS odpovědi vidí záměrně. Omezit počet těchto účtů a zapnout MFA. |
| Budoucí body | SQL vrací pouze pozice `<= current_position`; klient navíc odmítne budoucí bod. | Názvy/počet mohou být marketingově uvedené v katalogu, nikoli přesné souřadnice a zadání. |
| Nápovědy a odměny | Text nápovědy se vrátí až po RPC. Fakt a další indicie až po vyřešení bodu. | Penalizaci bodů je vhodné později počítat serverově při dokončení. |
| Vlastnictví | Každé načtení i mutace kontrolují `auth.uid()`, vlastní session a `user_route_access`. | Po refundaci je nutné skutečně odebrat řádek přístupu. |
| Přímý přístup k tabulkám | RLS je zapnuté a granty pro `anon`/`authenticated` jsou odebrané; klient používá úzká RPC. | `service_role` zůstává privilegovaný a nikdy nesmí být v prohlížeči. |
| Zneužití odpovědí | Session se při pokusu zamyká, platí krátký cooldown a limit 20 pokusů/minutu. Surové odpovědi se nelogují. | Pro větší provoz doplnit síťový rate limit a monitoring opakovaných neúspěchů. |
| Stabilita rozehrané hry | Session odkazuje na jednu publikaci s `ON DELETE RESTRICT`. | Snapshoty nemazat ani neupravovat servisním klíčem; oprava znamená novou verzi. |
| SQL oprávnění | Všechny funkce mají prázdný `search_path`; execute je explicitně povolen jen `authenticated`. | Supabase advisor může `SECURITY DEFINER` nahlásit informativně; u těchto čtyř RPC je použití záměrné. |
| Soukromí | Log pokusů obsahuje jen výsledek, checkpoint a čas, nikoli zadaný text. | Stanovit retenční dobu analytických záznamů před ostrým provozem. |

## Produkční stav k 4. listopadu 2026

Nasazení proběhlo postupně bez placené preview branche:

1. `20261104154753_add_route_cms.sql` vytvořila CMS a veřejné katalogové koncepty bez
   odpovědí.
2. `20261104154835_add_live_game_sessions.sql` přidala herní session a úzká RPC.
3. Neveřejný, Gitem ignorovaný import vložil pět checkpointů a jejich odpovědi.
4. `20261104154925_publish_pilot_cms_snapshot.sql` vytvořila auditovanou publikaci
   `brno-kralovo-pole-stopy` verze `1.1.0`, revize 20.
5. `20261104173550_add_discount_coupons.sql` přidala serverový checkout a kupóny.

Rollbackový smoke test ověřil start hry, jednu odhalenou nápovědu, chybnou i správnou
odpověď, posun checkpointu, rezervaci a uvolnění kupónu, potvrzení platby a odemčení trasy.
Po `ROLLBACK` zůstalo nula testovacích session, objednávek, kupónů i přístupů. Supabase
advisor hlásí `SECURITY DEFINER` RPC informativně; všechna veřejná RPC mají vlastní kontrolu
`auth.uid()`, vlastnictví nebo role a prázdný `search_path`. Herní tabulky nemají přímé
granty ani RLS policy, takže jsou z prohlížeče deny-by-default.
