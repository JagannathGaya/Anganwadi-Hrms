import { Platform, ToastAndroid, Alert } from 'react-native';

/**
 * Show a short, non-blocking notification.
 *
 * - Android: uses the native ToastAndroid (true bottom-of-screen toast).
 * - iOS:    falls back to an Alert (iOS has no system toast). For a more
 *           polished iOS experience later, swap this for an in-app banner
 *           component — the call sites won't change.
 */
export function showToast(message: string, longer = false): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, longer ? ToastAndroid.LONG : ToastAndroid.SHORT);
  } else {
    Alert.alert('', message);
  }
}
