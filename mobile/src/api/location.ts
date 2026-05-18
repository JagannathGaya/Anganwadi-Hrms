import Geolocation from '@react-native-community/geolocation';
import { PermissionsAndroid, Platform } from 'react-native';

export interface Coords {
  lat: number;
  lng: number;
}

/**
 * LocationError gives callers a structured way to react to specific failures
 * (e.g. show a "open Settings" hint when permission is denied) without parsing
 * raw messages.
 */
export type LocationErrorKind =
  | 'PERMISSION_DENIED'
  | 'POSITION_UNAVAILABLE'
  | 'TIMEOUT'
  | 'UNKNOWN';

export class LocationError extends Error {
  constructor(public kind: LocationErrorKind, message: string) {
    super(message);
  }
}

async function ensureAndroidPermission(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location permission',
        message: 'AnganwadiHrms needs your location to record check-in / check-out.',
        buttonPositive: 'OK',
      },
    );
    if (result !== PermissionsAndroid.RESULTS.GRANTED) {
      throw new LocationError(
        'PERMISSION_DENIED',
        result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
          ? 'Location permission was permanently denied. Enable it in Settings → Apps → AnganwadiHrms → Permissions.'
          : 'Location permission is required to check in / out.',
      );
    }
  } catch (err) {
    if (err instanceof LocationError) throw err;
    throw new LocationError('UNKNOWN', err instanceof Error ? err.message : 'Permission check failed');
  }
}

// Mapping a native PositionError code to our LocationError.
function toLocationError(err: { code?: number; message?: string } | null | undefined): LocationError {
  switch (err?.code) {
    case 1:
      return new LocationError(
        'PERMISSION_DENIED',
        'Location permission is required. Please allow it in Settings.',
      );
    case 2:
      return new LocationError(
        'POSITION_UNAVAILABLE',
        "Couldn't get a GPS fix. Make sure location services are on and you have a clear view of the sky.",
      );
    case 3:
      return new LocationError(
        'TIMEOUT',
        'Getting your location took too long. Try again in a moment.',
      );
    default:
      return new LocationError('UNKNOWN', err?.message || 'Could not read location');
  }
}

function getPositionOnce(opts: {
  enableHighAccuracy: boolean;
  timeout: number;
  maximumAge: number;
}): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => reject(toLocationError(err)),
      opts,
    );
  });
}

/**
 * Try to get a position, with sensible fallbacks for real-world flakiness:
 *
 *  1. Try high-accuracy GPS for up to 10s (works outdoors, slower indoors).
 *  2. If that fails with TIMEOUT or POSITION_UNAVAILABLE, fall back to
 *     coarse / network location for up to 10s (works indoors via Wi-Fi
 *     and cell towers).
 *  3. Only PERMISSION_DENIED short-circuits — that can't be fixed by retrying.
 *
 * `maximumAge` is widened in step 2 so the OS can hand back a recently cached
 * fix instead of waiting for a new one.
 */
export async function getCurrentCoords(): Promise<Coords> {
  await ensureAndroidPermission();
  try {
    return await getPositionOnce({
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 5_000,
    });
  } catch (err) {
    if (err instanceof LocationError && err.kind === 'PERMISSION_DENIED') {
      throw err;
    }
    // High-accuracy failed — fall back to coarse / network location.
    try {
      return await getPositionOnce({
        enableHighAccuracy: false,
        timeout: 10_000,
        maximumAge: 60_000,
      });
    } catch (err2) {
      // If even coarse failed, throw the more specific of the two errors.
      throw err2 instanceof LocationError ? err2 : err;
    }
  }
}
