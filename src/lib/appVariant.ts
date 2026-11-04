/**
 * Which of the three apps this bundle is — Workout, Tasks or Expenses.
 *
 * Momentum was one app with three sections until 3.0.0. It is now three APKs
 * built from this one tree: same stores, same components, same settings screen,
 * and a build-time switch that decides which section the shell shows. The
 * switch is `EXPO_PUBLIC_APP_VARIANT`, which `app.config.js` also reads to pick
 * the package name, the launcher label and the permissions, and which Metro
 * inlines into the bundle as a string literal — so a bundle can never disagree
 * with the APK it shipped in.
 *
 * ── WHY ONE TREE AND NOT THREE ────────────────────────────────────────────
 *
 * Three copies of the theme, the sheets, the backup, the AI client and the test
 * suite would be three places for one bug fix to be applied twice and forgotten
 * once. The sections never shared a screen — only infrastructure — so the seam
 * is the shell, and everything under it stays where it was.
 *
 * ── WHY WORKOUT KEEPS THE OLD PACKAGE ─────────────────────────────────────
 *
 * Android identifies an install by package + key. `com.semyonsw.workouttracker`
 * is the install on the phone, holding the training log AND the tasks and the
 * money. The Workout app keeps that package so it updates in place and loses
 * nothing; Tasks and Expenses are new installs that start empty and are filled
 * by importing a backup, which carries every section. The old data the Workout
 * app no longer shows is kept, not deleted, and its backups keep carrying it —
 * see `backupSlices` — so nothing is lost before it has been moved.
 *
 * Unset (vitest, jest, a dev server started without it) means `workout`: the
 * package that already exists, and the variant every older test was written for.
 */

import type { SectionTab } from './sectionNav';

export type AppVariant = 'workout' | 'tasks' | 'expenses';

export const APP_VARIANTS: readonly AppVariant[] = ['workout', 'tasks', 'expenses'];

export function parseVariant(raw: string | undefined | null): AppVariant {
  return raw === 'tasks' || raw === 'expenses' ? raw : 'workout';
}

/** This bundle's variant. Read once; Metro has replaced the env read by now. */
export const APP_VARIANT: AppVariant = parseVariant(process.env.EXPO_PUBLIC_APP_VARIANT);

/**
 * The release's fingerprint in the bundle: `momentum-build-<variant>-<version>`,
 * set by `tools/release-apk.sh` for the prebuild and the gradle run, and empty
 * anywhere else. The script greps the finished `index.android.bundle` for it,
 * because grepping for "tasks" proves nothing — all three names are in every
 * bundle — while this string exists only in JS bundled for THIS variant at THIS
 * version, in the same file as the variant switch. Stale cached JS, or a build
 * that silently fell back to Workout, fails the check. Plain ASCII, so Hermes
 * keeps it greppable (CLAUDE.md). The launch screen wears it as its `testID`, so it is never
 * an unused export a bundler could be tempted to drop.
 */
export const BUILD_MARK: string = process.env.EXPO_PUBLIC_BUILD_MARK ?? '';

/** The one content section each app is. Settings rides along in all three. */
export function variantSection(variant: AppVariant): Exclude<SectionTab, 'Settings'> {
  return variant === 'tasks' ? 'Tasks' : variant === 'expenses' ? 'Expenses' : 'Workout';
}

/** The sections the nav bar shows, in order: the app's own, then Settings. */
export function variantSections(variant: AppVariant): readonly SectionTab[] {
  return [variantSection(variant), 'Settings'];
}

export function hasSection(variant: AppVariant, section: SectionTab): boolean {
  return section === 'Settings' || variantSection(variant) === section;
}

/**
 * The auto-backup's file prefix. Distinct per app, because all three write into
 * the same folder the user granted, and each sweeps away older copies of ITS
 * OWN name — one shared prefix would have each app deleting the others' files.
 * None of them is `momentum-backup-`, so the last combined backup 2.x wrote is
 * left alone by all three: it is what Tasks and Expenses get imported from.
 */
export function backupPrefix(variant: AppVariant): string {
  return `momentum-${variant}-backup-`;
}
