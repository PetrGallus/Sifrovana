-- Route suitability badges and the next editorial portfolio for Brno.
-- All new routes are catalogue concepts only. They intentionally remain
-- unpublished until their paths, accessibility and physical clues are tested.

alter table public.cms_routes
  add column stroller_status text not null default 'unknown',
  add column preschool_status text not null default 'unknown';

alter table public.cms_routes
  add constraint cms_routes_stroller_status_check
    check (stroller_status in ('verified', 'not_recommended', 'unknown')),
  add constraint cms_routes_preschool_status_check
    check (preschool_status in ('suitable', 'with_adult', 'not_recommended', 'unknown'));

alter table public.routes
  add column stroller_status text not null default 'unknown',
  add column preschool_status text not null default 'unknown',
  add column duration_min_minutes integer,
  add column duration_max_minutes integer;

update public.routes
set duration_min_minutes = duration_minutes,
    duration_max_minutes = duration_minutes
where duration_min_minutes is null or duration_max_minutes is null;

alter table public.routes
  alter column duration_min_minutes set not null,
  alter column duration_max_minutes set not null,
  add constraint routes_duration_min_minutes_check check (duration_min_minutes > 0),
  add constraint routes_duration_max_minutes_check check (duration_max_minutes > 0),
  add constraint routes_duration_range_check check (duration_max_minutes >= duration_min_minutes),
  add constraint routes_stroller_status_check
    check (stroller_status in ('verified', 'not_recommended', 'unknown')),
  add constraint routes_preschool_status_check
    check (preschool_status in ('suitable', 'with_adult', 'not_recommended', 'unknown'));

update public.routes catalogue
set duration_min_minutes = cms.duration_min,
    duration_max_minutes = cms.duration_max,
    stroller_status = cms.stroller_status,
    preschool_status = cms.preschool_status
from public.cms_routes cms
where cms.id = catalogue.id;

comment on column public.cms_routes.stroller_status is
  'verified means the complete route was field-tested with a normal stroller; unknown must remain visible as unverified.';
comment on column public.cms_routes.preschool_status is
  'Editorial suitability for preschool children. Children always remain under adult supervision.';
comment on column public.routes.duration_max_minutes is
  'Upper duration estimate used for deterministic badges: <=60, <=120, or 120+ minutes.';

insert into public.cms_routes (
  id, city_id, city_name, district, title, tagline, description, price_czk,
  distance_km, duration_min, duration_max, difficulty, availability, lifecycle,
  version, team_min, team_max, audiences, language, seasonality,
  accessibility_note, safety_note, field_notes, equipment, accent, map_x, map_y,
  stroller_status, preschool_status
)
values
  (
    'brno-medlanky-pecet-parku', 'brno', 'Brno', 'Medlánky',
    'Pečeť zámeckého parku',
    'Šest znaků starých Medlánek odemkne pečeť zámecké správkyně.',
    'Krátká rodinná výprava od Sýpky přes historické centrum k zámeckému parku.',
    250, 1.80, 45, 60, 'Lehká', 'coming', 'draft', '0.1.0', 1, 5,
    array['families', 'adults'], 'cs', 'year-round',
    'Cílově pro běžný kočárek; označení ano až po kompletním průjezdu bez zvedání.',
    'Nevstupovat do zámku, neblokovat provoz Sýpky a u památníku zachovat pietu.',
    'Ověřit zvonici, obrubníky, akce v parku a bezpečný bod u každého objektu.',
    array['Nabitý telefon', 'Pohodlné boty'], 'orange', 34, 16,
    'unknown', 'with_adult'
  ),
  (
    'brno-medlanky-zabi-posta', 'brno', 'Brno', 'Medlánky',
    'Žabí pošta',
    'Dones zprávu mezi místy, kde se v Medlánkách stále drží voda.',
    'Rodinná výprava o rybnících, mokřadu, zahradě a vodním cyklu ve městě.',
    250, 3.50, 80, 105, 'Lehká', 'coming', 'draft', '0.1.0', 1, 5,
    array['families', 'adults'], 'cs', 'year-round',
    'Cílově pro kočárek po zpevněné variantě; nutno ověřit bláto a všechny nájezdy.',
    'Úlohy musí být řešitelné bez sestupu ke břehu a bez dotýkání živočichů.',
    'Prověřit provozní režim Přírodní zahrady, sezónní vegetaci a fotografické fallbacky.',
    array['Nabitý telefon', 'Pohodlné boty', 'Voda'], 'teal', 29, 12,
    'unknown', 'with_adult'
  ),
  (
    'brno-medlanky-kridla-stepi', 'brno', 'Brno', 'Medlánky',
    'Křídla nad stepí',
    'Sestav kluzák a propoj historii létání s medláneckou stepí.',
    'Delší přírodovědná výprava kolem veřejných cest u letiště a chráněných lokalit.',
    250, 7.00, 150, 190, 'Těžká', 'coming', 'draft', '0.1.0', 1, 5,
    array['adults', 'friends', 'families'], 'cs', 'year-round',
    'Kočárek se nedoporučuje; trasa počítá s terénem a delší chůzí.',
    'Nevstupovat na letištní plochu ani mimo legální cesty v chráněném území.',
    'Nutný audit horka, bláta, posledního startu, hranic ochrany a legálních cest.',
    array['Nabitý telefon', 'Pevné boty', 'Voda', 'Ochrana proti slunci'], 'blue', 23, 9,
    'not_recommended', 'not_recommended'
  ),
  (
    'brno-cerna-pole-moderni', 'brno', 'Brno', 'Černá Pole',
    'Tři zahrady, tři rodiny',
    'Rozlušti rodokmen domů mezi Lužánkami a slavnými vilami.',
    'Architektonická rodinná trasa po veřejných prostranstvích Černých Polí.',
    250, 2.80, 70, 90, 'Lehká', 'coming', 'draft', '0.1.0', 1, 5,
    array['families', 'adults', 'couples'], 'cs', 'year-round',
    'Kočárková varianta musí vést ulicemi; propojení zahrad není bezbariérové.',
    'Žádný checkpoint nesmí vyžadovat placený interiér ani otevřenou zahradu.',
    'Ověřit uliční fallback, otevírací režimy zahrad a klidné stanoviště u vil.',
    array['Nabitý telefon', 'Pohodlné boty'], 'orange', 58, 36,
    'unknown', 'with_adult'
  ),
  (
    'brno-cerna-pole-zelena-veda', 'brno', 'Brno', 'Černá Pole',
    'Od černé půdy k zelené vědě',
    'Proveď semínko školou a vypěstuj z něj strom poznání.',
    'Trasa propojí MENDELU, veřejnou zeleň, školy a zahradní historii čtvrti.',
    250, 3.50, 90, 115, 'Střední', 'coming', 'draft', '0.1.0', 1, 5,
    array['families', 'adults', 'friends'], 'cs', 'year-round',
    'Cílově zpevněná městská varianta; botanická zahrada je pouze volitelný bonus.',
    'Respektovat školní a nemocniční provoz; nevázat hru na otevírací dobu arboreta.',
    'Ověřit zimní údržbu, přechody, arboretum a bezpečnou vzdálenost od nemocnice.',
    array['Nabitý telefon', 'Pohodlné boty'], 'teal', 61, 31,
    'unknown', 'with_adult'
  ),
  (
    'brno-cerna-pole-99-schodu', 'brno', 'Brno', 'Černá Pole',
    'Devětadevadesát schodů',
    'Vystoupej od parku k moderně a rozlušti vertikální šifru města.',
    'Delší architektonická trasa se Schodovou ulicí a výrazným převýšením.',
    250, 4.50, 125, 150, 'Těžká', 'coming', 'draft', '0.1.0', 1, 5,
    array['adults', 'friends'], 'cs', 'year-round',
    'Bez kočárku; součástí konceptu je 99 schodů.',
    'Nespouštět za námrazy ani po setmění; respektovat soukromí vil a nemocnici.',
    'Změřit skutečný počet schodů, sklon, osvětlení a zimní režim.',
    array['Nabitý telefon', 'Pevné boty', 'Voda'], 'red', 55, 34,
    'not_recommended', 'not_recommended'
  ),
  (
    'brno-reckovice-pecet-vavrince', 'brno', 'Brno', 'Řečkovice a Mokrá Hora',
    'Pečeť svatého Vavřince',
    'Slož pečeť starých Řečkovic z vody, tvrze, kostela a cesty.',
    'Kompaktní rodinná trasa kolem Palackého náměstí a historického jádra.',
    250, 1.80, 45, 60, 'Lehká', 'coming', 'draft', '0.1.0', 1, 5,
    array['families', 'adults'], 'cs', 'year-round',
    'Cílově pro kočárek; nutný audit všech přechodů a obrubníků.',
    'Nevstupovat do budov, respektovat bohoslužby a pietní prostor památníku.',
    'Ověřit bezpečné pohledy na zámek, stopu pivovaru a vedení přes komunikace.',
    array['Nabitý telefon', 'Pohodlné boty'], 'orange', 44, 7,
    'unknown', 'with_adult'
  ),
  (
    'brno-reckovice-nove-mesto', 'brno', 'Brno', 'Řečkovice a Mokrá Hora',
    'Od císařské silnice k novému městu',
    'Překryj starou a novou mapu a sleduj proměnu vesnice ve čtvrť.',
    'Městská trasa od Palackého náměstí přes školy, sport a novou veřejnou zeleň.',
    250, 4.30, 95, 120, 'Střední', 'coming', 'draft', '0.1.0', 1, 5,
    array['families', 'adults', 'friends'], 'cs', 'year-round',
    'Cílově pro kočárek; potvrdit průjezdnost u škol, sportovišť a parků.',
    'Nefotit děti a nevstupovat do školních či sportovních areálů.',
    'Prověřit rekonstrukce ulic, program sportovišť, přechody a trasu k Oválu.',
    array['Nabitý telefon', 'Pohodlné boty'], 'blue', 47, 5,
    'unknown', 'with_adult'
  ),
  (
    'brno-mokra-hora-ponavka', 'brno', 'Brno', 'Řečkovice a Mokrá Hora',
    'Ponávka a tajemství Mokré Hory',
    'Najdi osm částí vodní zprávy od staré vsi po Zamilovaný hájek.',
    'Delší přírodní výprava podél veřejných cest a obnovených míst u Ponávky.',
    250, 6.00, 135, 170, 'Těžká', 'coming', 'draft', '0.1.0', 1, 5,
    array['adults', 'friends', 'families'], 'cs', 'year-round',
    'Kočárek se v základní variantě nedoporučuje; kratší varianta vyžaduje nový audit.',
    'Pozor na vodu, bláto, led, cyklisty a podmáčené úseky.',
    'Změřit cesty u Ponávky, sezónní stav vody, osvětlení a poslední bezpečný start.',
    array['Nabitý telefon', 'Pevné boty', 'Voda'], 'teal', 42, 2,
    'not_recommended', 'not_recommended'
  ),
  (
    'brno-vanoce-betlem-z-lip', 'brno', 'Brno', 'Černá Pole',
    'Betlém z lip',
    'Posbírej šest ozdob a vrať vánoční příběh lipám z Krkoškovy ulice.',
    'Klidnější adventní procházka přes Lužánky, vilovou čtvrť, dřevěný betlém a náměstí SNP.',
    250, 3.80, 90, 115, 'Lehká', 'seasonal', 'draft', '0.1.0', 1, 5,
    array['families', 'adults', 'couples'], 'cs', 'seasonal',
    'Cílově pro kočárek po uliční variantě; každý rok znovu ověřit zimní údržbu.',
    'Aktivovat pouze po potvrzení betléma, stromu, termínů a bezpečných zimních cest.',
    'Každoroční sezónní audit; zahrady vil a výzdoba jsou jen volitelné vrstvy.',
    array['Nabitý telefon', 'Teplé oblečení', 'Reflexní prvek'], 'red', 57, 38,
    'unknown', 'with_adult'
  ),
  (
    'brno-vanoce-kosmicka-hvezda', 'brno', 'Brno', 'Kraví hora',
    'Kosmické Vánoce',
    'Najdi ztracenou betlémskou hvězdu mezi parkem a hvězdárnou.',
    'Krátká venkovní adventní hra propojující tradici, souhvězdí a výhledy z Kraví hory.',
    250, 2.00, 45, 60, 'Lehká', 'seasonal', 'draft', '0.1.0', 1, 5,
    array['families', 'adults', 'couples'], 'cs', 'seasonal',
    'Cílově zpevněná kočárková varianta; nutno potvrdit zimní stav cest.',
    'Aktivovat pouze po oficiálním potvrzení daného ročníku instalace Vánoční hvězda.',
    'Pro sezonu 2026 zatím bez potvrzení; hra musí fungovat i bez vstupu do hvězdárny.',
    array['Nabitý telefon', 'Teplé oblečení', 'Reflexní prvek'], 'blue', 39, 47,
    'unknown', 'with_adult'
  ),
  (
    'brno-vanoce-zoo-advent', 'brno', 'Brno', 'Bystrc · Zoo Brno',
    'Zvířecí advent',
    'Doruč osm bezpečných dárků zvířatům — bez krmení a bez rušení.',
    'Partnerská prémiová trasa v areálu Zoo Brno, určená až po dohodě s provozovatelem.',
    250, 3.20, 120, 150, 'Střední', 'seasonal', 'draft', '0.1.0', 1, 5,
    array['families', 'adults'], 'cs', 'seasonal',
    'Kočárek je podmíněný kopcovitým areálem a aktuálními uzávěrami.',
    'Bez písemné dohody se Zoo nepublikovat; návštěvní řád a welfare mají přednost před hrou.',
    'Vyžaduje partnerství, vstupenku, přesnou mapu, sezónní program a audit uzavírek.',
    array['Nabitý telefon', 'Teplé oblečení', 'Vstupenka do Zoo'], 'teal', 8, 49,
    'unknown', 'with_adult'
  )
on conflict (id) do nothing;

-- Catalogue shells make the concepts visible as forthcoming routes, while the
-- CMS remains the authoritative editorial workspace.
insert into public.routes (
  id, city, district, title, tagline, price_czk, distance_km,
  duration_minutes, duration_min_minutes, duration_max_minutes, difficulty, checkpoint_count,
  xp_reward, status, accent, map_x, map_y, available_text,
  stroller_status, preschool_status
)
select
  cms.id, cms.city_name, cms.district, cms.title, cms.tagline, cms.price_czk,
  cms.distance_km,
  round((cms.duration_min + cms.duration_max) / 2.0)::integer,
  cms.duration_min, cms.duration_max, cms.difficulty,
  case cms.id
    when 'brno-medlanky-pecet-parku' then 7
    when 'brno-medlanky-zabi-posta' then 7
    when 'brno-medlanky-kridla-stepi' then 8
    when 'brno-cerna-pole-moderni' then 7
    when 'brno-cerna-pole-zelena-veda' then 7
    when 'brno-cerna-pole-99-schodu' then 8
    when 'brno-reckovice-pecet-vavrince' then 7
    when 'brno-reckovice-nove-mesto' then 7
    when 'brno-mokra-hora-ponavka' then 8
    when 'brno-vanoce-betlem-z-lip' then 7
    when 'brno-vanoce-kosmicka-hvezda' then 7
    when 'brno-vanoce-zoo-advent' then 8
    else 0
  end,
  100, cms.availability, cms.accent,
  round(cms.map_x)::integer, round(cms.map_y)::integer,
  case
    when cms.availability = 'seasonal' then 'Aktivace po sezónní kontrole'
    else 'v přípravě'
  end,
  cms.stroller_status, cms.preschool_status
from public.cms_routes cms
where cms.id in (
  'brno-medlanky-pecet-parku', 'brno-medlanky-zabi-posta', 'brno-medlanky-kridla-stepi',
  'brno-cerna-pole-moderni', 'brno-cerna-pole-zelena-veda', 'brno-cerna-pole-99-schodu',
  'brno-reckovice-pecet-vavrince', 'brno-reckovice-nove-mesto', 'brno-mokra-hora-ponavka',
  'brno-vanoce-betlem-z-lip', 'brno-vanoce-kosmicka-hvezda', 'brno-vanoce-zoo-advent'
)
on conflict (id) do update set
  city = excluded.city,
  district = excluded.district,
  title = excluded.title,
  tagline = excluded.tagline,
  distance_km = excluded.distance_km,
  duration_minutes = excluded.duration_minutes,
  duration_min_minutes = excluded.duration_min_minutes,
  duration_max_minutes = excluded.duration_max_minutes,
  difficulty = excluded.difficulty,
  checkpoint_count = excluded.checkpoint_count,
  status = excluded.status,
  accent = excluded.accent,
  map_x = excluded.map_x,
  map_y = excluded.map_y,
  available_text = excluded.available_text,
  stroller_status = excluded.stroller_status,
  preschool_status = excluded.preschool_status;

insert into public.cms_sources (route_id, title, url, verified_at, internal_note, sort_order)
values
  ('brno-medlanky-pecet-parku', 'MČ Brno-Medlánky — Historie', 'https://medlanky.brno.cz/historie', current_date, 'Zámek, park, Sýpka, zvonice, památník a památný buk.', 0),
  ('brno-medlanky-pecet-parku', 'MČ Brno-Medlánky — Medlánky 780 let', 'https://medlanky.brno.cz/documents/4864658/6336744/Medlanky_780-let.pdf/7c0366b9-d022-6ad8-9c9e-a7efc970090d', current_date, 'Parkové prvky a historický kontext.', 1),
  ('brno-medlanky-zabi-posta', 'MČ Brno-Medlánky — Medlánky 780 let', 'https://medlanky.brno.cz/documents/4864658/6336744/Medlanky_780-let.pdf/7c0366b9-d022-6ad8-9c9e-a7efc970090d', current_date, 'Mokřad, rybníky, biokoridor a Přírodní zahrada.', 0),
  ('brno-medlanky-kridla-stepi', 'MČ Brno-Medlánky — Medlánky 780 let', 'https://medlanky.brno.cz/documents/4864658/6336744/Medlanky_780-let.pdf/7c0366b9-d022-6ad8-9c9e-a7efc970090d', current_date, 'Letiště, létání, Žebětínská cesta a Pergl.', 0),
  ('brno-medlanky-kridla-stepi', 'AOPK ČR — Medlánecké kopce', 'https://portal.nature.cz/w/uzemi-1004', current_date, 'Ochrana stepní lokality.', 1),
  ('brno-cerna-pole-moderni', 'TIC Brno — To je Brno: Černá Pole', 'https://www.gotobrno.cz/wp-content/uploads/2020/12/to-je-brno-cerna-pole.pdf', current_date, 'Architektura a veřejná místa lokality.', 0),
  ('brno-cerna-pole-moderni', 'Vila Löw-Beer — vila a zahrada', 'https://www.vilalowbeer.cz/cz/vila', current_date, 'Provozní a historický kontext zahrady.', 1),
  ('brno-cerna-pole-zelena-veda', 'MČ Brno-sever — Černá Pole', 'https://www.sever.brno.cz/w/cerna-pole', current_date, 'Historie lokality.', 0),
  ('brno-cerna-pole-zelena-veda', 'MENDELU — Botanická zahrada a arboretum', 'https://arboretum.mendelu.cz/pro-navstevniky/oteviraci-doba-vstupne-pronajmy/', current_date, 'Otevírací doba a přístupnost; interiér jen bonus.', 1),
  ('brno-cerna-pole-99-schodu', 'TIC Brno — To je Brno: Černá Pole', 'https://www.gotobrno.cz/wp-content/uploads/2020/12/to-je-brno-cerna-pole.pdf', current_date, 'Schodová, vily a architektonický kontext.', 0),
  ('brno-cerna-pole-99-schodu', 'MČ Brno-sever — zimní údržba', 'https://www.sever.brno.cz/zimni-udrzba', current_date, 'Sezónní bezpečnost cest a schodů.', 1),
  ('brno-reckovice-pecet-vavrince', 'MČ Brno-Řečkovice a Mokrá Hora — Historie', 'https://reckovice.brno.cz/historie', current_date, 'Rybník, zámek, kostel, pivovar a císařská silnice.', 0),
  ('brno-reckovice-pecet-vavrince', 'NPÚ — Zámek Řečkovice', 'https://pamatkovykatalog.cz/zamek-14912786', current_date, 'Památková hodnota zámku.', 1),
  ('brno-reckovice-nove-mesto', 'MČ Brno-Řečkovice a Mokrá Hora — Historie', 'https://reckovice.brno.cz/historie', current_date, 'Císařská silnice a vývoj čtvrti.', 0),
  ('brno-reckovice-nove-mesto', 'MČ Brno-Řečkovice a Mokrá Hora — SK Řečkovice', 'https://reckovice.brno.cz/w/sk-reckovice-1', current_date, 'Historie sportovního klubu.', 1),
  ('brno-mokra-hora-ponavka', 'MČ Brno-Řečkovice a Mokrá Hora — Zajímavosti', 'https://reckovice.brno.cz/zajimavosti', current_date, 'Stezka zdraví a Ponávka.', 0),
  ('brno-mokra-hora-ponavka', 'Tiskový servis města Brna — Zamilovaný hájek', 'https://cosedeje.brno.cz/w/zamilovany-hajek-pro-vsechny-dalsi-projekt-dame-na-vas-je-hotovy-oslava-se-uskutecni-v-patek-na-bruslich', current_date, 'Naučná stezka a veřejné úpravy dokončené v roce 2026.', 1),
  ('brno-vanoce-betlem-z-lip', 'MČ Brno-sever — Severník 1/2026', 'https://www.sever.brno.cz/documents/10670111/0/severnik_1_2026.pdf/2356afd7-e917-b0bb-6058-2413f48c291b', current_date, 'Dřevěný betlém z lip a strom na náměstí SNP; každoročně znovu ověřit.', 0),
  ('brno-vanoce-kosmicka-hvezda', 'Hvězdárna a planetárium Brno — Kosmické Vánoce', 'https://www.hvezdarna.cz/novinky/kosmicke-vanoce-na-kravi-hore-brnenske-svatky-pod-hvezdami/', current_date, 'Předchozí ročník instalace; aktivace až po potvrzení aktuální sezóny.', 0),
  ('brno-vanoce-zoo-advent', 'Zoo Brno — Pavilony za setmění', 'https://www.zoobrno.cz/pavilony-za-setmeni', current_date, 'Adventní program 2026; samostatná hra vyžaduje partnerství.', 0),
  ('brno-vanoce-zoo-advent', 'Zoo Brno — Otevírací doba', 'https://www.zoobrno.cz/oteviraci-doba', current_date, 'Provozní podmínky a vstupné.', 1)
on conflict (route_id, coalesce(checkpoint_id, ''), url) do nothing;

create or replace function public.publish_cms_route(p_route_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_route public.cms_routes;
  v_snapshot jsonb;
  v_publication_id uuid;
  v_publish_version text;
begin
  if not private.is_cms_superadmin() then
    raise exception 'Publikovat trasu může pouze superadmin.';
  end if;

  select * into v_route from public.cms_routes where id = p_route_id for update;
  if not found then raise exception 'Trasa nebyla nalezena.'; end if;
  if v_route.stroller_status = 'unknown' or v_route.preschool_status = 'unknown' then
    raise exception 'Před publikací terénně ověř kočárek a vhodnost pro předškolní děti.';
  end if;

  select publication.id, publication.version
    into v_publication_id, v_publish_version
  from public.cms_route_publications publication
  where publication.route_id = p_route_id
    and publication.revision = v_route.content_revision
  limit 1;
  if v_publication_id is not null then
    update public.cms_routes
    set lifecycle = 'active',
        availability = case when availability = 'seasonal' then 'seasonal' else 'active' end,
        published_revision = v_route.content_revision,
        published_at = coalesce(published_at, now()),
        updated_by = auth.uid()
    where id = p_route_id;
    return jsonb_build_object(
      'publication_id', v_publication_id,
      'route_id', p_route_id,
      'version', v_publish_version,
      'revision', v_route.content_revision,
      'already_published', true
    );
  end if;

  if v_route.title = '' or v_route.district = '' or v_route.tagline = '' then
    raise exception 'Trasa nemá vyplněné povinné základní údaje.';
  end if;
  if not exists (select 1 from public.cms_checkpoints c where c.route_id = p_route_id and c.is_active) then
    raise exception 'Trasa nemá žádný aktivní checkpoint.';
  end if;
  if not coalesce((
    select min(c.position) = 1
      and max(c.position) = count(*)
      and count(distinct c.position) = count(*)
    from public.cms_checkpoints c
    where c.route_id = p_route_id and c.is_active
  ), false) then
    raise exception 'Aktivní checkpointy musí mít souvislé pořadí 1 až N bez mezer.';
  end if;
  if exists (
    select 1 from public.cms_checkpoints c
    where c.route_id = p_route_id and c.is_active
      and (c.puzzle_prompt = '' or cardinality(c.accepted_answers) = 0 or c.hint_1 = '' or c.hint_2 = ''
        or c.fallback_prompt = '' or cardinality(c.fallback_answers) = 0 or c.fact = '')
  ) then
    raise exception 'Nejméně jeden checkpoint není připravený k publikaci.';
  end if;
  if not exists (select 1 from public.cms_sources s where s.route_id = p_route_id) then
    raise exception 'Před publikací doplň alespoň jeden ověřitelný zdroj.';
  end if;
  if exists (
    select 1 from public.cms_media m
    where m.route_id = p_route_id and m.archived_at is null and m.media_role <> 'field' and btrim(m.alt_text) = ''
  ) then
    raise exception 'Veřejné fotografie musí mít alternativní text.';
  end if;
  if v_route.availability = 'seasonal'
    and (v_route.available_from is null or v_route.available_to is null) then
    raise exception 'Sezónní trasa musí mít začátek i konec dostupnosti.';
  end if;

  update public.cms_routes
  set lifecycle = 'active',
      availability = case when availability = 'seasonal' then 'seasonal' else 'active' end,
      published_at = now(), updated_by = auth.uid()
  where id = p_route_id;
  select * into v_route from public.cms_routes where id = p_route_id;

  v_publish_version := v_route.version;
  if exists (
    select 1 from public.cms_route_publications publication
    where publication.route_id = p_route_id and publication.version = v_publish_version
  ) then
    v_publish_version := regexp_replace(v_route.version, '-r[0-9]+$', '')
      || '-r' || v_route.content_revision::text;
  end if;

  select jsonb_build_object(
    'route', (to_jsonb(r) - 'field_notes') || jsonb_build_object('version', v_publish_version),
    'checkpoints', coalesce((
      select jsonb_agg(to_jsonb(c) - 'internal_notes' order by c.position)
      from public.cms_checkpoints c where c.route_id = r.id and c.is_active
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(to_jsonb(s) - 'internal_note' order by s.sort_order, s.title)
      from public.cms_sources s where s.route_id = r.id
    ), '[]'::jsonb),
    'media', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.sort_order, m.created_at)
      from public.cms_media m where m.route_id = r.id and m.archived_at is null and m.media_role <> 'field'
    ), '[]'::jsonb)
  ) into v_snapshot
  from public.cms_routes r where r.id = p_route_id;

  insert into public.cms_route_publications (route_id, version, revision, snapshot, published_by)
  values (p_route_id, v_publish_version, v_route.content_revision, v_snapshot, auth.uid())
  returning id into v_publication_id;

  update public.cms_routes set published_revision = v_route.content_revision where id = p_route_id;

  insert into public.routes (
    id, city, district, title, tagline, price_czk, distance_km,
    duration_minutes, duration_min_minutes, duration_max_minutes, difficulty, checkpoint_count, xp_reward,
    status, accent, map_x, map_y, available_text, stroller_status, preschool_status
  ) values (
    v_route.id, v_route.city_name, v_route.district, v_route.title, v_route.tagline,
    v_route.price_czk, v_route.distance_km,
    round((v_route.duration_min + v_route.duration_max) / 2.0)::integer,
    v_route.duration_min, v_route.duration_max, v_route.difficulty,
    (select count(*)::integer from public.cms_checkpoints c where c.route_id = v_route.id and c.is_active),
    100, v_route.availability, v_route.accent,
    round(v_route.map_x)::integer, round(v_route.map_y)::integer,
    case
      when v_route.availability = 'seasonal' then
        to_char(v_route.available_from, 'DD.MM.YYYY') || '–' || to_char(v_route.available_to, 'DD.MM.YYYY')
      when v_route.availability = 'coming' then 'v přípravě'
      else null
    end,
    v_route.stroller_status, v_route.preschool_status
  )
  on conflict (id) do update set
    city = excluded.city,
    district = excluded.district,
    title = excluded.title,
    tagline = excluded.tagline,
    price_czk = excluded.price_czk,
    distance_km = excluded.distance_km,
    duration_minutes = excluded.duration_minutes,
    duration_min_minutes = excluded.duration_min_minutes,
    duration_max_minutes = excluded.duration_max_minutes,
    difficulty = excluded.difficulty,
    checkpoint_count = excluded.checkpoint_count,
    status = excluded.status,
    accent = excluded.accent,
    map_x = excluded.map_x,
    map_y = excluded.map_y,
    available_text = excluded.available_text,
    stroller_status = excluded.stroller_status,
    preschool_status = excluded.preschool_status;

  return jsonb_build_object('publication_id', v_publication_id, 'route_id', p_route_id,
    'version', v_publish_version, 'revision', v_route.content_revision);
end;
$$;

revoke all on function public.publish_cms_route(text) from public, anon;
grant execute on function public.publish_cms_route(text) to authenticated;
