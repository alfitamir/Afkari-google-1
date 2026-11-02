/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import initialBackup from './initial-ideas.json';
import type { Idea } from './ideas';

export const INITIAL_IDEAS: Idea[] = (initialBackup?.ideas as Idea[]) || [];

export const SEED_VERSION_KEY = 'afkari.seed.version';
// The seed is intentionally empty: the app must never ship the author's
// personal articles to other installs, so first run starts with no ideas.
export const CURRENT_SEED_VERSION = '2026-11-02-v3';
