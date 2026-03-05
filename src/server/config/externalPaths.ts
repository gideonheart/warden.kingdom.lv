/**
 * Centralized paths to external scripts used by GSD routes.
 * All paths reference the gsd-code-skill directory on this host.
 * Defined once here to satisfy DRY — previously duplicated as constants in gsdRoutes.ts.
 */

const GSD_SKILL_ROOT = '/home/forge/.openclaw/workspace/skills/gsd-code-skill';

export const SPAWN_SH_PATH = `${GSD_SKILL_ROOT}/scripts/spawn.sh`;
export const MENU_DRIVER_PATH = `${GSD_SKILL_ROOT}/scripts/menu-driver.sh`;
export const ROTATE_SESSION_PATH = `${GSD_SKILL_ROOT}/bin/rotate-session.mjs`;
export const PAUSE_SESSION_PATH = `${GSD_SKILL_ROOT}/bin/pause-session.mjs`;
export const PAUSE_STATE_FILE_PATH = `${GSD_SKILL_ROOT}/logs/pause-state.json`;
