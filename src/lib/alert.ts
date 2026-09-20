import { Alert, Platform } from 'react-native';

/**
 * Cross-platform alert.
 *
 * Alert.alert is a silent NO-OP on web (react-native-web renders nothing),
 * so error dialogs like "Could not delete product" were invisible to web
 * users. This helper routes to window.alert there and keeps the native
 * dialog everywhere else.
 */
export function alert(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}
