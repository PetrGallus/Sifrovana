# Supabase baseline contract

## Current status

The tracked migration chain is **not reproducible on an empty Supabase project**.
The first migration, `20260811104721_reserve_gallus_superadmin_username.sql`,
starts with `alter table public.profiles` and also uses `private` and
`public.user_role`. None of those objects is created by an earlier tracked
migration.

This is an inventory/audit result, not a production incident. The current
production project already contains the implicit baseline, so the later
migrations can run there. The missing provenance matters when creating a new
project, resetting a local database, or recovering from source control alone.

The machine-readable source of truth is
[`supabase/baseline-contract.json`](../../supabase/baseline-contract.json).
Its contract test deliberately keeps `fresh_install_ready` false until an
empty-project replay has actually passed.

## Objects without a tracked origin

The production schema audit on 2026-11-06 found these baseline objects that no
file in `supabase/migrations` creates:

- schema `private`;
- enum types `public.user_role` and `public.order_status`;
- tables `profiles`, `routes`, `orders`, `user_route_access`,
  `level_definitions`, `route_managers`, `xp_events`, `email_templates`,
  `partner_leads`, and `contact_messages` in the `public` schema;
- helper functions `private.is_superadmin()`,
  `private.is_route_manager(text)`, and `private.sync_profile_xp()`;
- triggers `on_auth_user_created` on `auth.users` and
  `on_xp_event_created` on `public.xp_events`;
- the baseline tables' RLS policies and nine non-constraint foreign-key
  indexes listed in the JSON contract;
- ten level rows and five named email-template rows listed in the JSON
  contract. Their complete seed payloads still need to be exported and
  reviewed before a baseline can be declared complete.

The `route-media` bucket is not part of this gap: it is created, configured,
and protected by `20261104154753_add_route_cms.sql`. Referral and credit tables
are intentionally excluded from the active chain and remain under
`supabase/deferred`.

## Why this audit does not add a migration

A baseline file generated now would sort after the existing migrations. It
would therefore run too late to help an empty project. Giving it an older
timestamp would make an already-migrated production project see an unexpected
historical migration, while editing an applied migration would break migration
provenance. Either shortcut is more dangerous than leaving the gap explicit.

## Safe completion path

1. Export definitions for every object and reference-data set in the contract,
   excluding user, order, and other transactional rows.
2. Review ownership, grants, RLS expressions, security-definer search paths,
   constraints, and seed content. Production state is evidence, not an
   automatically trusted migration source.
3. Assemble a clean baseline in an isolated branch/project and decide on a
   migration-history cutover strategy before adding it to the active chain.
4. Replay the full chain from an empty project and exercise sign-up, catalogue,
   checkout, access grants, CMS, contact/partner forms, and XP updates.
5. Only after that replay passes, update the contract to
   `fresh_install_ready: true` and verify the chosen history strategy against
   production without applying the baseline there accidentally.

Until then, do not use `supabase db reset` or a fresh project as if the
repository alone were a complete recovery source.
