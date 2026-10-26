/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import initialBackup from './initial-ideas.json';
import type { Idea } from './ideas';

export const INITIAL_IDEAS: Idea[] = (initialBackup?.ideas as Idea[]) || [];

export const SEED_VERSION_KEY = 'afkari.seed.version';
export const CURRENT_SEED_VERSION = '2026-10-26-v2';
