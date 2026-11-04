import { CINEMETA_URL } from './addons';
import { KEYS, readJSON } from './storage';

export interface AppSettings {
  /** Corta toda petición a servidores externos: solo datos ya guardados. */
  offlineOnly: boolean;
  /** Guarda en el dispositivo las respuestas de catálogos y metadatos. */
  persistCache: boolean;
  /** Servidor de Cinemeta: público por defecto, o tu propia instancia. */
  cinemetaUrl: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  offlineOnly: false,
  persistCache: true,
  cinemetaUrl: CINEMETA_URL,
};

export function loadSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...readJSON<Partial<AppSettings>>(KEYS.settings, {}) };
}
